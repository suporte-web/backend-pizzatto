import { KmmDatabaseService } from '@/database/kmm/kmm-database.service';

import { PrismaService } from '@/prisma/prisma.service';

import { BadRequestException, Injectable, Logger } from '@nestjs/common';

import * as XLSX from 'xlsx';

@Injectable()
export class AniversariantesKmmService {
  private readonly logger = new Logger(AniversariantesKmmService.name);

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

  private normalizarNome(valor: string): string {
    return String(valor || '')
      .trim()

      .toUpperCase()

      .normalize('NFD')

      .replace(/[\u0300-\u036f]/g, '')

      .replace(/\s+/g, ' ');
  }

  private converterData(valor?: string | null): Date | null {
    if (!valor) {
      return null;
    }

    const data = String(valor).trim();

    if (!data) {
      return null;
    }

    const dataConvertida = new Date(`${data}T00:00:00.000Z`);

    if (Number.isNaN(dataConvertida.getTime())) {
      return null;
    }

    return dataConvertida;
  }

  async sincronizarDatasUsuarioChat() {
    const funcionarios = await this.findAniversarioAndAdmissao();

    const usuariosChat = await this.prisma.usuarioChat.findMany({
      select: {
        id: true,
        nome: true,
        ativo: true,
        dataNascimento: true,
        dataAdmissao: true,
        dataDemissao: true,
      },
    });

    const usuariosPorNome = new Map<string, typeof usuariosChat>();

    for (const usuario of usuariosChat) {
      const nome = this.normalizarNome(usuario.nome);

      if (!nome) continue;

      const grupo = usuariosPorNome.get(nome) ?? [];
      grupo.push(usuario);
      usuariosPorNome.set(nome, grupo);
    }

    let totalUsuariosAtualizados = 0;
    let totalUsuariosAmbiguos = 0;
    let totalUsuariosNaoEncontrados = 0;

    const hoje = this.inicioDoDiaUtc(new Date());

    for (const funcionario of funcionarios) {
      const nome = this.normalizarNome(funcionario.NOME);
      const encontrados = usuariosPorNome.get(nome) ?? [];

      if (!encontrados.length) {
        totalUsuariosNaoEncontrados++;
        continue;
      }

      const dataNascimento = this.converterData(funcionario.DATA_NASCIMENTO);

      const dataAdmissao = this.converterData(funcionario.DATA_ADMISSAO);

      const dataDemissao = this.converterData(funcionario.DATA_DEMISSAO);

      let usuarioChat: (typeof usuariosChat)[number] | undefined;

      if (encontrados.length === 1) {
        usuarioChat = encontrados[0];
      } else {
        // Em caso de múltiplas contas, somente sincroniza
        // quando uma delas corresponde exatamente à admissão
        // mais recente informada pelo KMM.
        const correspondentes = encontrados.filter(
          (usuario) =>
            dataAdmissao &&
            usuario.dataAdmissao?.getTime() === dataAdmissao.getTime(),
        );

        if (correspondentes.length === 1) {
          usuarioChat = correspondentes[0];
        } else {
          totalUsuariosAmbiguos++;

          this.logger.warn(
            `Sincronização ignorada: ${encontrados.length} contas ` +
              `para '${nome}', sem correspondência única da admissão.`,
          );

          continue;
        }
      }

      const dataUpdate: {
        dataNascimento?: Date;
        dataAdmissao?: Date;
        dataDemissao?: Date | null;
        ativo?: boolean;
      } = {};

      if (!usuarioChat.dataNascimento && dataNascimento) {
        dataUpdate.dataNascimento = dataNascimento;
      }

      if (
        dataAdmissao &&
        (!usuarioChat.dataAdmissao ||
          dataAdmissao.getTime() > usuarioChat.dataAdmissao.getTime())
      ) {
        dataUpdate.dataAdmissao = dataAdmissao;
      }

      if (dataDemissao) {
        if (usuarioChat.dataDemissao?.getTime() !== dataDemissao.getTime()) {
          dataUpdate.dataDemissao = dataDemissao;
        }

        if (dataDemissao.getTime() <= hoje.getTime() && usuarioChat.ativo) {
          dataUpdate.ativo = false;
        }
      } else if (dataAdmissao) {
        // O vínculo selecionado pelo KMM não tem demissão.
        // Remove a demissão antiga da conta correspondente.
        if (usuarioChat.dataDemissao !== null) {
          dataUpdate.dataDemissao = null;
        }

        // Para contas duplicadas, a correspondência exata
        // da admissão identifica a conta a ser reativada.
        const readmissaoConfirmada =
          encontrados.length > 1 ||
          (!!usuarioChat.dataDemissao &&
            dataAdmissao.getTime() > usuarioChat.dataDemissao.getTime());

        if (readmissaoConfirmada && !usuarioChat.ativo) {
          dataUpdate.ativo = true;
        }
      }

      if (!Object.keys(dataUpdate).length) {
        continue;
      }

      await this.prisma.usuarioChat.update({
        where: {
          id: usuarioChat.id,
        },
        data: dataUpdate,
      });

      totalUsuariosAtualizados++;

      this.logger.log(
        `Usuário sincronizado: ${usuarioChat.nome} (${usuarioChat.id})`,
      );
    }

    return {
      totalFuncionariosKmm: funcionarios.length,
      totalUsuariosAtualizados,
      totalUsuariosAmbiguos,
      totalUsuariosNaoEncontrados,
    };
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

        FD."CENTRO_CUSTO" AS "FILIAL",

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

      INNER JOIN FOLHA.FUNCIONARIO_DADOS FD

        ON FD."COD_PESSOA" = P."COD_PESSOA"

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

    await this.sincronizarDatasUsuarioChat();

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

    const normalizarNome = (valor: string) =>
      String(valor || '')
        .trim()

        .toUpperCase()

        .normalize('NFD')

        .replace(/[\u0300-\u036f]/g, '')

        .replace(/\s+/g, ' ');

    const nomesKmm = new Set(
      aniversariantesKmm.map((item) => normalizarNome(item.NOME)),
    );

    const aniversariantesPjSemDuplicados = aniversariantesPj.filter(
      (item) => !nomesKmm.has(normalizarNome(item.NOME)),
    );

    const aniversariantes = [
      ...aniversariantesKmm,

      ...aniversariantesPjSemDuplicados,
    ];

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

  private inicioDoDiaUtc(data: Date): Date {
    return new Date(
      Date.UTC(data.getUTCFullYear(), data.getUTCMonth(), data.getUTCDate()),
    );
  }

  async findAniversarioAndAdmissao() {
    const sql = `
      WITH funcionarios_ordenados AS (
        SELECT
          FD."COD_PESSOA",
          FD."NOME",
          TO_CHAR(FD."DATA_NASCIMENTO", 'YYYY-MM-DD') AS "DATA_NASCIMENTO",
          TO_CHAR(FD."DATA_ADMISSAO", 'YYYY-MM-DD') AS "DATA_ADMISSAO",
          TO_CHAR(FD."DATA_DEMISSAO", 'YYYY-MM-DD') AS "DATA_DEMISSAO",
          FD."SEXO",
          ROW_NUMBER() OVER (
            PARTITION BY UPPER(TRIM(FD."NOME"))
            ORDER BY
              FD."DATA_ADMISSAO" DESC NULLS LAST,
              FD."DATA_DEMISSAO" DESC NULLS LAST,
              FD."COD_PESSOA" DESC
          ) AS rn
        FROM FOLHA.FUNCIONARIO_DADOS FD
        WHERE FD."NOME" IS NOT NULL
          AND (
            FD."DATA_NASCIMENTO" IS NOT NULL
            OR FD."DATA_ADMISSAO" IS NOT NULL
            OR FD."DATA_DEMISSAO" IS NOT NULL
          )
      )
      SELECT
        "COD_PESSOA", "NOME", "DATA_NASCIMENTO", "DATA_ADMISSAO",
        "DATA_DEMISSAO", "SEXO"
      FROM funcionarios_ordenados
      WHERE rn = 1
      ORDER BY "NOME" ASC
    `;

    const result = await this.kmmDatabaseService.query(sql);
    return result.rows;
  }
}
