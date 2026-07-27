import {
  Injectable,
  BadRequestException,
  NotFoundException,
  InternalServerErrorException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import * as nodemailer from 'nodemailer';
import * as path from 'path';
import * as fs from 'fs';

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
      throw new NotFoundException('Assinatura não encontrada.');
    }

    if (!['APROVADO', 'REPROVADO'].includes(body.status)) {
      throw new BadRequestException('Status inválido.');
    }

    const destinatario = assinatura.email;

    if (!destinatario) {
      throw new BadRequestException(
        'A assinatura não possui um e-mail válido.',
      );
    }

    let subject = '';
    let html = '';
    const attachments: nodemailer.SendMailOptions['attachments'] = [];

    if (body.status === 'REPROVADO') {
      subject = 'Sua assinatura foi reprovada ❌';

      html = `
      <div style="margin:0; padding:0; background-color:#f4f6f8; font-family:Arial, Helvetica, sans-serif;">
        <table width="100%" cellpadding="0" cellspacing="0" border="0"
          style="background-color:#f4f6f8; padding:32px 16px;">
          <tr>
            <td align="center">
              <table width="100%" cellpadding="0" cellspacing="0" border="0"
                style="max-width:640px; background:#ffffff; border-radius:14px; overflow:hidden;">
                <tr>
                  <td style="background:#d32f2f; padding:24px 32px; color:#ffffff;">
                    <h1 style="margin:0; font-size:24px;">
                      Assinatura reprovada
                    </h1>
                  </td>
                </tr>

                <tr>
                  <td style="padding:32px;">
                    <p style="font-size:16px; color:#333333;">
                      Olá, <strong>${assinatura.nome}</strong>.
                    </p>

                    <p style="font-size:15px; line-height:1.7; color:#555555;">
                      Sua solicitação de assinatura foi reprovada.
                    </p>

                    <div style="margin:24px 0; padding:18px 20px; background:#fff4f4; border:1px solid #f3c7c7; border-radius:10px;">
                      <strong style="color:#b71c1c;">
                        Motivo da reprovação
                      </strong>

                      <p style="margin:8px 0 0; color:#6b2c2c;">
                        ${body.motivo?.trim() || 'Não informado'}
                      </p>
                    </div>

                    <p style="font-size:15px; color:#333333;">
                      Atenciosamente,<br />
                      <strong>Equipe de Marketing</strong>
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

    if (body.status === 'APROVADO') {
      subject = 'Sua assinatura foi aprovada ✅';

      if (!assinatura.caminhoImagem) {
        throw new BadRequestException(
          'A assinatura não possui uma imagem vinculada.',
        );
      }

      /*
       * No create, o caminho salvo é:
       * downloads/assinaturas/nome-do-arquivo.png
       *
       * process.cwd() precisa apontar para a raiz da aplicação,
       * onde está a pasta downloads.
       */
      const caminhoAbsoluto = path.resolve(
        process.cwd(),
        assinatura.caminhoImagem,
      );

      console.log('[ASSINATURA] Caminho do anexo:', caminhoAbsoluto);

      if (!fs.existsSync(caminhoAbsoluto)) {
        console.error('[ASSINATURA] Arquivo não encontrado:', caminhoAbsoluto);

        throw new NotFoundException(
          'O arquivo da assinatura não foi encontrado no servidor.',
        );
      }

      attachments.push({
        filename: `assinatura-${assinatura.nome
          .normalize('NFD')
          .replace(/[\u0300-\u036f]/g, '')
          .replace(/[^a-zA-Z0-9-_ ]/g, '')
          .trim()
          .replace(/\s+/g, '-')
          .toLowerCase()}-${Date.now()}.jpeg`,
        path: caminhoAbsoluto,
        contentType: 'image/jeg',
      });

      html = `
      <div style="margin:0; padding:0; background-color:#f4f6f8; font-family:Arial, Helvetica, sans-serif;">
        <table width="100%" cellpadding="0" cellspacing="0" border="0"
          style="background-color:#f4f6f8; padding:32px 16px;">
          <tr>
            <td align="center">
              <table width="100%" cellpadding="0" cellspacing="0" border="0"
                style="max-width:640px; background:#ffffff; border-radius:14px; overflow:hidden;">
                <tr>
                  <td style="background:#2e7d32; padding:24px 32px; color:#ffffff;">
                    <h1 style="margin:0; font-size:24px;">
                      Assinatura aprovada
                    </h1>

                    <p style="margin:8px 0 0; font-size:14px;">
                      Sua assinatura foi validada com sucesso.
                    </p>
                  </td>
                </tr>

                <tr>
                  <td style="padding:32px;">
                    <p style="font-size:16px; color:#333333;">
                      Olá, <strong>${assinatura.nome}</strong>.
                    </p>

                    <p style="font-size:15px; line-height:1.7; color:#555555;">
                      Sua solicitação de assinatura de e-mail foi
                      <strong style="color:#2e7d32;">
                        aprovada com sucesso
                      </strong>.
                    </p>

                    <div style="margin:24px 0; padding:18px 20px; background:#f1f8f2; border:1px solid #cfe8d1; border-radius:10px;">
                      <p style="margin:0; color:#2f5d34;">
                        A assinatura aprovada segue anexada a este e-mail.
                      </p>
                    </div>

                    <p style="font-size:15px; color:#333333;">
                      Atenciosamente,<br />
                      <strong>Equipe de Marketing</strong>
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

    try {
      const resultadoEmail = await this.transporter.sendMail({
        from: process.env.SMTP_FROM,
        to: destinatario,
        subject,
        html,
        attachments,
      });

      console.log('[ASSINATURA] E-mail enviado:', {
        assinaturaId: assinatura.id,
        destinatario,
        messageId: resultadoEmail.messageId,
        anexos: attachments.length,
      });
    } catch (error) {
      console.error('[ASSINATURA] Erro no envio do e-mail:', error);

      throw new InternalServerErrorException(
        'Não foi possível enviar o e-mail da assinatura.',
      );
    }

    return this.prisma.assinatura.update({
      where: { id },
      data: {
        status: body.status,
        motivo:
          body.status === 'REPROVADO'
            ? body.motivo?.trim() || 'Não informado'
            : null,
      },
    });
  }
}
