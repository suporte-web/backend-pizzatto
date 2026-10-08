import { PrismaService } from '@/prisma/prisma.service';
import { Injectable, Logger } from '@nestjs/common';

@Injectable()
export class StatusFeriasService {
  private readonly logger = new Logger(StatusFeriasService.name);

  constructor(private readonly prisma: PrismaService) {}

  private inicioDoDiaUtc(data: Date): Date {
    return new Date(
      Date.UTC(data.getUTCFullYear(), data.getUTCMonth(), data.getUTCDate()),
    );
  }

  async atualizarStatusAutomaticos() {
    const hoje = this.inicioDoDiaUtc(new Date());

    const resultado = {
      parcelasEmFerias: 0,
      parcelasFinalizadas: 0,
      solicitacoesEmAndamento: 0,
      solicitacoesConcluidas: 0,
      periodosDisponiveis: 0,
      periodosProgramados: 0,
      periodosEmAndamento: 0,
      periodosConcluidos: 0,
      periodosVencidos: 0,
      parcelasPendentesRegularizacao: 0,
    };

    this.logger.log('Iniciando atualização automática dos status de férias.');

    /*
     * ============================================================
     * 1. DOCUMENTO_ASSINADO -> EM_FERIAS
     * ============================================================
     *
     * Regras:
     * - Documento deve estar assinado.
     * - Data atual deve estar entre início e fim da parcela.
     * - Solicitação deve estar aprovada ou em andamento.
     * - Atualização condicional evita sobrescrever cancelamentos.
     */

    const parcelasParaIniciar = await this.prisma.parcelaFerias.findMany({
      where: {
        status: 'DOCUMENTO_ASSINADO',

        dataInicio: {
          lte: hoje,
        },

        dataFim: {
          gte: hoje,
        },

        SolicitacaoFerias: {
          status: {
            in: ['APROVADO', 'EM_ANDAMENTO'],
          },
        },
      },

      select: {
        id: true,
        solicitacaoId: true,
        ordem: true,
        dataInicio: true,
        dataFim: true,
      },
    });

    for (const parcela of parcelasParaIniciar) {
      const atualizado = await this.prisma.$transaction(async (tx) => {
        const update = await tx.parcelaFerias.updateMany({
          where: {
            id: parcela.id,
            status: 'DOCUMENTO_ASSINADO',

            dataInicio: {
              lte: hoje,
            },

            dataFim: {
              gte: hoje,
            },

            SolicitacaoFerias: {
              status: {
                in: ['APROVADO', 'EM_ANDAMENTO'],
              },
            },
          },

          data: {
            status: 'EM_FERIAS',
          },
        });

        if (update.count === 0) {
          return false;
        }

        await tx.historicoSolicitacaoFerias.create({
          data: {
            solicitacaoId: parcela.solicitacaoId,

            tipoEvento: 'ALTERACAO_STATUS',

            descricao: `Parcela ${parcela.ordem} entrou automaticamente em férias.`,

            statusAnterior: 'DOCUMENTO_ASSINADO',
            statusNovo: 'EM_FERIAS',

            responsavelUsuario: 'SISTEMA',
            responsavelNome: 'Sistema',

            dadosAnteriores: {
              parcelaId: parcela.id,
              status: 'DOCUMENTO_ASSINADO',
            },

            dadosNovos: {
              parcelaId: parcela.id,
              status: 'EM_FERIAS',
              dataInicio: parcela.dataInicio.toISOString(),
            },
          },
        });

        return true;
      });

      if (atualizado) {
        resultado.parcelasEmFerias++;
      }
    }

    /*
     * ============================================================
     * 2. EM_FERIAS -> FERIAS_RETIRADAS
     * ============================================================
     *
     * Regras:
     * - Somente parcelas que já estavam em férias.
     * - A data final deve ser anterior a hoje.
     * - Não altera solicitações canceladas ou reprovadas.
     */

    const parcelasParaFinalizar = await this.prisma.parcelaFerias.findMany({
      where: {
        status: 'EM_FERIAS',

        dataFim: {
          lt: hoje,
        },

        SolicitacaoFerias: {
          status: {
            in: ['APROVADO', 'EM_ANDAMENTO'],
          },
        },
      },

      select: {
        id: true,
        solicitacaoId: true,
        ordem: true,
        quantidadeDias: true,
        dataFim: true,
      },
    });

    for (const parcela of parcelasParaFinalizar) {
      const atualizado = await this.prisma.$transaction(async (tx) => {
        const update = await tx.parcelaFerias.updateMany({
          where: {
            id: parcela.id,
            status: 'EM_FERIAS',

            dataFim: {
              lt: hoje,
            },

            SolicitacaoFerias: {
              status: {
                in: ['APROVADO', 'EM_ANDAMENTO'],
              },
            },
          },

          data: {
            status: 'FERIAS_RETIRADAS',
          },
        });

        if (update.count === 0) {
          return false;
        }

        await tx.historicoSolicitacaoFerias.create({
          data: {
            solicitacaoId: parcela.solicitacaoId,

            tipoEvento: 'ALTERACAO_STATUS',

            descricao: `Parcela ${parcela.ordem} de férias finalizada automaticamente.`,

            statusAnterior: 'EM_FERIAS',
            statusNovo: 'FERIAS_RETIRADAS',

            responsavelUsuario: 'SISTEMA',
            responsavelNome: 'Sistema',

            dadosAnteriores: {
              parcelaId: parcela.id,
              status: 'EM_FERIAS',
            },

            dadosNovos: {
              parcelaId: parcela.id,
              status: 'FERIAS_RETIRADAS',
              quantidadeDias: parcela.quantidadeDias,
              dataFim: parcela.dataFim.toISOString(),
            },
          },
        });

        return true;
      });

      if (atualizado) {
        resultado.parcelasFinalizadas++;
      }
    }

    /*
     * ============================================================
     * 3. IDENTIFICAR PARCELAS QUE PRECISAM DE REGULARIZAÇÃO
     * ============================================================
     *
     * Documento assinado, mas data final já passou.
     *
     * Não alteramos automaticamente essas parcelas, pois
     * não é seguro assumir que as férias foram usufruídas.
     */

    resultado.parcelasPendentesRegularizacao =
      await this.prisma.parcelaFerias.count({
        where: {
          status: 'DOCUMENTO_ASSINADO',

          dataFim: {
            lt: hoje,
          },

          SolicitacaoFerias: {
            status: {
              in: ['APROVADO', 'EM_ANDAMENTO'],
            },
          },
        },
      });

    if (resultado.parcelasPendentesRegularizacao > 0) {
      this.logger.warn(
        `Existem ${resultado.parcelasPendentesRegularizacao} parcelas com documento assinado e data final ultrapassada. Verificar regularização.`,
      );
    }

    /*
     * ============================================================
     * 4. ATUALIZAR SOLICITAÇÕES
     * ============================================================
     *
     * APROVADO -> EM_ANDAMENTO:
     * quando alguma parcela iniciou ou foi retirada.
     *
     * EM_ANDAMENTO -> CONCLUIDO:
     * somente quando todas as parcelas foram retiradas.
     *
     * Solicitações canceladas e reprovadas são ignoradas.
     */

    const solicitacoes = await this.prisma.solicitacaoFerias.findMany({
      where: {
        status: {
          in: ['APROVADO', 'EM_ANDAMENTO'],
        },
      },

      include: {
        ParcelaFerias: {
          select: {
            id: true,
            status: true,
          },
        },
      },
    });

    for (const solicitacao of solicitacoes) {
      const parcelas = solicitacao.ParcelaFerias;

      if (parcelas.length === 0) {
        continue;
      }

      const todasFinalizadas = parcelas.every(
        (parcela) => parcela.status === 'FERIAS_RETIRADAS',
      );

      const iniciouAlgumaParcela = parcelas.some(
        (parcela) =>
          parcela.status === 'EM_FERIAS' ||
          parcela.status === 'FERIAS_RETIRADAS',
      );

      let proximoStatus: 'EM_ANDAMENTO' | 'CONCLUIDO' | null = null;

      if (todasFinalizadas) {
        proximoStatus = 'CONCLUIDO';
      } else if (iniciouAlgumaParcela && solicitacao.status === 'APROVADO') {
        proximoStatus = 'EM_ANDAMENTO';
      }

      if (!proximoStatus || solicitacao.status === proximoStatus) {
        continue;
      }

      const statusNovo = proximoStatus;

      const atualizado = await this.prisma.$transaction(async (tx) => {
        const update = await tx.solicitacaoFerias.updateMany({
          where: {
            id: solicitacao.id,
            status: solicitacao.status,
          },

          data: {
            status: statusNovo,
          },
        });

        if (update.count === 0) {
          return false;
        }

        await tx.historicoSolicitacaoFerias.create({
          data: {
            solicitacaoId: solicitacao.id,

            tipoEvento: 'ALTERACAO_STATUS',

            descricao:
              statusNovo === 'CONCLUIDO'
                ? 'Solicitação de férias concluída automaticamente.'
                : 'Solicitação de férias entrou automaticamente em andamento.',

            statusAnterior: solicitacao.status,
            statusNovo,

            responsavelUsuario: 'SISTEMA',
            responsavelNome: 'Sistema',

            dadosAnteriores: {
              status: solicitacao.status,
            },

            dadosNovos: {
              status: statusNovo,
            },
          },
        });

        return true;
      });

      if (!atualizado) {
        continue;
      }

      if (statusNovo === 'CONCLUIDO') {
        resultado.solicitacoesConcluidas++;
      } else {
        resultado.solicitacoesEmAndamento++;
      }
    }

    /*
     * ============================================================
     * 5. CONSOLIDAR STATUS DOS PERÍODOS AQUISITIVOS
     * ============================================================
     *
     * Considera todas as solicitações válidas vinculadas
     * ao período aquisitivo.
     *
     * Prioridade:
     *
     * 1. CONCLUIDO
     * 2. EM_ANDAMENTO
     * 3. PROGRAMADO
     * 4. VENCIDO
     * 5. DISPONIVEL
     *
     * Não altera períodos EM_AQUISICAO, pois eles são
     * administrados pelo gerador de períodos.
     */

    const periodos = await this.prisma.periodoAquisitivoFerias.findMany({
      where: {
        status: {
          in: ['DISPONIVEL', 'PROGRAMADO', 'EM_ANDAMENTO', 'VENCIDO'],
        },
      },

      include: {
        SolicitacaoFerias: {
          where: {
            status: {
              in: ['APROVADO', 'EM_ANDAMENTO', 'CONCLUIDO'],
            },
          },

          include: {
            ParcelaFerias: {
              select: {
                id: true,
                status: true,
                quantidadeDias: true,
              },
            },
          },
        },
      },
    });

    for (const periodo of periodos) {
      const solicitacoesValidas = periodo.SolicitacaoFerias;

      const parcelas = solicitacoesValidas.flatMap(
        (solicitacao) => solicitacao.ParcelaFerias,
      );

      const todasFinalizadas =
        parcelas.length > 0 &&
        parcelas.every((parcela) => parcela.status === 'FERIAS_RETIRADAS');

      const algumaEmFerias = parcelas.some(
        (parcela) => parcela.status === 'EM_FERIAS',
      );

      const algumaJaRetirada = parcelas.some(
        (parcela) => parcela.status === 'FERIAS_RETIRADAS',
      );

      const possuiSolicitacaoEmAndamento = solicitacoesValidas.some(
        (solicitacao) => solicitacao.status === 'EM_ANDAMENTO',
      );

      const possuiProgramacao =
        solicitacoesValidas.length > 0 &&
        !algumaEmFerias &&
        !algumaJaRetirada &&
        !todasFinalizadas;

      let proximoStatus:
        | 'DISPONIVEL'
        | 'PROGRAMADO'
        | 'EM_ANDAMENTO'
        | 'CONCLUIDO'
        | 'VENCIDO';

      if (todasFinalizadas) {
        proximoStatus = 'CONCLUIDO';
      } else if (
        algumaEmFerias ||
        algumaJaRetirada ||
        possuiSolicitacaoEmAndamento
      ) {
        proximoStatus = 'EM_ANDAMENTO';
      } else if (possuiProgramacao) {
        proximoStatus = 'PROGRAMADO';
      } else if (hoje > this.inicioDoDiaUtc(periodo.dataLimiteConcessivo)) {
        proximoStatus = 'VENCIDO';
      } else {
        proximoStatus = 'DISPONIVEL';
      }

      if (periodo.status === proximoStatus) {
        continue;
      }

      const update = await this.prisma.periodoAquisitivoFerias.updateMany({
        where: {
          id: periodo.id,
          status: periodo.status,
        },

        data: {
          status: proximoStatus,
        },
      });

      if (update.count === 0) {
        continue;
      }

      switch (proximoStatus) {
        case 'DISPONIVEL':
          resultado.periodosDisponiveis++;
          break;

        case 'PROGRAMADO':
          resultado.periodosProgramados++;
          break;

        case 'EM_ANDAMENTO':
          resultado.periodosEmAndamento++;
          break;

        case 'CONCLUIDO':
          resultado.periodosConcluidos++;
          break;

        case 'VENCIDO':
          resultado.periodosVencidos++;
          break;
      }
    }

    /*
     * ============================================================
     * 6. FINALIZAR
     * ============================================================
     */

    this.logger.log(
      `Atualização automática de férias finalizada: ${JSON.stringify(resultado)}`,
    );

    return resultado;
  }
}
