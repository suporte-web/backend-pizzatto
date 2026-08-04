import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { basename, join } from 'node:path';
import { existsSync, unlinkSync } from 'node:fs';
import { Prisma } from '../../generated/prisma/client';

@Injectable()
export class BeneficiosService {
  constructor(private readonly prisma: PrismaService) {}

  private converterBoolean(value: unknown): boolean {
    if (typeof value === 'boolean') {
      return value;
    }

    return String(value).toLowerCase() === 'true';
  }

  async create(body: any, imagem?: Express.Multer.File) {
    const { titulo, descricao, link, ativo } = body;

    const tituloTratado = String(titulo ?? '').trim();

    if (!tituloTratado) {
      throw new BadRequestException('O título do benefício é obrigatório.');
    }

    const dadosImagem = imagem
      ? {
          nomeOriginal: imagem.originalname,
          nomeSalvo: imagem.filename,
          caminho: `/downloads/beneficios/${imagem.filename}`,
          mimeType: imagem.mimetype,
          tamanho: imagem.size,
        }
      : undefined;

    try {
      return await this.prisma.beneficio.create({
        data: {
          titulo: tituloTratado,
          descricao: descricao ? String(descricao).trim() : null,
          imagem: dadosImagem,
          link: link ? String(link).trim() : null,
          ativo: ativo === undefined ? true : this.converterBoolean(ativo),
        },
      });
    } catch (error: any) {
      throw new BadRequestException(
        error?.message || 'Não foi possível cadastrar o benefício.',
      );
    }
  }

  async findByFilter(body: any) {
    const { pesquisa, ativo, page = 1, limit = 10 } = body ?? {};

    const pageNumber = Math.max(Number(page) || 1, 1);
    const limitNumber = Math.max(Number(limit) || 10, 1);
    const skip = (pageNumber - 1) * limitNumber;

    const where: any = {};

    if (pesquisa && String(pesquisa).trim()) {
      const termo = String(pesquisa).trim();

      where.OR = [
        {
          titulo: {
            contains: termo,
            mode: 'insensitive',
          },
        },
        {
          descricao: {
            contains: termo,
            mode: 'insensitive',
          },
        },
      ];
    }

    if (ativo !== undefined && ativo !== null && ativo !== '') {
      where.ativo = this.converterBoolean(ativo);
    }

    const [beneficios, total] = await this.prisma.$transaction([
      this.prisma.beneficio.findMany({
        where,
        skip,
        take: limitNumber,
        orderBy: {
          createdAt: 'desc',
        },
      }),
      this.prisma.beneficio.count({
        where,
      }),
    ]);

    return {
      data: beneficios,
      total,
      page: pageNumber,
      limit: limitNumber,
      totalPages: Math.ceil(total / limitNumber),
    };
  }

  async findAllAtivos() {
    return this.prisma.beneficio.findMany({
      where: {
        ativo: true,
      },
      orderBy: {
        createdAt: 'desc',
      },
    });
  }

  async findById(id: string) {
    if (!id) {
      throw new BadRequestException('O ID do benefício é obrigatório.');
    }

    const beneficio = await this.prisma.beneficio.findUnique({
      where: {
        id,
      },
    });

    if (!beneficio) {
      throw new NotFoundException('Benefício não encontrado.');
    }

    return beneficio;
  }

  async update(body: any, novaImagem?: Express.Multer.File) {
    const { id, titulo, descricao, link, ativo, removerImagem } = body;

    if (!id) {
      if (novaImagem) {
        this.removerArquivoImagem({
          nomeSalvo: novaImagem.filename,
        });
      }

      throw new BadRequestException('O ID do benefício é obrigatório.');
    }

    if (titulo !== undefined && !String(titulo).trim()) {
      if (novaImagem) {
        this.removerArquivoImagem({
          nomeSalvo: novaImagem.filename,
        });
      }

      throw new BadRequestException('O título do benefício é obrigatório.');
    }

    const beneficioAtual = await this.findById(id);

    const deveRemoverImagem =
      removerImagem === true || String(removerImagem).toLowerCase() === 'true';

    const dadosNovaImagem = novaImagem
      ? {
          nomeOriginal: novaImagem.originalname,
          nomeSalvo: novaImagem.filename,
          caminho: `/downloads/beneficios/${novaImagem.filename}`,
          mimeType: novaImagem.mimetype,
          tamanho: novaImagem.size,
        }
      : undefined;

    try {
      const beneficioAtualizado = await this.prisma.beneficio.update({
        where: {
          id,
        },
        data: {
          ...(titulo !== undefined && {
            titulo: String(titulo).trim(),
          }),

          ...(descricao !== undefined && {
            descricao: descricao ? String(descricao).trim() : null,
          }),

          ...(link !== undefined && {
            link: link ? String(link).trim() : null,
          }),

          ...(ativo !== undefined && {
            ativo: this.converterBoolean(ativo),
          }),

          ...(novaImagem && {
            imagem: dadosNovaImagem,
          }),

          ...(!novaImagem &&
            deveRemoverImagem && {
              imagem: Prisma.DbNull,
            }),
        },
      });

      /*
       * A imagem anterior só é removida depois que
       * a atualização no banco for concluída.
       */
      if (beneficioAtual.imagem && (novaImagem || deveRemoverImagem)) {
        try {
          this.removerArquivoImagem(beneficioAtual.imagem);
        } catch (error) {
          console.error('Não foi possível remover a imagem anterior:', error);
        }
      }

      return beneficioAtualizado;
    } catch (error: any) {
      /*
       * O FileInterceptor salva o novo arquivo antes
       * de o service ser executado. Se o banco falhar,
       * removemos esse arquivo para não deixá-lo órfão.
       */
      if (novaImagem) {
        try {
          this.removerArquivoImagem({
            nomeSalvo: novaImagem.filename,
          });
        } catch (removeError) {
          console.error(
            'Não foi possível remover a nova imagem após o erro:',
            removeError,
          );
        }
      }

      throw new BadRequestException(
        error?.message || 'Não foi possível atualizar o benefício.',
      );
    }
  }

  async alterarStatus(body: any) {
    const { id, ativo } = body;

    if (!id) {
      throw new BadRequestException('O ID do benefício é obrigatório.');
    }

    if (ativo === undefined || ativo === null || ativo === '') {
      throw new BadRequestException('O status do benefício é obrigatório.');
    }

    await this.findById(id);

    return this.prisma.beneficio.update({
      where: {
        id,
      },
      data: {
        ativo: this.converterBoolean(ativo),
      },
    });
  }

  async delete(id: string) {
    if (!id) {
      throw new BadRequestException('O ID do benefício é obrigatório.');
    }

    await this.findById(id);

    await this.prisma.beneficio.delete({
      where: {
        id,
      },
    });

    return {
      message: 'Benefício excluído com sucesso.',
    };
  }

  private removerArquivoImagem(imagem: any) {
    if (!imagem) return;

    const nomeArquivo =
      imagem?.nomeSalvo ||
      (imagem?.caminho ? basename(String(imagem.caminho)) : null);

    if (!nomeArquivo) return;

    const caminhoArquivo = join(
      process.cwd(),
      'downloads',
      'beneficios',
      nomeArquivo,
    );

    if (existsSync(caminhoArquivo)) {
      unlinkSync(caminhoArquivo);
    }
  }
}
