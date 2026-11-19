import {
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';
import { EmailService } from '../email/email.service';
import { podeRepetirEnvio } from '../email/email-retry';
import {
  dataSaoPaulo,
  emailValido,
  filialChave,
  montarMensagem,
  ocorrencia,
  estaNaJanelaDeNotificacao,
} from './feriadosNotificacoes.utils';
import type { FeriadoNotificavel } from './feriadosNotificacoes.utils';

interface Destinatario {
  id: string;
  nome: string;
  email: string;
  filial: string;
}

@Injectable()
export class FeriadosNotificacoesService {
  private readonly logger = new Logger(FeriadosNotificacoesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly email: EmailService,
  ) {}

  private async buscarDestinatarios(
    feriado: FeriadoNotificavel,
  ): Promise<Destinatario[]> {
    if (!feriado.filiais.length) return [];
    try {
      // A sincronização do AD já persiste os gestores neste mesmo PostgreSQL.
      const gestores = await this.prisma.gestores.findMany({
        where: {
          ativo: true,
          recebeEmail: 'SIM',
          email: { not: null },
          filial: { not: null },
        },
        select: { id: true, nome: true, email: true, filial: true },
        orderBy: { nome: 'asc' },
      });
      const filiais = new Set(feriado.filiais.map(filialChave));
      const emails = new Set<string>();
      return gestores
        .filter((gestor): gestor is Destinatario => {
          if (!gestor.email || !gestor.filial) return false;
          const email = gestor.email.trim().toLowerCase();
          if (
            !emailValido(email) ||
            !filiais.has(filialChave(gestor.filial)) ||
            emails.has(email)
          )
            return false;
          emails.add(email);
          return true;
        })
        .map((gestor) => ({
          ...gestor,
          email: gestor.email.trim().toLowerCase(),
        }));
    } catch (error) {
      // Não inclui erros brutos: podem expor a conexão ou dados dos gestores.
      const motivos: Record<string, string> = {
        P2021:
          'tabela Gestores não encontrada; confira as migrations no banco compartilhado',
        P2022:
          'coluna de Gestores não encontrada; confira o schema e o Prisma Client',
        P1001: 'PostgreSQL indisponível',
        P1002: 'tempo limite de conexão com o PostgreSQL excedido',
        P2024: 'tempo limite para obter conexão do pool excedido',
      };
      const code = (error as { code?: unknown } | null)?.code;
      const motivo =
        typeof code === 'string' &&
        Object.prototype.hasOwnProperty.call(motivos, code)
          ? code + ': ' + motivos[code]
          : 'erro de consulta à tabela Gestores';
      throw new ServiceUnavailableException(
        'Falha ao consultar os destinatários no PostgreSQL. ' +
          motivo +
          '. Nenhum envio realizado nesta consulta.',
      );
    }
  }

  private async enviarAviso(feriado: FeriadoNotificavel, data: Date) {
    const destinatarios = await this.buscarDestinatarios(feriado);
    if (!destinatarios.length) {
      this.logger.log(
        `Feriado ${feriado.id}: nenhum gestor habilitado nas filiais selecionadas.`,
      );
      return;
    }
    this.email.validarConfiguracao();
    const mensagem = montarMensagem(
      feriado,
      data,
      process.env.FERIADOS_EMAIL_GRH?.trim(),
    );
    const registros = await this.prisma.$transaction(
      async (tx) => {
        // Serializa a reserva da ocorrência para duas instâncias não dividirem o grupo.
        const chave = `${feriado.id}:${data.toISOString().slice(0, 10)}`;
        const [lock] = await tx.$queryRaw<Array<{ adquirido: boolean }>>`
        SELECT pg_try_advisory_xact_lock(hashtext(${chave})) AS adquirido
      `;
        if (!lock?.adquirido) return [];
        const existentes = await tx.feriadoNotificacaoEnvio.findMany({
          where: { feriadoId: feriado.id, dataFeriado: data },
          select: {
            id: true,
            gestorId: true,
            destinatario: true,
            status: true,
            enviadoEm: true,
          },
        });
        const reservados: Array<{ id: string; email: string }> = [];
        for (const gestor of destinatarios) {
          const relacionados = existentes.filter(
            (envio) =>
              envio.gestorId === gestor.id ||
              envio.destinatario.trim().toLowerCase() === gestor.email,
          );
          if (relacionados.length) {
            // ENVIADO, PROCESSANDO e entregas incertas nunca são repetidos.
            if (
              relacionados.some(
                (envio) => envio.status !== 'RETENTAR' || envio.enviadoEm,
              )
            )
              continue;
            const anterior =
              relacionados.find(
                (envio) =>
                  envio.gestorId === gestor.id &&
                  envio.destinatario.trim().toLowerCase() === gestor.email,
              ) ?? (relacionados.length === 1 ? relacionados[0] : undefined);
            if (!anterior) continue;
            await tx.feriadoNotificacaoEnvio.update({
              where: { id: anterior.id },
              data: {
                chave: `${feriado.id}:${data.toISOString().slice(0, 10)}:${gestor.email}`,
                gestorId: gestor.id,
                destinatario: gestor.email,
                status: 'PROCESSANDO',
                detalhe: null,
                nomeFeriado: feriado.nome,
                assunto: mensagem.assunto,
                updatedAt: new Date(),
              },
            });
            reservados.push({ id: anterior.id, email: gestor.email });
            continue;
          }
          const registro = await tx.feriadoNotificacaoEnvio.create({
            data: {
              chave: `${feriado.id}:${data.toISOString().slice(0, 10)}:${gestor.email}`,
              feriadoId: feriado.id,
              gestorId: gestor.id,
              nomeFeriado: feriado.nome,
              dataFeriado: data,
              destinatario: gestor.email,
              assunto: mensagem.assunto,
            },
          });
          reservados.push({ id: registro.id, email: gestor.email });
        }
        return reservados;
      },
      { timeout: 30000 },
    );
    if (!registros.length) return;

    let resultado: Awaited<ReturnType<EmailService['enviarEmCopiaOculta']>>;
    try {
      // Uma única mensagem SMTP, com todos os gestores pendentes em CCO.
      resultado = await this.email.enviarEmCopiaOculta(
        registros.map((r) => r.email),
        mensagem,
      );
    } catch (error) {
      const podeRepetir = podeRepetirEnvio(error);
      await this.prisma.feriadoNotificacaoEnvio.updateMany({
        where: { id: { in: registros.map((r) => r.id) } },
        data: {
          status: podeRepetir ? 'RETENTAR' : 'INCERTO',
          updatedAt: new Date(),
          detalhe: podeRepetir
            ? 'SMTP não aceitou a mensagem. Nova tentativa automática na janela de três a um dia útil antes do feriado.'
            : 'Entrega sem confirmação SMTP. Verifique antes de repetir para evitar duplicidade.',
        },
      });
      this.logger.error(
        `Feriado ${feriado.id}: ${podeRepetir ? 'falha sem entrega; será tentado novamente na janela' : 'entrega incerta; repetição automática bloqueada'}.`,
      );
      return;
    }
    const aceitos = new Set(resultado.aceitos);
    const rejeitados = new Set(resultado.rejeitados);
    const enviados = registros.filter(
      (r) => aceitos.has(r.email) && !rejeitados.has(r.email),
    );
    const falhas = registros.filter((r) => rejeitados.has(r.email));
    const incertos = registros.filter(
      (r) => !aceitos.has(r.email) && !rejeitados.has(r.email),
    );
    if (enviados.length) {
      await this.prisma.feriadoNotificacaoEnvio.updateMany({
        where: { id: { in: enviados.map((r) => r.id) } },
        data: {
          status: 'ENVIADO',
          enviadoEm: new Date(),
          updatedAt: new Date(),
        },
      });
    }
    if (falhas.length) {
      await this.prisma.feriadoNotificacaoEnvio.updateMany({
        where: { id: { in: falhas.map((r) => r.id) } },
        data: {
          status: 'RETENTAR',
          updatedAt: new Date(),
          detalhe:
            'Destinatário rejeitado pelo SMTP. Será tentado novamente dentro da janela de notificação.',
        },
      });
      this.logger.error(
        `Feriado ${feriado.id}: ${falhas.length} destinatário(s) sem confirmação no envio em CCO.`,
      );
    }
    if (incertos.length) {
      await this.prisma.feriadoNotificacaoEnvio.updateMany({
        where: { id: { in: incertos.map((r) => r.id) } },
        data: {
          status: 'INCERTO',
          updatedAt: new Date(),
          detalhe:
            'Destinatário sem confirmação de aceite ou rejeição. Verifique a entrega antes de repetir.',
        },
      });
    }
  }

  @Cron('0 */15 * * * *', {
    name: 'notificacoes-feriados',
    timeZone: 'America/Sao_Paulo',
    waitForCompletion: true,
  })
  async verificarFeriadosParaNotificar(agora = new Date()) {
    const hora = Number(
      new Intl.DateTimeFormat('en-GB', {
        timeZone: 'America/Sao_Paulo',
        hour: '2-digit',
        hourCycle: 'h23',
      }).format(agora),
    );
    if (hora < 8) return;
    try {
      const hoje = dataSaoPaulo(agora);
      const calendario = await this.prisma.feriado.findMany({
        where: { ativo: true },
      });
      for (const feriado of calendario) {
        if (!feriado.filiais.length) continue;
        for (const ano of [hoje.getUTCFullYear(), hoje.getUTCFullYear() + 1]) {
          const data = ocorrencia(feriado, ano);
          if (
            !data ||
            !estaNaJanelaDeNotificacao(data, hoje, feriado.filiais, calendario)
          )
            continue;
          try {
            await this.enviarAviso(feriado, data);
          } catch (error) {
            this.logger.error(
              `Feriado ${feriado.id}: ${error instanceof Error ? error.message : 'falha no envio'}`,
            );
          }
        }
      }
    } catch {
      this.logger.error(
        'Falha ao consultar feriados. Confira a conexão com o banco e a aplicação das migrations no backend AD.',
      );
    }
  }
}
