import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class FotoPerfilWhatsappPadraoService {
  constructor(private readonly prisma: PrismaService) {}

  /*
   * =========================================================
   * AUXILIARES
   * =========================================================
   */

  private parseBoolean(value: any, defaultValue = false): boolean {
    if (value === undefined || value === null || value === '') {
      return defaultValue;
    }

    return value === true || value === 'true' || value === 1 || value === '1';
  }

  private parseOptionalNumber(value: any, fieldName: string): number | null {
    if (value === undefined || value === null || value === '') {
      return null;
    }

    const numberValue = Number(value);

    if (Number.isNaN(numberValue)) {
      throw new BadRequestException(`Campo numérico inválido: ${fieldName}`);
    }

    return numberValue;
  }

  /*
   * =========================================================
   * CREATE
   * =========================================================
   */

  async create(body: any, file: Express.Multer.File, ip: string, user: any) {
    if (!file) {
      throw new BadRequestException('Imagem de background é obrigatória.');
    }

    const caminhoBackground = `downloads/background-foto-perfil-whatsapp/${file.filename}`;

    /*
     * =========================
     * INFORMAÇÕES DO MODELO
     * =========================
     */

    const nome = String(body.nome || '').trim();

    const descricao = String(body.descricao || '').trim() || null;

    if (!nome) {
      throw new BadRequestException('Nome do modelo é obrigatório.');
    }

    /*
     * =========================
     * ORDEM
     * =========================
     */

    const ordem = Number(body.ordem ?? 0);

    if (Number.isNaN(ordem)) {
      throw new BadRequestException('Ordem inválida.');
    }

    if (!Number.isInteger(ordem)) {
      throw new BadRequestException('A ordem deve ser um número inteiro.');
    }

    if (ordem < 0) {
      throw new BadRequestException('A ordem não pode ser menor que zero.');
    }

    /*
     * =========================
     * FOTO
     * =========================
     */

    const photoX = Number(body.photoX);
    const photoY = Number(body.photoY);

    const photoWidth = Number(body.photoWidth);
    const photoHeight = Number(body.photoHeight);

    /*
     * =========================
     * LOGO
     * =========================
     */

    const logoX = Number(body.logoX);
    const logoY = Number(body.logoY);
    const logoHeight = Number(body.logoHeight);

    /*
     * =========================
     * CAMPOS DO NOME
     * =========================
     */

    const nomeX = this.parseOptionalNumber(body.nomeX, 'nomeX');

    const nomeY = this.parseOptionalNumber(body.nomeY, 'nomeY');

    const nomeCorFont = String(body.nomeCorFont || '').trim() || null;

    const nomeFontSize = String(body.nomeFontSize || '').trim() || null;

    /*
     * =========================
     * VALIDAÇÕES NUMÉRICAS
     * =========================
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
     * =========================
     * CONTROLE DO MODELO
     * =========================
     */

    const definirComoAtual = this.parseBoolean(body.isAtual, false);

    let disponivelParaEscolha = this.parseBoolean(
      body.disponivelParaEscolha,
      true,
    );

    /*
     * Se o modelo for definido como atual,
     * obrigatoriamente ele deve estar disponível.
     */
    if (definirComoAtual) {
      disponivelParaEscolha = true;
    }

    /*
     * Verifica se já existe algum modelo atual.
     *
     * Caso seja o primeiro modelo cadastrado,
     * ele automaticamente se torna o padrão.
     */
    const quantidadePadroes =
      await this.prisma.fotoPerfilWhatsappPadrao.count();

    const deveSerAtual = quantidadePadroes === 0 || definirComoAtual;

    /*
     * =========================
     * CRIAÇÃO
     * =========================
     */

    const fotoPerfilWhatsappPadrao = await this.prisma.$transaction(
      async (tx) => {
        /*
         * Somente desativa o padrão existente
         * se o novo modelo for virar o padrão.
         */
        if (deveSerAtual) {
          await tx.fotoPerfilWhatsappPadrao.updateMany({
            where: {
              isAtual: true,
            },

            data: {
              isAtual: false,
            },
          });
        }

        return tx.fotoPerfilWhatsappPadrao.create({
          data: {
            /*
             * Modelo
             */
            nome,
            descricao,
            ordem,

            /*
             * Background
             */
            caminhoBackground,

            /*
             * Foto
             */
            photoX,
            photoY,
            photoWidth,
            photoHeight,

            /*
             * Nome
             */
            nomeX,
            nomeY,
            nomeCorFont,
            nomeFontSize,

            /*
             * Logo
             */
            logoX,
            logoY,
            logoHeight,

            /*
             * Controle
             */
            criadoPor: user?.name || 'Sistema',

            isAtual: deveSerAtual,

            disponivelParaEscolha: deveSerAtual ? true : disponivelParaEscolha,
          },
        });
      },
    );

    /*
     * =========================
     * AUDITORIA
     * =========================
     */

    await this.prisma.audit_logs.create({
      data: {
        acao: `Criou o padrão de Foto de Perfil do WhatsApp: ${nome}`,

        entidade: user?.name,

        filialEntidade: user?.company || user?.filial,

        ipAddress: ip,
      },
    });

    return fotoPerfilWhatsappPadrao;
  }

  /*
   * =========================================================
   * BUSCA MODELO ATUAL
   * =========================================================
   */

  async findAtual() {
    return this.prisma.fotoPerfilWhatsappPadrao.findFirst({
      where: {
        isAtual: true,
      },
    });
  }

  /*
   * =========================================================
   * BUSCA MODELOS DISPONÍVEIS PARA ESCOLHA
   * =========================================================
   */

  async findDisponiveis() {
    return this.prisma.fotoPerfilWhatsappPadrao.findMany({
      where: {
        disponivelParaEscolha: true,
      },

      orderBy: [
        {
          isAtual: 'desc',
        },
        {
          ordem: 'asc',
        },
        {
          createdAt: 'desc',
        },
      ],
    });
  }

  /*
   * =========================================================
   * FIND BY FILTER
   * =========================================================
   */

  async findByFilter(body: any) {
    const page = Number(body.page) > 0 ? Number(body.page) : 1;

    const limit = Number(body.limit) > 0 ? Number(body.limit) : 10;

    const skip = (page - 1) * limit;

    /*
     * =========================
     * PESQUISA
     * =========================
     */

    const pesquisa =
      typeof body.pesquisa === 'string' ? body.pesquisa.trim() : '';

    const where: any = {};

    if (pesquisa) {
      where.OR = [
        {
          nome: {
            contains: pesquisa,
            mode: 'insensitive',
          },
        },
        {
          descricao: {
            contains: pesquisa,
            mode: 'insensitive',
          },
        },
        {
          criadoPor: {
            contains: pesquisa,
            mode: 'insensitive',
          },
        },
      ];
    }

    /*
     * Filtro opcional de disponibilidade.
     */
    if (
      body.disponivelParaEscolha !== undefined &&
      body.disponivelParaEscolha !== null &&
      body.disponivelParaEscolha !== ''
    ) {
      where.disponivelParaEscolha = this.parseBoolean(
        body.disponivelParaEscolha,
      );
    }

    /*
     * Filtro opcional para modelo atual.
     */
    if (
      body.isAtual !== undefined &&
      body.isAtual !== null &&
      body.isAtual !== ''
    ) {
      where.isAtual = this.parseBoolean(body.isAtual);
    }

    const [result, total] = await Promise.all([
      this.prisma.fotoPerfilWhatsappPadrao.findMany({
        where,

        skip,
        take: limit,

        orderBy: [
          {
            isAtual: 'desc',
          },
          {
            ordem: 'asc',
          },
          {
            createdAt: 'desc',
          },
        ],
      }),

      this.prisma.fotoPerfilWhatsappPadrao.count({
        where,
      }),
    ]);

    return {
      result,
      total,

      page,
      limit,

      totalPages: Math.ceil(total / limit),
    };
  }

  /*
   * =========================================================
   * UPDATE
   * =========================================================
   */

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
     * =========================
     * NOME
     * =========================
     */

    if (body.nome !== undefined) {
      const nome = String(body.nome || '').trim();

      if (!nome) {
        throw new BadRequestException('Nome do modelo é obrigatório.');
      }

      data.nome = nome;
    }

    /*
     * =========================
     * DESCRIÇÃO
     * =========================
     */

    if (body.descricao !== undefined) {
      const descricao = String(body.descricao || '').trim();

      data.descricao = descricao || null;
    }

    /*
     * =========================
     * ORDEM
     * =========================
     */

    if (body.ordem !== undefined && body.ordem !== null && body.ordem !== '') {
      const ordem = Number(body.ordem);

      if (Number.isNaN(ordem)) {
        throw new BadRequestException('Ordem inválida.');
      }

      if (!Number.isInteger(ordem)) {
        throw new BadRequestException('A ordem deve ser um número inteiro.');
      }

      if (ordem < 0) {
        throw new BadRequestException('A ordem não pode ser menor que zero.');
      }

      data.ordem = ordem;
    }

    /*
     * =========================
     * DISPONÍVEL PARA ESCOLHA
     * =========================
     */

    if (body.disponivelParaEscolha !== undefined) {
      const disponivelParaEscolha = this.parseBoolean(
        body.disponivelParaEscolha,
      );

      /*
       * O modelo atual sempre precisa
       * continuar disponível.
       */
      if (fotoPerfilWhatsappPadrao.isAtual && !disponivelParaEscolha) {
        throw new BadRequestException(
          'O modelo padrão atual não pode ser removido das opções disponíveis.',
        );
      }

      data.disponivelParaEscolha = disponivelParaEscolha;
    }

    /*
     * =========================
     * BACKGROUND
     * =========================
     */

    if (file) {
      data.caminhoBackground = `downloads/background-foto-perfil-whatsapp/${file.filename}`;
    }

    /*
     * =========================
     * CAMPOS NUMÉRICOS
     * =========================
     */

    const numericFields = [
      'photoX',
      'photoY',

      'photoWidth',
      'photoHeight',

      'nomeX',
      'nomeY',

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

    /*
     * =========================
     * CONFIGURAÇÕES DO NOME
     * =========================
     */

    if (body.nomeCorFont !== undefined) {
      const nomeCorFont = String(body.nomeCorFont || '').trim();

      data.nomeCorFont = nomeCorFont || null;
    }

    if (body.nomeFontSize !== undefined) {
      const nomeFontSize = String(body.nomeFontSize || '').trim();

      data.nomeFontSize = nomeFontSize || null;
    }

    /*
     * O isAtual NÃO é alterado aqui.
     *
     * A troca de modelo padrão deve ser
     * feita exclusivamente pelo método:
     *
     * changeFotoPerfilWhatsappPadrao()
     */

    return this.prisma.fotoPerfilWhatsappPadrao.update({
      where: {
        id,
      },

      data,
    });
  }

  /*
   * =========================================================
   * DELETE
   * =========================================================
   */

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

    /*
     * Impede excluir o padrão atual.
     *
     * Primeiro deve selecionar outro modelo
     * como padrão.
     */
    if (fotoPerfilWhatsappPadrao.isAtual) {
      throw new BadRequestException(
        'Não é possível excluir o modelo padrão atual. Defina outro modelo como padrão primeiro.',
      );
    }

    return this.prisma.fotoPerfilWhatsappPadrao.delete({
      where: {
        id,
      },
    });
  }

  /*
   * =========================================================
   * ALTERA MODELO PADRÃO
   * =========================================================
   */

  async changeFotoPerfilWhatsappPadrao(id: string) {
    const idNormalizado = String(id || '').trim();

    if (!idNormalizado) {
      throw new BadRequestException('ID é obrigatório.');
    }

    const fotoPerfilWhatsappPadrao =
      await this.prisma.fotoPerfilWhatsappPadrao.findUnique({
        where: {
          id: idNormalizado,
        },
      });

    if (!fotoPerfilWhatsappPadrao) {
      throw new NotFoundException(
        'Padrão de Foto de Perfil do WhatsApp não encontrado.',
      );
    }

    /*
     * Se já for o padrão atual,
     * apenas garante que esteja disponível.
     */
    if (fotoPerfilWhatsappPadrao.isAtual) {
      if (!fotoPerfilWhatsappPadrao.disponivelParaEscolha) {
        return this.prisma.fotoPerfilWhatsappPadrao.update({
          where: {
            id: idNormalizado,
          },

          data: {
            disponivelParaEscolha: true,
          },
        });
      }

      return fotoPerfilWhatsappPadrao;
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
       *
       * Todo padrão atual também deve
       * estar disponível para escolha.
       */
      return tx.fotoPerfilWhatsappPadrao.update({
        where: {
          id: idNormalizado,
        },

        data: {
          isAtual: true,
          disponivelParaEscolha: true,
        },
      });
    });
  }
}
