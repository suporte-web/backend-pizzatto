import { Injectable, InternalServerErrorException } from '@nestjs/common';
import * as nodemailer from 'nodemailer';

@Injectable()
export class FeriasEmailService {
  private readonly transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT),
    secure: true,

    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  });

  constructor() {
    this.transporter.verify().catch((error) => {
      console.error('[FERIAS][EMAIL] Erro ao conectar no SMTP:', error);
    });
  }

  private criarTemplate(params: {
    titulo: string;
    subtitulo?: string;
    conteudo: string;
    cor?: string;
  }) {
    const cor = params.cor ?? '#1565c0';

    return `
    <div
      style="
        margin:0;
        padding:0;
        background:#f4f6f8;
        font-family:Arial,Helvetica,sans-serif;
      "
    >
      <table
        width="100%"
        cellpadding="0"
        cellspacing="0"
        border="0"
        style="
          background:#f4f6f8;
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
                    background:${cor};
                    padding:24px 32px;
                    color:#ffffff;
                  "
                >
                  <h1
                    style="
                      margin:0;
                      font-size:23px;
                    "
                  >
                    ${params.titulo}
                  </h1>

                  ${
                    params.subtitulo
                      ? `
                        <p
                          style="
                            margin:8px 0 0;
                            font-size:14px;
                          "
                        >
                          ${params.subtitulo}
                        </p>
                      `
                      : ''
                  }
                </td>
              </tr>

              <tr>
                <td style="padding:32px;">
                  ${params.conteudo}

                  <p
                    style="
                      margin-top:28px;
                      font-size:14px;
                      color:#666666;
                    "
                  >
                    Atenciosamente,<br />
                    <strong>Intranet Pizzatto</strong>
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

  async enviarSolicitacaoAprovada(params: {
    colaboradorNome: string;

    colaboradorEmail?: string | null;

    rhEmail?: string | null;

    aprovadoPorNome?: string | null;

    modalidade: string;

    parcelas: Array<{
      ordem: number;
      quantidadeDias: number;
      dataInicio: Date;
      dataFim: Date;
      dataRetorno: Date;
    }>;
  }) {
    const periodos = params.parcelas
      .map(
        (parcela) => `
        <div
          style="
            margin:10px 0;
            padding:14px 16px;
            background:#f7f9fc;
            border:1px solid #e1e6eb;
            border-radius:8px;
          "
        >
          <strong>
            ${parcela.ordem}º período
          </strong>

          <br />

          ${parcela.quantidadeDias} dias

          <br />

          ${this.formatarData(parcela.dataInicio)}
          até
          ${this.formatarData(parcela.dataFim)}

          <br />

          <strong>Retorno:</strong>
          ${this.formatarData(parcela.dataRetorno)}
        </div>
      `,
      )
      .join('');

    const html = this.criarTemplate({
      titulo: 'Solicitação de férias aprovada',

      subtitulo: 'Sua programação de férias foi aprovada.',

      cor: '#2e7d32',

      conteudo: `
      <p style="font-size:16px;color:#333333;">
        Olá,
        <strong>${params.colaboradorNome}</strong>.
      </p>

      <p
        style="
          font-size:15px;
          line-height:1.7;
          color:#555555;
        "
      >
        Sua solicitação de férias foi
        <strong style="color:#2e7d32;">
          aprovada
        </strong>.
      </p>

      <p>
        <strong>Modalidade:</strong>
        ${params.modalidade}
      </p>

      ${periodos}

      ${
        params.aprovadoPorNome
          ? `
            <p style="margin-top:20px;">
              <strong>Aprovado por:</strong>
              ${params.aprovadoPorNome}
            </p>
          `
          : ''
      }
    `,
    });

    return this.enviarEmail({
      destinatarios: [params.colaboradorEmail, params.rhEmail],

      assunto: 'Sua solicitação de férias foi aprovada',

      html,
    });
  }

  async enviarDocumentoDisponivel(params: {
    colaboradorNome: string;

    colaboradorEmail?: string | null;

    ordemParcela: number;

    dataInicio: Date;

    dataFim: Date;
  }) {
    const html = this.criarTemplate({
      titulo: 'Documento de férias disponível',

      subtitulo: 'Seu documento está disponível para assinatura.',

      cor: '#1565c0',

      conteudo: `
      <p style="font-size:16px;color:#333333;">
        Olá,
        <strong>${params.colaboradorNome}</strong>.
      </p>

      <p
        style="
          font-size:15px;
          line-height:1.7;
          color:#555555;
        "
      >
        O documento referente ao seu
        <strong>
          ${params.ordemParcela}º período de férias
        </strong>
        está disponível.
      </p>

      <div
        style="
          margin:24px 0;
          padding:18px 20px;
          background:#f7f9fc;
          border:1px solid #dce3eb;
          border-radius:10px;
        "
      >
        <strong>Período:</strong>

        ${this.formatarData(params.dataInicio)}

        até

        ${this.formatarData(params.dataFim)}
      </div>

      <p
        style="
          font-size:15px;
          color:#333333;
        "
      >
        Acesse a Intranet para consultar
        e assinar o documento.
      </p>
    `,
    });

    return this.enviarEmail({
      destinatarios: [params.colaboradorEmail],

      assunto: 'Documento de férias disponível para assinatura',

      html,
    });
  }

  private normalizarDestinatarios(
    destinatarios: Array<string | null | undefined>,
  ) {
    return Array.from(
      new Set(
        destinatarios
          .map((email) =>
            String(email || '')
              .trim()
              .toLowerCase(),
          )
          .filter(Boolean),
      ),
    );
  }

  private async enviarEmail(params: {
    destinatarios: Array<string | null | undefined>;

    assunto: string;

    html: string;

    attachments?: nodemailer.SendMailOptions['attachments'];
  }) {
    const destinatarios = this.normalizarDestinatarios(params.destinatarios);

    if (!destinatarios.length) {
      console.warn('[FERIAS][EMAIL] Nenhum destinatário válido.');

      return {
        enviado: false,
        destinatarios: [],
      };
    }

    try {
      await this.transporter.sendMail({
        from: process.env.SMTP_FROM,

        to: destinatarios.join(','),

        subject: params.assunto,

        html: params.html,

        attachments: params.attachments ?? [],
      });

      return {
        enviado: true,
        destinatarios,
      };
    } catch (error) {
      console.error('[FERIAS][EMAIL] Erro no envio:', error);

      throw new InternalServerErrorException(
        'Não foi possível enviar o e-mail de férias.',
      );
    }
  }

  private formatarData(data: Date | string) {
    const valor = data instanceof Date ? data : new Date(data);

    return new Intl.DateTimeFormat('pt-BR', {
      timeZone: 'UTC',
    }).format(valor);
  }

  async enviarSolicitacaoCriada(params: {
    colaboradorNome: string;

    colaboradorEmail?: string | null;

    gestorNome?: string | null;

    gestorEmail?: string | null;

    rhEmail?: string | null;

    modalidade: string;

    anoVigencia: number;

    parcelas: Array<{
      ordem: number;
      quantidadeDias: number;
      dataInicio: Date;
      dataFim: Date;
      dataRetorno: Date;
    }>;
  }) {
    const linhasParcelas = params.parcelas
      .map(
        (parcela) => `
            <tr>
              <td style="padding:8px;border-bottom:1px solid #eeeeee;">
                ${parcela.ordem}º período
              </td>

              <td style="padding:8px;border-bottom:1px solid #eeeeee;">
                ${parcela.quantidadeDias} dias
              </td>

              <td style="padding:8px;border-bottom:1px solid #eeeeee;">
                ${this.formatarData(parcela.dataInicio)}
              </td>

              <td style="padding:8px;border-bottom:1px solid #eeeeee;">
                ${this.formatarData(parcela.dataFim)}
              </td>

              <td style="padding:8px;border-bottom:1px solid #eeeeee;">
                ${this.formatarData(parcela.dataRetorno)}
              </td>
            </tr>
          `,
      )
      .join('');

    const html = `
      <div style="margin:0;padding:0;background:#f4f6f8;font-family:Arial,Helvetica,sans-serif;">
        <table
          width="100%"
          cellpadding="0"
          cellspacing="0"
          border="0"
          style="background:#f4f6f8;padding:32px 16px;"
        >
          <tr>
            <td align="center">
              <table
                width="100%"
                cellpadding="0"
                cellspacing="0"
                border="0"
                style="max-width:720px;background:#ffffff;border-radius:14px;overflow:hidden;"
              >
                <tr>
                  <td
                    style="background:#1565c0;padding:24px 32px;color:#ffffff;"
                  >
                    <h1 style="margin:0;font-size:23px;">
                      Nova solicitação de férias
                    </h1>

                    <p style="margin:8px 0 0;font-size:14px;">
                      A solicitação está aguardando aprovação.
                    </p>
                  </td>
                </tr>

                <tr>
                  <td style="padding:32px;">
                    <p style="font-size:16px;color:#333333;">
                      Olá,
                    </p>

                    <p
                      style="font-size:15px;line-height:1.7;color:#555555;"
                    >
                      <strong>${params.colaboradorNome}</strong>
                      realizou uma nova solicitação de férias.
                    </p>

                    <div
                      style="margin:22px 0;padding:18px 20px;background:#f7f9fc;border:1px solid #dce3eb;border-radius:10px;"
                    >
                      <p style="margin:0 0 8px;">
                        <strong>Vigência:</strong>
                        ${params.anoVigencia}
                      </p>

                      <p style="margin:0;">
                        <strong>Modalidade:</strong>
                        ${params.modalidade}
                      </p>
                    </div>

                    <table
                      width="100%"
                      cellpadding="0"
                      cellspacing="0"
                      border="0"
                      style="border-collapse:collapse;font-size:14px;"
                    >
                      <thead>
                        <tr>
                          <th align="left" style="padding:8px;">
                            Período
                          </th>

                          <th align="left" style="padding:8px;">
                            Dias
                          </th>

                          <th align="left" style="padding:8px;">
                            Início
                          </th>

                          <th align="left" style="padding:8px;">
                            Fim
                          </th>

                          <th align="left" style="padding:8px;">
                            Retorno
                          </th>
                        </tr>
                      </thead>

                      <tbody>
                        ${linhasParcelas}
                      </tbody>
                    </table>

                    ${
                      params.gestorNome
                        ? `
                          <p
                            style="margin-top:24px;font-size:14px;color:#555555;"
                          >
                            <strong>Gestor responsável:</strong>
                            ${params.gestorNome}
                          </p>
                        `
                        : ''
                    }

                    <p
                      style="margin-top:28px;font-size:14px;color:#666666;"
                    >
                      Atenciosamente,<br />
                      <strong>Intranet Pizzatto</strong>
                    </p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
        </table>
      </div>
    `;

    return await this.enviarEmail({
      destinatarios: [
        params.colaboradorEmail,
        params.gestorEmail,
        params.rhEmail,
      ],

      assunto: 'Nova solicitação de férias aguardando aprovação',

      html,
    });
  }

  async enviarSolicitacaoCancelada(params: {
    colaboradorNome: string;

    colaboradorEmail?: string | null;

    gestorEmail?: string | null;

    rhEmail?: string | null;

    motivo: string;
  }) {
    const html = this.criarTemplate({
      titulo: 'Solicitação de férias cancelada',

      subtitulo: 'A programação de férias foi cancelada.',

      cor: '#d32f2f',

      conteudo: `
      <p style="font-size:16px;color:#333333;">
        Olá,
        <strong>${params.colaboradorNome}</strong>.
      </p>

      <p
        style="
          font-size:15px;
          line-height:1.7;
          color:#555555;
        "
      >
        Sua solicitação de férias foi cancelada.
      </p>

      <div
        style="
          margin:24px 0;
          padding:18px 20px;
          background:#fff4f4;
          border:1px solid #f3c7c7;
          border-radius:10px;
        "
      >
        <strong style="color:#b71c1c;">
          Motivo do cancelamento
        </strong>

        <p
          style="
            margin:8px 0 0;
            color:#6b2c2c;
          "
        >
          ${params.motivo}
        </p>
      </div>
    `,
    });

    return this.enviarEmail({
      destinatarios: [
        params.colaboradorEmail,
        params.gestorEmail,
        params.rhEmail,
      ],

      assunto: 'Solicitação de férias cancelada',

      html,
    });
  }

  async enviarDocumentoAssinado(params: {
    colaboradorNome: string;

    colaboradorEmail?: string | null;

    rhEmail?: string | null;

    ordemParcela: number;

    dataInicio: Date;

    dataFim: Date;
  }) {
    const html = this.criarTemplate({
      titulo: 'Documento de férias assinado',

      subtitulo: 'O documento assinado foi recebido com sucesso.',

      cor: '#2e7d32',

      conteudo: `
      <p style="font-size:16px;color:#333333;">
        Olá,
        <strong>${params.colaboradorNome}</strong>.
      </p>

      <p
        style="
          font-size:15px;
          line-height:1.7;
          color:#555555;
        "
      >
        O documento referente ao seu
        <strong>
          ${params.ordemParcela}º período de férias
        </strong>
        foi recebido e registrado com sucesso.
      </p>

      <div
        style="
          margin:24px 0;
          padding:18px 20px;
          background:#f1f8f2;
          border:1px solid #cfe8d1;
          border-radius:10px;
        "
      >
        <strong>Período:</strong>

        ${this.formatarData(params.dataInicio)}

        até

        ${this.formatarData(params.dataFim)}
      </div>

      <p style="font-size:15px;color:#555555;">
        O RH também foi notificado sobre o recebimento do documento.
      </p>
    `,
    });

    return this.enviarEmail({
      destinatarios: [params.colaboradorEmail, params.rhEmail],

      assunto: 'Documento de férias assinado recebido',

      html,
    });
  }

  async enviarAlerta90Dias(params: {
    colaboradorNome: string;

    colaboradorEmail?: string | null;

    gestorNome?: string | null;

    gestorEmail?: string | null;

    rhEmail?: string | null;

    anoVigencia: number;

    dataLimiteConcessivo: Date;

    diasRestantes: number;
  }) {
    const html = this.criarTemplate({
      titulo: 'Alerta de prazo de férias',

      subtitulo: 'O período concessivo está se aproximando do vencimento.',

      cor: '#ed6c02',

      conteudo: `
      <p style="font-size:16px;color:#333333;">
        Olá,
        <strong>${params.colaboradorNome}</strong>.
      </p>

      <p
        style="
          font-size:15px;
          line-height:1.7;
          color:#555555;
        "
      >
        Faltam aproximadamente
        <strong>${params.diasRestantes} dias</strong>
        para o término do período concessivo das suas férias.
      </p>

      <div
        style="
          margin:24px 0;
          padding:18px 20px;
          background:#fff8ed;
          border:1px solid #f1d4a7;
          border-radius:10px;
        "
      >
        <p style="margin:0 0 8px;">
          <strong>Vigência:</strong>
          ${params.anoVigencia}
        </p>

        <p style="margin:0;">
          <strong>Data limite:</strong>
          ${this.formatarData(params.dataLimiteConcessivo)}
        </p>
      </div>

      ${
        params.gestorNome
          ? `
            <p style="font-size:14px;color:#555555;">
              <strong>Gestor responsável:</strong>
              ${params.gestorNome}
            </p>
          `
          : ''
      }

      <p style="font-size:15px;color:#555555;">
        Recomendamos que a programação seja regularizada com antecedência.
      </p>
    `,
    });

    return this.enviarEmail({
      destinatarios: [
        params.colaboradorEmail,
        params.gestorEmail,
        params.rhEmail,
      ],

      assunto: 'Alerta: faltam até 90 dias para o vencimento das férias',

      html,
    });
  }

  async enviarAlerta60Dias(params: {
    colaboradorNome: string;

    colaboradorEmail?: string | null;

    gestorNome?: string | null;

    gestorEmail?: string | null;

    rhEmail?: string | null;

    anoVigencia: number;

    dataLimiteConcessivo: Date;

    diasRestantes: number;
  }) {
    const html = this.criarTemplate({
      titulo: 'Atenção ao vencimento das férias',

      subtitulo: 'O período concessivo está próximo do vencimento.',

      cor: '#d32f2f',

      conteudo: `
      <p style="font-size:16px;color:#333333;">
        Olá,
        <strong>${params.colaboradorNome}</strong>.
      </p>

      <p
        style="
          font-size:15px;
          line-height:1.7;
          color:#555555;
        "
      >
        Faltam aproximadamente
        <strong style="color:#d32f2f;">
          ${params.diasRestantes} dias
        </strong>
        para o término do período concessivo das suas férias.
      </p>

      <div
        style="
          margin:24px 0;
          padding:18px 20px;
          background:#fff4f4;
          border:1px solid #f3c7c7;
          border-radius:10px;
        "
      >
        <p style="margin:0 0 8px;">
          <strong>Vigência:</strong>
          ${params.anoVigencia}
        </p>

        <p style="margin:0;">
          <strong>Data limite:</strong>
          ${this.formatarData(params.dataLimiteConcessivo)}
        </p>
      </div>

      <p style="font-size:15px;color:#555555;">
        A programação das férias deve ser tratada com prioridade.
      </p>
    `,
    });

    return this.enviarEmail({
      destinatarios: [
        params.colaboradorEmail,
        params.gestorEmail,
        params.rhEmail,
      ],

      assunto: 'Atenção: faltam até 60 dias para o vencimento das férias',

      html,
    });
  }
}
