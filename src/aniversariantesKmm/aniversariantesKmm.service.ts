import { KmmDatabaseService } from '@/database/kmm/kmm-database.service';
import { PrismaService } from '@/prisma/prisma.service';
import { Injectable } from '@nestjs/common';

@Injectable()
export class AniversariantesKmmService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly kmmDatabaseService: KmmDatabaseService,
  ) {}

  async findAllAniversariantes(body: any) {
    const mesNumero = Number(body.mes);
    const nome = body.nome?.trim() || null;

    const ordenarPorRecebido = String(
      body.ordenarPor || 'DATA_NASCIMENTO',
    ).toUpperCase();

    const ordemRecebida = String(body.ordem || 'asc').toLowerCase();

    const colunasPermitidas: Record<string, string> = {
      NOME: '"NOME"',
      DATA_NASCIMENTO: `EXTRACT(DAY FROM "DATA_NASCIMENTO_ORIGINAL")`,
      MODALIDADE: '"MODALIDADE"',
      SITUACAO: '"SITUACAO"',
    };

    const colunaOrdenacao =
      colunasPermitidas[ordenarPorRecebido] ||
      `EXTRACT(DAY FROM "DATA_NASCIMENTO_ORIGINAL")`;

    const ordem = ordemRecebida === 'desc' ? 'DESC' : 'ASC';

    const sql = `
    WITH aniversariantes AS (
      SELECT
        P."COD_PESSOA",
        PF."NOME",
        PF."DATA_NASCIMENTO" AS "DATA_NASCIMENTO_ORIGINAL",
        TO_CHAR(
          PF."DATA_NASCIMENTO",
          'YYYY-MM-DD'
        ) AS "DATA_NASCIMENTO",
        M."DESCRICAO" AS "MODALIDADE",
        PMS."DESCRICAO" AS "SITUACAO",
        UN."UNIDADE_NEGOCIO" AS "FILIAL",
        P."DATE_INSERT",

        ROW_NUMBER() OVER (
          PARTITION BY PF."NOME"
          ORDER BY P."DATE_INSERT" DESC
        ) AS rn

      FROM KSS.PESSOA P

      INNER JOIN KSS.PESSOA_FISICA PF
        ON PF."COD_PESSOA" = P."COD_PESSOA"

      INNER JOIN KSS.PESSOA_MODALIDADE PM
        ON PM."COD_PESSOA" = P."COD_PESSOA"

      INNER JOIN KSS.MODALIDADE M
        ON M."NUM_MODALIDADE" = PM."NUM_MODALIDADE"

      INNER JOIN KSS.PESSOA_MODALIDADE_SITUACAO PMS
        ON PMS."SITUACAO" = PM."SITUACAO"

      INNER JOIN KSS.FUNCIONARIO_MATR_HISTORICO FMH
        ON FMH."COD_PESSOA" = P."COD_PESSOA"

      INNER JOIN KSS.UNIDADE_NEGOCIO UN
        ON UN."COD_PESSOA" = FMH."COD_PESSOA_FILIAL"

      WHERE M."NUM_MODALIDADE" = 4

        AND PMS."DESCRICAO" = 'Ativo'

        AND EXTRACT(
          MONTH FROM PF."DATA_NASCIMENTO"
        ) = $1

        AND (
          $2::TEXT IS NULL
          OR PF."NOME" ILIKE '%' || $2 || '%'
        )
    )

    SELECT
      "COD_PESSOA",
      "NOME",
      "DATA_NASCIMENTO",
      "MODALIDADE",
      "SITUACAO",
      "FILIAL"

    FROM aniversariantes

    WHERE rn = 1

    ORDER BY ${colunaOrdenacao} ${ordem};
  `;

    const result = await this.kmmDatabaseService.query(sql, [mesNumero, nome]);

    const aniversariantes = result.rows;

    if (!aniversariantes.length) {
      return [];
    }

    return aniversariantes;
  }
}
