import {
  Injectable,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import * as nodemailer from 'nodemailer';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class LicencaNotificacaoService {
  private readonly logger = new Logger(LicencaNotificacaoService.name);

  private readonly transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT),
    secure: true,
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  });

  constructor(private readonly prisma: PrismaService) {
    this.transporter
      .verify()
      .then(() => {
        this.logger.log(
          'SMTP de notificações de licenças conectado com sucesso.',
        );
      })
      .catch((error) => {
        this.logger.error(
          'Erro ao conectar no SMTP de notificações de licenças:',
          error,
        );
      });
  }

  /**
   * Executa todos os dias às 07:00.
   */
  @Cron('0 0 7 * * *', {
    name: 'notificacao-vencimento-licencas',
    timeZone: 'America/Sao_Paulo',
  })
  async verificarLicencasParaVencimento() {
    this.logger.log(
      'Iniciando verificação de licenças próximas do vencimento.',
    );

    const hoje = new Date();
    hoje.setHours(0, 0, 0, 0);

    const licencas = await this.prisma.licenca.findMany({
      where: {
        ativo: true,

        responsavelEmail: {
          not: null,
        },
      },

      include: {
        LicencaFilial: true,
      },

      orderBy: {
        dataProximaRevisao: 'asc',
      },
    });

    let enviados = 0;
    let ignorados = 0;
    let erros = 0;

    for (const licenca of licencas) {
      if (!licenca.dataProximaRevisao) {
        ignorados++;
        continue;
      }

      const destinatario = String(licenca.responsavelEmail || '').trim();

      if (!destinatario) {
        this.logger.warn(`Licença ${licenca.nome} sem e-mail do responsável.`);

        ignorados++;
        continue;
      }

      const dataVencimento = new Date(licenca.dataProximaRevisao);

      dataVencimento.setHours(0, 0, 0, 0);

      const diasRestantes = this.calcularDiferencaEmDias(hoje, dataVencimento);

      const diasNotificacaoAntes = Array.isArray(licenca.diasNotificacaoAntes)
        ? licenca.diasNotificacaoAntes
        : [];

      const diasNotificacaoDepois = Array.isArray(licenca.diasNotificacaoDepois)
        ? licenca.diasNotificacaoDepois
        : [];

      let deveNotificar = false;

      if (diasRestantes >= 0) {
        /**
         * Licença ainda não venceu.
         *
         * Exemplo:
         * diasRestantes = 30
         *
         * Verifica se 30 está configurado em
         * diasNotificacaoAntes.
         */
        deveNotificar = diasNotificacaoAntes.includes(diasRestantes);
      } else {
        /**
         * Licença já venceu.
         *
         * diasRestantes será negativo:
         *
         * -1 = venceu há 1 dia
         * -3 = venceu há 3 dias
         *
         * Por isso usamos Math.abs().
         */
        const diasAposVencimento = Math.abs(diasRestantes);

        deveNotificar = diasNotificacaoDepois.includes(diasAposVencimento);
      }

      if (!deveNotificar) {
        ignorados++;
        continue;
      }

      try {
        const resultadoEmail = await this.enviarEmailVencimento({
          licenca,
          diasRestantes,
        });

        await this.registrarAuditLogEmail({
          licenca,
          destinatario,
          diasRestantes,
          messageId: resultadoEmail.messageId,
        });

        enviados++;

        this.logger.log(
          [
            `Notificação enviada para ${destinatario}`,
            `— licença ${licenca.nome}.`,
          ].join(' '),
        );
      } catch (error) {
        erros++;

        this.logger.error(
          `Erro ao notificar a licença ${licenca.nome}:`,
          error instanceof Error ? error.stack : error,
        );
      }
    }

    this.logger.log(
      [
        'Verificação de licenças finalizada.',
        `Enviados: ${enviados},`,
        `ignorados: ${ignorados},`,
        `erros: ${erros}.`,
      ].join(' '),
    );

    return {
      enviados,
      ignorados,
      erros,
    };
  }

  private async enviarEmailVencimento({
    licenca,
    diasRestantes,
  }: {
    licenca: any;
    diasRestantes: number;
  }) {
    const destinatario = String(licenca.responsavelEmail).trim();

    const responsavelNome =
      licenca.responsavelNome?.trim() || 'Responsável pela licença';

    const assunto = this.montarAssunto(licenca.nome, diasRestantes);

    const html = this.montarTemplateEmail({
      licenca,
      responsavelNome,
      diasRestantes,
    });

    try {
      return await this.transporter.sendMail({
        from: process.env.SMTP_FROM,
        to: destinatario,
        subject: assunto,
        html,
      });
    } catch (error) {
      this.logger.error('Erro no disparo do e-mail da licença:', error);

      throw new InternalServerErrorException(
        'Não foi possível enviar o e-mail de vencimento da licença.',
      );
    }
  }

  private montarAssunto(nomeLicenca: string, diasRestantes: number) {
    if (diasRestantes < 0) {
      return `Licença vencida | ${nomeLicenca}`;
    }

    if (diasRestantes === 0) {
      return `Licença vence hoje | ${nomeLicenca}`;
    }

    if (diasRestantes === 1) {
      return `Licença vence amanhã | ${nomeLicenca}`;
    }

    return `Licença próxima do vencimento | ${nomeLicenca} | ${diasRestantes} dias`;
  }

  private montarTemplateEmail({
    licenca,
    responsavelNome,
    diasRestantes,
  }: {
    licenca: any;
    responsavelNome: string;
    diasRestantes: number;
  }) {
    const mensagemStatus = this.montarMensagemStatus(diasRestantes);

    const vencido = diasRestantes < 0;

    const corPrincipal = vencido ? '#c62828' : '#1565c0';

    const corFundoAlerta = vencido ? '#fff4f4' : '#f3f8fd';

    const corBordaAlerta = vencido ? '#efc6c6' : '#c9dff3';

    const corTextoAlerta = vencido ? '#8e2424' : '#174f7f';

    const dataVencimento = this.formatarData(licenca.dataProximaRevisao);

    const filial = licenca.LicencaFilial?.nome || 'Não informada';

    const cnpjFilial = licenca.LicencaFilial?.cnpj || 'Não informado';

    return `
      <div
        style="
          margin:0;
          padding:0;
          background-color:#f4f6f8;
          font-family:Arial, Helvetica, sans-serif;
        "
      >
        <table
          width="100%"
          cellpadding="0"
          cellspacing="0"
          border="0"
          style="
            background-color:#f4f6f8;
            padding:32px 16px;
          "
        >
          <tr>
            <td align="center">

              <table
                width="100%"
                cellpadding="0"
                cellspacing="0"
                border="0"
                style="
                  max-width:680px;
                  background:#ffffff;
                  border-radius:14px;
                  overflow:hidden;
                "
              >

                <tr>
                  <td
                    style="
                      background:${corPrincipal};
                      padding:24px 32px;
                      color:#ffffff;
                    "
                  >
                    <h1
                      style="
                        margin:0;
                        font-size:24px;
                      "
                    >
                      Gestão de Licenças
                    </h1>

                    <p
                      style="
                        margin:8px 0 0;
                        font-size:14px;
                        line-height:1.5;
                      "
                    >
                      Aviso automático de vencimento de licença.
                    </p>
                  </td>
                </tr>

                <tr>
                  <td style="padding:32px;">

                    <p
                      style="
                        margin:0 0 18px;
                        font-size:16px;
                        color:#333333;
                      "
                    >
                      Prezado(a),
                      <strong>
                        ${this.escaparHtml(responsavelNome)}
                      </strong>.
                    </p>

                    <p
                      style="
                        margin:0 0 20px;
                        font-size:15px;
                        line-height:1.7;
                        color:#555555;
                      "
                    >
                      Este é um aviso automático referente ao
                      vencimento de uma licença cadastrada no
                      sistema de Gestão de Licenças da Pizzattolog.
                    </p>

                    <div
                      style="
                        margin:24px 0;
                        padding:18px 20px;
                        background:${corFundoAlerta};
                        border:1px solid ${corBordaAlerta};
                        border-radius:10px;
                      "
                    >
                      <strong
                        style="
                          display:block;
                          margin-bottom:8px;
                          color:${corTextoAlerta};
                        "
                      >
                        Situação da licença
                      </strong>

                      <p
                        style="
                          margin:0;
                          font-size:15px;
                          line-height:1.6;
                          color:${corTextoAlerta};
                        "
                      >
                        ${mensagemStatus}
                      </p>
                    </div>

                    <table
                      width="100%"
                      cellpadding="0"
                      cellspacing="0"
                      border="0"
                      style="
                        margin:24px 0;
                        border:1px solid #e2e6ea;
                        border-radius:10px;
                        border-collapse:separate;
                        overflow:hidden;
                      "
                    >

                      ${this.montarLinhaDetalhe(
                        'Licença',
                        licenca.nome || 'Não informada',
                      )}

                      ${this.montarLinhaDetalhe('Filial', filial)}

                      ${this.montarLinhaDetalhe('CNPJ', cnpjFilial)}

                      ${this.montarLinhaDetalhe(
                        'Data de vencimento',
                        dataVencimento,
                      )}

                    </table>

                    <p
                      style="
                        margin:0 0 16px;
                        font-size:15px;
                        line-height:1.7;
                        color:#555555;
                      "
                    >
                      Solicitamos que seja realizada a verificação
                      da licença e, caso necessário, iniciada a
                      renovação antes do vencimento.
                    </p>

                    ${
                      vencido
                        ? `
                          <p
                            style="
                              margin:0 0 24px;
                              font-size:15px;
                              line-height:1.7;
                              color:#c62828;
                              font-weight:bold;
                            "
                          >
                            A licença encontra-se vencida.
                            Recomendamos regularizar a situação
                            o quanto antes.
                          </p>
                        `
                        : ''
                    }

                    <div
                      style="
                        margin-top:28px;
                        padding-top:20px;
                        border-top:1px solid #e5e7eb;
                      "
                    >
                      <p
                        style="
                          margin:0;
                          font-size:13px;
                          line-height:1.6;
                          color:#777777;
                        "
                      >
                        Este e-mail foi enviado automaticamente
                        pelo Sistema de Gestão de Licenças.
                      </p>
                    </div>

                    <p
                      style="
                        margin:24px 0 0;
                        font-size:15px;
                        color:#333333;
                      "
                    >
                      Atenciosamente,<br />

                      <strong>
                        Sistema de Gestão de Licenças
                      </strong>

                      <br />

                      Pizzattolog
                    </p>

                  </td>
                </tr>

              </table>

            </td>
          </tr>
        </table>
      </div>
    `;
  }

  private montarLinhaDetalhe(label: string, valor: string) {
    return `
      <tr>
        <td
          style="
            width:190px;
            padding:12px 16px;
            background:#f8f9fa;
            border-bottom:1px solid #e2e6ea;
            font-size:14px;
            font-weight:bold;
            color:#444444;
          "
        >
          ${this.escaparHtml(label)}
        </td>

        <td
          style="
            padding:12px 16px;
            border-bottom:1px solid #e2e6ea;
            font-size:14px;
            color:#555555;
          "
        >
          ${this.escaparHtml(String(valor))}
        </td>
      </tr>
    `;
  }

  private montarMensagemStatus(diasRestantes: number) {
    if (diasRestantes < 0) {
      const diasVencido = Math.abs(diasRestantes);

      return `
        A licença está vencida há
        <strong>
          ${diasVencido}
          ${diasVencido === 1 ? 'dia' : 'dias'}
        </strong>.
        Recomendamos que a regularização seja realizada
        o quanto antes.
      `;
    }

    if (diasRestantes === 0) {
      return `
        A licença possui vencimento previsto para
        <strong>hoje</strong>.
      `;
    }

    if (diasRestantes === 1) {
      return `
        A licença vencerá
        <strong>amanhã</strong>.
      `;
    }

    return `
      A licença vencerá em
      <strong>
        ${diasRestantes} dias
      </strong>.
    `;
  }

  private calcularDiferencaEmDias(dataInicial: Date, dataFinal: Date) {
    const milissegundosPorDia = 1000 * 60 * 60 * 24;

    return Math.round(
      (dataFinal.getTime() - dataInicial.getTime()) / milissegundosPorDia,
    );
  }

  private formatarData(data: Date | string | null) {
    if (!data) {
      return 'Não informada';
    }

    const dataConvertida = new Date(data);

    if (Number.isNaN(dataConvertida.getTime())) {
      return 'Data inválida';
    }

    return new Intl.DateTimeFormat('pt-BR', {
      timeZone: 'America/Sao_Paulo',
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    }).format(dataConvertida);
  }

  private escaparHtml(valor: string) {
    return String(valor)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  private async registrarAuditLogEmail({
    licenca,
    destinatario,
    diasRestantes,
    messageId,
  }: {
    licenca: any;
    destinatario: string;
    diasRestantes: number;
    messageId?: string;
  }) {
    const motivo = this.montarMotivoAuditLog(diasRestantes);

    await this.prisma.audit_logs.create({
      data: {
        acao: [
          `Disparou e-mail para ${destinatario}`,
          `por motivo de ${motivo}`,
          `da licença ${licenca.nome}`,
        ].join(' '),

        entidade: 'SISTEMA - GESTÃO DE LICENÇAS',

        filialEntidade: licenca.LicencaFilial?.nome || 'Pizzattolog',

        ipAddress: 'SISTEMA',

        /*
         * Se seu audit_logs possuir algum campo
         * para JSON/detalhes, você pode adicionar:
         */

        // detalhes: JSON.stringify({
        //   licencaId: licenca.id,
        //   licenca: licenca.nome,
        //   filial: licenca.filial?.nome,
        //   destinatario,
        //   diasRestantes,
        //   messageId,
        // }),
      },
    });
  }

  private montarMotivoAuditLog(diasRestantes: number) {
    if (diasRestantes < 0) {
      const diasVencido = Math.abs(diasRestantes);

      return `licença vencida há ${diasVencido} ${
        diasVencido === 1 ? 'dia' : 'dias'
      }`;
    }

    if (diasRestantes === 0) {
      return 'vencimento da licença na data de hoje';
    }

    if (diasRestantes === 1) {
      return 'vencimento da licença em 1 dia';
    }

    return `vencimento da licença em ${diasRestantes} dias`;
  }
}
