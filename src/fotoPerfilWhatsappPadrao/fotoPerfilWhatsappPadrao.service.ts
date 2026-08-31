import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class FotoPerfilWhatsappPadraoService {
  constructor(private readonly prisma: PrismaService) {}

  async create(body: any, file: Express.Multer.File, ip: string, user: any) {
    if (!file) {
      throw new BadRequestException('Imagem de background é obrigatória.');
    }

    const caminhoBackground = `downloads/background-foto-perfil-whatsapp/${file.filename}`;

    /*
     * Foto
     */
    const photoX = Number(body.photoX);
    const photoY = Number(body.photoY);

    const photoWidth = Number(body.photoWidth);
    const photoHeight = Number(body.photoHeight);

    /*
     * Logo
     */
    const logoX = Number(body.logoX);
    const logoY = Number(body.logoY);
    const logoHeight = Number(body.logoHeight);

    /*
     * Campos numéricos obrigatórios
     */
    const numericFields = [
      {
        name: 'photoX',
        value: photoX,
      },
      {
        name: 'photoY',
        value: photoY,
      },
      {
        name: 'photoWidth',
        value: photoWidth,
      },
      {
        name: 'photoHeight',
        value: photoHeight,
      },
      {
        name: 'logoX',
        value: logoX,
      },
      {
        name: 'logoY',
        value: logoY,
      },
      {
        name: 'logoHeight',
        value: logoHeight,
      },
    ];

    const invalidField = numericFields.find((field) =>
      Number.isNaN(field.value),
    );

    if (invalidField) {
      throw new BadRequestException(
        `Campo numérico inválido: ${invalidField.name}`,
      );
    }

    /*
     * Validações adicionais
     */
    if (photoWidth <= 0) {
      throw new BadRequestException(
        'A largura da foto deve ser maior que zero.',
      );
    }

    if (photoHeight <= 0) {
      throw new BadRequestException(
        'A altura da foto deve ser maior que zero.',
      );
    }

    /*
     * Desativa o padrão anterior
     * e cria o novo padrão.
     */
    const [, fotoPerfilWhatsappPadrao] = await this.prisma.$transaction([
      this.prisma.fotoPerfilWhatsappPadrao.updateMany({
        where: {
          isAtual: true,
        },
        data: {
          isAtual: false,
        },
      }),

      this.prisma.fotoPerfilWhatsappPadrao.create({
        data: {
          caminhoBackground,

          photoX,
          photoY,
          photoWidth,
          photoHeight,

          logoX,
          logoY,
          logoHeight,

          criadoPor: user?.name || 'Sistema',

          isAtual: true,
        },
      }),
    ]);

    /*
     * Auditoria
     */
    await this.prisma.audit_logs.create({
      data: {
        acao: 'Criou o padrão de Foto de Perfil do WhatsApp',

        entidade: user?.name,

        filialEntidade: user?.company || user?.filial,

        ipAddress: ip,
      },
    });

    return fotoPerfilWhatsappPadrao;
  }

  async findAtual() {
    return this.prisma.fotoPerfilWhatsappPadrao.findFirst({
      where: {
        isAtual: true,
      },
    });
  }

  async findByFilter(body: any) {
    const page = Number(body.page) > 0 ? Number(body.page) : 1;

    const limit = Number(body.limit) > 0 ? Number(body.limit) : 10;

    const skip = (page - 1) * limit;

    const [result, total] = await Promise.all([
      this.prisma.fotoPerfilWhatsappPadrao.findMany({
        skip,
        take: limit,

        orderBy: {
          createdAt: 'desc',
        },
      }),

      this.prisma.fotoPerfilWhatsappPadrao.count(),
    ]);

    return {
      result,
      total,
    };
  }

  async update(body: any, file?: Express.Multer.File) {
    const id = String(body.id || '').trim();

    if (!id) {
      throw new BadRequestException('ID é obrigatório.');
    }

    const fotoPerfilWhatsappPadrao =
      await this.prisma.fotoPerfilWhatsappPadrao.findUnique({
        where: {
          id,
        },
      });

    if (!fotoPerfilWhatsappPadrao) {
      throw new NotFoundException(
        'Padrão de Foto de Perfil do WhatsApp não encontrado.',
      );
    }

    const data: any = {};

    /*
     * Caso seja enviado um novo background,
     * substituímos o caminho salvo.
     */
    if (file) {
      data.caminhoBackground = `downloads/background-foto-perfil-whatsapp/${file.filename}`;
    }

    /*
     * Campos numéricos que podem ser atualizados.
     */
    const numericFields = [
      'photoX',
      'photoY',

      'photoWidth',
      'photoHeight',

      'logoX',
      'logoY',
      'logoHeight',
    ];

    for (const field of numericFields) {
      if (
        body[field] !== undefined &&
        body[field] !== null &&
        body[field] !== ''
      ) {
        const value = Number(body[field]);

        if (Number.isNaN(value)) {
          throw new BadRequestException(`Campo numérico inválido: ${field}`);
        }

        if ((field === 'photoWidth' || field === 'photoHeight') && value <= 0) {
          throw new BadRequestException(`${field} deve ser maior que zero.`);
        }

        data[field] = value;
      }
    }

    return this.prisma.fotoPerfilWhatsappPadrao.update({
      where: {
        id,
      },

      data,
    });
  }

  async delete(body: any) {
    const id = String(body.id || '').trim();

    if (!id) {
      throw new BadRequestException('ID é obrigatório.');
    }

    const fotoPerfilWhatsappPadrao =
      await this.prisma.fotoPerfilWhatsappPadrao.findUnique({
        where: {
          id,
        },
      });

    if (!fotoPerfilWhatsappPadrao) {
      throw new NotFoundException(
        'Padrão de Foto de Perfil do WhatsApp não encontrado.',
      );
    }

    return this.prisma.fotoPerfilWhatsappPadrao.delete({
      where: {
        id,
      },
    });
  }

  async changeFotoPerfilWhatsappPadrao(id: string) {
    const fotoPerfilWhatsappPadrao =
      await this.prisma.fotoPerfilWhatsappPadrao.findUnique({
        where: {
          id,
        },
      });

    if (!fotoPerfilWhatsappPadrao) {
      throw new NotFoundException(
        'Padrão de Foto de Perfil do WhatsApp não encontrado.',
      );
    }

    return this.prisma.$transaction(async (tx) => {
      /*
       * Remove o padrão atual.
       */
      await tx.fotoPerfilWhatsappPadrao.updateMany({
        where: {
          isAtual: true,
        },

        data: {
          isAtual: false,
        },
      });

      /*
       * Define o novo padrão.
       */
      return tx.fotoPerfilWhatsappPadrao.update({
        where: {
          id,
        },

        data: {
          isAtual: true,
        },
      });
    });
  }
}
