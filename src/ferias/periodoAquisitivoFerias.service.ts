import { PrismaService } from '@/prisma/prisma.service';
import { BadRequestException, Injectable } from '@nestjs/common';
import { Prisma } from '../../generated/prisma/client';

@Injectable()
export class PeriodoAquisitivoFeriasService {
  constructor(private readonly prisma: PrismaService) {}

  private adicionarAnos(data: Date, anos: number) {
    const novaData = new Date(data);

    novaData.setUTCFullYear(novaData.getUTCFullYear() + anos);

    return novaData;
  }

  private adicionarDias(data: Date, dias: number) {
    const novaData = new Date(data);

    novaData.setUTCDate(novaData.getUTCDate() + dias);

    return novaData;
  }

  private inicioDoDiaUtc(data: Date) {
    return new Date(
      Date.UTC(data.getUTCFullYear(), data.getUTCMonth(), data.getUTCDate()),
    );
  }

  async gerarPeriodosAquisitivos() {
    const usuarios = await this.prisma.usuarioChat.findMany({
      where: {
        ativo: true,

        dataAdmissao: {
          not: null,
        },
      },

      select: {
        id: true,
        nome: true,
        usuario: true,
        ativo: true,
        dataAdmissao: true,
        dataDemissao: true,
        tipoContratacao: true,
      },
    });

    let criados = 0;
    let atualizados = 0;
    let ignorados = 0;
    let existentes = 0;

    const hoje = this.inicioDoDiaUtc(new Date());

    const inicioModulo = new Date(Date.UTC(2027, 0, 1));

    const anoMaximoAquisicao = Math.max(2027, hoje.getUTCFullYear() + 1);

    for (const usuario of usuarios) {
      if (!usuario.dataAdmissao) {
        ignorados++;
        continue;
      }

      const dataAdmissao = this.inicioDoDiaUtc(usuario.dataAdmissao);

      const dataDemissao = usuario.dataDemissao
        ? this.inicioDoDiaUtc(usuario.dataDemissao)
        : null;

      let dataInicioAquisitivo = dataAdmissao;

      while (true) {
        const dataFimAquisitivo = this.adicionarDias(
          this.adicionarAnos(dataInicioAquisitivo, 1),
          -1,
        );

        const anoVigencia = dataFimAquisitivo.getUTCFullYear();

        if (anoVigencia > anoMaximoAquisicao) {
          break;
        }

        if (dataDemissao && dataInicioAquisitivo >= dataDemissao) {
          break;
        }

        const dataDisponibilidade = this.adicionarDias(dataFimAquisitivo, 1);

        const dataLimiteConcessivo = this.adicionarDias(
          this.adicionarAnos(dataDisponibilidade, 1),
          -1,
        );

        if (dataLimiteConcessivo < inicioModulo) {
          ignorados++;

          dataInicioAquisitivo = this.adicionarDias(dataFimAquisitivo, 1);

          continue;
        }

        const statusCalculado =
          hoje >= dataDisponibilidade ? 'DISPONIVEL' : 'EM_AQUISICAO';

        const existente = await this.prisma.periodoAquisitivoFerias.findUnique({
          where: {
            usuarioId_anoVigencia: {
              usuarioId: usuario.id,

              anoVigencia,
            },
          },
        });

        if (existente) {
          if (
            existente.status === 'EM_AQUISICAO' &&
            statusCalculado === 'DISPONIVEL'
          ) {
            await this.prisma.periodoAquisitivoFerias.update({
              where: {
                id: existente.id,
              },

              data: {
                status: 'DISPONIVEL',

                dataInicioAquisitivo,
                dataFimAquisitivo,
                dataLimiteConcessivo,
              },
            });

            atualizados++;
          }

          existentes++;
        } else {
          await this.prisma.periodoAquisitivoFerias.create({
            data: {
              usuarioId: usuario.id,

              anoVigencia,

              dataInicioAquisitivo,

              dataFimAquisitivo,

              dataLimiteConcessivo,

              quantidadeDiasDireito: 30,

              diasUtilizados: 0,

              diasVendidos: 0,

              status: statusCalculado,
            },
          });

          criados++;
        }

        dataInicioAquisitivo = this.adicionarDias(dataFimAquisitivo, 1);
      }
    }

    return {
      usuariosEncontrados: usuarios.length,

      criados,
      atualizados,
      existentes,
      ignorados,
    };
  }

  async findDisponiveis(user: any) {
    const usuarioAd = String(user?.sam || '')
      .trim()
      .toLowerCase();

    if (!usuarioAd) {
      throw new BadRequestException(
        'Não foi possível identificar o usuário autenticado.',
      );
    }

    const usuario = await this.prisma.usuarioChat.findFirst({
      where: {
        usuario: {
          equals: usuarioAd,

          mode: 'insensitive',
        },

        ativo: true,
      },

      select: {
        id: true,
        nome: true,
        usuario: true,
        cargo: true,
        empresa: true,
        tipoContratacao: true,
      },
    });

    if (!usuario) {
      throw new BadRequestException(
        'Usuário não encontrado no cadastro interno.',
      );
    }

    const periodos = await this.prisma.periodoAquisitivoFerias.findMany({
      where: {
        usuarioId: usuario.id,

        status: 'DISPONIVEL',
      },

      orderBy: {
        anoVigencia: 'asc',
      },

      select: {
        id: true,
        anoVigencia: true,

        dataInicioAquisitivo: true,

        dataFimAquisitivo: true,

        dataLimiteConcessivo: true,

        quantidadeDiasDireito: true,

        diasUtilizados: true,

        diasVendidos: true,

        status: true,
      },
    });

    return {
      usuario,

      result: periodos,

      total: periodos.length,
    };
  }

  async findByFilterEquipe(body: any, user: any) {
    const gestorSam = String(user?.sam ?? '')
      .trim()
      .toLowerCase();

    if (!gestorSam) {
      throw new BadRequestException(
        'Não foi possível identificar o usuário autenticado.',
      );
    }

    const page = Number(body?.page ?? 1);
    const limit = Number(body?.limit ?? 10);

    if (
      !Number.isInteger(page) ||
      page < 1 ||
      !Number.isInteger(limit) ||
      limit < 1 ||
      limit > 100
    ) {
      throw new BadRequestException(
        'Paginação inválida. Informe page >= 1 e limit entre 1 e 100.',
      );
    }

    const skip = (page - 1) * limit;

    const pesquisa = String(body?.pesquisa ?? '').trim();

    // Identifica os colaboradores vinculados ao gestor
    // por meio das solicitações de férias existentes.
    const colaboradoresEquipe = await this.prisma.solicitacaoFerias.findMany({
      where: {
        gestorUsuario: {
          equals: gestorSam,
          mode: 'insensitive',
        },
      },

      select: {
        PeriodoAquisitivoFerias: {
          select: {
            usuarioId: true,
          },
        },
      },

      distinct: ['periodoAquisitivoId'],
    });

    const usuarioIds = [
      ...new Set(
        colaboradoresEquipe
          .map((solicitacao) => solicitacao.PeriodoAquisitivoFerias?.usuarioId)
          .filter((id): id is string => Boolean(id)),
      ),
    ];

    if (usuarioIds.length === 0) {
      return {
        data: [],
        pagination: {
          page,
          limit,
          total: 0,
          totalPages: 0,
        },
      };
    }

    const where: Prisma.PeriodoAquisitivoFeriasWhereInput = {
      usuarioId: {
        in: usuarioIds,
      },

      UsuarioChat: {
        is: {
          ativo: true,

          ...(pesquisa
            ? {
                nome: {
                  contains: pesquisa,
                  mode: 'insensitive',
                },
              }
            : {}),
        },
      },
    };

    const [total, periodos] = await this.prisma.$transaction([
      this.prisma.periodoAquisitivoFerias.count({
        where,
      }),

      this.prisma.periodoAquisitivoFerias.findMany({
        where,

        skip,
        take: limit,

        orderBy: [
          {
            UsuarioChat: {
              nome: 'asc',
            },
          },
          {
            anoVigencia: 'desc',
          },
          {
            id: 'asc',
          },
        ],

        select: {
          id: true,
          usuarioId: true,
          anoVigencia: true,

          dataInicioAquisitivo: true,
          dataFimAquisitivo: true,
          dataLimiteConcessivo: true,

          quantidadeDiasDireito: true,
          diasUtilizados: true,
          diasVendidos: true,

          status: true,

          UsuarioChat: {
            select: {
              id: true,
              nome: true,
              usuario: true,
              cargo: true,
              empresa: true,
              tipoContratacao: true,
              dataAdmissao: true,
            },
          },
        },
      }),
    ]);

    return {
      data: periodos,

      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }
}
