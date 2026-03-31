import { Injectable, BadRequestException } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import * as nodemailer from 'nodemailer';

@Injectable()
export class AssinaturasEmailService {
  private transporter = nodemailer.createTransport({
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
        console.log('SMTP conectado com sucesso');
      })
      .catch((error) => {
        console.error('Erro ao conectar no SMTP:', error);
      });

    console.log('SMTP DEBUG', {
      host: process.env.SMTP_HOST,
      port: process.env.SMTP_PORT,
      user: process.env.SMTP_USER,
      passExists: !!process.env.SMTP_PASS,
    });
  }

  async create(body: any, file: Express.Multer.File, ip: string, user: any) {
    if (!file) {
      throw new BadRequestException('Imagem da assinatura é obrigatória.');
    }

    const caminhoImagem = `downloads/assinaturas/${file.filename}`;

    const create = await this.prisma.assinatura.create({
      data: {
        nome: body.nome.trim(),
        email: body.email.trim(),
        departamento: body.departamento.trim(),
        telefone: body.telefone.trim(),
        criadoPor: user.name,
        caminhoImagem,
      },
    });

    return await this.prisma.audit_logs.create({
      data: {
        acao: `Criou a Assinatura de E-mail de ${create.nome}`,
        entidade: user.name,
        filialEntidade: user.company,
        ipAddress: ip,
      },
    });
  }

  async findByFilter(body: any) {
    const page = Number(body.page) > 0 ? Number(body.page) : 1;
    const limit = Number(body.limit) > 0 ? Number(body.limit) : 10;
    const skip = (page - 1) * limit;

    const pesquisa = body.pesquisa?.trim();

    const where = {
      AND: [
        {
          status: 'AGUARDANDO APROVAÇÃO',
        },
        ...(pesquisa
          ? [
              {
                OR: [
                  {
                    nome: {
                      contains: pesquisa,
                      mode: 'insensitive' as const,
                    },
                  },
                  {
                    email: {
                      contains: pesquisa,
                      mode: 'insensitive' as const,
                    },
                  },
                  {
                    departamento: {
                      contains: pesquisa,
                      mode: 'insensitive' as const,
                    },
                  },
                  {
                    telefone: {
                      contains: pesquisa,
                      mode: 'insensitive' as const,
                    },
                  },
                ],
              },
            ]
          : []),
      ],
    };

    const [result, total] = await Promise.all([
      this.prisma.assinatura.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.assinatura.count({ where }),
    ]);

    return {
      result,
      total,
    };
  }

  async updateValidacao(id: string, body: any) {
    const assinatura = await this.prisma.assinatura.findUnique({
      where: { id },
    });

    if (!assinatura) {
      throw new BadRequestException('Assinatura não encontrada.');
    }

    let subject = '';
    let html = '';
    let attachments: any[] = [];

    if (body.status === 'REPROVADO') {
      subject = 'Sua assinatura foi reprovada ❌';

      html = `
        <div style="margin:0; padding:0; background-color:#f4f6f8; font-family:Arial, Helvetica, sans-serif;">
          <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#f4f6f8; padding:32px 16px;">
            <tr>
              <td align="center">
                <table width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:640px; background:#ffffff; border-radius:14px; overflow:hidden; box-shadow:0 4px 18px rgba(0,0,0,0.08);">
                  
                  <tr>
                    <td style="background:linear-gradient(90deg, #d32f2f, #ef5350); padding:24px 32px; color:#ffffff;">
                      <h1 style="margin:0; font-size:24px; font-weight:700;">Assinatura reprovada</h1>
                      <p style="margin:8px 0 0; font-size:14px; opacity:0.95;">
                        Atualização sobre a sua solicitação de assinatura de e-mail
                      </p>
                    </td>
                  </tr>

                  <tr>
                    <td style="padding:32px;">
                      <p style="margin:0 0 16px; font-size:16px; color:#333333;">
                        Olá, <strong>${body.nome}</strong>.
                      </p>

                      <p style="margin:0 0 16px; font-size:15px; line-height:1.7; color:#555555;">
                        Informamos que a sua solicitação de assinatura de e-mail foi
                        <strong style="color:#d32f2f;"> reprovada</strong> após a análise da equipe responsável.
                      </p>

                      <div style="margin:24px 0; padding:18px 20px; background:#fff4f4; border:1px solid #f3c7c7; border-radius:10px;">
                        <p style="margin:0 0 8px; font-size:14px; font-weight:700; color:#b71c1c;">
                          Motivo da reprovação
                        </p>
                        <p style="margin:0; font-size:14px; line-height:1.6; color:#6b2c2c;">
                          ${body.motivo ?? 'Não informado'}
                        </p>
                      </div>

                      <p style="margin:0 0 16px; font-size:15px; line-height:1.7; color:#555555;">
                        Pedimos, por gentileza, que realize os ajustes necessários e envie novamente para uma nova validação.
                      </p>

                      <p style="margin:24px 0 0; font-size:15px; color:#333333;">
                        Atenciosamente,<br />
                        <strong>Equipe de Marketing</strong>
                      </p>
                    </td>
                  </tr>

                  <tr>
                    <td style="padding:18px 32px; background:#fafafa; border-top:1px solid #eeeeee;">
                      <p style="margin:0; font-size:12px; color:#888888; text-align:center;">
                        Este é um e-mail automático. Em caso de dúvidas, entre em contato com a equipe responsável.
                      </p>
                    </td>
                  </tr>

                </table>
              </td>
            </tr>
          </table>
        </div>
      `;
    } else if (body.status === 'APROVADO') {
      const caminhoImagem = assinatura.caminhoImagem || '';

      subject = 'Sua assinatura foi aprovada ✅';

      html = `
    <div style="margin:0; padding:0; background-color:#f4f6f8; font-family:Arial, Helvetica, sans-serif;">
      <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#f4f6f8; padding:32px 16px;">
        <tr>
          <td align="center">
            <table width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:640px; background:#ffffff; border-radius:14px; overflow:hidden; box-shadow:0 4px 18px rgba(0,0,0,0.08);">
              
              <tr>
                <td style="background:linear-gradient(90deg, #2e7d32, #43a047); padding:24px 32px; color:#ffffff;">
                  <h1 style="margin:0; font-size:24px; font-weight:700;">Assinatura aprovada</h1>
                  <p style="margin:8px 0 0; font-size:14px; opacity:0.95;">
                    Sua assinatura de e-mail foi validada com sucesso
                  </p>
                </td>
              </tr>

              <tr>
                <td style="padding:32px;">
                  <p style="margin:0 0 16px; font-size:16px; color:#333333;">
                    Olá, <strong>${body.nome}</strong>.
                  </p>

                  <p style="margin:0 0 16px; font-size:15px; line-height:1.7; color:#555555;">
                    Temos uma boa notícia: sua solicitação de assinatura de e-mail foi
                    <strong style="color:#2e7d32;"> aprovada com sucesso</strong>.
                  </p>

                  <div style="margin:24px 0; padding:18px 20px; background:#f1f8f2; border:1px solid #cfe8d1; border-radius:10px;">
                    <p style="margin:0; font-size:14px; line-height:1.7; color:#2f5d34;">
                      A assinatura aprovada segue em anexo neste e-mail para download.
                    </p>
                  </div>

                  <p style="margin:0 0 16px; font-size:15px; line-height:1.7; color:#555555;">
                    Recomendamos que utilize o arquivo enviado como padrão oficial da sua assinatura corporativa.
                  </p>

                  <p style="margin:24px 0 0; font-size:15px; color:#333333;">
                    Atenciosamente,<br />
                    <strong>Equipe de Marketing</strong>
                  </p>
                </td>
              </tr>

              <tr>
                <td style="padding:18px 32px; background:#fafafa; border-top:1px solid #eeeeee;">
                  <p style="margin:0; font-size:12px; color:#888888; text-align:center;">
                    Este é um e-mail automático. Em caso de dúvidas, entre em contato com a equipe responsável.
                  </p>
                </td>
              </tr>

            </table>
          </td>
        </tr>
      </table>
    </div>
  `;

      if (caminhoImagem) {
        attachments.push({
          filename: 'assinatura-aprovada.png',
          path: `${process.env.API_BACKEND}/${caminhoImagem}`,
        });
      }
    } else {
      throw new BadRequestException('Status inválido.');
    }

    await this.transporter.sendMail({
      from: process.env.SMTP_FROM,
      to: body.email,
      subject,
      html,
      attachments,
    });

    await this.prisma.assinatura.update({
      where: { id },
      data: {
        status: body.status,
        motivo: body.status === 'REPROVADO' ? body.motivo : null,
      },
    });
  }
}
