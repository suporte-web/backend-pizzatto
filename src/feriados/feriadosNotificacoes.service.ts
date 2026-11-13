import {
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import axios from 'axios';
import { sign } from 'jsonwebtoken';
import { isUUID } from 'class-validator';
import { PrismaService } from '../prisma/prisma.service';
import { EmailService } from '../email/email.service';
import {
  dataSaoPaulo,
  emailValido,
  filialChave,
  montarMensagem,
  ocorrencia,
  tresDiasUteisAntes,
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
    const baseUrl = process.env.AUTH_API_URL?.replace(/\/$/, '');
    const secret = process.env.JWT_SECRET;
    if (!baseUrl || !secret)
      throw new ServiceUnavailableException(
        'Configure AUTH_API_URL e JWT_SECRET para consultar os destinatários no backend AD.',
      );
    try {
      const token = sign(
        {
          sub: 'notificacoes-feriados',
          type: 'service',
          scope: 'feriados:destinatarios',
        },
        secret,
        { expiresIn: '2m', algorithm: 'HS256' },
      );
      const { data } = await axios.get(
        `${baseUrl}/gestores/destinatarios-feriados`,
        {
          params: { feriadoId: feriado.id },
          headers: { Authorization: `Bearer ${token}` },
          timeout: 30000,
          maxRedirects: 0,
        },
      );
      if (!Array.isArray(data)) throw new Error('Resposta inválida');
      const filiais = new Set(feriado.filiais.map(filialChave));
      const emails = new Set<string>();
      return data
        .filter((gestor): gestor is Destinatario => {
          if (
            !gestor ||
            !isUUID(gestor.id) ||
            typeof gestor.email !== 'string' ||
            typeof gestor.filial !== 'string'
          )
            return false;
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
    } catch {
      // Não registrar objetos Axios: eles podem conter o token de autenticação.
      throw new ServiceUnavailableException(
        'Falha ao consultar os destinatários no backend AD. Nenhum envio realizado nesta consulta.',
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
          select: { gestorId: true, destinatario: true },
        });
        const gestoresReservados = new Set(
          existentes.map((envio) => envio.gestorId),
        );
        const emailsReservados = new Set(
          existentes.map((envio) => envio.destinatario.trim().toLowerCase()),
        );
        const reservados: Array<{ id: string; email: string }> = [];
        for (const gestor of destinatarios) {
          if (
            gestoresReservados.has(gestor.id) ||
            emailsReservados.has(gestor.email)
          )
            continue;
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
    } catch {
      await this.prisma.feriadoNotificacaoEnvio.updateMany({
        where: { id: { in: registros.map((r) => r.id) } },
        data: {
          status: 'FALHA',
          detalhe:
            'Envio não confirmado pelo SMTP. Verifique a entrega antes de repetir; sem retentativa automática para evitar duplicidade.',
        },
      });
      this.logger.error(
        `Feriado ${feriado.id}: envio em CCO sem confirmação SMTP.`,
      );
      return;
    }
    const aceitos = new Set(resultado.aceitos);
    const rejeitados = new Set(resultado.rejeitados);
    const enviados = registros.filter(
      (r) => aceitos.has(r.email) && !rejeitados.has(r.email),
    );
    const falhas = registros.filter(
      (r) => !aceitos.has(r.email) || rejeitados.has(r.email),
    );
    if (enviados.length) {
      await this.prisma.feriadoNotificacaoEnvio.updateMany({
        where: { id: { in: enviados.map((r) => r.id) } },
        data: { status: 'ENVIADO', enviadoEm: new Date() },
      });
    }
    if (falhas.length) {
      await this.prisma.feriadoNotificacaoEnvio.updateMany({
        where: { id: { in: falhas.map((r) => r.id) } },
        data: {
          status: 'FALHA',
          detalhe:
            'Destinatário rejeitado ou não confirmado pelo SMTP no envio em CCO. Sem repetição automática; verifique a entrega.',
        },
      });
      this.logger.error(
        `Feriado ${feriado.id}: ${falhas.length} destinatário(s) sem confirmação no envio em CCO.`,
      );
    }
  }

  @Cron('0 */15 * * * *', {
    name: 'notificacoes-feriados',
    timeZone: 'America/Sao_Paulo',
    waitForCompletion: true,
  })
  async verificarFeriadosParaNotificar(agora = new Date()) { 
    // if (process.env.FERIADOS_NOTIFICACOES_ATIVAS !== 'true') return;
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
            tresDiasUteisAntes(data, feriado.filiais, calendario).getTime() !==
              hoje.getTime()
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
