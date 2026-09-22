import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '@/prisma/prisma.service';
import { CreateFeedDto } from './dtos/create-feed.dto';
import { FindFeedDto } from './dtos/find-feed.dto';
import { UpdateFeedDto } from './dtos/update-feed.dto';

@Injectable()
export class FeedService {
  constructor(private readonly prisma: PrismaService) {}

  async create(
    body: CreateFeedDto,
    arquivos: Express.Multer.File[],
    user: any,
  ) {
    const texto = body.texto?.trim() || null;

    if (!texto && (!arquivos || arquivos.length === 0)) {
      throw new BadRequestException(
        'Informe um texto ou adicione uma imagem/vídeo.',
      );
    }

    for (const arquivo of arquivos || []) {
      const imagem = arquivo.mimetype.startsWith('image/');
      const video = arquivo.mimetype.startsWith('video/');

      if (!imagem && !video) {
        throw new BadRequestException(
          `O arquivo "${arquivo.originalname}" não é uma imagem ou vídeo válido.`,
        );
      }
    }

    const publicacao = await this.prisma.feedPublicacao.create({
      data: {
        texto,

        adObjectGuid: user.adObjectGuid,

        autorNome:
          user.name || user.displayName || user.cn || user.usuario || 'Usuário',

        autorEmail: user.mail || null,

        departamento: user.department || null,

        autorFoto: user.photo,

        FeedMidia: {
          create: (arquivos || []).map((arquivo, index) => {
            const tipo = arquivo.mimetype.startsWith('image/')
              ? 'IMAGEM'
              : 'VIDEO';

            return {
              tipo,

              url: `/downloads/feed/${arquivo.filename}`,

              nomeOriginal: arquivo.originalname,

              mimeType: arquivo.mimetype,

              tamanho: arquivo.size,

              ordem: index,
            };
          }),
        },
      },

      include: {
        FeedMidia: {
          orderBy: {
            ordem: 'asc',
          },
        },

        _count: {
          select: {
            FeedCurtida: true,
            FeedComentario: true,
          },
        },
      },
    });

    return {
      id: publicacao.id,
      adObjectGuid: publicacao.adObjectGuid,
      autorNome: publicacao.autorNome,
      autorEmail: publicacao.autorEmail,
      autorFoto: publicacao.autorFoto,
      departamento: publicacao.departamento,
      texto: publicacao.texto,
      createdAt: publicacao.createdAt,
      updatedAt: publicacao.updatedAt,
      ativo: publicacao.ativo,

      midias: publicacao.FeedMidia,

      curtidoPorMim: false,

      totalCurtidas: publicacao._count.FeedCurtida,

      totalComentarios: publicacao._count.FeedComentario,
    };
  }

  /**
   * =====================================================
   * LISTAR FEED
   * =====================================================
   */
  async findAll(body: FindFeedDto, user: any) {
    const page = Math.max(Number(body.page || 1), 1);

    const pageSize = Math.min(Math.max(Number(body.pageSize || 10), 1), 50);

    const skip = (page - 1) * pageSize;

    const where = {
      ativo: true,
    };

    const [publicacoes, total] = await this.prisma.$transaction([
      this.prisma.feedPublicacao.findMany({
        where,

        orderBy: {
          createdAt: 'desc',
        },

        skip,

        take: pageSize,

        include: {
          FeedMidia: {
            orderBy: {
              ordem: 'asc',
            },
          },

          FeedCurtida: {
            where: {
              adObjectGuid: user.adObjectGuid,
            },

            select: {
              id: true,
            },
          },

          FeedComentario: {
            where: {
              ativo: true,
            },

            orderBy: {
              createdAt: 'desc',
            },

            take: 5,

            include: {
              FeedComentarioLike: {
                where: {
                  adObjectGuid: user.adObjectGuid,
                },

                select: {
                  id: true,
                },
              },

              _count: {
                select: {
                  FeedComentarioLike: true,
                },
              },
            },
          },

          _count: {
            select: {
              FeedCurtida: true,

              FeedComentario: {
                where: {
                  ativo: true,
                },
              },
            },
          },
        },
      }),

      this.prisma.feedPublicacao.count({
        where,
      }),
    ]);

    const data = publicacoes.map((publicacao) => {
      const { FeedCurtida, FeedComentario, FeedMidia, _count, ...resto } =
        publicacao;

      const comentariosRecentes = FeedComentario.map((comentario) => {
        const {
          FeedComentarioLike,
          _count: comentarioCount,
          ...restoComentario
        } = comentario;

        return {
          ...restoComentario,

          curtidoPorMim: FeedComentarioLike.length > 0,

          totalCurtidas: comentarioCount.FeedComentarioLike,
        };
      }).reverse();

      return {
        ...resto,

        midias: FeedMidia,

        curtidoPorMim: FeedCurtida.length > 0,

        totalCurtidas: _count.FeedCurtida,

        totalComentarios: _count.FeedComentario,

        comentariosRecentes,
      };
    });

    return {
      data,

      pagination: {
        page,
        pageSize,
        total,
        totalPages: Math.ceil(total / pageSize),
        hasNextPage: page * pageSize < total,
        hasPreviousPage: page > 1,
      },
    };
  }

  /**
   * =====================================================
   * BUSCAR PUBLICAÇÃO POR ID
   * =====================================================
   */
  async findById(id: string, user: any) {
    const publicacao = await this.prisma.feedPublicacao.findFirst({
      where: {
        id,
        ativo: true,
      },

      include: {
        FeedMidia: {
          orderBy: {
            ordem: 'asc',
          },
        },

        FeedCurtida: {
          where: {
            adObjectGuid: user.adObjectGuid,
          },

          select: {
            id: true,
          },
        },

        FeedComentario: {
          where: {
            ativo: true,
          },

          orderBy: {
            createdAt: 'asc',
          },
        },

        _count: {
          select: {
            FeedCurtida: true,

            FeedComentario: {
              where: {
                ativo: true,
              },
            },
          },
        },
      },
    });

    if (!publicacao) {
      throw new NotFoundException('Publicação não encontrada.');
    }

    const { FeedCurtida, FeedComentario, FeedMidia, _count, ...resto } =
      publicacao;

    return {
      ...resto,

      midias: FeedMidia,

      curtidoPorMim: FeedCurtida.length > 0,

      totalCurtidas: _count.FeedCurtida,

      totalComentarios: _count.FeedComentario,

      comentarios: FeedComentario,
    };
  }

  /**
   * =====================================================
   * EDITAR PUBLICAÇÃO
   * =====================================================
   */
  async update(id: string, body: UpdateFeedDto, user: any) {
    const publicacao = await this.prisma.feedPublicacao.findFirst({
      where: {
        id,
        ativo: true,
      },
    });

    if (!publicacao) {
      throw new NotFoundException('Publicação não encontrada.');
    }

    if (publicacao.adObjectGuid !== user.adObjectGuid) {
      throw new ForbiddenException(
        'Você não tem permissão para editar esta publicação.',
      );
    }

    const texto = body.texto?.trim();

    if (!texto) {
      throw new BadRequestException(
        'O texto da publicação não pode ficar vazio.',
      );
    }

    return this.prisma.feedPublicacao.update({
      where: {
        id,
      },

      data: {
        texto,
      },
    });
  }

  /**
   * =====================================================
   * EXCLUIR PUBLICAÇÃO
   * Exclusão lógica
   * =====================================================
   */
  async remove(id: string, user: any) {
    const publicacao = await this.prisma.feedPublicacao.findFirst({
      where: {
        id,
        ativo: true,
      },
    });

    if (!publicacao) {
      throw new NotFoundException('Publicação não encontrada.');
    }

    if (publicacao.adObjectGuid !== user.adObjectGuid) {
      throw new ForbiddenException(
        'Você não tem permissão para excluir esta publicação.',
      );
    }

    await this.prisma.feedPublicacao.update({
      where: {
        id,
      },

      data: {
        ativo: false,
      },
    });

    return {
      message: 'Publicação excluída com sucesso.',
    };
  }

  /**
   * =====================================================
   * CURTIR / DESCURTIR
   * =====================================================
   */
  async toggleCurtida(publicacaoId: string, user: any) {
    const publicacao = await this.prisma.feedPublicacao.findFirst({
      where: {
        id: publicacaoId,
        ativo: true,
      },

      select: {
        id: true,
      },
    });

    if (!publicacao) {
      throw new NotFoundException('Publicação não encontrada.');
    }

    const curtida = await this.prisma.feedCurtida.findUnique({
      where: {
        publicacaoId_adObjectGuid: {
          publicacaoId,
          adObjectGuid: user.adObjectGuid,
        },
      },
    });

    let curtido = false;

    if (curtida) {
      await this.prisma.feedCurtida.delete({
        where: {
          id: curtida.id,
        },
      });
    } else {
      await this.prisma.feedCurtida.create({
        data: {
          publicacaoId,

          adObjectGuid: user.adObjectGuid,

          usuarioNome:
            user.nome ||
            user.displayName ||
            user.cn ||
            user.usuario ||
            'Usuário',
        },
      });

      curtido = true;
    }

    const totalCurtidas = await this.prisma.feedCurtida.count({
      where: {
        publicacaoId,
      },
    });

    return {
      curtido,
      totalCurtidas,
    };
  }

  /**
   * =====================================================
   * CRIAR COMENTÁRIO
   * =====================================================
   */
  async createComentario(publicacaoId: string, texto: string, user: any) {
    const textoNormalizado = texto?.trim();

    if (!textoNormalizado) {
      throw new BadRequestException('Informe o comentário.');
    }

    const publicacao = await this.prisma.feedPublicacao.findFirst({
      where: {
        id: publicacaoId,
        ativo: true,
      },

      select: {
        id: true,
      },
    });

    if (!publicacao) {
      throw new NotFoundException('Publicação não encontrada.');
    }

    const comentario = await this.prisma.feedComentario.create({
      data: {
        publicacaoId,

        texto: textoNormalizado,

        adObjectGuid: user.adObjectGuid,

        autorNome:
          user.name || user.displayName || user.cn || user.usuario || 'Usuário',

        autorFoto: user.photo || null,
      },
    });

    const totalComentarios = await this.prisma.feedComentario.count({
      where: {
        publicacaoId,
        ativo: true,
      },
    });

    return {
      comentario,
      totalComentarios,
    };
  }

  /**
   * =====================================================
   * LISTAR COMENTÁRIOS
   * =====================================================
   */
  async findComentarios(publicacaoId: string, page = 1, pageSize = 20) {
    const pagina = Math.max(Number(page || 1), 1);

    const tamanhoPagina = Math.min(Math.max(Number(pageSize || 20), 1), 100);

    const skip = (pagina - 1) * tamanhoPagina;

    const publicacao = await this.prisma.feedPublicacao.findFirst({
      where: {
        id: publicacaoId,
        ativo: true,
      },

      select: {
        id: true,
      },
    });

    if (!publicacao) {
      throw new NotFoundException('Publicação não encontrada.');
    }

    const [comentarios, total] = await this.prisma.$transaction([
      this.prisma.feedComentario.findMany({
        where: {
          publicacaoId,
          ativo: true,
        },

        orderBy: {
          createdAt: 'asc',
        },

        skip,

        take: tamanhoPagina,
      }),

      this.prisma.feedComentario.count({
        where: {
          publicacaoId,
          ativo: true,
        },
      }),
    ]);

    return {
      data: comentarios,

      pagination: {
        page: pagina,
        pageSize: tamanhoPagina,
        total,
        totalPages: Math.ceil(total / tamanhoPagina),
        hasNextPage: pagina * tamanhoPagina < total,
      },
    };
  }

  /**
   * =====================================================
   * EDITAR COMENTÁRIO
   * =====================================================
   */
  async updateComentario(comentarioId: string, texto: string, user: any) {
    const comentario = await this.prisma.feedComentario.findFirst({
      where: {
        id: comentarioId,
        ativo: true,
      },
    });

    if (!comentario) {
      throw new NotFoundException('Comentário não encontrado.');
    }

    if (comentario.adObjectGuid !== user.adObjectGuid) {
      throw new ForbiddenException(
        'Você não tem permissão para editar este comentário.',
      );
    }

    const textoNormalizado = texto?.trim();

    if (!textoNormalizado) {
      throw new BadRequestException('O comentário não pode ficar vazio.');
    }

    return this.prisma.feedComentario.update({
      where: {
        id: comentarioId,
      },

      data: {
        texto: textoNormalizado,
      },
    });
  }

  /**
   * =====================================================
   * EXCLUIR COMENTÁRIO
   * =====================================================
   */
  async removeComentario(comentarioId: string, user: any) {
    const comentario = await this.prisma.feedComentario.findFirst({
      where: {
        id: comentarioId,
        ativo: true,
      },
    });

    if (!comentario) {
      throw new NotFoundException('Comentário não encontrado.');
    }

    if (comentario.adObjectGuid !== user.adObjectGuid) {
      throw new ForbiddenException(
        'Você não tem permissão para excluir este comentário.',
      );
    }

    await this.prisma.feedComentario.update({
      where: {
        id: comentarioId,
      },

      data: {
        ativo: false,
      },
    });

    return {
      message: 'Comentário excluído com sucesso.',
    };
  }

  async toggleLikeComentario(comentarioId: string, user: any) {
    const comentario = await this.prisma.feedComentario.findFirst({
      where: {
        id: comentarioId,
        ativo: true,
      },

      select: {
        id: true,
      },
    });

    if (!comentario) {
      throw new NotFoundException('Comentário não encontrado.');
    }

    const likeExistente = await this.prisma.feedComentarioLike.findUnique({
      where: {
        comentarioId_adObjectGuid: {
          comentarioId,
          adObjectGuid: user.adObjectGuid,
        },
      },
    });

    let curtido = false;

    if (likeExistente) {
      await this.prisma.feedComentarioLike.delete({
        where: {
          id: likeExistente.id,
        },
      });
    } else {
      await this.prisma.feedComentarioLike.create({
        data: {
          comentarioId,

          adObjectGuid: user.adObjectGuid,

          usuarioNome:
            user.nome ||
            user.displayName ||
            user.cn ||
            user.usuario ||
            'Usuário',
        },
      });

      curtido = true;
    }

    const totalCurtidas = await this.prisma.feedComentarioLike.count({
      where: {
        comentarioId,
      },
    });

    return {
      curtido,
      totalCurtidas,
    };
  }
}
