import {
  Injectable,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import * as nodemailer from 'nodemailer';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class DocumentoNotificacaoService {
  private readonly logger = new Logger(DocumentoNotificacaoService.name);

  private readonly diasParaNotificar = [90, 60, 30, 15, 7, 3, 1, 0];

  private readonly transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: process.env.SMTP_PORT,
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
        this.logger.log('SMTP de documentos conectado com sucesso.');
      })
      .catch((error) => {
        this.logger.error('Erro ao conectar no SMTP de documentos:', error);
      });
  }

  /**
   * Executa todos os dias às 08:00.
   */
  @Cron('0 0 7 * * *', {
    name: 'notificacao-revisao-documentos',
    timeZone: 'America/Sao_Paulo',
  })
  async verificarDocumentosParaRevisao() {
    this.logger.log('Iniciando verificação de documentos próximos da revisão.');

    const hoje = new Date();
    hoje.setHours(0, 0, 0, 0);

    const documentos = await this.prisma.documento.findMany({
      where: {
        ativo: true,

        responsavelEmail: {
          not: null,
        },
      },

      include: {
        DocumentoCategoria: true,
      },

      orderBy: {
        dataProximaRevisao: 'asc',
      },
    });

    let enviados = 0;
    let ignorados = 0;
    let erros = 0;

    for (const documento of documentos) {
      if (!documento.dataProximaRevisao) {
        ignorados++;
        continue;
      }

      const destinatario = String(documento.responsavelEmail || '').trim();

      if (!destinatario) {
        this.logger.warn(
          `Documento ${documento.codigo} sem e-mail do responsável.`,
        );

        ignorados++;
        continue;
      }

      const dataRevisao = new Date(documento.dataProximaRevisao);
      dataRevisao.setHours(0, 0, 0, 0);

      const diasRestantes = this.calcularDiferencaEmDias(hoje, dataRevisao);

      const deveNotificar =
        this.diasParaNotificar.includes(diasRestantes) || diasRestantes < 0;

      if (!deveNotificar) {
        ignorados++;
        continue;
      }

      try {
        const resultadoEmail = await this.enviarEmailRevisao({
          documento,
          diasRestantes,
        });

        await this.registrarAuditLogEmail({
          documento,
          destinatario,
          diasRestantes,
          messageId: resultadoEmail.messageId,
        });

        enviados++;

        this.logger.log(
          `Notificação enviada para ${destinatario} — documento ${documento.codigo}.`,
        );
      } catch (error) {
        erros++;

        this.logger.error(
          `Erro ao notificar o documento ${documento.codigo}:`,
          error instanceof Error ? error.stack : error,
        );
      }
    }

    this.logger.log(
      `Verificação finalizada. Enviados: ${enviados}, ignorados: ${ignorados}, erros: ${erros}.`,
    );

    return {
      enviados,
      ignorados,
      erros,
    };
  }

  private async enviarEmailRevisao({
    documento,
    diasRestantes,
  }: {
    documento: any;
    diasRestantes: number;
  }) {
    const destinatario = String(documento.responsavelEmail).trim();

    const responsavelNome =
      documento.responsavelNome?.trim() || 'Responsável pelo documento';

    const assunto = this.montarAssunto(documento.codigo, diasRestantes);

    const html = this.montarTemplateEmail({
      documento,
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
      this.logger.error('Erro no disparo do e-mail:', error);

      throw new InternalServerErrorException(
        'Não foi possível enviar o e-mail de revisão do documento.',
      );
    }
  }

  private montarAssunto(codigoDocumento: string, diasRestantes: number) {
    if (diasRestantes < 0) {
      return `Documento vencido para revisão | ${codigoDocumento}`;
    }

    if (diasRestantes === 0) {
      return `Documento vence hoje para revisão | ${codigoDocumento}`;
    }

    if (diasRestantes === 1) {
      return `Documento vence amanhã para revisão | ${codigoDocumento}`;
    }

    return `Documento próximo da revisão | ${codigoDocumento} | ${diasRestantes} dias`;
  }

  private montarTemplateEmail({
    documento,
    responsavelNome,
    diasRestantes,
  }: {
    documento: any;
    responsavelNome: string;
    diasRestantes: number;
  }) {
    const mensagemStatus = this.montarMensagemStatus(diasRestantes);

    const vencido = diasRestantes < 0;

    const corPrincipal = vencido ? '#c62828' : '#1565c0';
    const corFundoAlerta = vencido ? '#fff4f4' : '#f3f8fd';
    const corBordaAlerta = vencido ? '#efc6c6' : '#c9dff3';
    const corTextoAlerta = vencido ? '#8e2424' : '#174f7f';

    const dataPublicacao = this.formatarData(documento.dataPublicacao);

    const dataRevisao = this.formatarData(documento.dataProximaRevisao);

    const categoria = documento.DocumentoCategoria?.nome || 'Não informada';

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
          style="background-color:#f4f6f8; padding:32px 16px;"
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
                    <h1 style="margin:0; font-size:24px;">
                      Controle de revisão documental
                    </h1>

                    <p
                      style="
                        margin:8px 0 0;
                        font-size:14px;
                        line-height:1.5;
                      "
                    >
                      Aviso automático do Sistema de Gestão de Documentos
                      Controlados.
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
                      <strong>${this.escaparHtml(responsavelNome)}</strong>.
                    </p>

                    <p
                      style="
                        margin:0 0 20px;
                        font-size:15px;
                        line-height:1.7;
                        color:#555555;
                      "
                    >
                      Este é um aviso para controle da revisão periódica
                      do documento sob sua responsabilidade.
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
                        Situação da revisão
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
                        'Código',
                        documento.codigo || 'Não informado',
                      )}

                      ${this.montarLinhaDetalhe(
                        'Documento',
                        documento.nome || 'Não informado',
                      )}

                      ${this.montarLinhaDetalhe('Categoria', categoria)}

                      ${this.montarLinhaDetalhe(
                        'Setor responsável',
                        documento.setorResponsavel || 'Não informado',
                      )}

                      ${this.montarLinhaDetalhe(
                        'Data de publicação',
                        dataPublicacao,
                      )}

                      ${this.montarLinhaDetalhe('Próxima revisão', dataRevisao)}
                    </table>

                    <p
                      style="
                        margin:0 0 16px;
                        font-size:15px;
                        line-height:1.7;
                        color:#555555;
                      "
                    >
                      Solicitamos que o documento seja revisado para
                      verificar se seu conteúdo permanece atualizado,
                      aplicável e adequado aos processos da empresa.
                    </p>

                    <p
                      style="
                        margin:0 0 24px;
                        font-size:15px;
                        line-height:1.7;
                        color:#555555;
                      "
                    >
                      Caso sejam necessárias alterações, realize a
                      atualização conforme o processo interno de Gestão
                      de Documentos Controlados.
                    </p>

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
                        Este e-mail foi enviado automaticamente e possui
                        caráter informativo para controle da revisão
                        documental.
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
                        Sistema de Gestão de Documentos Controlados
                      </strong><br />
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
        O documento está com a revisão vencida há
        <strong>${diasVencido} ${diasVencido === 1 ? 'dia' : 'dias'}</strong>.
        Recomendamos que a revisão seja realizada o quanto antes.
      `;
    }

    if (diasRestantes === 0) {
      return `
        A data prevista para revisão do documento é
        <strong>hoje</strong>.
      `;
    }

    if (diasRestantes === 1) {
      return `
        O documento deverá ser revisado
        <strong>amanhã</strong>.
      `;
    }

    return `
      O documento deverá ser revisado em
      <strong>${diasRestantes} dias</strong>.
    `;
  }

  private obterTipoNotificacao(diasRestantes: number) {
    if (diasRestantes < 0) {
      return 'VENCIDO';
    }

    if (diasRestantes === 0) {
      return 'VENCE_HOJE';
    }

    return `FALTAM_${diasRestantes}_DIAS`;
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
    documento,
    destinatario,
    diasRestantes,
    messageId,
  }: {
    documento: any;
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
          `do documento ${documento.codigo} - ${documento.nome}`,
        ].join(' '),

        /*
         * Como o disparo é automático, não existe um usuário autenticado
         * realizando a ação.
         */
        entidade: 'SISTEMA - GESTÃO DE DOCUMENTOS',

        /*
         * Ajuste para um campo existente no seu audit_logs.
         * Pode usar o setor do documento ou um valor fixo.
         */
        filialEntidade: documento.setorResponsavel || 'Pizzattolog',

        /*
         * O disparo vem do próprio servidor, então não existe IP
         * de uma requisição HTTP.
         */
        ipAddress: 'SISTEMA',

        /*
         * Inclua somente se esses campos existirem no seu model.
         */
        // detalhes: JSON.stringify({
        //   documentoId: documento.id,
        //   codigo: documento.codigo,
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

      return `revisão vencida há ${diasVencido} ${
        diasVencido === 1 ? 'dia' : 'dias'
      }`;
    }

    if (diasRestantes === 0) {
      return 'vencimento da revisão na data de hoje';
    }

    if (diasRestantes === 1) {
      return 'vencimento da revisão em 1 dia';
    }

    return `vencimento da revisão em ${diasRestantes} dias`;
  }
}
