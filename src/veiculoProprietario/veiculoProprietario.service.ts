import { KmmDatabaseService } from '@/database/kmm/kmm-database.service';
import { PrismaService } from '@/prisma/prisma.service';
import { Injectable } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { Logger } from '@nestjs/common';

@Injectable()
export class VeiculoProprietarioService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly kmmDatabaseService: KmmDatabaseService,
  ) {}

  private readonly logger = new Logger(VeiculoProprietarioService.name);

  @Cron('0 0 6 * * 1', {
  // @Cron('30 * * * * *', {
    name: 'sincronizar-veiculos-proprietarios',
    timeZone: 'America/Sao_Paulo',
    waitForCompletion: true,
  })
  async sincronizarVeiculosCron() {
    this.logger.log(
      'Iniciando sincronização semanal dos veículos proprietários...',
    );

    try {
      const resultado = await this.create({});

      this.logger.log(
        `Sincronização concluída. ` +
          `Total KMM: ${resultado.totalKmm} | ` +
          `Inseridos: ${resultado.inseridos} | ` +
          `Atualizados: ${resultado.atualizados}`,
      );
    } catch (error) {
      this.logger.error(
        'Erro na sincronização semanal dos veículos proprietários.',
        error instanceof Error ? error.stack : String(error),
      );
    }
  }

  async create(body: any) {
    const sql = `
    WITH ultima_situacao AS (
      SELECT
        VHS."PLACA",
        VHS."SITUACAO_ID",
        VHS."DATE_INSERT",
        ROW_NUMBER() OVER (
          PARTITION BY VHS."PLACA"
          ORDER BY VHS."DATE_INSERT" DESC
        ) AS rn
      FROM VEICULO.VEICULO_HIST_SITUACAO VHS
    )

    SELECT DISTINCT ON (VP."PLACA")
      P."CLIENTE" AS "NOME",
      P."CNPJ_CPF",
      VP."PLACA",
      VMA."MODALIDADE",
      VS."SITUACAO",
      VTC."DESCRICAO" AS "CLASSIFICACAO_VEICULO"

    FROM VEICULO.VEICULO_PROPRIETARIO VP

    INNER JOIN KSS.PESSOA P
      ON P."COD_PESSOA" = VP."COD_PESSOA"

    LEFT JOIN VEICULO.V_VEICULO_MODALIDADE_ATUAL VMA
      ON VMA."PLACA" = VP."PLACA"

    LEFT JOIN ultima_situacao VHS
      ON VHS."PLACA" = VP."PLACA"
      AND VHS.rn = 1

    LEFT JOIN VEICULO.VEICULO_SITUACAO VS
      ON VS."SITUACAO_ID" = VHS."SITUACAO_ID"

    LEFT JOIN VEICULO.VEICULO V
      ON V."PLACA" = VP."PLACA"

    LEFT JOIN VEICULO.VEICULO_TIPO_CARROCERIA VTC
      ON VTC."NUM_TIPO_CARROCERIA" = V."TIPO_CARROCERIA_ID"

    WHERE VP."PLACA" IS NOT NULL

    ORDER BY VP."PLACA"
  `;

    const resultKmm = await this.kmmDatabaseService.query(sql, []);

    const veiculosKmm = resultKmm.rows;

    if (!veiculosKmm.length) {
      return {
        message: 'Nenhum veículo encontrado no KMM.',
        totalKmm: 0,
        inseridos: 0,
        atualizados: 0,
      };
    }

    const veiculosNormalizados = veiculosKmm
      .map((item: any) => ({
        placa: String(item.PLACA || '')
          .trim()
          .toUpperCase(),
        nome: String(item.NOME || '').trim(),
        cnpjCpf: String(item.CNPJ_CPF || '').trim(),
        modalidade: item.MODALIDADE ? String(item.MODALIDADE).trim() : null,
        situacao: item.SITUACAO ? String(item.SITUACAO).trim() : null,
        classificacaoVeiculo: item.CLASSIFICACAO_VEICULO
          ? String(item.CLASSIFICACAO_VEICULO).trim()
          : null,
      }))
      .filter((item) => item.placa);

    const placas = veiculosNormalizados.map((item) => item.placa);

    const veiculosExistentes = await this.prisma.veiculoProprietario.findMany({
      where: {
        placa: {
          in: placas,
        },
      },
      select: {
        placa: true,
      },
    });

    const placasExistentes = new Set(
      veiculosExistentes.map((item) => item.placa),
    );

    let inseridos = 0;
    let atualizados = 0;

    // Processa em lotes para evitar excesso de consultas simultâneas
    const tamanhoLote = 100;

    for (let i = 0; i < veiculosNormalizados.length; i += tamanhoLote) {
      const lote = veiculosNormalizados.slice(i, i + tamanhoLote);

      await this.prisma.$transaction(
        lote.map((veiculo) =>
          this.prisma.veiculoProprietario.upsert({
            where: {
              placa: veiculo.placa,
            },
            create: {
              placa: veiculo.placa,
              nome: veiculo.nome,
              cnpjCpf: veiculo.cnpjCpf,
              modalidade: veiculo.modalidade,
              situacao: veiculo.situacao,
              classificacaoVeiculo: veiculo.classificacaoVeiculo,
            },
            update: {
              nome: veiculo.nome,
              cnpjCpf: veiculo.cnpjCpf,
              modalidade: veiculo.modalidade,
              situacao: veiculo.situacao,
              classificacaoVeiculo: veiculo.classificacaoVeiculo,
            },
          }),
        ),
      );

      for (const veiculo of lote) {
        if (placasExistentes.has(veiculo.placa)) {
          atualizados++;
        } else {
          inseridos++;
        }
      }
    }

    return {
      message: 'Veículos sincronizados com sucesso.',
      totalKmm: veiculosKmm.length,
      inseridos,
      atualizados,
    };
  }

  async findByFilter(body: any) {
    const {
      pesquisa,
      placa,
      nome,
      cnpjCpf,
      modalidade,
      situacao,
      classificacaoVeiculo,
    } = body;

    const page = Math.max(1, Number(body.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(body.limit) || 10));
    const skip = (page - 1) * limit;

    const where: any = {
      AND: [
        ...(pesquisa?.trim()
          ? [
              {
                OR: [
                  {
                    placa: {
                      contains: pesquisa.trim(),
                      mode: 'insensitive',
                    },
                  },
                  {
                    nome: {
                      contains: pesquisa.trim(),
                      mode: 'insensitive',
                    },
                  },
                  {
                    cnpjCpf: {
                      contains: pesquisa.trim(),
                      mode: 'insensitive',
                    },
                  },
                  {
                    modalidade: {
                      contains: pesquisa.trim(),
                      mode: 'insensitive',
                    },
                  },
                  {
                    situacao: {
                      contains: pesquisa.trim(),
                      mode: 'insensitive',
                    },
                  },
                  {
                    classificacaoVeiculo: {
                      contains: pesquisa.trim(),
                      mode: 'insensitive',
                    },
                  },
                ],
              },
            ]
          : []),

        ...(placa?.trim()
          ? [
              {
                placa: {
                  contains: placa.trim(),
                  mode: 'insensitive',
                },
              },
            ]
          : []),

        ...(nome?.trim()
          ? [
              {
                nome: {
                  contains: nome.trim(),
                  mode: 'insensitive',
                },
              },
            ]
          : []),

        ...(cnpjCpf?.trim()
          ? [
              {
                cnpjCpf: {
                  contains: cnpjCpf.trim(),
                  mode: 'insensitive',
                },
              },
            ]
          : []),

        ...(modalidade?.trim()
          ? [
              {
                modalidade: {
                  equals: modalidade.trim(),
                  mode: 'insensitive',
                },
              },
            ]
          : []),

        ...(situacao?.trim()
          ? [
              {
                situacao: {
                  equals: situacao.trim(),
                  mode: 'insensitive',
                },
              },
            ]
          : []),

        ...(classificacaoVeiculo?.trim()
          ? [
              {
                classificacaoVeiculo: {
                  equals: classificacaoVeiculo.trim(),
                  mode: 'insensitive',
                },
              },
            ]
          : []),
      ],
    };

    const [veiculos, total] = await this.prisma.$transaction([
      this.prisma.veiculoProprietario.findMany({
        where,
        skip,
        take: limit,
        orderBy: [{ nome: 'asc' }, { placa: 'asc' }],
      }),

      this.prisma.veiculoProprietario.count({
        where,
      }),
    ]);

    return {
      data: veiculos,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
        hasNextPage: page * limit < total,
        hasPreviousPage: page > 1,
      },
    };
  }
}
