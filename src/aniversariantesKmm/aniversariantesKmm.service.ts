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

    const sql = `
    SELECT
      P."COD_PESSOA",
      PF."NOME",
      PF."DATA_NASCIMENTO",
      M."DESCRICAO" AS "MODALIDADE",
      PMS."DESCRICAO" AS "SITUACAO"

    FROM KSS.PESSOA P

    INNER JOIN KSS.PESSOA_FISICA PF
      ON PF."COD_PESSOA" = P."COD_PESSOA"

    INNER JOIN KSS.PESSOA_MODALIDADE PM
      ON PM."COD_PESSOA" = P."COD_PESSOA"

    INNER JOIN KSS.MODALIDADE M
      ON M."NUM_MODALIDADE" = PM."NUM_MODALIDADE"

    INNER JOIN KSS.PESSOA_MODALIDADE_SITUACAO PMS
      ON PMS."SITUACAO" = PM."SITUACAO"

    WHERE M."NUM_MODALIDADE" = 4
      AND EXTRACT(MONTH FROM PF."DATA_NASCIMENTO") = $1
      AND (
        $2::TEXT IS NULL
        OR PF."NOME" ILIKE '%' || $2 || '%'
      )

    ORDER BY PF."NOME" ASC;
  `;

    const result = await this.kmmDatabaseService.query(sql, [mesNumero, nome]);

    return result.rows;
  }
}
