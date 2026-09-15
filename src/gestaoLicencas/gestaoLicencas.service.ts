import { PrismaService } from '@/prisma/prisma.service';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

@Injectable()
export class GestaoLicencasService {
  constructor(private readonly prisma: PrismaService) {}

  async create(body: any, file: Express.Multer.File, ip: string, user: any) {
    if (!file) {
      throw new BadRequestException(
        'É necessário enviar um arquivo para cadastrar a licença.',
      );
    }

    if (!body.nome || !String(body.nome).trim()) {
      throw new BadRequestException('O nome da licença é obrigatório.');
    }

    if (!body.codigo || !String(body.codigo).trim()) {
      throw new BadRequestException('O código da licença é obrigatório.');
    }

    if (!body.filialId || !String(body.filialId).trim()) {
      throw new BadRequestException('A filial da licença é obrigatória.');
    }

    const nome = String(body.nome).trim();

    const codigo = String(body.codigo).trim().toUpperCase();

    const filialId = String(body.filialId).trim();

    const orgao =
      body.orgao && String(body.orgao).trim()
        ? String(body.orgao).trim()
        : null;

    const responsavelEmail =
      body.responsavelEmail && String(body.responsavelEmail).trim()
        ? String(body.responsavelEmail).trim().toLowerCase()
        : null;

    const descricao = body.descricao ? String(body.descricao).trim() : null;

    const licencaExistente = await this.prisma.licenca.findUnique({
      where: {
        codigo,
      },
    });

    if (licencaExistente) {
      throw new ConflictException(
        `Já existe uma licença cadastrada com o código ${codigo}.`,
      );
    }

    const filial = await this.prisma.licencaFilial.findUnique({
      where: {
        id: filialId,
      },
    });

    if (!filial) {
      throw new BadRequestException('A filial informada não existe.');
    }

    if (!filial.ativo) {
      throw new BadRequestException('A filial informada está inativa.');
    }

    const dataPublicacao = new Date();

    const diasParaRevisao =
      body.diasParaRevisao === undefined ||
      body.diasParaRevisao === null ||
      body.diasParaRevisao === ''
        ? 365
        : Number(body.diasParaRevisao);

    if (
      Number.isNaN(diasParaRevisao) ||
      !Number.isInteger(diasParaRevisao) ||
      diasParaRevisao <= 0
    ) {
      throw new BadRequestException(
        'A quantidade de dias para revisão deve ser um número inteiro maior que zero.',
      );
    }

    const dataProximaRevisao = this.parseDataLicenca(body.dataProximaRevisao);

    const status = this.calcularStatusLicenca(dataProximaRevisao);

    const usuarioId =
      user?.objectGUID || user?.adObjectGuid || user?.id || user?.sub || null;

    const usuarioNome =
      user?.nome ||
      user?.name ||
      user?.cn ||
      user?.usuario ||
      'Usuário não identificado';

    const diasNotificacaoAntes = this.parseArrayInteiros(
      body.diasNotificacaoAntes,
      [90, 60, 30, 15, 7, 3, 1, 0],
    );

    const diasNotificacaoDepois = this.parseArrayInteiros(
      body.diasNotificacaoDepois,
      [1, 3, 7, 15, 30],
    );

    const licenca = await this.prisma.$transaction(async (transaction) => {
      const novaLicenca = await transaction.licenca.create({
        data: {
          nome,
          codigo,
          orgao,
          filialId,
          responsavelEmail,
          descricao,
          dataPublicacao,
          dataProximaRevisao,
          versaoAtual: '1.0',
          status,

          diasNotificacaoAntes,
          diasNotificacaoDepois,
        },
      });

      await transaction.licencaVersao.create({
        data: {
          licencaId: novaLicenca.id,

          versao: '1.0',

          vigente: true,

          nomeOriginal: file.originalname,

          nomeSalvo: file.filename,

          caminho: file.path,

          mimeType: file.mimetype,

          tamanho: file.size,

          publicadoPorId: usuarioId,

          publicadoPorNome: usuarioNome,
        },
      });

      return transaction.licenca.findUnique({
        where: {
          id: novaLicenca.id,
        },

        include: {
          LicencaFilial: true,

          LicencaVersao: {
            orderBy: {
              createdAt: 'desc',
            },
          },
        },
      });
    });

    await this.prisma.audit_logs.create({
      data: {
        acao: `Criou a Licença ${licenca?.nome}`,
        entidade: user?.name,

        filialEntidade: user?.filial,

        ipAddress: ip,
      },
    });

    return {
      status: 'sucesso',

      mensagem: 'Licença publicada com sucesso.',

      data: licenca,
    };
  }

  async createLicencaFilial(body: any, ip: string, user: any) {
    if (!body.nome || !String(body.nome).trim()) {
      throw new BadRequestException('O nome da filial é obrigatório.');
    }

    if (!body.cnpj || !String(body.cnpj).trim()) {
      throw new BadRequestException('O CNPJ da filial é obrigatório.');
    }

    const nome = String(body.nome).trim();
    const cnpj = String(body.cnpj).trim();

    const filialExistente = await this.prisma.licencaFilial.findFirst({
      where: {
        nome: {
          equals: nome,
          mode: 'insensitive',
        },
      },
    });

    if (filialExistente) {
      throw new BadRequestException(
        `Já existe uma Filial cadastrada com o nome "${nome}".`,
      );
    }

    const filial = await this.prisma.licencaFilial.create({
      data: {
        nome,
        cnpj,
        ativo: body.ativo === undefined ? true : this.parseBoolean(body.ativo),
      },
    });

    await this.prisma.audit_logs.create({
      data: {
        acao: `Criou a Filial da Licença ${filial.nome}`,
        entidade: user?.name,
        filialEntidade: user?.company,
        ipAddress: ip,
      },
    });

    return filial;
  }

  private parseBoolean(value: unknown): boolean {
    if (typeof value === 'boolean') {
      return value;
    }

    if (typeof value === 'string') {
      return value.trim().toLowerCase() === 'true';
    }

    if (typeof value === 'number') {
      return value === 1;
    }

    return Boolean(value);
  }

  async findAllLicencasFiliaisAtivos() {
    return await this.prisma.licencaFilial.findMany({
      where: { ativo: true },
    });
  }

  async findByFilterLicencasFiliais(body: any, user: any) {
    const { pesquisa, ativo, page = 1, limit = 10 } = body;

    const skip = (page - 1) * limit;

    const where: any = {};

    const roles = user?.roles ?? [];

    const podeVisualizarInativas =
      roles.includes('DESENVOLVIMENTO') || roles.includes('REGULATORIO');

    if (pesquisa?.trim()) {
      const pesquisaNormalizada = pesquisa.trim();

      const pesquisaCnpj = pesquisaNormalizada.replace(/\D/g, '');

      where.OR = [
        {
          nome: {
            contains: pesquisaNormalizada,
            mode: 'insensitive',
          },
        },
        {
          cnpj: {
            contains: pesquisaCnpj,
          },
        },
      ];
    }

    // =========================================================
    // FILTRO DE ATIVO
    // =========================================================

    if (podeVisualizarInativas) {
      // Usuários autorizados podem filtrar
      // por ativo/inativo normalmente.
      if (ativo !== undefined && ativo !== null && ativo !== '') {
        where.ativo = ativo;
      }
    } else {
      // Demais usuários sempre visualizam
      // somente filiais ativas.
      where.ativo = true;
    }

    const result = await this.prisma.licencaFilial.findMany({
      where,
      skip,
      take: limit,
      orderBy: {
        nome: 'asc',
      },
    });

    const total = await this.prisma.licencaFilial.count({
      where,
    });

    return {
      result,
      total,
    };
  }

  async findLicencasByFilial(filial: string, user: any) {
    const filialNormalizado = String(filial || '').trim();

    if (!filialNormalizado) {
      throw new BadRequestException('A Filial responsável é obrigatória.');
    }

    const result = await this.prisma.licenca.findMany({
      where: {
        filialId: filialNormalizado,
        ativo: true,
      },
      include: {
        LicencaFilial: true,
        LicencaVersao: {
          orderBy: {
            createdAt: 'desc',
          },
        },
        _count: {
          select: {
            LicencaVersao: true,
          },
        },
      },
      orderBy: [{ status: 'asc' }, { nome: 'asc' }],
    });

    return {
      result,
      total: result.length,
    };
  }

  async findByFilterLicencas(body: any, user: any) {
    const {
      pesquisa,
      filialId,
      status,
      ativo,
      excluirBaixadas,
      dataPublicacaoInicio,
      dataPublicacaoFim,
      dataRevisaoInicio,
      dataRevisaoFim,
      page = 1,
      limit = 10,
    } = body;

    const pageNumber = Math.max(Number(page) || 1, 1);

    const limitNumber = Math.max(Number(limit) || 10, 1);

    const skip = (pageNumber - 1) * limitNumber;

    const where: any = {
      AND: [],
    };

    // =========================================================
    // ROLES
    // =========================================================

    const rolesUsuario = Array.isArray(user?.roles)
      ? user.roles.map((role: string) => String(role).trim().toUpperCase())
      : [
          String(user?.role || '')
            .trim()
            .toUpperCase(),
        ].filter(Boolean);

    const podeVisualizarBaixadas =
      rolesUsuario.includes('DESENVOLVIMENTO') ||
      rolesUsuario.includes('REGULATORIO');

    // =========================================================
    // STATUS
    // =========================================================

    const statusNormalizado =
      status && String(status).trim()
        ? String(status).trim().toUpperCase().replace(/\s+/g, '_')
        : null;

    /*
     * Usuário sem permissão não pode solicitar BAIXADA.
     */
    if (statusNormalizado === 'BAIXADA' && !podeVisualizarBaixadas) {
      throw new ForbiddenException(
        'Você não possui permissão para visualizar licenças baixadas.',
      );
    }

    // =========================================================
    // PESQUISA
    // =========================================================

    if (pesquisa && String(pesquisa).trim()) {
      const termo = String(pesquisa).trim();

      where.AND.push({
        OR: [
          {
            nome: {
              contains: termo,
              mode: 'insensitive',
            },
          },
          {
            codigo: {
              contains: termo,
              mode: 'insensitive',
            },
          },
          {
            descricao: {
              contains: termo,
              mode: 'insensitive',
            },
          },
          {
            responsavelEmail: {
              contains: termo,
              mode: 'insensitive',
            },
          },
        ],
      });
    }

    // =========================================================
    // FILIAL
    // =========================================================

    if (filialId) {
      where.filialId = String(filialId);
    }

    // =========================================================
    // REGRA DE STATUS / BAIXADA
    // =========================================================

    if (statusNormalizado) {
      where.status = statusNormalizado;
    } else {
      /*
       * Sem status específico:
       *
       * DESENVOLVIMENTO / REGULATORIO
       * podem visualizar BAIXADA normalmente.
       *
       * Demais usuários nunca visualizam BAIXADA.
       */
      if (!podeVisualizarBaixadas) {
        where.status = {
          not: 'BAIXADA',
        };
      } else if (this.parseBoolean(excluirBaixadas)) {
        /*
         * Para usuários autorizados,
         * ainda permitimos que o frontend peça
         * explicitamente para esconder baixadas.
         */
        where.status = {
          not: 'BAIXADA',
        };
      }
    }

    // =========================================================
    // ATIVO
    // =========================================================

    if (podeVisualizarBaixadas) {
      /*
       * Quando estiver buscando BAIXADA,
       * NÃO filtramos por ativo.
       *
       * Isso é importante porque uma licença baixada
       * pode estar ativo = false.
       */
      if (
        statusNormalizado !== 'BAIXADA' &&
        ativo !== undefined &&
        ativo !== null &&
        ativo !== ''
      ) {
        where.ativo = this.parseBoolean(ativo);
      }
    } else {
      /*
       * Usuários comuns:
       * somente licenças ativas.
       */
      where.ativo = true;
    }

    // =========================================================
    // DATA DE PUBLICAÇÃO
    // =========================================================

    if (dataPublicacaoInicio || dataPublicacaoFim) {
      where.dataPublicacao = {};

      if (dataPublicacaoInicio) {
        const inicio = new Date(dataPublicacaoInicio);

        if (Number.isNaN(inicio.getTime())) {
          throw new BadRequestException(
            'A data inicial de publicação é inválida.',
          );
        }

        inicio.setHours(0, 0, 0, 0);

        where.dataPublicacao.gte = inicio;
      }

      if (dataPublicacaoFim) {
        const fim = new Date(dataPublicacaoFim);

        if (Number.isNaN(fim.getTime())) {
          throw new BadRequestException(
            'A data final de publicação é inválida.',
          );
        }

        fim.setHours(23, 59, 59, 999);

        where.dataPublicacao.lte = fim;
      }
    }

    // =========================================================
    // DATA DE REVISÃO
    // =========================================================

    if (dataRevisaoInicio || dataRevisaoFim) {
      where.dataProximaRevisao = {};

      if (dataRevisaoInicio) {
        const inicio = new Date(dataRevisaoInicio);

        if (Number.isNaN(inicio.getTime())) {
          throw new BadRequestException(
            'A data inicial da próxima revisão é inválida.',
          );
        }

        inicio.setHours(0, 0, 0, 0);

        where.dataProximaRevisao.gte = inicio;
      }

      if (dataRevisaoFim) {
        const fim = new Date(dataRevisaoFim);

        if (Number.isNaN(fim.getTime())) {
          throw new BadRequestException(
            'A data final da próxima revisão é inválida.',
          );
        }

        fim.setHours(23, 59, 59, 999);

        where.dataProximaRevisao.lte = fim;
      }
    }

    // =========================================================
    // REMOVE AND VAZIO
    // =========================================================

    if (where.AND.length === 0) {
      delete where.AND;
    }

    // =========================================================
    // CONSULTA
    // =========================================================

    const [result, total] = await this.prisma.$transaction([
      this.prisma.licenca.findMany({
        where,

        skip,

        take: limitNumber,

        include: {
          LicencaFilial: true,

          LicencaVersao: {
            orderBy: {
              createdAt: 'desc',
            },
          },

          _count: {
            select: {
              LicencaVersao: true,
            },
          },
        },

        orderBy: [
          {
            ativo: 'desc',
          },
          {
            dataProximaRevisao: 'asc',
          },
          {
            nome: 'asc',
          },
        ],
      }),

      this.prisma.licenca.count({
        where,
      }),
    ]);

    return {
      result,
      total,
    };
  }

  async findByFilterFiliaisComLicencas(body: any, user: any) {
    const { pesquisa, ativo, page = 1, limit = 10 } = body;

    const pageNumber = Math.max(Number(page) || 1, 1);

    const limitNumber = Math.max(Number(limit) || 10, 1);

    const roles = user?.roles ?? [];

    const podeVisualizarInativas =
      roles.includes('DESENVOLVIMENTO') || roles.includes('REGULATORIO');

    // =========================================================
    // FILTRO DAS LICENÇAS
    // =========================================================

    const whereLicenca: any = {};

    if (podeVisualizarInativas) {
      /*
       * DESENVOLVIMENTO / REGULATORIO:
       *
       * Sem filtro ativo:
       * traz licenças ativas + inativas.
       *
       * Se informar ativo:
       * respeita o filtro.
       */
      if (ativo !== undefined && ativo !== null && ativo !== '') {
        whereLicenca.ativo = this.parseBoolean(ativo);
      }
    } else {
      /*
       * Demais usuários:
       * somente licenças ativas.
       */
      whereLicenca.ativo = true;
    }

    // =========================================================
    // BUSCA AS LICENÇAS E IDENTIFICA AS FILIAIS
    // =========================================================

    const licencas = await this.prisma.licenca.findMany({
      where: whereLicenca,

      select: {
        filialId: true,
      },
    });

    const filialIds = [
      ...new Set(licencas.map((licenca) => licenca.filialId).filter(Boolean)),
    ];

    if (filialIds.length === 0) {
      return {
        result: [],
        total: 0,
      };
    }

    // =========================================================
    // FILTRO DAS FILIAIS
    // =========================================================

    const whereFilial: any = {
      id: {
        in: filialIds,
      },
    };

    if (pesquisa && String(pesquisa).trim()) {
      const termo = String(pesquisa).trim();

      const termoCnpj = termo.replace(/\D/g, '');

      const filtrosPesquisa: any[] = [
        {
          nome: {
            contains: termo,
            mode: 'insensitive',
          },
        },
      ];

      if (termoCnpj) {
        filtrosPesquisa.push({
          cnpj: {
            contains: termoCnpj,
          },
        });
      }

      whereFilial.OR = filtrosPesquisa;
    }

    // =========================================================
    // PERMISSÃO DAS FILIAIS
    // =========================================================

    if (podeVisualizarInativas) {
      /*
       * DESENVOLVIMENTO / REGULATORIO:
       * pode visualizar filial ativa ou inativa.
       *
       * Se ativo não foi informado,
       * não adicionamos filtro.
       */
      if (ativo !== undefined && ativo !== null && ativo !== '') {
        whereFilial.ativo = this.parseBoolean(ativo);
      }
    } else {
      /*
       * Outros usuários:
       * somente filial ativa.
       */
      whereFilial.ativo = true;
    }

    // =========================================================
    // TOTAL
    // =========================================================

    const total = await this.prisma.licencaFilial.count({
      where: whereFilial,
    });

    const skip = (pageNumber - 1) * limitNumber;

    // =========================================================
    // RESULTADO
    // =========================================================

    const result = await this.prisma.licencaFilial.findMany({
      where: whereFilial,

      skip,

      take: limitNumber,

      orderBy: {
        nome: 'asc',
      },

      select: {
        id: true,
        nome: true,
        cnpj: true,
        ativo: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    return {
      result,
      total,
    };
  }

  async updateLicenca(
    body: any,
    file?: Express.Multer.File,
    ip?: string,
    user?: any,
  ) {
    const licencaId = String(body.id || '').trim();

    if (!licencaId) {
      throw new BadRequestException('O ID da licença é obrigatório.');
    }

    if (!body.nome || !String(body.nome).trim()) {
      throw new BadRequestException('O nome da licença é obrigatório.');
    }

    if (!body.codigo || !String(body.codigo).trim()) {
      throw new BadRequestException('O código da licença é obrigatório.');
    }

    if (!body.filialId || !String(body.filialId).trim()) {
      throw new BadRequestException('A filial da licença é obrigatória.');
    }

    const licencaExistente = await this.prisma.licenca.findUnique({
      where: {
        id: licencaId,
      },

      include: {
        LicencaVersao: {
          orderBy: {
            createdAt: 'desc',
          },
        },

        LicencaFilial: true,
      },
    });

    if (!licencaExistente) {
      throw new NotFoundException('Licença não encontrada.');
    }

    const codigo = String(body.codigo).trim().toUpperCase();

    const filialId = String(body.filialId).trim();

    const orgao =
      body.orgao && String(body.orgao).trim()
        ? String(body.orgao).trim()
        : null;

    const licencaComMesmoCodigo = await this.prisma.licenca.findFirst({
      where: {
        codigo,

        id: {
          not: licencaId,
        },
      },

      select: {
        id: true,
      },
    });

    if (licencaComMesmoCodigo) {
      throw new ConflictException(
        `Já existe outra licença cadastrada com o código ${codigo}.`,
      );
    }

    const filial = await this.prisma.licencaFilial.findUnique({
      where: {
        id: filialId,
      },
    });

    if (!filial) {
      throw new BadRequestException('A filial informada não existe.');
    }

    if (!filial.ativo) {
      throw new BadRequestException('A filial informada está inativa.');
    }

    const dataProximaRevisao = this.parseDataLicenca(body.dataProximaRevisao);

    const statusRecebido = String(body.status || '')
      .trim()
      .toUpperCase()
      .replace(/\s+/g, '_');

    const solicitouBaixa = statusRecebido === 'BAIXADA';
    const solicitouProtocolada = statusRecebido === 'PROTOCOLADA';

    let status: 'VALIDA' | 'VENCIDA' | 'A VENCER' | 'BAIXADA' | 'PROTOCOLADA';

    if (solicitouBaixa) {
      status = 'BAIXADA';
    } else if (solicitouProtocolada) {
      status = 'PROTOCOLADA';
    } else {
      status = this.calcularStatusLicenca(dataProximaRevisao);
    }

    const usuarioId =
      user?.objectGUID || user?.adObjectGuid || user?.id || user?.sub || null;

    const usuarioNome =
      user?.nome ||
      user?.name ||
      user?.cn ||
      user?.usuario ||
      'Usuário não identificado';

    const diasNotificacaoAntes =
      body.diasNotificacaoAntes !== undefined
        ? this.parseArrayInteiros(
            body.diasNotificacaoAntes,
            licencaExistente.diasNotificacaoAntes,
          )
        : licencaExistente.diasNotificacaoAntes;

    const diasNotificacaoDepois =
      body.diasNotificacaoDepois !== undefined
        ? this.parseArrayInteiros(
            body.diasNotificacaoDepois,
            licencaExistente.diasNotificacaoDepois,
          )
        : licencaExistente.diasNotificacaoDepois;

    const resultado = await this.prisma.$transaction(async (transaction) => {
      let versaoAtual = licencaExistente.LicencaVersao.find(
        (versao) => versao.vigente,
      );

      if (!versaoAtual) {
        versaoAtual = licencaExistente.LicencaVersao[0];
      }

      let novaVersao: any = null;

      let numeroVersaoAtualizado =
        licencaExistente.versaoAtual || versaoAtual?.versao || '1.0';

      if (file) {
        await transaction.licencaVersao.updateMany({
          where: {
            licencaId,
            vigente: true,
          },

          data: {
            vigente: false,
          },
        });

        numeroVersaoAtualizado = this.incrementarVersaoLicenca(
          licencaExistente.versaoAtual || versaoAtual?.versao || '1.0',
        );

        novaVersao = await transaction.licencaVersao.create({
          data: {
            licencaId,

            versao: numeroVersaoAtualizado,

            vigente: true,

            nomeOriginal: file.originalname,

            nomeSalvo: file.filename,

            caminho: file.path,

            mimeType: file.mimetype,

            tamanho: file.size,

            publicadoPorId: usuarioId,

            publicadoPorNome: usuarioNome,
          },
        });

        versaoAtual = novaVersao;
      }

      if (!versaoAtual) {
        throw new BadRequestException(
          'A licença não possui uma versão válida.',
        );
      }

      const licencaAtualizada = await transaction.licenca.update({
        where: {
          id: licencaId,
        },

        data: {
          nome: String(body.nome).trim(),
          codigo,
          orgao,
          filialId,
          status,

          responsavelEmail:
            body.responsavelEmail && String(body.responsavelEmail).trim()
              ? String(body.responsavelEmail).trim().toLowerCase()
              : null,

          descricao:
            body.descricao && String(body.descricao).trim()
              ? String(body.descricao).trim()
              : null,

          dataProximaRevisao,

          versaoAtual: numeroVersaoAtualizado,

          diasNotificacaoAntes,
          diasNotificacaoDepois,
        },
      });

      return transaction.licenca.findUnique({
        where: {
          id: licencaAtualizada.id,
        },

        include: {
          LicencaFilial: true,

          LicencaVersao: {
            orderBy: {
              createdAt: 'desc',
            },
          },
        },
      });
    });

    await this.prisma.audit_logs.create({
      data: {
        acao: file
          ? `Atualizou a licença ${resultado?.nome} e publicou a versão ${resultado?.versaoAtual}`
          : `Atualizou a licença ${resultado?.nome}`,

        entidade: user?.name || user?.nome,

        filialEntidade: user?.company,

        ipAddress: ip,
      },
    });

    return {
      status: 'sucesso',

      mensagem: file
        ? 'Licença atualizada e nova versão publicada com sucesso.'
        : 'Licença atualizada com sucesso.',

      data: resultado,
    };
  }

  async findById(id: string) {
    return await this.prisma.licencaFilial.findUnique({ where: { id } });
  }

  private incrementarVersaoLicenca(versaoAtual: string): string {
    const major = Number(String(versaoAtual || '1.0').split('.')[0]);

    if (Number.isNaN(major)) {
      return '1.0';
    }

    return `${major + 1}.0`;
  }

  private calcularStatusLicenca(
    dataProximaRevisao: Date | null | undefined,
    statusAtual?: string | null,
  ): 'VALIDA' | 'VENCIDA' | 'A VENCER' | 'BAIXADA' | 'PROTOCOLADA' {
    const statusNormalizado = String(statusAtual || '')
      .trim()
      .toUpperCase();

    if (statusNormalizado === 'BAIXADA') {
      return 'BAIXADA';
    }

    if (statusNormalizado === 'PROTOCOLADA') {
      return 'PROTOCOLADA';
    }

    if (!dataProximaRevisao) {
      return 'VALIDA';
    }

    const hoje = new Date();

    hoje.setHours(0, 0, 0, 0);

    const vencimento = new Date(dataProximaRevisao);

    vencimento.setHours(0, 0, 0, 0);

    if (Number.isNaN(vencimento.getTime())) {
      return 'VALIDA';
    }

    const diferencaMs = vencimento.getTime() - hoje.getTime();

    const diferencaDias = Math.ceil(diferencaMs / (1000 * 60 * 60 * 24));

    if (diferencaDias < 0) {
      return 'VENCIDA';
    }

    if (diferencaDias <= 30) {
      return 'A VENCER';
    }

    return 'VALIDA';
  }

  async dashboardLicencas(user: any) {
    /*
     * ============================================================
     * PERMISSÕES
     * ============================================================
     */

    const rolesUsuario = Array.isArray(user?.roles)
      ? user.roles.map((role: string) => String(role).trim().toUpperCase())
      : [
          String(user?.role || '')
            .trim()
            .toUpperCase(),
        ].filter(Boolean);

    const usuarioRegulatorio = rolesUsuario.includes('REGULATORIO');

    /*
     * ============================================================
     * SINCRONIZA STATUS AUTOMÁTICOS
     * ============================================================
     *
     * Antes de montar o dashboard, garantimos que:
     *
     * > 30 dias  = VALIDA
     * 0-30 dias  = A_VENCER
     * vencida    = VENCIDA
     *
     * BAIXADA e PROTOCOLADA nunca são alteradas automaticamente.
     */

    await this.sincronizarStatusLicencas();

    /*
     * ============================================================
     * DATA ATUAL
     * ============================================================
     */

    const hoje = new Date();

    hoje.setHours(0, 0, 0, 0);

    /*
     * ============================================================
     * LICENÇAS OPERACIONAIS
     * ============================================================
     */

    const licencas = await this.prisma.licenca.findMany({
      where: {
        ativo: true,

        status: {
          not: 'BAIXADA',
        },
      },

      include: {
        LicencaFilial: true,

        LicencaVersao: {
          orderBy: {
            createdAt: 'desc',
          },
        },
      },

      orderBy: [
        {
          dataProximaRevisao: 'asc',
        },
        {
          nome: 'asc',
        },
      ],
    });

    /*
     * ============================================================
     * BAIXADAS
     * ============================================================
     */

    const licencasBaixadas = usuarioRegulatorio
      ? await this.prisma.licenca.findMany({
          where: {
            status: 'BAIXADA',
          },

          include: {
            LicencaFilial: true,

            LicencaVersao: {
              orderBy: {
                createdAt: 'desc',
              },
            },
          },

          orderBy: {
            updatedAt: 'desc',
          },
        })
      : [];

    /*
     * ============================================================
     * CONTADORES PRINCIPAIS
     * ============================================================
     */

    const total = licencas.length;

    const totalValidas = licencas.filter(
      (licenca) => licenca.status === 'VALIDA',
    ).length;

    const totalAVencer = licencas.filter(
      (licenca) => licenca.status === 'A VENCER',
    ).length;

    const totalVencidas = licencas.filter(
      (licenca) => licenca.status === 'VENCIDA',
    ).length;

    const totalProtocoladas = licencas.filter(
      (licenca) => licenca.status === 'PROTOCOLADA',
    ).length;

    const totalBaixadas = usuarioRegulatorio
      ? licencasBaixadas.length
      : undefined;

    /*
     * ============================================================
     * ÍNDICES
     * ============================================================
     */

    const percentualConformidade =
      total > 0 ? Number(((totalValidas / total) * 100).toFixed(2)) : 0;

    const totalSemPendenciaCritica = totalValidas + totalAVencer;

    const percentualSemPendenciaCritica =
      total > 0
        ? Number(((totalSemPendenciaCritica / total) * 100).toFixed(2))
        : 0;

    /*
     * ============================================================
     * FAIXAS DE VENCIMENTO
     * ============================================================
     */

    const faixasVencimento = {
      vencidas: 0,
      ate7Dias: 0,
      de8A15Dias: 0,
      de16A30Dias: 0,
      de31A60Dias: 0,
      acima60Dias: 0,
      semData: 0,
    };

    /*
     * ============================================================
     * QUALIDADE DO CADASTRO
     * ============================================================
     */

    let semResponsavel = 0;

    let semVencimento = 0;

    let semArquivoVigente = 0;

    /*
     * ============================================================
     * LICENÇAS CRÍTICAS
     * ============================================================
     */

    const licencasCriticas: any[] = [];

    for (const licenca of licencas) {
      /*
       * Responsável
       */
      if (
        !licenca.responsavelEmail ||
        !String(licenca.responsavelEmail).trim()
      ) {
        semResponsavel++;
      }

      /*
       * Arquivo vigente
       */
      const versaoVigente = licenca.LicencaVersao.find(
        (versao) => versao.vigente,
      );

      if (!versaoVigente) {
        semArquivoVigente++;
      }

      /*
       * Sem data
       */
      if (!licenca.dataProximaRevisao) {
        semVencimento++;

        faixasVencimento.semData++;

        continue;
      }

      /*
       * Dias restantes.
       */
      const vencimento = new Date(licenca.dataProximaRevisao);

      vencimento.setHours(0, 0, 0, 0);

      const diferencaDias = Math.ceil(
        (vencimento.getTime() - hoje.getTime()) / (1000 * 60 * 60 * 24),
      );

      /*
       * Faixas.
       */
      if (diferencaDias < 0) {
        faixasVencimento.vencidas++;
      } else if (diferencaDias <= 7) {
        faixasVencimento.ate7Dias++;
      } else if (diferencaDias <= 15) {
        faixasVencimento.de8A15Dias++;
      } else if (diferencaDias <= 30) {
        faixasVencimento.de16A30Dias++;
      } else if (diferencaDias <= 60) {
        faixasVencimento.de31A60Dias++;
      } else {
        faixasVencimento.acima60Dias++;
      }

      /*
       * Consideramos crítica:
       *
       * - vencida
       * - vence em até 30 dias
       */
      if (diferencaDias <= 30) {
        licencasCriticas.push({
          id: licenca.id,

          nome: licenca.nome,

          codigo: licenca.codigo,

          filialId: licenca.filialId,

          filial: licenca.LicencaFilial?.nome || null,

          responsavelEmail: licenca.responsavelEmail,

          status: licenca.status,

          dataProximaRevisao: licenca.dataProximaRevisao,

          diasParaVencer: diferencaDias,

          versaoAtual: licenca.versaoAtual,

          arquivoVigente: Boolean(versaoVigente),
        });
      }
    }

    /*
     * Ordenação:
     *
     * mais vencida -> menor número de dias
     */
    licencasCriticas.sort((a, b) => a.diasParaVencer - b.diasParaVencer);

    /*
     * ============================================================
     * PRÓXIMOS VENCIMENTOS
     * ============================================================
     */

    const proximosVencimentos = licencas
      .filter((licenca) => licenca.dataProximaRevisao)
      .map((licenca) => {
        const vencimento = new Date(licenca.dataProximaRevisao!);

        vencimento.setHours(0, 0, 0, 0);

        const diasParaVencer = Math.ceil(
          (vencimento.getTime() - hoje.getTime()) / (1000 * 60 * 60 * 24),
        );

        return {
          id: licenca.id,

          nome: licenca.nome,

          codigo: licenca.codigo,

          filial: licenca.LicencaFilial?.nome || null,

          status: licenca.status,

          dataProximaRevisao: licenca.dataProximaRevisao,

          diasParaVencer,

          responsavelEmail: licenca.responsavelEmail,
        };
      })
      .filter(
        (licenca) =>
          licenca.diasParaVencer >= 0 && licenca.diasParaVencer <= 60,
      )
      .sort((a, b) => a.diasParaVencer - b.diasParaVencer)
      .slice(0, 20);

    /*
     * ============================================================
     * AGRUPAMENTO POR FILIAL
     * ============================================================
     */

    const mapaFiliais = new Map<
      string,
      {
        filialId: string;
        filial: string;
        total: number;
        valida: number;
        aVencer: number;
        vencida: number;
        protocolada: number;
        semVencimento: number;
        semResponsavel: number;
      }
    >();

    for (const licenca of licencas) {
      const filialId = licenca.filialId;

      const filialNome = licenca.LicencaFilial?.nome || 'Sem filial';

      if (!mapaFiliais.has(filialId)) {
        mapaFiliais.set(filialId, {
          filialId,

          filial: filialNome,

          total: 0,

          valida: 0,

          aVencer: 0,

          vencida: 0,

          protocolada: 0,

          semVencimento: 0,

          semResponsavel: 0,
        });
      }

      const dadosFilial = mapaFiliais.get(filialId)!;

      dadosFilial.total++;

      switch (licenca.status) {
        case 'VALIDA':
          dadosFilial.valida++;
          break;

        case 'A VENCER':
          dadosFilial.aVencer++;
          break;

        case 'VENCIDA':
          dadosFilial.vencida++;
          break;

        case 'PROTOCOLADA':
          dadosFilial.protocolada++;
          break;
      }

      if (!licenca.dataProximaRevisao) {
        dadosFilial.semVencimento++;
      }

      if (!licenca.responsavelEmail) {
        dadosFilial.semResponsavel++;
      }
    }

    const porFilial = Array.from(mapaFiliais.values())
      .map((item) => ({
        ...item,

        totalPendencias: item.vencida + item.aVencer,

        percentualConformidade:
          item.total > 0
            ? Number(((item.valida / item.total) * 100).toFixed(2))
            : 0,
      }))
      .sort((a, b) => b.totalPendencias - a.totalPendencias);

    /*
     * ============================================================
     * RANKING DE FILIAIS
     * ============================================================
     */

    const rankingFiliais = porFilial
      .map((filial) => ({
        filialId: filial.filialId,

        filial: filial.filial,

        vencidas: filial.vencida,

        aVencer: filial.aVencer,

        pendencias: filial.totalPendencias,
      }))
      .sort((a, b) => b.pendencias - a.pendencias);

    /*
     * ============================================================
     * COBERTURA / QUALIDADE
     * ============================================================
     */

    const comResponsavel = total - semResponsavel;

    const comVencimento = total - semVencimento;

    const comArquivoVigente = total - semArquivoVigente;

    const qualidadeCadastro = {
      semResponsavel,

      semVencimento,

      semArquivoVigente,

      comResponsavel,

      comVencimento,

      comArquivoVigente,

      percentualComResponsavel:
        total > 0 ? Number(((comResponsavel / total) * 100).toFixed(2)) : 0,

      percentualComVencimento:
        total > 0 ? Number(((comVencimento / total) * 100).toFixed(2)) : 0,

      percentualComArquivoVigente:
        total > 0 ? Number(((comArquivoVigente / total) * 100).toFixed(2)) : 0,
    };

    /*
     * ============================================================
     * ÚLTIMAS ATUALIZAÇÕES
     * ============================================================
     */

    const ultimasAtualizacoes = await this.prisma.licenca.findMany({
      where: usuarioRegulatorio
        ? undefined
        : {
            status: {
              not: 'BAIXADA',
            },
          },

      take: 10,

      orderBy: {
        updatedAt: 'desc',
      },

      include: {
        LicencaFilial: true,
      },
    });

    const ultimasAtualizacoesFormatadas = ultimasAtualizacoes.map(
      (licenca) => ({
        id: licenca.id,

        nome: licenca.nome,

        codigo: licenca.codigo,

        filial: licenca.LicencaFilial?.nome || null,

        status: licenca.status,

        versaoAtual: licenca.versaoAtual,

        atualizadoEm: licenca.updatedAt,
      }),
    );

    /*
     * ============================================================
     * PUBLICAÇÕES DE VERSÕES
     * ÚLTIMOS 12 MESES
     * ============================================================
     */

    const inicioPeriodo = new Date();

    inicioPeriodo.setMonth(inicioPeriodo.getMonth() - 11);

    inicioPeriodo.setDate(1);

    inicioPeriodo.setHours(0, 0, 0, 0);

    const versoesPublicadas = await this.prisma.licencaVersao.findMany({
      where: {
        createdAt: {
          gte: inicioPeriodo,
        },
      },

      select: {
        createdAt: true,
      },

      orderBy: {
        createdAt: 'asc',
      },
    });

    const mapaPublicacoes = new Map<string, number>();

    /*
     * Inicializa os 12 meses com zero,
     * inclusive meses sem publicação.
     */
    for (let i = 0; i < 12; i++) {
      const data = new Date();

      data.setDate(1);

      data.setMonth(data.getMonth() - (11 - i));

      const chave = `${data.getFullYear()}-${String(
        data.getMonth() + 1,
      ).padStart(2, '0')}`;

      mapaPublicacoes.set(chave, 0);
    }

    for (const versao of versoesPublicadas) {
      const data = new Date(versao.createdAt);

      const chave = `${data.getFullYear()}-${String(
        data.getMonth() + 1,
      ).padStart(2, '0')}`;

      if (mapaPublicacoes.has(chave)) {
        mapaPublicacoes.set(chave, (mapaPublicacoes.get(chave) || 0) + 1);
      }
    }

    const publicacoesPorMes = Array.from(mapaPublicacoes.entries()).map(
      ([mes, quantidade]) => ({
        mes,

        quantidade,
      }),
    );

    /*
     * ============================================================
     * BAIXADAS RECENTES
     * ============================================================
     */

    const baixadasRecentes = usuarioRegulatorio
      ? licencasBaixadas.slice(0, 10).map((licenca) => ({
          id: licenca.id,

          nome: licenca.nome,

          codigo: licenca.codigo,

          filial: licenca.LicencaFilial?.nome || null,

          atualizadoEm: licenca.updatedAt,

          responsavelEmail: licenca.responsavelEmail,
        }))
      : undefined;

    /*
     * ============================================================
     * RETORNO
     * ============================================================
     */

    return {
      resumo: {
        total,

        valida: totalValidas,

        aVencer: totalAVencer,

        vencida: totalVencidas,

        protocolada: totalProtocoladas,

        ...(usuarioRegulatorio
          ? {
              baixada: totalBaixadas,
            }
          : {}),

        percentualConformidade,

        percentualSemPendenciaCritica,
      },

      faixasVencimento,

      qualidadeCadastro,

      licencasCriticas,

      proximosVencimentos,

      porFilial,

      rankingFiliais,

      ultimasAtualizacoes: ultimasAtualizacoesFormatadas,

      publicacoesPorMes,

      ...(usuarioRegulatorio
        ? {
            baixadasRecentes,
          }
        : {}),
    };
  }

  async updateFilial(body: any) {
    const { id, nome, cnpj, ativo } = body;

    if (!id) {
      throw new BadRequestException('O ID da filial é obrigatório.');
    }

    const filialExistente = await this.prisma.licencaFilial.findUnique({
      where: {
        id: String(id),
      },
    });

    if (!filialExistente) {
      throw new NotFoundException('Filial não encontrada.');
    }

    return await this.prisma.licencaFilial.update({
      where: {
        id: String(id),
      },
      data: {
        ...(nome !== undefined && {
          nome: String(nome).trim(),
        }),

        ...(cnpj !== undefined && {
          cnpj: String(cnpj).trim(),
        }),

        ...(ativo !== undefined && {
          ativo: ativo === true || ativo === 'true',
        }),

        updatedAt: new Date(),
      },
    });
  }

  private async sincronizarStatusLicencas() {
    const licencas = await this.prisma.licenca.findMany({
      where: {
        ativo: true,

        status: {
          notIn: ['BAIXADA', 'PROTOCOLADA'],
        },
      },

      select: {
        id: true,

        status: true,

        dataProximaRevisao: true,
      },
    });

    const atualizacoes: {
      id: string;
      status: string;
    }[] = [];

    for (const licenca of licencas) {
      const novoStatus = this.calcularStatusLicenca(
        licenca.dataProximaRevisao,
        licenca.status,
      );

      if (novoStatus !== licenca.status) {
        atualizacoes.push({
          id: licenca.id,

          status: novoStatus,
        });
      }
    }

    if (atualizacoes.length === 0) {
      return;
    }

    await this.prisma.$transaction(
      atualizacoes.map((item) =>
        this.prisma.licenca.update({
          where: {
            id: item.id,
          },

          data: {
            status: item.status,
          },
        }),
      ),
    );
  }

  private parseDataLicenca(valor: unknown): Date | null {
    if (valor === undefined || valor === null || String(valor).trim() === '') {
      return null;
    }

    const valorNormalizado = String(valor).trim();

    const data = /^\d{4}-\d{2}-\d{2}$/.test(valorNormalizado)
      ? new Date(`${valorNormalizado}T12:00:00`)
      : new Date(valorNormalizado);

    if (Number.isNaN(data.getTime())) {
      throw new BadRequestException('A data da próxima revisão é inválida.');
    }

    return data;
  }

  private parseArrayInteiros(valor: unknown, padrao: number[] = []): number[] {
    if (valor === undefined || valor === null || valor === '') {
      return padrao;
    }

    let array: unknown;

    if (Array.isArray(valor)) {
      array = valor;
    } else if (typeof valor === 'string') {
      const valorNormalizado = valor.trim();

      if (!valorNormalizado) {
        return padrao;
      }

      try {
        array = JSON.parse(valorNormalizado);
      } catch {
        array = valorNormalizado.split(',').map((item) => item.trim());
      }
    } else {
      throw new BadRequestException(
        'Os dias de notificação possuem formato inválido.',
      );
    }

    if (!Array.isArray(array)) {
      throw new BadRequestException(
        'Os dias de notificação devem ser uma lista.',
      );
    }

    const numeros = array.map((item) => Number(item));

    const possuiValorInvalido = numeros.some(
      (numero) =>
        Number.isNaN(numero) || !Number.isInteger(numero) || numero < 0,
    );

    if (possuiValorInvalido) {
      throw new BadRequestException(
        'Os dias de notificação devem ser números inteiros maiores ou iguais a zero.',
      );
    }

    return [...new Set(numeros)].sort((a, b) => b - a);
  }
}
