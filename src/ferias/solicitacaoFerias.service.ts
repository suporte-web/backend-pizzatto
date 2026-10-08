import { PrismaService } from '@/prisma/prisma.service';
import {
  BadRequestException,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { FeriasRegrasService } from './feriasRegras.service';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';

@Injectable()
export class SolicitacaoFeriasService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly regras: FeriasRegrasService,
    private readonly httpService: HttpService,
  ) {}

  private async validarGestorSuperior(
    colaboradorSam: string,
    authorization: string,
  ) {
    try {
      const url = `${process.env.AUTH_API_URL}/auth/validar-aprovador-ferias`;

      const response = await firstValueFrom(
        this.httpService.post(
          url,
          {
            colaboradorSam,
          },
          {
            headers: {
              Authorization: authorization,
            },
          },
        ),
      );

      return response.data;
    } catch (error: any) {
      /*
       * O serviço de autenticação respondeu,
       * mas negou a requisição.
       */
      if (error?.response) {
        throw new ForbiddenException(
          error.response?.data?.message ||
            'Não foi possível validar a hierarquia de aprovação.',
        );
      }

      /*
       * Falha de comunicação entre os backends.
       */
      throw new BadRequestException(
        'Não foi possível consultar o serviço de autenticação para validar a hierarquia do gestor.',
      );
    }
  }

  private converterData(valor: string) {
    if (!valor) {
      throw new BadRequestException('Data inválida.');
    }

    const data = new Date(`${valor}T00:00:00.000Z`);

    if (Number.isNaN(data.getTime())) {
      throw new BadRequestException('Data inválida.');
    }

    return data;
  }

  async create(body: any, ip: string, user: any) {
    if (!body.periodoAquisitivoId) {
      throw new BadRequestException('Período aquisitivo é obrigatório.');
    }

    if (!body.modalidade) {
      throw new BadRequestException('Modalidade de férias é obrigatória.');
    }

    if (!Array.isArray(body.parcelas) || body.parcelas.length === 0) {
      throw new BadRequestException('Informe os períodos de férias.');
    }

    const usuarioAd = user?.sam;

    if (!usuarioAd) {
      throw new BadRequestException(
        'Não foi possível identificar o usuário autenticado.',
      );
    }

    const usuarioChat = await this.prisma.usuarioChat.findFirst({
      where: {
        usuario: {
          equals: String(usuarioAd),
          mode: 'insensitive',
        },
      },
    });

    if (!usuarioChat) {
      throw new BadRequestException(
        'Usuário não encontrado no cadastro da Intranet.',
      );
    }

    if (!usuarioChat.ativo) {
      throw new BadRequestException(
        'Usuário inativo não pode solicitar férias.',
      );
    }

    if (!usuarioChat.dataAdmissao) {
      throw new BadRequestException(
        'A data de admissão do colaborador não está cadastrada.',
      );
    }

    const periodo = await this.regras.validarPeriodoDisponivel(
      body.periodoAquisitivoId,
      usuarioChat.id,
    );

    const configuracao = this.regras.validarParcelas(
      body.modalidade,
      body.parcelas,
    );

    this.regras.validarModalidadeMotorista(body.modalidade, usuarioChat.cargo);

    const parcelasCalculadas: {
      ordem: number;
      quantidadeDias: number;
      dataInicio: Date;
      dataFim: Date;
      dataRetorno: Date;
    }[] = [];

    for (let index = 0; index < body.parcelas.length; index++) {
      const parcelaRecebida = body.parcelas[index];

      const quantidadeDias = configuracao.parcelas[index];

      const dataInicio = this.converterData(parcelaRecebida.dataInicio);

      this.regras.validarAntecedenciaMinima(dataInicio);

      this.regras.validarDiaSemana(dataInicio);

      await this.regras.validarFeriados(dataInicio, usuarioChat.empresa);

      const dataFim = this.regras.calcularDataFim(dataInicio, quantidadeDias);

      const dataRetorno = this.regras.calcularDataRetorno(dataFim);

      parcelasCalculadas.push({
        ordem: index + 1,

        quantidadeDias,

        dataInicio,

        dataFim,

        dataRetorno,
      });
    }

    this.regras.validarOrdemCronologicaParcelas(parcelasCalculadas);

    this.regras.validarSobreposicaoParcelas(parcelasCalculadas);

    const solicitacaoExistente = await this.prisma.solicitacaoFerias.findFirst({
      where: {
        periodoAquisitivoId: periodo.id,

        status: {
          notIn: ['REPROVADO', 'CANCELADO', 'CONCLUIDO'],
        },
      },
    });

    if (solicitacaoExistente) {
      throw new BadRequestException(
        'Já existe uma solicitação de férias ativa para este período aquisitivo.',
      );
    }

    const quantidadeDiasFerias = configuracao.parcelas.reduce(
      (total: number, quantidade: number) => total + quantidade,
      0,
    );

    const quantidadeDiasVendidos = configuracao.diasVendidos;

    const totalConsumido = quantidadeDiasFerias + quantidadeDiasVendidos;

    if (totalConsumido !== periodo.quantidadeDiasDireito) {
      throw new BadRequestException(
        `A modalidade informada deve consumir exatamente ${periodo.quantidadeDiasDireito} dias do período aquisitivo.`,
      );
    }

    const manager = user?.manager;

    if (!manager?.sam) {
      throw new BadRequestException(
        'Não foi possível identificar o gestor responsável pela aprovação.',
      );
    }

    const gestorUsuario = manager.sam;
    const gestorNome = manager.name ?? null;
    const gestorEmail = manager.mail ?? null;

    const novaSolicitacao = await this.prisma.$transaction(async (tx) => {
      const solicitacao = await tx.solicitacaoFerias.create({
        data: {
          periodoAquisitivoId: periodo.id,

          modalidade: body.modalidade,

          quantidadeDiasFerias,

          quantidadeDiasVendidos,

          status: 'AGUARDANDO_APROVACAO',

          /*
           * Snapshot
           */
          empresa: usuarioChat.empresa,

          cargo: usuarioChat.cargo,

          tipoContratacao: usuarioChat.tipoContratacao,

          /*
           * Gestor
           */
          gestorUsuario,
          gestorNome,
          gestorEmail,
        },
      });

      /*
       * Parcelas
       */
      await tx.parcelaFerias.createMany({
        data: parcelasCalculadas.map((parcela) => ({
          solicitacaoId: solicitacao.id,

          ordem: parcela.ordem,

          quantidadeDias: parcela.quantidadeDias,

          dataInicio: parcela.dataInicio,

          dataFim: parcela.dataFim,

          dataRetorno: parcela.dataRetorno,

          status: 'AGUARDANDO_APROVACAO',
        })),
      });

      /*
       * Histórico
       */
      await tx.historicoSolicitacaoFerias.create({
        data: {
          solicitacaoId: solicitacao.id,

          tipoEvento: 'CRIACAO',

          descricao: 'Solicitação de férias criada pelo colaborador.',

          statusAnterior: null,

          statusNovo: 'AGUARDANDO_APROVACAO',

          responsavelUsuario: usuarioChat.usuario,

          responsavelNome: usuarioChat.nome,

          responsavelEmail: usuarioChat.email,

          ipAddress: ip,

          dadosNovos: {
            modalidade: body.modalidade,

            quantidadeDiasFerias,

            quantidadeDiasVendidos,

            periodoAquisitivo: {
              id: periodo.id,

              anoVigencia: periodo.anoVigencia,
            },

            parcelas: parcelasCalculadas.map((parcela) => ({
              ordem: parcela.ordem,

              quantidadeDias: parcela.quantidadeDias,

              dataInicio: parcela.dataInicio.toISOString(),

              dataFim: parcela.dataFim.toISOString(),

              dataRetorno: parcela.dataRetorno.toISOString(),
            })),
          },
        },
      });

      await tx.periodoAquisitivoFerias.update({
        where: {
          id: periodo.id,
        },

        data: {
          status: 'PROGRAMADO',
        },
      });

      return solicitacao;
    });

    return await this.prisma.solicitacaoFerias.findUnique({
      where: {
        id: novaSolicitacao.id,
      },

      include: {
        PeriodoAquisitivoFerias: true,

        ParcelaFerias: {
          orderBy: {
            ordem: 'asc',
          },
        },

        HistoricoSolicitacaoFerias: {
          orderBy: {
            createdAt: 'asc',
          },
        },
      },
    });
  }

  async findByFilter(body: any, user: any) {
    const page = Number(body.page ?? 1);
    const limit = Number(body.limit ?? 10);

    const skip = (page - 1) * limit;

    const pesquisa = body.pesquisa?.trim();
    const status = body.status?.trim();
    const modalidade = body.modalidade?.trim();

    const anoVigencia = body.anoVigencia ? Number(body.anoVigencia) : undefined;

    const tipoVisualizacao =
      body.tipoVisualizacao?.trim() || 'MINHAS_SOLICITACOES';

    const usuarioAd = user?.sam;

    if (!usuarioAd) {
      throw new BadRequestException(
        'Não foi possível identificar o usuário autenticado.',
      );
    }

    const tiposVisualizacaoPermitidos = [
      'MINHAS_SOLICITACOES',
      'PARA_APROVAR',
      'TODAS',
    ];

    if (!tiposVisualizacaoPermitidos.includes(tipoVisualizacao)) {
      throw new BadRequestException('Tipo de visualização inválido.');
    }

    const where: any = {
      AND: [],
    };

    if (tipoVisualizacao === 'MINHAS_SOLICITACOES') {
      where.AND.push({
        PeriodoAquisitivoFerias: {
          UsuarioChat: {
            usuario: {
              equals: usuarioAd,
              mode: 'insensitive',
            },
          },
        },
      });
    }

    if (tipoVisualizacao === 'PARA_APROVAR') {
      where.AND.push({
        gestorUsuario: {
          equals: usuarioAd,
          mode: 'insensitive',
        },
      });
    }

    if (tipoVisualizacao === 'TODAS') {
      const roles = Array.isArray(user?.roles) ? user.roles : [];

      const podeVisualizarTodas =
        roles.includes('PESSOAS_E_CULTURA') || roles.includes('ADMIN');

      if (!podeVisualizarTodas) {
        throw new BadRequestException(
          'Você não possui permissão para visualizar todas as solicitações de férias.',
        );
      }
    }

    if (status && status !== 'TODOS') {
      where.AND.push({
        status,
      });
    }

    if (modalidade && modalidade !== 'TODOS') {
      where.AND.push({
        modalidade,
      });
    }

    if (anoVigencia) {
      where.AND.push({
        PeriodoAquisitivoFerias: {
          anoVigencia,
        },
      });
    }

    if (pesquisa) {
      where.AND.push({
        OR: [
          {
            PeriodoAquisitivoFerias: {
              UsuarioChat: {
                nome: {
                  contains: pesquisa,
                  mode: 'insensitive',
                },
              },
            },
          },

          {
            PeriodoAquisitivoFerias: {
              UsuarioChat: {
                usuario: {
                  contains: pesquisa,
                  mode: 'insensitive',
                },
              },
            },
          },

          {
            PeriodoAquisitivoFerias: {
              UsuarioChat: {
                email: {
                  contains: pesquisa,
                  mode: 'insensitive',
                },
              },
            },
          },

          {
            empresa: {
              contains: pesquisa,
              mode: 'insensitive',
            },
          },

          {
            cargo: {
              contains: pesquisa,
              mode: 'insensitive',
            },
          },

          {
            gestorNome: {
              contains: pesquisa,
              mode: 'insensitive',
            },
          },

          {
            gestorUsuario: {
              contains: pesquisa,
              mode: 'insensitive',
            },
          },

          {
            gestorEmail: {
              contains: pesquisa,
              mode: 'insensitive',
            },
          },
        ],
      });
    }

    const [solicitacoes, total] = await this.prisma.$transaction([
      this.prisma.solicitacaoFerias.findMany({
        where,

        skip,

        take: limit,

        orderBy: {
          createdAt: 'desc',
        },

        include: {
          PeriodoAquisitivoFerias: {
            include: {
              UsuarioChat: {
                select: {
                  id: true,
                  usuario: true,
                  nome: true,
                  email: true,
                  empresa: true,
                  departamento: true,
                  cargo: true,
                  tipoContratacao: true,
                  dataAdmissao: true,
                },
              },
            },
          },

          ParcelaFerias: {
            orderBy: {
              ordem: 'asc',
            },
          },

          HistoricoSolicitacaoFerias: {
            orderBy: {
              createdAt: 'desc',
            },
          },
        },
      }),

      this.prisma.solicitacaoFerias.count({
        where,
      }),
    ]);

    return {
      data: solicitacoes,

      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async aprovarSolicitacao(
    solicitacaoId: string,
    ip: string,
    user: any,
    authorization: string,
  ) {
    if (!solicitacaoId) {
      throw new BadRequestException('Solicitação de férias é obrigatória.');
    }

    const usuarioAd = user?.sam;

    if (!usuarioAd) {
      throw new BadRequestException(
        'Não foi possível identificar o usuário autenticado.',
      );
    }

    const solicitacao = await this.prisma.solicitacaoFerias.findUnique({
      where: {
        id: solicitacaoId,
      },

      include: {
        PeriodoAquisitivoFerias: {
          include: {
            UsuarioChat: {
              select: {
                id: true,
                usuario: true,
                nome: true,
                email: true,
                empresa: true,
                departamento: true,
                cargo: true,
              },
            },
          },
        },

        ParcelaFerias: {
          orderBy: {
            ordem: 'asc',
          },
        },
      },
    });

    if (!solicitacao) {
      throw new BadRequestException('Solicitação de férias não encontrada.');
    }

    if (solicitacao.status !== 'AGUARDANDO_APROVACAO') {
      throw new BadRequestException(
        `A solicitação não pode ser aprovada porque está com status ${solicitacao.status}.`,
      );
    }

    if (!solicitacao.gestorUsuario) {
      throw new BadRequestException(
        'A solicitação não possui gestor responsável definido.',
      );
    }

    const colaboradorSam =
      solicitacao.PeriodoAquisitivoFerias.UsuarioChat.usuario;

    if (!colaboradorSam) {
      throw new BadRequestException(
        'Não foi possível identificar o colaborador da solicitação.',
      );
    }

    const gestorSolicitacao = solicitacao.gestorUsuario.trim().toLowerCase();

    const usuarioAutenticado = String(usuarioAd).trim().toLowerCase();

    let tipoAprovador: 'GESTOR_DIRETO' | 'GESTOR_SUPERIOR';

    if (gestorSolicitacao === usuarioAutenticado) {
      tipoAprovador = 'GESTOR_DIRETO';
    } else {
      if (!authorization) {
        throw new ForbiddenException(
          'Token de autenticação não encontrado para validação da hierarquia.',
        );
      }

      const validacao = await this.validarGestorSuperior(
        colaboradorSam,
        authorization,
      );

      if (!validacao?.autorizado || validacao?.tipo !== 'GESTOR_SUPERIOR') {
        throw new ForbiddenException(
          'Você não possui permissão para aprovar esta solicitação de férias.',
        );
      }

      tipoAprovador = 'GESTOR_SUPERIOR';
    }

    const aprovadoPorUsuario = user?.sam ?? null;

    const aprovadoPorNome = user?.name ?? null;

    const aprovadoPorEmail = user?.mail ?? null;

    const aprovadoEm = new Date();

    await this.prisma.$transaction(async (tx) => {
      await tx.solicitacaoFerias.update({
        where: {
          id: solicitacao.id,
        },

        data: {
          status: 'APROVADO',

          aprovadoPorUsuario,
          aprovadoPorNome,
          aprovadoPorEmail,
          aprovadoEm,

          motivoReprovacao: null,
        },
      });

      await tx.parcelaFerias.updateMany({
        where: {
          solicitacaoId: solicitacao.id,
        },

        data: {
          status: 'APROVADO',
        },
      });

      await tx.historicoSolicitacaoFerias.create({
        data: {
          solicitacaoId: solicitacao.id,

          tipoEvento: 'APROVACAO',

          descricao: 'Solicitação de férias aprovada pelo gestor.',

          statusAnterior: solicitacao.status,

          statusNovo: 'APROVADO',

          responsavelUsuario: aprovadoPorUsuario,

          responsavelNome: aprovadoPorNome,

          responsavelEmail: aprovadoPorEmail,

          ipAddress: ip,

          dadosAnteriores: {
            status: solicitacao.status,

            aprovadoPorUsuario: solicitacao.aprovadoPorUsuario,

            aprovadoPorNome: solicitacao.aprovadoPorNome,

            aprovadoPorEmail: solicitacao.aprovadoPorEmail,

            aprovadoEm: solicitacao.aprovadoEm,
          },

          dadosNovos: {
            status: 'APROVADO',

            tipoAprovador,

            aprovadoPorUsuario,
            aprovadoPorNome,
            aprovadoPorEmail,

            aprovadoEm: aprovadoEm.toISOString(),
          },
        },
      });
    });

    return await this.prisma.solicitacaoFerias.findUnique({
      where: {
        id: solicitacao.id,
      },

      include: {
        PeriodoAquisitivoFerias: {
          include: {
            UsuarioChat: {
              select: {
                id: true,
                usuario: true,
                nome: true,
                email: true,
                empresa: true,
                departamento: true,
                cargo: true,
                tipoContratacao: true,
                dataAdmissao: true,
              },
            },
          },
        },

        ParcelaFerias: {
          orderBy: {
            ordem: 'asc',
          },
        },

        HistoricoSolicitacaoFerias: {
          orderBy: {
            createdAt: 'desc',
          },
        },
      },
    });
  }

  async updateSolicitacao(body: any, ip: string, user: any) {
    if (!body?.solicitacaoId) {
      throw new BadRequestException('Solicitação de férias é obrigatória.');
    }

    if (!body?.modalidade) {
      throw new BadRequestException('Modalidade de férias é obrigatória.');
    }

    if (!Array.isArray(body.parcelas) || body.parcelas.length === 0) {
      throw new BadRequestException('Informe os períodos de férias.');
    }

    /*
     * ================================
     * Permissão
     * ================================
     */

    const roles = Array.isArray(user?.roles) ? user.roles : [];

    const podeAlterar =
      roles.includes('PESSOAS_E_CULTURA') || roles.includes('ADMIN');

    if (!podeAlterar) {
      throw new ForbiddenException(
        'Você não possui permissão para alterar esta solicitação de férias.',
      );
    }

    /*
     * ================================
     * Solicitação atual
     * ================================
     */

    const solicitacao = await this.prisma.solicitacaoFerias.findUnique({
      where: {
        id: body.solicitacaoId,
      },

      include: {
        PeriodoAquisitivoFerias: {
          include: {
            UsuarioChat: true,
          },
        },

        ParcelaFerias: {
          orderBy: {
            ordem: 'asc',
          },
        },
      },
    });

    if (!solicitacao) {
      throw new BadRequestException('Solicitação de férias não encontrada.');
    }

    /*
     * ================================
     * Status que não podem ser editados
     * ================================
     */

    const statusBloqueados = ['EM_FERIAS', 'FERIAS_RETIRADAS', 'CANCELADO'];

    if (statusBloqueados.includes(String(solicitacao.status))) {
      throw new BadRequestException(
        `A solicitação não pode ser alterada porque está com status ${solicitacao.status}.`,
      );
    }

    const usuarioChat = solicitacao.PeriodoAquisitivoFerias.UsuarioChat;

    if (!usuarioChat) {
      throw new BadRequestException(
        'Colaborador vinculado à solicitação não foi encontrado.',
      );
    }

    /*
     * ================================
     * Modalidade
     * ================================
     */

    const configuracao = this.regras.validarParcelas(
      body.modalidade,
      body.parcelas,
    );

    this.regras.validarModalidadeMotorista(body.modalidade, usuarioChat.cargo);

    /*
     * ================================
     * Recalcula parcelas
     * ================================
     */

    const parcelasCalculadas: {
      ordem: number;
      quantidadeDias: number;
      dataInicio: Date;
      dataFim: Date;
      dataRetorno: Date;
    }[] = [];

    for (let index = 0; index < body.parcelas.length; index++) {
      const parcelaRecebida = body.parcelas[index];

      const quantidadeDias = configuracao.parcelas[index];

      const dataInicio = this.converterData(parcelaRecebida.dataInicio);

      this.regras.validarAntecedenciaMinima(dataInicio);

      this.regras.validarDiaSemana(dataInicio);

      await this.regras.validarFeriados(dataInicio, usuarioChat.empresa);

      const dataFim = this.regras.calcularDataFim(dataInicio, quantidadeDias);

      const dataRetorno = this.regras.calcularDataRetorno(dataFim);

      parcelasCalculadas.push({
        ordem: index + 1,
        quantidadeDias,
        dataInicio,
        dataFim,
        dataRetorno,
      });
    }

    this.regras.validarOrdemCronologicaParcelas(parcelasCalculadas);

    this.regras.validarSobreposicaoParcelas(parcelasCalculadas);

    /*
     * ================================
     * Totais
     * ================================
     */

    const quantidadeDiasFerias = configuracao.parcelas.reduce(
      (total: number, quantidade: number) => total + quantidade,
      0,
    );

    const quantidadeDiasVendidos = configuracao.diasVendidos;

    const totalConsumido = quantidadeDiasFerias + quantidadeDiasVendidos;

    if (
      totalConsumido !==
      solicitacao.PeriodoAquisitivoFerias.quantidadeDiasDireito
    ) {
      throw new BadRequestException(
        `A modalidade informada deve consumir exatamente ${solicitacao.PeriodoAquisitivoFerias.quantidadeDiasDireito} dias do período aquisitivo.`,
      );
    }

    /*
     * ================================
     * Snapshot anterior
     * ================================
     */

    const dadosAnteriores = {
      modalidade: solicitacao.modalidade,

      quantidadeDiasFerias: solicitacao.quantidadeDiasFerias,

      quantidadeDiasVendidos: solicitacao.quantidadeDiasVendidos,

      status: solicitacao.status,

      aprovadoPorUsuario: solicitacao.aprovadoPorUsuario,

      aprovadoPorNome: solicitacao.aprovadoPorNome,

      aprovadoPorEmail: solicitacao.aprovadoPorEmail,

      aprovadoEm: solicitacao.aprovadoEm,

      parcelas: solicitacao.ParcelaFerias.map((parcela) => ({
        ordem: parcela.ordem,

        quantidadeDias: parcela.quantidadeDias,

        dataInicio: parcela.dataInicio,

        dataFim: parcela.dataFim,

        dataRetorno: parcela.dataRetorno,

        status: parcela.status,
      })),
    };

    /*
     * ================================
     * Transaction
     * ================================
     */

    await this.prisma.$transaction(async (tx) => {
      /*
       * Solicitação volta para aprovação
       */
      await tx.solicitacaoFerias.update({
        where: {
          id: solicitacao.id,
        },

        data: {
          modalidade: body.modalidade,

          quantidadeDiasFerias,

          quantidadeDiasVendidos,

          status: 'AGUARDANDO_APROVACAO',

          aprovadoPorUsuario: null,

          aprovadoPorNome: null,

          aprovadoPorEmail: null,

          aprovadoEm: null,

          motivoReprovacao: null,
        },
      });

      /*
       * Remove parcelas antigas
       */
      await tx.parcelaFerias.deleteMany({
        where: {
          solicitacaoId: solicitacao.id,
        },
      });

      /*
       * Cria novamente as parcelas
       */
      await tx.parcelaFerias.createMany({
        data: parcelasCalculadas.map((parcela) => ({
          solicitacaoId: solicitacao.id,

          ordem: parcela.ordem,

          quantidadeDias: parcela.quantidadeDias,

          dataInicio: parcela.dataInicio,

          dataFim: parcela.dataFim,

          dataRetorno: parcela.dataRetorno,

          status: 'AGUARDANDO_APROVACAO',
        })),
      });

      /*
       * Histórico
       */
      await tx.historicoSolicitacaoFerias.create({
        data: {
          solicitacaoId: solicitacao.id,

          tipoEvento: 'EDICAO',

          descricao:
            'Solicitação de férias alterada pelo RH e encaminhada novamente para aprovação.',

          statusAnterior: solicitacao.status,

          statusNovo: 'AGUARDANDO_APROVACAO',

          responsavelUsuario: user?.sam ?? null,

          responsavelNome: user?.name ?? null,

          responsavelEmail: user?.mail ?? null,

          ipAddress: ip,

          dadosAnteriores,

          dadosNovos: {
            modalidade: body.modalidade,

            quantidadeDiasFerias,

            quantidadeDiasVendidos,

            status: 'AGUARDANDO_APROVACAO',

            parcelas: parcelasCalculadas.map((parcela) => ({
              ordem: parcela.ordem,

              quantidadeDias: parcela.quantidadeDias,

              dataInicio: parcela.dataInicio.toISOString(),

              dataFim: parcela.dataFim.toISOString(),

              dataRetorno: parcela.dataRetorno.toISOString(),

              status: 'AGUARDANDO_APROVACAO',
            })),
          },
        },
      });
    });

    /*
     * ================================
     * Retorno atualizado
     * ================================
     */

    return await this.prisma.solicitacaoFerias.findUnique({
      where: {
        id: solicitacao.id,
      },

      include: {
        PeriodoAquisitivoFerias: {
          include: {
            UsuarioChat: {
              select: {
                id: true,
                usuario: true,
                nome: true,
                email: true,
                empresa: true,
                departamento: true,
                cargo: true,
                tipoContratacao: true,
                dataAdmissao: true,
              },
            },
          },
        },

        ParcelaFerias: {
          orderBy: {
            ordem: 'asc',
          },
        },

        HistoricoSolicitacaoFerias: {
          orderBy: {
            createdAt: 'desc',
          },
        },
      },
    });
  }

  async cancelarSolicitacao(body: any, ip: string, user: any) {
    if (!body?.solicitacaoId) {
      throw new BadRequestException('Solicitação de férias é obrigatória.');
    }

    if (!body?.motivoCancelamento?.trim()) {
      throw new BadRequestException('O motivo do cancelamento é obrigatório.');
    }

    const roles = Array.isArray(user?.roles) ? user.roles : [];

    const podeCancelar =
      roles.includes('PESSOAS_E_CULTURA') || roles.includes('ADMIN');

    if (!podeCancelar) {
      throw new ForbiddenException(
        'Você não possui permissão para cancelar esta solicitação de férias.',
      );
    }

    const solicitacao = await this.prisma.solicitacaoFerias.findUnique({
      where: {
        id: body.solicitacaoId,
      },

      include: {
        PeriodoAquisitivoFerias: true,

        ParcelaFerias: {
          orderBy: {
            ordem: 'asc',
          },
        },
      },
    });

    if (!solicitacao) {
      throw new BadRequestException('Solicitação de férias não encontrada.');
    }

    if (solicitacao.status === 'CANCELADO') {
      throw new BadRequestException('Esta solicitação já está cancelada.');
    }

    if (solicitacao.status === 'CONCLUIDO') {
      throw new BadRequestException(
        'Não é possível cancelar uma solicitação de férias já concluída.',
      );
    }

    const possuiParcelaRetirada = solicitacao.ParcelaFerias.some(
      (parcela) => parcela.status === 'FERIAS_RETIRADAS',
    );

    if (possuiParcelaRetirada) {
      throw new BadRequestException(
        'Não é possível cancelar uma solicitação que possui período de férias já retirado.',
      );
    }

    const motivoCancelamento = body.motivoCancelamento.trim();

    const statusAnterior = solicitacao.status;

    const dadosAnteriores = {
      status: solicitacao.status,

      modalidade: solicitacao.modalidade,

      quantidadeDiasFerias: solicitacao.quantidadeDiasFerias,

      quantidadeDiasVendidos: solicitacao.quantidadeDiasVendidos,

      motivoCancelamento: solicitacao.motivoCancelamento,

      parcelas: solicitacao.ParcelaFerias.map((parcela) => ({
        id: parcela.id,

        ordem: parcela.ordem,

        quantidadeDias: parcela.quantidadeDias,

        dataInicio: parcela.dataInicio,

        dataFim: parcela.dataFim,

        dataRetorno: parcela.dataRetorno,

        status: parcela.status,
      })),
    };

    await this.prisma.$transaction(async (tx) => {
      await tx.solicitacaoFerias.update({
        where: {
          id: solicitacao.id,
        },

        data: {
          status: 'CANCELADO',

          motivoCancelamento,

          motivoReprovacao: null,
        },
      });

      await tx.parcelaFerias.updateMany({
        where: {
          solicitacaoId: solicitacao.id,
        },

        data: {
          status: 'CANCELADO',
        },
      });

      /*
       * Como a solicitação deixou de consumir
       * o período aquisitivo, ele volta a ficar
       * disponível.
       */
      await tx.periodoAquisitivoFerias.update({
        where: {
          id: solicitacao.periodoAquisitivoId,
        },

        data: {
          status: 'DISPONIVEL',
        },
      });

      await tx.historicoSolicitacaoFerias.create({
        data: {
          solicitacaoId: solicitacao.id,

          tipoEvento: 'CANCELAMENTO',

          descricao: 'Solicitação de férias cancelada pelo RH.',

          statusAnterior,

          statusNovo: 'CANCELADO',

          responsavelUsuario: user?.sam ?? null,

          responsavelNome: user?.name ?? null,

          responsavelEmail: user?.mail ?? null,

          ipAddress: ip,

          dadosAnteriores,

          dadosNovos: {
            status: 'CANCELADO',

            motivoCancelamento,
          },
        },
      });
    });

    return await this.prisma.solicitacaoFerias.findUnique({
      where: {
        id: solicitacao.id,
      },

      include: {
        PeriodoAquisitivoFerias: {
          include: {
            UsuarioChat: {
              select: {
                id: true,
                usuario: true,
                nome: true,
                email: true,
                empresa: true,
                departamento: true,
                cargo: true,
                tipoContratacao: true,
                dataAdmissao: true,
              },
            },
          },
        },

        ParcelaFerias: {
          orderBy: {
            ordem: 'asc',
          },
        },

        HistoricoSolicitacaoFerias: {
          orderBy: {
            createdAt: 'desc',
          },
        },
      },
    });
  }

  async disponibilizarDocumento(body: any, ip: string, user: any) {
    if (!body?.parcelaId) {
      throw new BadRequestException('Parcela de férias é obrigatória.');
    }

    if (!body?.nomeArquivo) {
      throw new BadRequestException('Nome do arquivo é obrigatório.');
    }

    if (!body?.arquivoUrl) {
      throw new BadRequestException('Arquivo é obrigatório.');
    }

    /*
     * ================================
     * Permissão RH
     * ================================
     */

    const roles = Array.isArray(user?.roles) ? user.roles : [];

    const podeDisponibilizar =
      roles.includes('PESSOAS_E_CULTURA') || roles.includes('ADMIN');

    if (!podeDisponibilizar) {
      throw new ForbiddenException(
        'Você não possui permissão para disponibilizar documentos de férias.',
      );
    }

    /*
     * ================================
     * Busca parcela
     * ================================
     */

    const parcela = await this.prisma.parcelaFerias.findUnique({
      where: {
        id: body.parcelaId,
      },

      include: {
        SolicitacaoFerias: {
          include: {
            PeriodoAquisitivoFerias: {
              include: {
                UsuarioChat: {
                  select: {
                    id: true,
                    usuario: true,
                    nome: true,
                    email: true,
                    empresa: true,
                    departamento: true,
                    cargo: true,
                  },
                },
              },
            },
          },
        },

        DocumentoFerias: true,
      },
    });

    if (!parcela) {
      throw new BadRequestException('Parcela de férias não encontrada.');
    }

    const solicitacao = parcela.SolicitacaoFerias;

    /*
     * ================================
     * Valida solicitação
     * ================================
     */

    if (
      solicitacao.status !== 'APROVADO' &&
      solicitacao.status !== 'EM_ANDAMENTO'
    ) {
      throw new BadRequestException(
        'O documento só pode ser disponibilizado para uma solicitação aprovada.',
      );
    }

    /*
     * ================================
     * Valida parcela
     * ================================
     */

    if (
      parcela.status === 'CANCELADO' ||
      parcela.status === 'FERIAS_RETIRADAS'
    ) {
      throw new BadRequestException(
        'Não é possível disponibilizar documento para esta parcela.',
      );
    }

    /*
     * ================================
     * Verifica documento existente
     * ================================
     */

    const documentoExistente = parcela.DocumentoFerias.find(
      (documento) => documento.tipoDocumento === 'AVISO_FERIAS',
    );

    if (documentoExistente) {
      throw new BadRequestException(
        'Já existe um documento de férias disponibilizado para esta parcela.',
      );
    }

    /*
     * ================================
     * Transaction
     * ================================
     */

    const documento = await this.prisma.$transaction(async (tx) => {
      const novoDocumento = await tx.documentoFerias.create({
        data: {
          parcelaId: parcela.id,

          tipoDocumento: 'AVISO_FERIAS',

          nomeArquivo: body.nomeArquivo,

          arquivoUrl: body.arquivoUrl,

          mimeType: body.mimeType ?? null,

          tamanho: body.tamanho ? Number(body.tamanho) : null,

          geradoAutomaticamente: body.geradoAutomaticamente === true,

          disponibilizadoEm: new Date(),

          uploadedPorUsuario: user?.sam ?? null,

          uploadedPorNome: user?.name ?? null,
        },
      });

      await tx.parcelaFerias.update({
        where: {
          id: parcela.id,
        },

        data: {
          status: 'DOCUMENTO_DISPONIVEL',
        },
      });

      await tx.historicoSolicitacaoFerias.create({
        data: {
          solicitacaoId: solicitacao.id,

          tipoEvento: 'DOCUMENTO_DISPONIBILIZADO',

          descricao: `Documento de férias disponibilizado para o período ${parcela.ordem}.`,

          statusAnterior: parcela.status,

          statusNovo: 'DOCUMENTO_DISPONIVEL',

          responsavelUsuario: user?.sam ?? null,

          responsavelNome: user?.name ?? null,

          responsavelEmail: user?.mail ?? null,

          ipAddress: ip,

          dadosAnteriores: {
            parcelaId: parcela.id,

            ordem: parcela.ordem,

            status: parcela.status,
          },

          dadosNovos: {
            parcelaId: parcela.id,

            ordem: parcela.ordem,

            status: 'DOCUMENTO_DISPONIVEL',

            documento: {
              id: novoDocumento.id,

              nomeArquivo: novoDocumento.nomeArquivo,

              tipoDocumento: novoDocumento.tipoDocumento,

              arquivoUrl: novoDocumento.arquivoUrl,

              disponibilizadoEm: novoDocumento.disponibilizadoEm,
            },
          },
        },
      });

      return novoDocumento;
    });

    return {
      message: 'Documento disponibilizado com sucesso.',

      documento,
    };
  }

  async enviarDocumentoAssinado(body: any, ip: string, user: any) {
    if (!body?.parcelaId) {
      throw new BadRequestException('Parcela de férias é obrigatória.');
    }

    if (!body?.nomeArquivo) {
      throw new BadRequestException('Nome do arquivo é obrigatório.');
    }

    if (!body?.arquivoUrl) {
      throw new BadRequestException('Arquivo assinado é obrigatório.');
    }

    /*
     * ================================
     * Usuário autenticado
     * ================================
     */

    const usuarioAd = user?.sam;

    if (!usuarioAd) {
      throw new BadRequestException(
        'Não foi possível identificar o usuário autenticado.',
      );
    }

    /*
     * ================================
     * Busca parcela
     * ================================
     */

    const parcela = await this.prisma.parcelaFerias.findUnique({
      where: {
        id: body.parcelaId,
      },

      include: {
        SolicitacaoFerias: {
          include: {
            PeriodoAquisitivoFerias: {
              include: {
                UsuarioChat: {
                  select: {
                    id: true,
                    usuario: true,
                    nome: true,
                    email: true,
                    empresa: true,
                    departamento: true,
                    cargo: true,
                  },
                },
              },
            },
          },
        },

        DocumentoFerias: true,
      },
    });

    if (!parcela) {
      throw new BadRequestException('Parcela de férias não encontrada.');
    }

    const solicitacao = parcela.SolicitacaoFerias;

    const colaborador = solicitacao.PeriodoAquisitivoFerias.UsuarioChat;

    /*
     * ================================
     * Garante que é o próprio colaborador
     * ================================
     */

    const usuarioSolicitacao = String(colaborador.usuario || '')
      .trim()
      .toLowerCase();

    const usuarioAutenticado = String(usuarioAd).trim().toLowerCase();

    if (usuarioSolicitacao !== usuarioAutenticado) {
      throw new ForbiddenException(
        'Somente o colaborador responsável pelas férias pode enviar o documento assinado.',
      );
    }

    /*
     * ================================
     * Valida status
     * ================================
     */

    if (parcela.status !== 'DOCUMENTO_DISPONIVEL') {
      throw new BadRequestException(
        'O documento assinado só pode ser enviado quando o documento de férias estiver disponível.',
      );
    }

    /*
     * ================================
     * Confirma documento original
     * ================================
     */

    const documentoOriginal = parcela.DocumentoFerias.find(
      (documento) => documento.tipoDocumento === 'AVISO_FERIAS',
    );

    if (!documentoOriginal) {
      throw new BadRequestException(
        'O documento original de férias não foi encontrado.',
      );
    }

    /*
     * ================================
     * Evita duplicidade
     * ================================
     */

    const documentoAssinadoExistente = parcela.DocumentoFerias.find(
      (documento) => documento.tipoDocumento === 'AVISO_FERIAS_ASSINADO',
    );

    if (documentoAssinadoExistente) {
      throw new BadRequestException(
        'Já existe um documento assinado para esta parcela.',
      );
    }

    const assinadoEm = new Date();

    /*
     * ================================
     * Transaction
     * ================================
     */

    const documento = await this.prisma.$transaction(async (tx) => {
      /*
       * Cria documento assinado
       */
      const novoDocumento = await tx.documentoFerias.create({
        data: {
          parcelaId: parcela.id,

          tipoDocumento: 'AVISO_FERIAS_ASSINADO',

          nomeArquivo: body.nomeArquivo,

          arquivoUrl: body.arquivoUrl,

          mimeType: body.mimeType ?? null,

          tamanho: body.tamanho ? Number(body.tamanho) : null,

          geradoAutomaticamente: false,

          assinadoEm,

          uploadedPorUsuario: usuarioAd,

          uploadedPorNome: user?.name ?? colaborador.nome,
        },
      });

      /*
       * Atualiza parcela
       */
      await tx.parcelaFerias.update({
        where: {
          id: parcela.id,
        },

        data: {
          status: 'DOCUMENTO_ASSINADO',
        },
      });

      /*
       * Histórico
       */
      await tx.historicoSolicitacaoFerias.create({
        data: {
          solicitacaoId: solicitacao.id,

          tipoEvento: 'DOCUMENTO_ASSINADO',

          descricao: `Documento assinado enviado pelo colaborador para o período ${parcela.ordem}.`,

          statusAnterior: parcela.status,

          statusNovo: 'DOCUMENTO_ASSINADO',

          responsavelUsuario: usuarioAd,

          responsavelNome: user?.name ?? colaborador.nome,

          responsavelEmail: user?.mail ?? colaborador.email,

          ipAddress: ip,

          dadosAnteriores: {
            parcelaId: parcela.id,

            ordem: parcela.ordem,

            status: parcela.status,

            documentoOriginal: {
              id: documentoOriginal.id,

              nomeArquivo: documentoOriginal.nomeArquivo,
            },
          },

          dadosNovos: {
            parcelaId: parcela.id,

            ordem: parcela.ordem,

            status: 'DOCUMENTO_ASSINADO',

            documentoAssinado: {
              id: novoDocumento.id,

              nomeArquivo: novoDocumento.nomeArquivo,

              tipoDocumento: novoDocumento.tipoDocumento,

              arquivoUrl: novoDocumento.arquivoUrl,

              assinadoEm: novoDocumento.assinadoEm,
            },
          },
        },
      });

      return novoDocumento;
    });

    return {
      message: 'Documento assinado enviado com sucesso.',

      documento,
    };
  }
}
