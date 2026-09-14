import { KmmDatabaseService } from '@/database/kmm/kmm-database.service';

import { PrismaService } from '@/prisma/prisma.service';

import { BadRequestException, Injectable } from '@nestjs/common';

import * as XLSX from 'xlsx';

@Injectable()
export class AniversariantesKmmService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly kmmDatabaseService: KmmDatabaseService,
  ) {}

  private extrairMesDataNascimento(dataNascimento: string): number | null {
    if (!dataNascimento) {
      return null;
    }

    const data = String(dataNascimento).trim();

    // YYYY-MM-DD
    const formatoIso = /^(\d{4})-(\d{2})-(\d{2})$/;

    const matchIso = data.match(formatoIso);

    if (matchIso) {
      return Number(matchIso[2]);
    }

    // DD/MM/YYYY
    const formatoBr = /^(\d{2})\/(\d{2})\/(\d{4})$/;

    const matchBr = data.match(formatoBr);

    if (matchBr) {
      return Number(matchBr[2]);
    }

    // DD/MM
    const formatoSemAno = /^(\d{2})\/(\d{2})$/;

    const matchSemAno = data.match(formatoSemAno);

    if (matchSemAno) {
      return Number(matchSemAno[2]);
    }

    return null;
  }

  private extrairDiaDataNascimento(dataNascimento: string): number {
    if (!dataNascimento) {
      return 0;
    }

    const data = String(dataNascimento).trim();

    // YYYY-MM-DD
    const formatoIso = /^(\d{4})-(\d{2})-(\d{2})$/;

    const matchIso = data.match(formatoIso);

    if (matchIso) {
      return Number(matchIso[3]);
    }

    // DD/MM/YYYY
    const formatoBr = /^(\d{2})\/(\d{2})\/(\d{4})$/;

    const matchBr = data.match(formatoBr);

    if (matchBr) {
      return Number(matchBr[1]);
    }

    // DD/MM
    const formatoSemAno = /^(\d{2})\/(\d{2})$/;

    const matchSemAno = data.match(formatoSemAno);

    if (matchSemAno) {
      return Number(matchSemAno[1]);
    }

    return 0;
  }

  private normalizarDataNascimento(dataNascimento: string): string {
    if (!dataNascimento) {
      return '';
    }

    const data = String(dataNascimento).trim();

    // Já está YYYY-MM-DD
    if (/^\d{4}-\d{2}-\d{2}$/.test(data)) {
      return data;
    }

    // DD/MM/YYYY
    const matchBr = data.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);

    if (matchBr) {
      const [, dia, mes, ano] = matchBr;

      return `${ano}-${mes}-${dia}`;
    }

    return data;
  }

  async findAllAniversariantes(body: any, user: any) {
    const podeVerInativos =
      user.roles.includes('DESENVOLVIMENTO') ||
      user.roles.includes('PESSOAS_E_CULTURA');

    const mesNumero = Number(body.mes);

    const nome = body.nome?.trim() || null;

    const ordenarPorRecebido = String(
      body.ordenarPor || 'DATA_NASCIMENTO',
    ).toUpperCase();

    const ordemRecebida = String(body.ordem || 'asc').toLowerCase();

    const ordem = ordemRecebida === 'desc' ? 'DESC' : 'ASC';

    const colunasPermitidas: Record<string, string> = {
      NOME: '"NOME"',
      DATA_NASCIMENTO: `EXTRACT(DAY FROM "DATA_NASCIMENTO_ORIGINAL")`,
      MODALIDADE: '"MODALIDADE"',
      SITUACAO: '"SITUACAO"',
    };

    const colunaOrdenacao =
      colunasPermitidas[ordenarPorRecebido] ||
      `EXTRACT(DAY FROM "DATA_NASCIMENTO_ORIGINAL")`;

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

    const resultKmm = await this.kmmDatabaseService.query(sql, [
      mesNumero,
      nome,
    ]);

    const aniversariantesKmm = resultKmm.rows.map((item: any) => ({
      ...item,

      TIPO: 'COLABORADOR',
      ORIGEM: 'KMM',
    }));

    const aniversariantesPjBanco = await this.prisma.aniversariantesPj.findMany(
      {
        where: {
          ...(!podeVerInativos
            ? {
                ativo: true,
              }
            : {}),

          ...(nome
            ? {
                nome: {
                  contains: nome,
                  mode: 'insensitive',
                },
              }
            : {}),
        },
      },
    );

    const aniversariantesPj = aniversariantesPjBanco
      .filter((item) => {
        const mes = this.extrairMesDataNascimento(item.dataNascimento);

        return mes === mesNumero;
      })
      .map((item) => ({
        COD_PESSOA: item.id,

        NOME: item.nome,

        DATA_NASCIMENTO: this.normalizarDataNascimento(item.dataNascimento),

        MODALIDADE: 'PJ',

        SITUACAO: item.ativo ? 'Ativo' : 'Inativo',

        FILIAL: item.filial.toUpperCase(),

        ATIVO: item.ativo,

        TIPO: 'PJ',

        ORIGEM: 'MANUAL',
      }));

    const aniversariantes = [...aniversariantesKmm, ...aniversariantesPj];

    aniversariantes.sort((a, b) => {
      let comparacao = 0;

      if (ordenarPorRecebido === 'DATA_NASCIMENTO') {
        const diaA = this.extrairDiaDataNascimento(a.DATA_NASCIMENTO);

        const diaB = this.extrairDiaDataNascimento(b.DATA_NASCIMENTO);

        comparacao = diaA - diaB;
      } else if (ordenarPorRecebido === 'NOME') {
        comparacao = String(a.NOME || '').localeCompare(
          String(b.NOME || ''),
          'pt-BR',
          {
            sensitivity: 'base',
          },
        );
      } else if (ordenarPorRecebido === 'MODALIDADE') {
        comparacao = String(a.MODALIDADE || '').localeCompare(
          String(b.MODALIDADE || ''),
          'pt-BR',
          {
            sensitivity: 'base',
          },
        );
      } else if (ordenarPorRecebido === 'SITUACAO') {
        comparacao = String(a.SITUACAO || '').localeCompare(
          String(b.SITUACAO || ''),
          'pt-BR',
          {
            sensitivity: 'base',
          },
        );
      }

      return ordemRecebida === 'desc' ? -comparacao : comparacao;
    });

    return aniversariantes;
  }

  async createAniversariantesPj(body: {
    nome: string;
    dataNascimento: string;
    filial: string;
  }) {
    const nome = body.nome?.trim();
    const dataNascimento = body.dataNascimento?.trim();
    const filial = body.filial?.trim().toUpperCase();

    if (!nome || !dataNascimento || !filial) {
      throw new BadRequestException(
        'Nome, data de nascimento e filial são obrigatórios.',
      );
    }

    const existente = await this.prisma.aniversariantesPj.findFirst({
      where: {
        nome: {
          equals: nome,
          mode: 'insensitive',
        },
        dataNascimento,
        filial: {
          equals: filial,
          mode: 'insensitive',
        },
      },
    });

    if (existente) {
      throw new BadRequestException(
        'Este aniversariante PJ já está cadastrado.',
      );
    }

    return await this.prisma.aniversariantesPj.create({
      data: {
        nome,
        dataNascimento,
        filial,
      },
    });
  }

  async importAniversariantesPj(file: Express.Multer.File) {
    if (!file) {
      throw new BadRequestException('Nenhuma planilha foi enviada.');
    }

    const extensao = file.originalname.split('.').pop()?.toLowerCase();

    if (extensao !== 'xlsx' && extensao !== 'xls') {
      throw new BadRequestException(
        'Formato inválido. Envie uma planilha .xlsx ou .xls.',
      );
    }

    const workbook = XLSX.read(file.buffer, {
      type: 'buffer',
      cellDates: false,
    });

    const primeiraAba = workbook.SheetNames[0];

    if (!primeiraAba) {
      throw new BadRequestException('A planilha não possui nenhuma aba.');
    }

    const worksheet = workbook.Sheets[primeiraAba];

    const dados = XLSX.utils.sheet_to_json<{
      nome?: string;
      dataNascimento?: string;
      filial?: string;
    }>(worksheet, {
      defval: '',
      raw: false,
    });

    if (!dados.length) {
      throw new BadRequestException('A planilha está vazia.');
    }

    const registros = dados
      .map((item) => ({
        nome: String(item.nome || '').trim(),

        dataNascimento: String(item.dataNascimento || '').trim(),

        filial: String(item.filial || '')
          .toUpperCase()
          .trim(),
      }))
      .filter((item) => item.nome && item.dataNascimento && item.filial);

    if (!registros.length) {
      throw new BadRequestException(
        'Nenhum registro válido foi encontrado na planilha.',
      );
    }

    const resultado = await this.prisma.aniversariantesPj.createMany({
      data: registros,
    });

    return {
      mensagem: 'Planilha importada com sucesso.',
      quantidadeImportada: resultado.count,
    };
  }

  async updateAniversariantesPj(
    id: string,
    body: {
      nome: string;
      dataNascimento: string;
      filial: string;
      ativo: boolean;
    },
  ) {
    if (!id) {
      throw new BadRequestException('ID do aniversariante é obrigatório.');
    }

    const nome = body.nome?.trim();
    const dataNascimento = body.dataNascimento?.trim();
    const filial = body.filial?.trim().toUpperCase();
    const ativo = body.ativo;

    if (
      !nome ||
      !dataNascimento ||
      !filial ||
      ativo === undefined ||
      ativo === null
    ) {
      throw new BadRequestException(
        'Nome, data de nascimento, filial e ativo são obrigatórios.',
      );
    }

    const aniversariante = await this.prisma.aniversariantesPj.findUnique({
      where: {
        id,
      },
    });

    if (!aniversariante) {
      throw new BadRequestException('Aniversariante PJ não encontrado.');
    }

    const existente = await this.prisma.aniversariantesPj.findFirst({
      where: {
        id: {
          not: id,
        },

        nome: {
          equals: nome,
          mode: 'insensitive',
        },

        dataNascimento,

        filial: {
          equals: filial,
          mode: 'insensitive',
        },
      },
    });

    if (existente) {
      throw new BadRequestException(
        'Já existe outro aniversariante PJ com estes dados.',
      );
    }

    return await this.prisma.aniversariantesPj.update({
      where: {
        id,
      },

      data: {
        nome,
        dataNascimento,
        filial,
        ativo,
      },
    });
  }
}
