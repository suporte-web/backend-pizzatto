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
import sharp from 'sharp';
import { randomUUID } from 'crypto';

@Injectable()
export class FotoPerfilWhatsappService {
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
    this.transporter.verify().catch((error) => {
      console.error('Erro ao conectar no SMTP:', error);
    });
  }

  async create(body: any, file: Express.Multer.File, ip: string, user: any) {
    if (!file) {
      throw new BadRequestException('Imagem da Foto de Perfil é obrigatória.');
    }

    /*
     * Valida formato recebido.
     */
    if (file.mimetype !== 'image/png') {
      throw new BadRequestException(
        'A Foto de Perfil deve estar no formato PNG.',
      );
    }

    /*
     * Gera PNG circular definitivo.
     */
    const { caminhoImagem } = await this.gerarPngCircular(file);

    const create = await this.prisma.fotoPerfilWhatsapp.create({
      data: {
        nome: body.nome.trim(),

        email: body.email.trim(),

        criadoPor: user?.name || 'Sistema',

        caminhoImagem,
      },
    });

    await this.prisma.audit_logs.create({
      data: {
        acao: `Criou a Foto de Perfil do WhatsApp de ${create.nome}`,

        entidade: user?.name,

        filialEntidade: user?.company,

        ipAddress: ip,
      },
    });

    return create;
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
                ],
              },
            ]
          : []),
      ],
    };

    const [result, total] = await Promise.all([
      this.prisma.fotoPerfilWhatsapp.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.fotoPerfilWhatsapp.count({ where }),
    ]);

    return {
      result,
      total,
    };
  }

  async updateValidacao(id: string, body: any, ip: string, user: any) {
    const fotoPerfilWhatsapp = await this.prisma.fotoPerfilWhatsapp.findUnique({
      where: { id },
    });

    if (!fotoPerfilWhatsapp) {
      throw new NotFoundException('Foto de Perfil não encontrada.');
    }

    if (!['APROVADO', 'REPROVADO'].includes(body.status)) {
      throw new BadRequestException('Status inválido.');
    }

    const destinatario = fotoPerfilWhatsapp.email;

    if (!destinatario) {
      throw new BadRequestException(
        'A foto de Perfil não possui um e-mail válido.',
      );
    }

    let subject = '';
    let html = '';
    const attachments: nodemailer.SendMailOptions['attachments'] = [];

    if (body.status === 'REPROVADO') {
      subject = 'Sua Foto de Perfil foi reprovada ❌';

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
                      Foto de Perfil reprovada
                    </h1>
                  </td>
                </tr>

                <tr>
                  <td style="padding:32px;">
                    <p style="font-size:16px; color:#333333;">
                      Olá, <strong>${fotoPerfilWhatsapp.nome}</strong>.
                    </p>

                    <p style="font-size:15px; line-height:1.7; color:#555555;">
                      Sua solicitação de foto de perfil foi reprovada.
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
      subject = 'Sua Foto de Perfil foi aprovada ✅';

      if (!fotoPerfilWhatsapp.caminhoImagem) {
        throw new BadRequestException(
          'A Foto de Perfil não possui uma imagem vinculada.',
        );
      }

      const caminhoAbsoluto = path.resolve(
        process.cwd(),
        fotoPerfilWhatsapp.caminhoImagem,
      );

      if (!fs.existsSync(caminhoAbsoluto)) {
        console.error(
          '[FOTO DE PERFIL] Arquivo não encontrado:',
          caminhoAbsoluto,
        );

        throw new NotFoundException(
          'O arquivo da foto de perfil não foi encontrado no servidor.',
        );
      }

      attachments.push({
        filename: `foto-de-perfil-${fotoPerfilWhatsapp.nome
          .normalize('NFD')
          .replace(/[\u0300-\u036f]/g, '')
          .replace(/[^a-zA-Z0-9-_ ]/g, '')
          .trim()
          .replace(/\s+/g, '-')
          .toLowerCase()}-${Date.now()}.png`,
        path: caminhoAbsoluto,
        contentType: 'image/png',
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
                      Foto de Perfil aprovada
                    </h1>

                    <p style="margin:8px 0 0; font-size:14px;">
                      Sua foto de perfil foi validada com sucesso.
                    </p>
                  </td>
                </tr>

                <tr>
                  <td style="padding:32px;">
                    <p style="font-size:16px; color:#333333;">
                      Olá, <strong>${fotoPerfilWhatsapp.nome}</strong>.
                    </p>

                    <p style="font-size:15px; line-height:1.7; color:#555555;">
                      Sua solicitação de foto de perfil para o WhatsApp foi
                        <strong style="color:#2e7d32;">
                            aprovada com sucesso
                        </strong>.
                    </p>

                    <div style="margin:24px 0; padding:18px 20px; background:#f1f8f2; border:1px solid #cfe8d1; border-radius:10px;">
                      <p style="margin:0; color:#2f5d34;">
                        A foto de perfil aprovada segue anexada a este e-mail.
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
      await this.transporter.sendMail({
        from: process.env.SMTP_FROM,
        to: destinatario,
        subject,
        html,
        attachments,
      });
    } catch (error) {
      console.error('[FOTO DE PERFIL] Erro no envio do e-mail:', error);

      throw new InternalServerErrorException(
        'Não foi possível enviar o e-mail da foto de perfil.',
      );
    }

    await this.prisma.audit_logs.create({
      data: {
        acao: `${body.status} foto de perfil do Whatsapp de ${fotoPerfilWhatsapp.nome}`,
        entidade: user.name,
        filialEntidade: user.company,
        ipAddress: ip,
      },
    });

    return this.prisma.fotoPerfilWhatsapp.update({
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

  private async gerarPngCircular(file: Express.Multer.File): Promise<{
    caminhoImagem: string;
    caminhoAbsoluto: string;
  }> {
    const pasta = path.resolve(process.cwd(), 'downloads/foto-perfil-whatsapp');

    if (!fs.existsSync(pasta)) {
      fs.mkdirSync(pasta, {
        recursive: true,
      });
    }

    const nomeArquivo = `${randomUUID()}.png`;

    const caminhoAbsoluto = path.join(pasta, nomeArquivo);

    /*
     * Descobre as dimensões da imagem recebida.
     */
    const metadata = await sharp(file.path).metadata();

    const largura = metadata.width;
    const altura = metadata.height;

    if (!largura || !altura) {
      throw new BadRequestException(
        'Não foi possível identificar as dimensões da imagem.',
      );
    }

    /*
     * Garante uma imagem quadrada.
     *
     * Como a Foto de Perfil é circular,
     * largura e altura precisam ser iguais.
     */
    const tamanho = Math.min(largura, altura);

    /*
     * Máscara circular.
     */
    const mascaraCircular = Buffer.from(`
    <svg
      width="${tamanho}"
      height="${tamanho}"
      viewBox="0 0 ${tamanho} ${tamanho}"
    >
      <circle
        cx="${tamanho / 2}"
        cy="${tamanho / 2}"
        r="${tamanho / 2}"
        fill="white"
      />
    </svg>
  `);

    await sharp(file.path)
      .resize(tamanho, tamanho, {
        fit: 'cover',
        position: 'center',
      })
      .ensureAlpha()
      .composite([
        {
          input: mascaraCircular,
          blend: 'dest-in',
        },
      ])
      .png({
        compressionLevel: 9,
      })
      .toFile(caminhoAbsoluto);

    /*
     * Remove o arquivo temporário enviado pelo Multer.
     *
     * Só fazemos isso se ele for diferente
     * do PNG final.
     */
    if (
      file.path &&
      path.resolve(file.path) !== path.resolve(caminhoAbsoluto) &&
      fs.existsSync(file.path)
    ) {
      try {
        fs.unlinkSync(file.path);
      } catch (error) {
        console.error(
          '[FOTO DE PERFIL] Não foi possível remover arquivo temporário:',
          error,
        );
      }
    }

    return {
      caminhoImagem: `downloads/foto-perfil-whatsapp/${nomeArquivo}`,

      caminhoAbsoluto,
    };
  }
}
