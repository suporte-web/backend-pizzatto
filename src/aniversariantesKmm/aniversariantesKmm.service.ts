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
      NOME: 'PF."NOME"',
      DATA_NASCIMENTO: `EXTRACT(DAY FROM PF."DATA_NASCIMENTO")`,
      MODALIDADE: 'M."DESCRICAO"',
      SITUACAO: 'PMS."DESCRICAO"',
    };

    const colunaOrdenacao =
      colunasPermitidas[ordenarPorRecebido] ||
      `EXTRACT(DAY FROM PF."DATA_NASCIMENTO")`;

    const ordem = ordemRecebida === 'desc' ? 'DESC' : 'ASC';

    const sql = `
    SELECT
      P."COD_PESSOA",
      PF."NOME",

      TO_CHAR(
        PF."DATA_NASCIMENTO",
        'YYYY-MM-DD'
      ) AS "DATA_NASCIMENTO",

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

      AND EXTRACT(
        MONTH FROM PF."DATA_NASCIMENTO"
      ) = $1

      AND (
        $2::TEXT IS NULL
        OR PF."NOME" ILIKE '%' || $2 || '%'
      )

    ORDER BY ${colunaOrdenacao} ${ordem};
  `;

    const result = await this.kmmDatabaseService.query(sql, [mesNumero, nome]);

    const aniversariantes = result.rows;

    if (!aniversariantes.length) {
      return [];
    }

    const normalizarNome = (valor?: string | null) => {
      if (!valor) return '';

      return valor
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .trim()
        .replace(/\s+/g, ' ')
        .toUpperCase();
    };

    const usuariosChat = await this.prisma.usuarioChat.findMany({
      where: {
        nome: {
          not: '',
        },
      },
      select: {
        nome: true,
        empresa: true,
      },
    });

    const empresasPorNome = new Map<string, string | null>();

    usuariosChat.forEach((usuario) => {
      const nomeNormalizado = normalizarNome(usuario.nome);

      if (!nomeNormalizado) return;

      empresasPorNome.set(nomeNormalizado, usuario.empresa ?? null);
    });

    const diagnostico = aniversariantes.map((aniversariante: any) => {
      const nomeKmm = aniversariante.NOME;
      const nomeNormalizado = normalizarNome(nomeKmm);

      return {
        nomeKmm,
        nomeNormalizado,
        encontradoUsuarioChat: empresasPorNome.has(nomeNormalizado),
        empresa: empresasPorNome.get(nomeNormalizado) ?? null,
      };
    });

    return aniversariantes.map((aniversariante: any) => {
      const nomeNormalizado = normalizarNome(aniversariante.NOME);

      return {
        ...aniversariante,

        EMPRESA: empresasPorNome.get(nomeNormalizado) ?? null,
      };
    });
  }
}
