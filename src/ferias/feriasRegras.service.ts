import { PrismaService } from '@/prisma/prisma.service';
import { BadRequestException, Injectable } from '@nestjs/common';

@Injectable()
export class FeriasRegrasService {
  constructor(
    private readonly prisma: PrismaService,
  ) {}

  private inicioDoDiaUtc(data: Date) {
    return new Date(
      Date.UTC(
        data.getUTCFullYear(),
        data.getUTCMonth(),
        data.getUTCDate(),
      ),
    );
  }

  private adicionarDias(
    data: Date,
    dias: number,
  ) {
    const novaData = new Date(data);

    novaData.setUTCDate(
      novaData.getUTCDate() + dias,
    );

    return novaData;
  }

  async validarPeriodoDisponivel(
    periodoId: string,
    usuarioId: string,
  ) {
    const periodo =
      await this.prisma.periodoAquisitivoFerias.findFirst({
        where: {
          id: periodoId,
          usuarioId,
        },
      });

    if (!periodo) {
      throw new BadRequestException(
        'Período aquisitivo não encontrado.',
      );
    }

    if (periodo.status !== 'DISPONIVEL') {
      throw new BadRequestException(
        'Este período aquisitivo não está disponível para solicitação.',
      );
    }

    return periodo;
  }

  validarAntecedenciaMinima(
    dataInicio: Date,
  ) {
    const hoje =
      this.inicioDoDiaUtc(new Date());

    const dataMinima =
      this.adicionarDias(
        hoje,
        30,
      );

    const inicio =
      this.inicioDoDiaUtc(dataInicio);

    if (inicio < dataMinima) {
      throw new BadRequestException(
        'As férias devem ser solicitadas com no mínimo 30 dias de antecedência.',
      );
    }
  }

  validarDiaSemana(
    dataInicio: Date,
  ) {
    const data =
      this.inicioDoDiaUtc(
        dataInicio,
      );

    const diaSemana =
      data.getUTCDay();

    /*
     * 0 = domingo
     * 1 = segunda
     * 2 = terça
     * 3 = quarta
     * 4 = quinta
     * 5 = sexta
     * 6 = sábado
     */
    if (![1, 2, 3].includes(diaSemana)) {
      throw new BadRequestException(
        'O início das férias deve ocorrer entre segunda e quarta-feira.',
      );
    }
  }

  calcularDataFim(
    dataInicio: Date,
    quantidadeDias: number,
  ) {
    return this.adicionarDias(
      dataInicio,
      quantidadeDias - 1,
    );
  }

  calcularDataRetorno(
    dataFim: Date,
  ) {
    return this.adicionarDias(
      dataFim,
      1,
    );
  }

  obterConfiguracaoModalidade(
    modalidade: string,
  ) {
    const modalidades: Record<
      string,
      {
        parcelas: number[];
        diasVendidos: number;
      }
    > = {
      DIAS_30: {
        parcelas: [30],
        diasVendidos: 0,
      },

      DIAS_25_5: {
        parcelas: [25, 5],
        diasVendidos: 0,
      },

      DIAS_20_10: {
        parcelas: [20, 10],
        diasVendidos: 0,
      },

      DIAS_15_15: {
        parcelas: [15, 15],
        diasVendidos: 0,
      },

      DIAS_20_10_VENDIDOS: {
        parcelas: [20],
        diasVendidos: 10,
      },

      DIAS_15_10_5: {
        parcelas: [15, 10, 5],
        diasVendidos: 0,
      },

      DIAS_20_5_5: {
        parcelas: [20, 5, 5],
        diasVendidos: 0,
      },
    };

    const configuracao =
      modalidades[modalidade];

    if (!configuracao) {
      throw new BadRequestException(
        'Modalidade de férias inválida.',
      );
    }

    return configuracao;
  }

  validarModalidadeMotorista(
    modalidade: string,
    cargo?: string | null,
  ) {
    if (
      modalidade !==
      'DIAS_20_10_VENDIDOS'
    ) {
      return;
    }

    const cargoNormalizado =
      String(cargo || '')
        .trim()
        .toUpperCase();

    const ehMotorista =
      cargoNormalizado.includes(
        'MOTORISTA',
      );

    if (!ehMotorista) {
      throw new BadRequestException(
        'A modalidade de 20 dias de férias com 10 dias vendidos é permitida somente para motoristas.',
      );
    }
  }

  validarParcelas(
    modalidade: string,
    parcelas: any[],
  ) {
    const configuracao =
      this.obterConfiguracaoModalidade(
        modalidade,
      );

    if (!Array.isArray(parcelas)) {
      throw new BadRequestException(
        'As parcelas de férias são obrigatórias.',
      );
    }

    if (
      parcelas.length !==
      configuracao.parcelas.length
    ) {
      throw new BadRequestException(
        `A modalidade selecionada exige ${configuracao.parcelas.length} período(s) de férias.`,
      );
    }

    parcelas.forEach(
      (parcela, index) => {
        if (!parcela?.dataInicio) {
          throw new BadRequestException(
            `Informe a data de início do período ${index + 1}.`,
          );
        }
      },
    );

    return configuracao;
  }

  private mapearEmpresaParaFilialFeriado(
    empresa?: string | null,
  ) {
    if (!empresa) {
      return null;
    }

    const mapa: Record<
      string,
      string
    > = {
      'Campina Grande':
        'Campina_Grande',

      'CEP Portão':
        'CEP_Port_o',

      Costeira:
        'Costeira',

      'COP - Boticario':
        'COP___Boticario',

      Matriz:
        'Matriz',

      Araraquara:
        'Araraquara',

      Guarulhos:
        'Guarulhos',

      Camaçari:
        'Cama_ari',

      'Feira de Santana':
        'Feira_de_Santana',

      'São Gonçalo dos Campos':
        'S_o_Gon_alo_dos_Campos',

      Varginha:
        'Varginha',

      'Campo Grande':
        'Campo_Grande',

      Serra:
        'Serra',

      Registro:
        'Registro',

      Itupeva:
        'Itupeva',

      Louveira:
        'Louveira',
    };

    return mapa[empresa] ?? null;
  }

  async validarFeriados(
    dataInicio: Date,
    empresa?: string | null,
  ) {
    const filial =
      this.mapearEmpresaParaFilialFeriado(
        empresa,
      );

    if (!filial) {
      throw new BadRequestException(
        'Não foi possível identificar a filial do colaborador para validar os feriados.',
      );
    }

    const inicio =
      this.inicioDoDiaUtc(
        dataInicio,
      );

    /*
     * Precisamos verificar:
     *
     * dataInicio
     * dataInicio + 1
     * dataInicio + 2
     *
     * Se existir feriado nesse intervalo,
     * o início é inválido.
     */
    const limite =
      this.adicionarDias(
        inicio,
        2,
      );

    const feriado =
      await this.prisma.feriado.findFirst({
        where: {
          ativo: true,

          filiais: {
            has: filial as any,
          },

          dataFeriado: {
            gte: inicio,
            lte: limite,
          },
        },

        orderBy: {
          dataFeriado: 'asc',
        },
      });

    if (feriado) {
      throw new BadRequestException(
        `Não é permitido iniciar as férias nesta data devido ao feriado "${feriado.nome}".`,
      );
    }
  }

  validarSobreposicaoParcelas(
    parcelas: {
      ordem: number;
      dataInicio: Date;
      dataFim: Date;
    }[],
  ) {
    const parcelasOrdenadas =
      [...parcelas].sort(
        (a, b) =>
          a.dataInicio.getTime() -
          b.dataInicio.getTime(),
      );

    for (
      let index = 0;
      index <
      parcelasOrdenadas.length - 1;
      index++
    ) {
      const atual =
        parcelasOrdenadas[index];

      const proxima =
        parcelasOrdenadas[index + 1];

      if (
        proxima.dataInicio <=
        atual.dataFim
      ) {
        throw new BadRequestException(
          `O período ${proxima.ordem} está sobreposto ao período ${atual.ordem}.`,
        );
      }
    }
  }

  validarOrdemCronologicaParcelas(
    parcelas: {
      ordem: number;
      dataInicio: Date;
    }[],
  ) {
    for (
      let index = 1;
      index < parcelas.length;
      index++
    ) {
      const anterior =
        parcelas[index - 1];

      const atual =
        parcelas[index];

      if (
        atual.dataInicio <=
        anterior.dataInicio
      ) {
        throw new BadRequestException(
          `A data de início do período ${atual.ordem} deve ser posterior ao período ${anterior.ordem}.`,
        );
      }
    }
  }
}