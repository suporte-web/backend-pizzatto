import { PrismaService } from '@/prisma/prisma.service';
import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

@Injectable()
export class GestaoDocumentosService {
  constructor(private readonly prisma: PrismaService) {}

  async create(body: any, file: Express.Multer.File, ip: string, user: any) {
    if (!file) {
      throw new BadRequestException(
        'É necessário enviar um arquivo para cadastrar o documento.',
      );
    }

    if (!body.nome) {
      throw new BadRequestException('O nome do documento é obrigatório.');
    }

    if (!body.codigo) {
      throw new BadRequestException('O código do documento é obrigatório.');
    }

    if (!body.setorResponsavel) {
      throw new BadRequestException(
        'O setor responsável pelo documento é obrigatório.',
      );
    }

    if (!body.categoriaId) {
      throw new BadRequestException('A categoria do documento é obrigatória.');
    }

    if (!body.responsavelId) {
      throw new BadRequestException(
        'O responsável pelo documento é obrigatório.',
      );
    }

    if (!body.visibilidade) {
      throw new BadRequestException(
        'A visibilidade do documento é obrigatória.',
      );
    }

    const codigo = String(body.codigo).trim().toUpperCase();

    const documentoExistente = await this.prisma.documento.findUnique({
      where: {
        codigo,
      },
    });

    if (documentoExistente) {
      throw new ConflictException(
        `Já existe um documento cadastrado com o código ${codigo}.`,
      );
    }

    const dataPublicacao = new Date();

    const diasParaRevisao = Number(body.diasParaRevisao) || 365;

    if (
      Number.isNaN(diasParaRevisao) ||
      diasParaRevisao <= 0 ||
      !Number.isInteger(diasParaRevisao)
    ) {
      throw new BadRequestException(
        'A quantidade de dias para revisão deve ser um número inteiro maior que zero.',
      );
    }

    const dataProximaRevisao = new Date(dataPublicacao);

    dataProximaRevisao.setDate(dataProximaRevisao.getDate() + diasParaRevisao);

    const visibilidade = String(body.visibilidade).trim().toUpperCase();

    if (!['PUBLICO', 'RESTRITO'].includes(visibilidade)) {
      throw new BadRequestException(
        'A visibilidade deve ser PUBLICO ou RESTRITO.',
      );
    }

    const tipoRestricao =
      visibilidade === 'RESTRITO'
        ? String(body.tipoRestricao || '')
            .trim()
            .toUpperCase()
        : null;

    if (
      visibilidade === 'RESTRITO' &&
      !['SETOR', 'GRUPO', 'USUARIO'].includes(tipoRestricao || '')
    ) {
      throw new BadRequestException(
        'O tipo de restrição deve ser SETOR, GRUPO ou USUARIO.',
      );
    }

    const acessos = this.parseArray(body.acessos);

    if (visibilidade === 'RESTRITO' && acessos.length === 0) {
      throw new BadRequestException(
        'Selecione pelo menos um setor, grupo ou usuário autorizado.',
      );
    }

    const usuarioId =
      user?.objectGUID || user?.adObjectGuid || user?.id || user?.sub || null;

    const usuarioNome =
      user?.nome ||
      user?.name ||
      user?.cn ||
      user?.usuario ||
      'Usuário não identificado';

    const documento = await this.prisma.$transaction(async (transaction) => {
      const novoDocumento = await transaction.documento.create({
        data: {
          nome: String(body.nome).trim(),
          codigo,

          descricao: body.descricao ? String(body.descricao).trim() : null,

          setorResponsavel: String(body.setorResponsavel).trim(),

          categoriaId: String(body.categoriaId),

          responsavelId: String(body.responsavelId),

          responsavelNome:
            body.responsavelNome || body.responsavel?.nome || null,

          responsavelEmail:
            body.responsavelEmail || body.responsavel?.email || null,

          dataPublicacao,
          dataProximaRevisao,

          versaoAtual: '1.0',

          status: 'ATIVO',
          visibilidade,
          tipoRestricao,

          confirmacaoLeituraObrigatoria: this.parseBoolean(
            body.confirmacaoLeituraObrigatoria,
          ),

          // criadoPorId: usuarioId,
          // criadoPorNome: usuarioNome,
          // criadoPorIp: ip,
        },
      });

      const versao = await transaction.documentoVersao.create({
        data: {
          documentoId: novoDocumento.id,

          versao: '1.0',
          vigente: true,

          nomeOriginal: file.originalname,
          nomeSalvo: file.filename,
          caminho: file.path,
          mimeType: file.mimetype,
          tamanho: file.size,

          publicadoPorId: usuarioId,
          publicadoPorNome: usuarioNome,
          // publicadoPorIp: ip,
        },
      });

      if (visibilidade === 'PUBLICO') {
        await transaction.documentoAcesso.create({
          data: {
            documentoId: novoDocumento.id,
            tipo: 'TODOS',
            valor: 'TODOS',
            nomeExibicao: 'Todos os colaboradores',
          },
        });
      }

      if (visibilidade === 'RESTRITO') {
        const acessosNormalizados = acessos.map((acesso: any) => {
          const valor =
            acesso.valor ||
            acesso.objectGUID ||
            acesso.adObjectGuid ||
            acesso.id ||
            acesso.codigo;

          if (!valor) {
            throw new BadRequestException(
              'Um dos acessos selecionados não possui um identificador válido.',
            );
          }

          return {
            documentoId: novoDocumento.id,
            tipo: tipoRestricao!,
            valor: String(valor),

            nomeExibicao:
              acesso.nome ||
              acesso.name ||
              acesso.cn ||
              acesso.label ||
              acesso.descricao ||
              String(valor),
          };
        });

        await transaction.documentoAcesso.createMany({
          data: acessosNormalizados,
          skipDuplicates: true,
        });
      }

      return transaction.documento.findUnique({
        where: {
          id: novoDocumento.id,
        },
        include: {
          DocumentoCategoria: true,

          DocumentoVersao: {
            orderBy: {
              createdAt: 'desc',
            },
          },

          DocumentoAcesso: true,

          _count: {
            select: {
              DocumentoLeitura: true,
              DocumentoFavorito: true,
            },
          },
        },
      });
    });

    return {
      status: 'sucesso',
      mensagem: 'Documento publicado com sucesso.',
      data: documento,
    };
  }

  private parseArray(value: unknown): any[] {
    if (!value) {
      return [];
    }

    if (Array.isArray(value)) {
      return value;
    }

    if (typeof value === 'string') {
      try {
        const parsed = JSON.parse(value);

        return Array.isArray(parsed) ? parsed : [];
      } catch {
        throw new BadRequestException(
          'O campo de acessos está em um formato inválido.',
        );
      }
    }

    return [];
  }

  async createDocumentoCategoria(body: any, ip: string, user: any) {
    if (!body.nome || !String(body.nome).trim()) {
      throw new BadRequestException('O nome da categoria é obrigatório.');
    }

    const nome = String(body.nome).trim();

    const categoriaExistente = await this.prisma.documentoCategoria.findFirst({
      where: {
        nome: {
          equals: nome,
          mode: 'insensitive',
        },
      },
    });

    if (categoriaExistente) {
      throw new BadRequestException(
        `Já existe uma categoria cadastrada com o nome "${nome}".`,
      );
    }

    const categoria = await this.prisma.documentoCategoria.create({
      data: {
        nome,
        ativo: body.ativo === undefined ? true : this.parseBoolean(body.ativo),
      },
    });

    await this.prisma.audit_logs.create({
      data: {
        acao: `Criou a Categoria do Documento ${categoria.nome}`,
        entidade: user?.name,
        filialEntidade: user?.company,
        ipAddress: ip,
      },
    });

    return categoria;
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

  async findAllCadastrosCategoriasAtivos() {
    return await this.prisma.documentoCategoria.findMany({
      where: { ativo: true },
    });
  }

  async findByFilterCadastrosCategorias(body: any) {
    const { pesquisa, ativo, page = 1, limit = 10 } = body;

    const skip = (page - 1) * limit;

    const where: any = {};

    if (pesquisa?.trim()) {
      where.nome = {
        contains: pesquisa.trim(),
        mode: 'insensitive',
      };
    }

    if (ativo !== undefined && ativo !== null && ativo !== '') {
      where.ativo = ativo;
    }

    const result = await this.prisma.documentoCategoria.findMany({
      where,
      skip,
      take: limit,
      orderBy: {
        nome: 'asc',
      },
    });

    const total = await this.prisma.documentoCategoria.count({
      where,
    });

    return {
      result,
      total,
    };
  }

  async updateDocumentoCategoria(body: any, ip: string, user: any) {
    if (!body.nome || !String(body.nome).trim()) {
      throw new BadRequestException('O nome da categoria é obrigatório.');
    }

    const nome = String(body.nome).trim();

    const categoria = await this.prisma.documentoCategoria.update({
      where: { id: body.id },
      data: {
        nome,
        ativo: body.ativo === undefined ? true : this.parseBoolean(body.ativo),
      },
    });

    await this.prisma.audit_logs.create({
      data: {
        acao: `Atualizou a Categoria do Documento ${categoria.nome}`,
        entidade: user?.name,
        filialEntidade: user?.company,
        ipAddress: ip,
      },
    });

    return categoria;
  }

  async findByFilterDocumentos(body: any) {
    const {
      pesquisa,
      categoriaId,
      setorResponsavel,
      responsavelId,
      status,
      visibilidade,
      ativo,
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

    const where: any = {};

    if (pesquisa && String(pesquisa).trim()) {
      const termo = String(pesquisa).trim();

      where.OR = [
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
          setorResponsavel: {
            contains: termo,
            mode: 'insensitive',
          },
        },
        {
          responsavelNome: {
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
        {
          DocumentoCategoria: {
            is: {
              nome: {
                contains: termo,
                mode: 'insensitive',
              },
            },
          },
        },
      ];
    }

    if (categoriaId) {
      where.categoriaId = String(categoriaId);
    }

    if (setorResponsavel && String(setorResponsavel).trim()) {
      where.setorResponsavel = {
        contains: String(setorResponsavel).trim(),
        mode: 'insensitive',
      };
    }

    if (responsavelId) {
      where.responsavelId = String(responsavelId);
    }

    if (status && String(status).trim()) {
      where.status = String(status).trim().toUpperCase();
    }

    if (visibilidade && String(visibilidade).trim()) {
      where.visibilidade = String(visibilidade).trim().toUpperCase();
    }

    if (ativo !== undefined && ativo !== null && ativo !== '') {
      where.ativo = this.parseBoolean(ativo);
    }

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

    const [result, total] = await this.prisma.$transaction([
      this.prisma.documento.findMany({
        where,
        skip,
        take: limitNumber,

        include: {
          DocumentoCategoria: true,

          DocumentoVersao: {
            orderBy: {
              createdAt: 'desc',
            },
          },

          DocumentoAcesso: {
            orderBy: {
              createdAt: 'desc',
            },
          },

          DocumentoLeitura: {
            orderBy: {
              createdAt: 'desc',
            },
          },

          DocumentoFavorito: {
            orderBy: {
              createdAt: 'desc',
            },
          },

          _count: {
            select: {
              DocumentoVersao: true,
              DocumentoAcesso: true,
              DocumentoLeitura: true,
              DocumentoFavorito: true,
            },
          },
        },

        orderBy: [
          {
            ativo: 'desc',
          },
          {
            dataPublicacao: 'desc',
          },
          {
            nome: 'asc',
          },
        ],
      }),

      this.prisma.documento.count({
        where,
      }),
    ]);

    return {
      result,
      total,
    };
  }

  async findDocumentosBySetor(setor: string) {
    if (!setor.trim()) {
      throw new BadRequestException('O setor responsável é obrigatório.');
    }

    const result = await this.prisma.documento.findMany({
      where: {
        setorResponsavel: {
          equals: setor.trim(),
          mode: 'insensitive',
        },
        ativo: true,
      },

      include: {
        DocumentoCategoria: true,

        DocumentoVersao: {
          orderBy: {
            createdAt: 'desc',
          },
        },

        DocumentoAcesso: true,

        DocumentoLeitura: true,

        DocumentoFavorito: true,

        _count: {
          select: {
            DocumentoVersao: true,
            DocumentoAcesso: true,
            DocumentoLeitura: true,
            DocumentoFavorito: true,
          },
        },
      },

      orderBy: [
        {
          status: 'asc',
        },
        {
          nome: 'asc',
        },
      ],
    });

    return {
      result,
      total: result.length,
    };
  }

  async findDocumentosBySetorAndCategoria(
    setor: string,
    categoriaId: string,
    body: any,
  ) {
    const setorNormalizado = String(setor || '').trim();
    const categoriaIdNormalizado = String(categoriaId || '').trim();

    if (!setorNormalizado) {
      throw new BadRequestException('O setor responsável é obrigatório.');
    }

    if (!categoriaIdNormalizado) {
      throw new BadRequestException('O ID da categoria é obrigatório.');
    }

    const { pesquisa, page = 1, limit = 10 } = body || {};

    const pageNumber = Math.max(Number(page) || 1, 1);

    const limitNumber = Math.max(Number(limit) || 10, 1);

    const skip = (pageNumber - 1) * limitNumber;

    const where: any = {
      setorResponsavel: {
        equals: setorNormalizado,
        mode: 'insensitive',
      },

      categoriaId: categoriaIdNormalizado,

      ativo: true,
    };

    if (pesquisa && String(pesquisa).trim()) {
      const termo = String(pesquisa).trim();

      where.OR = [
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
          responsavelNome: {
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
        {
          DocumentoVersao: {
            some: {
              nomeOriginal: {
                contains: termo,
                mode: 'insensitive',
              },
            },
          },
        },
      ];
    }

    const [result, total] = await this.prisma.$transaction([
      this.prisma.documento.findMany({
        where,

        skip,
        take: limitNumber,

        include: {
          DocumentoCategoria: true,

          DocumentoVersao: {
            orderBy: {
              createdAt: 'desc',
            },
          },

          DocumentoAcesso: true,

          DocumentoLeitura: true,

          DocumentoFavorito: true,

          _count: {
            select: {
              DocumentoVersao: true,
              DocumentoAcesso: true,
              DocumentoLeitura: true,
              DocumentoFavorito: true,
            },
          },
        },

        orderBy: [
          {
            status: 'asc',
          },
          {
            dataPublicacao: 'desc',
          },
          {
            nome: 'asc',
          },
        ],
      }),

      this.prisma.documento.count({
        where,
      }),
    ]);

    return {
      result,
      total,
    };
  }

  async updateDocumento(
    body: any,
    file?: Express.Multer.File,
    ip?: string,
    user?: any,
  ) {
    const documentoId = String(body.id || '').trim();

    if (!documentoId) {
      throw new BadRequestException('O ID do documento é obrigatório.');
    }

    if (!body.nome || !String(body.nome).trim()) {
      throw new BadRequestException('O nome do documento é obrigatório.');
    }

    if (!body.codigo || !String(body.codigo).trim()) {
      throw new BadRequestException('O código do documento é obrigatório.');
    }

    if (!body.setorResponsavel || !String(body.setorResponsavel).trim()) {
      throw new BadRequestException(
        'O setor responsável pelo documento é obrigatório.',
      );
    }

    if (!body.categoriaId || !String(body.categoriaId).trim()) {
      throw new BadRequestException('A categoria do documento é obrigatória.');
    }

    if (!body.responsavelId || !String(body.responsavelId).trim()) {
      throw new BadRequestException(
        'O responsável pelo documento é obrigatório.',
      );
    }

    const documentoExistente = await this.prisma.documento.findUnique({
      where: {
        id: documentoId,
      },
      include: {
        DocumentoVersao: {
          orderBy: {
            createdAt: 'desc',
          },
        },
      },
    });

    if (!documentoExistente) {
      throw new NotFoundException('Documento não encontrado.');
    }

    const codigo = String(body.codigo).trim().toUpperCase();

    const documentoComMesmoCodigo = await this.prisma.documento.findFirst({
      where: {
        codigo,
        id: {
          not: documentoId,
        },
      },
      select: {
        id: true,
      },
    });

    if (documentoComMesmoCodigo) {
      throw new ConflictException(
        `Já existe outro documento cadastrado com o código ${codigo}.`,
      );
    }

    const diasParaRevisao = Number(body.diasParaRevisao);

    if (
      Number.isNaN(diasParaRevisao) ||
      !Number.isInteger(diasParaRevisao) ||
      diasParaRevisao <= 0
    ) {
      throw new BadRequestException(
        'A quantidade de dias para revisão deve ser um número inteiro maior que zero.',
      );
    }

    const dataProximaRevisao = new Date();

    dataProximaRevisao.setHours(0, 0, 0, 0);
    dataProximaRevisao.setDate(dataProximaRevisao.getDate() + diasParaRevisao);

    const visibilidade = String(body.visibilidade || '')
      .trim()
      .toUpperCase();

    if (!['PUBLICO', 'RESTRITO'].includes(visibilidade)) {
      throw new BadRequestException(
        'A visibilidade deve ser PUBLICO ou RESTRITO.',
      );
    }

    const tipoRestricao =
      visibilidade === 'RESTRITO'
        ? String(body.tipoRestricao || '')
            .trim()
            .toUpperCase()
        : null;

    if (
      visibilidade === 'RESTRITO' &&
      !['SETOR', 'GRUPO', 'USUARIO'].includes(tipoRestricao || '')
    ) {
      throw new BadRequestException(
        'O tipo de restrição deve ser SETOR, GRUPO ou USUARIO.',
      );
    }

    const acessos = this.parseArray(body.acessos);

    if (visibilidade === 'RESTRITO' && acessos.length === 0) {
      throw new BadRequestException(
        'Selecione pelo menos um setor, grupo ou usuário autorizado.',
      );
    }

    const usuarioId =
      user?.objectGUID || user?.adObjectGuid || user?.id || user?.sub || null;

    const usuarioNome =
      user?.nome ||
      user?.name ||
      user?.cn ||
      user?.usuario ||
      'Usuário não identificado';

    const resultado = await this.prisma.$transaction(async (transaction) => {
      let versaoAtual = documentoExistente.DocumentoVersao.find(
        (versao) => versao.vigente,
      );

      if (!versaoAtual) {
        versaoAtual = documentoExistente.DocumentoVersao[0];
      }

      let novaVersao: any = null;
      let numeroVersaoAtualizado = documentoExistente.versaoAtual;

      /*
       * Somente cria uma nova versão quando um arquivo novo for enviado.
       */
      if (file) {
        await transaction.documentoVersao.updateMany({
          where: {
            documentoId,
            vigente: true,
          },
          data: {
            vigente: false,
          },
        });

        numeroVersaoAtualizado = this.incrementarVersao(
          documentoExistente.versaoAtual || versaoAtual?.versao || '1.0',
        );

        novaVersao = await transaction.documentoVersao.create({
          data: {
            documentoId,

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
          'O documento não possui uma versão válida.',
        );
      }

      const documentoAtualizado = await transaction.documento.update({
        where: {
          id: documentoId,
        },
        data: {
          nome: String(body.nome).trim(),
          codigo,

          descricao:
            body.descricao && String(body.descricao).trim()
              ? String(body.descricao).trim()
              : null,

          setorResponsavel: String(body.setorResponsavel).trim(),

          categoriaId: String(body.categoriaId).trim(),

          responsavelId: String(body.responsavelId).trim(),

          responsavelNome: String(body.responsavelNome || '').trim(),

          responsavelEmail:
            body.responsavelEmail && String(body.responsavelEmail).trim()
              ? String(body.responsavelEmail).trim()
              : null,

          dataProximaRevisao,

          visibilidade,
          tipoRestricao,

          versaoAtual: numeroVersaoAtualizado,

          confirmacaoLeituraObrigatoria: this.parseBoolean(
            body.confirmacaoLeituraObrigatoria,
          ),
        },
      });

      /*
       * Remove os acessos anteriores para recriá-los conforme
       * a configuração atual do formulário.
       */
      await transaction.documentoAcesso.deleteMany({
        where: {
          documentoId,
        },
      });

      if (visibilidade === 'PUBLICO') {
        await transaction.documentoAcesso.create({
          data: {
            documentoId,
            tipo: 'TODOS',
            valor: 'TODOS',
            nomeExibicao: 'Todos os colaboradores',
          },
        });
      }

      if (visibilidade === 'RESTRITO') {
        const acessosNormalizados = acessos.map((acesso: any) => {
          const valor =
            acesso.valor ||
            acesso.objectGUID ||
            acesso.adObjectGuid ||
            acesso.id ||
            acesso.codigo;

          if (!valor) {
            throw new BadRequestException(
              'Um dos acessos selecionados não possui um identificador válido.',
            );
          }

          return {
            documentoId,
            tipo: tipoRestricao as 'SETOR' | 'GRUPO' | 'USUARIO',

            valor: String(valor),

            nomeExibicao:
              acesso.nome ||
              acesso.nomeExibicao ||
              acesso.name ||
              acesso.cn ||
              acesso.label ||
              acesso.descricao ||
              String(valor),
          };
        });

        await transaction.documentoAcesso.createMany({
          data: acessosNormalizados,
          skipDuplicates: true,
        });
      }

      return transaction.documento.findUnique({
        where: {
          id: documentoAtualizado.id,
        },
        include: {
          DocumentoCategoria: true,

          DocumentoVersao: {
            orderBy: {
              createdAt: 'desc',
            },
          },

          DocumentoAcesso: {
            orderBy: {
              createdAt: 'desc',
            },
          },

          DocumentoLeitura: {
            orderBy: {
              createdAt: 'desc',
            },
          },

          DocumentoFavorito: true,

          _count: {
            select: {
              DocumentoVersao: true,
              DocumentoAcesso: true,
              DocumentoLeitura: true,
              DocumentoFavorito: true,
            },
          },
        },
      });
    });

    await this.prisma.audit_logs.create({
      data: {
        acao: file
          ? `Atualizou o documento ${resultado?.nome} e publicou a versão ${resultado?.versaoAtual}`
          : `Atualizou o documento ${resultado?.nome}`,

        entidade: user?.name || user?.nome,
        filialEntidade: user?.company,
        ipAddress: ip,
      },
    });

    return {
      status: 'sucesso',
      mensagem: file
        ? 'Documento atualizado e nova versão publicada com sucesso.'
        : 'Documento atualizado com sucesso.',
      data: resultado,
    };
  }

  async changeFavoritos(body: any, ip: string, user: any) {
    const documentoId = String(body.documentoId || '').trim();

    if (!documentoId) {
      throw new BadRequestException('O ID do documento é obrigatório.');
    }

    const colaboradorId = String(
      user?.objectGUID || user?.adObjectGuid || user?.id || user?.sub || '',
    ).trim();

    if (!colaboradorId) {
      throw new BadRequestException(
        'Não foi possível identificar o colaborador.',
      );
    }

    const documento = await this.prisma.documento.findUnique({
      where: {
        id: documentoId,
      },
      select: {
        id: true,
        nome: true,
        ativo: true,
      },
    });

    if (!documento) {
      throw new NotFoundException('Documento não encontrado.');
    }

    const favorito = await this.prisma.documentoFavorito.findUnique({
      where: {
        documentoId_colaboradorId: {
          documentoId,
          colaboradorId,
        },
      },
    });

    if (favorito) {
      await this.prisma.documentoFavorito.delete({
        where: {
          id: favorito.id,
        },
      });

      await this.prisma.audit_logs.create({
        data: {
          acao: `Removeu o documento ${documento.nome} dos favoritos`,
          entidade: user?.name || user?.nome,
          filialEntidade: user?.company,
          ipAddress: ip,
        },
      });

      return {
        status: 'sucesso',
        mensagem: 'Documento removido dos favoritos.',
        favoritado: false,
      };
    }

    await this.prisma.documentoFavorito.create({
      data: {
        documentoId,
        colaboradorId,
      },
    });

    await this.prisma.audit_logs.create({
      data: {
        acao: `Adicionou o documento ${documento.nome} aos favoritos`,
        entidade: user?.name || user?.nome,
        filialEntidade: user?.company,
        ipAddress: ip,
      },
    });

    return {
      status: 'sucesso',
      mensagem: 'Documento adicionado aos favoritos.',
      favoritado: true,
    };
  }

  private incrementarVersao(versaoAtual: string): string {
    const major = Number(String(versaoAtual || '1.0').split('.')[0]);

    if (Number.isNaN(major)) {
      return '1.0';
    }

    return `${major + 1}.0`;
  }

  async findFavoritos(body: any, user: any) {
    const colaboradorId = user.objectGUID || user.adObjectGuid;

    const { pesquisa, page = 1, limit = 12 } = body;

    const where: any = {
      ativo: true,

      DocumentoFavorito: {
        some: {
          colaboradorId,
        },
      },
    };

    if (pesquisa?.trim()) {
      where.OR = [
        {
          nome: {
            contains: pesquisa,
            mode: 'insensitive',
          },
        },
        {
          codigo: {
            contains: pesquisa,
            mode: 'insensitive',
          },
        },
        {
          DocumentoCategoria: {
            is: {
              nome: {
                contains: pesquisa,
                mode: 'insensitive',
              },
            },
          },
        },
      ];
    }

    const [result, total] = await this.prisma.$transaction([
      this.prisma.documento.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,

        include: {
          DocumentoCategoria: true,
          DocumentoVersao: {
            orderBy: {
              createdAt: 'desc',
            },
          },
          DocumentoFavorito: true,
        },

        orderBy: {
          nome: 'asc',
        },
      }),

      this.prisma.documento.count({
        where,
      }),
    ]);

    return {
      result,
      total,
    };
  }

  async findPendentesLeitura(user: any) {
    const colaboradorId = this.obterColaboradorId(user);
    const setorColaborador = this.obterSetorColaborador(user);

    /*
     * Busca documentos que:
     *
     * 1. Estejam ativos;
     * 2. Estejam com status ATIVO;
     * 3. Exijam confirmação de leitura;
     * 4. Possuam uma versão vigente;
     * 5. Estejam disponíveis para o colaborador.
     */
    const documentos = await this.prisma.documento.findMany({
      where: {
        ativo: true,
        status: 'ATIVO',

        /*
         * Esse campo precisa existir no model Documento.
         *
         * Caso o nome no seu Prisma seja diferente,
         * altere aqui.
         */
        confirmacaoLeituraObrigatoria: true,

        DocumentoVersao: {
          some: {
            vigente: true,
          },
        },

        OR: [
          /*
           * Documento público:
           * disponível para todos os colaboradores.
           */
          {
            visibilidade: 'PUBLICO',
          },

          /*
           * Documento restrito por setor.
           */
          ...(setorColaborador
            ? [
                {
                  visibilidade: 'RESTRITO',
                  tipoRestricao: 'SETOR',

                  DocumentoAcesso: {
                    some: {
                      tipo: 'SETOR',

                      valor: {
                        equals: setorColaborador,
                        mode: 'insensitive' as const,
                      },
                    },
                  },
                },
              ]
            : []),

          /*
           * Documento restrito por usuário.
           */
          {
            visibilidade: 'RESTRITO',
            tipoRestricao: 'USUARIO',

            DocumentoAcesso: {
              some: {
                tipo: 'USUARIO',
                valor: colaboradorId,
              },
            },
          },
        ],
      },

      include: {
        DocumentoCategoria: true,

        DocumentoVersao: {
          where: {
            vigente: true,
          },

          orderBy: {
            createdAt: 'desc',
          },

          take: 1,
        },

        DocumentoAcesso: true,

        /*
         * Carrega somente os registros de leitura
         * pertencentes ao colaborador autenticado.
         */
        DocumentoLeitura: {
          where: {
            colaboradorId,
          },

          orderBy: {
            createdAt: 'desc',
          },
        },
      },

      orderBy: [
        {
          dataPublicacao: 'asc',
        },
        {
          nome: 'asc',
        },
      ],
    });

    /*
     * Remove os documentos cuja versão vigente
     * já foi confirmada pelo colaborador.
     */
    const documentosPendentes = documentos
      .map((documento) => {
        const versaoVigente = documento.DocumentoVersao[0];

        if (!versaoVigente) {
          return null;
        }

        const leituraConfirmada = documento.DocumentoLeitura.some(
          (leitura) =>
            leitura.versaoId === versaoVigente.id &&
            leitura.confirmadoEm !== null,
        );

        if (leituraConfirmada) {
          return null;
        }

        return {
          id: documento.id,
          nome: documento.nome,
          codigo: documento.codigo,
          descricao: documento.descricao,

          setorResponsavel: documento.setorResponsavel,

          responsavelId: documento.responsavelId,
          responsavelNome: documento.responsavelNome,
          responsavelEmail: documento.responsavelEmail,

          dataPublicacao: documento.dataPublicacao,
          dataProximaRevisao: documento.dataProximaRevisao,

          versaoAtual: documento.versaoAtual,

          visibilidade: documento.visibilidade,
          tipoRestricao: documento.tipoRestricao,

          categoria: documento.DocumentoCategoria,

          /*
           * Mantido neste formato porque o frontend
           * procura primeiro DocumentoVersao.
           */
          DocumentoVersao: [versaoVigente],

          /*
           * Também pode ser usado diretamente pelo frontend.
           */
          versaoVigente,
        };
      })
      .filter(Boolean);

    return {
      status: 'sucesso',
      result: documentosPendentes,
      total: documentosPendentes.length,
    };
  }

  async confirmarLeitura(
    body: {
      documentoId: string;
      documentoVersaoId: string;
    },
    ip: string,
    user: any,
  ) {
    const documentoId = String(body?.documentoId || '').trim();
    const documentoVersaoId = String(body?.documentoVersaoId || '').trim();

    if (!documentoId) {
      throw new BadRequestException('O ID do documento é obrigatório.');
    }

    if (!documentoVersaoId) {
      throw new BadRequestException(
        'O ID da versão do documento é obrigatório.',
      );
    }

    const colaboradorId = this.obterColaboradorId(user);
    const setorColaborador = this.obterSetorColaborador(user);

    const colaboradorNome =
      user?.nome ||
      user?.name ||
      user?.cn ||
      user?.displayName ||
      user?.usuario ||
      user?.samAccountName ||
      'Colaborador não identificado';

    const colaboradorEmail =
      user?.email || user?.mail || user?.userPrincipalName || null;

    const documento = await this.prisma.documento.findUnique({
      where: {
        id: documentoId,
      },

      include: {
        DocumentoCategoria: true,

        DocumentoVersao: {
          where: {
            id: documentoVersaoId,
          },
        },

        DocumentoAcesso: true,
      },
    });

    if (!documento) {
      throw new NotFoundException('Documento não encontrado.');
    }

    if (!documento.ativo || documento.status !== 'ATIVO') {
      throw new BadRequestException(
        'Este documento não está ativo para leitura.',
      );
    }

    if (!documento.confirmacaoLeituraObrigatoria) {
      throw new BadRequestException(
        'Este documento não exige confirmação de leitura.',
      );
    }

    const versao = documento.DocumentoVersao[0];

    if (!versao) {
      throw new NotFoundException(
        'A versão informada não foi encontrada para este documento.',
      );
    }

    if (!versao.vigente) {
      throw new BadRequestException(
        'Somente a versão vigente pode receber confirmação de leitura.',
      );
    }

    const possuiAcesso = this.verificarAcessoDocumento({
      documento,
      colaboradorId,
      setorColaborador,
    });

    if (!possuiAcesso) {
      throw new BadRequestException(
        'O colaborador não possui acesso a este documento.',
      );
    }

    const leituraExistente = await this.prisma.documentoLeitura.findUnique({
      where: {
        documentoId_versaoId_colaboradorId: {
          documentoId,
          versaoId: documentoVersaoId,
          colaboradorId,
        },
      },
    });

    /*
     * Caso já tenha confirmado, retorna sucesso.
     *
     * Isso torna o endpoint idempotente e evita erro
     * em casos de duplo clique ou repetição da requisição.
     */
    if (leituraExistente?.confirmadoEm) {
      return {
        status: 'sucesso',
        mensagem: 'A leitura deste documento já havia sido confirmada.',
        data: leituraExistente,
      };
    }

    const confirmadoEm = new Date();

    const leitura = await this.prisma.$transaction(async (transaction) => {
      let resultado;

      if (leituraExistente) {
        resultado = await transaction.documentoLeitura.update({
          where: {
            id: leituraExistente.id,
          },

          data: {
            colaboradorNome,
            colaboradorEmail,
            obrigatorio: true,
            confirmadoEm,
          },
        });
      } else {
        resultado = await transaction.documentoLeitura.create({
          data: {
            documentoId,
            versaoId: documentoVersaoId,

            colaboradorId,
            colaboradorNome,
            colaboradorEmail,

            obrigatorio: true,
            confirmadoEm,
          },
        });
      }

      await transaction.audit_logs.create({
        data: {
          acao: `Confirmou a leitura do documento ${documento.nome}, versão ${versao.versao}`,
          entidade: colaboradorNome,
          filialEntidade: user?.company,
          ipAddress: ip,
        },
      });

      return resultado;
    });

    return {
      status: 'sucesso',
      mensagem: 'Leitura do documento confirmada com sucesso.',
      data: leitura,
    };
  }

  private obterColaboradorId(user: any): string {
    const colaboradorId = String(
      user?.objectGUID || user?.adObjectGuid || user?.id || user?.sub || '',
    ).trim();

    if (!colaboradorId) {
      throw new BadRequestException(
        'Não foi possível identificar o colaborador autenticado.',
      );
    }

    return colaboradorId;
  }

  private obterSetorColaborador(user: any): string | null {
    const setor = String(
      user?.departamento ||
        user?.department ||
        user?.setor ||
        user?.departamentoNome ||
        '',
    ).trim();

    return setor || null;
  }

  private verificarAcessoDocumento({
    documento,
    colaboradorId,
    setorColaborador,
  }: {
    documento: any;
    colaboradorId: string;
    setorColaborador: string | null;
  }): boolean {
    if (documento.visibilidade === 'PUBLICO') {
      return true;
    }

    if (documento.visibilidade !== 'RESTRITO') {
      return false;
    }

    if (documento.tipoRestricao === 'SETOR' && setorColaborador) {
      return documento.DocumentoAcesso.some(
        (acesso: any) =>
          acesso.tipo === 'SETOR' &&
          this.normalizarComparacao(acesso.valor) ===
            this.normalizarComparacao(setorColaborador),
      );
    }

    if (documento.tipoRestricao === 'USUARIO') {
      return documento.DocumentoAcesso.some(
        (acesso: any) =>
          acesso.tipo === 'USUARIO' && String(acesso.valor) === colaboradorId,
      );
    }

    return false;
  }

  async visualizarAceites(idDocumento: string) {
    return await this.prisma.documentoLeitura.findMany({ where: { documentoId: idDocumento } });
  }

  private normalizarComparacao(value: unknown): string {
    return String(value || '')
      .trim()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase();
  }
}
