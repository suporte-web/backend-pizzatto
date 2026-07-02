import { PrismaService } from '@/prisma/prisma.service';
import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '../../generated/prisma/browser';

export function fixFileName(name: string) {
  return Buffer.from(name, 'latin1').toString('utf8').normalize('NFC');
}

@Injectable()
export class RecrutamentoInternoCandidatoService {
  constructor(private readonly prisma: PrismaService) {}

  async create(
    body: any,
    curriculo: Express.Multer.File,
    ip: string,
    user: any,
  ) {
    const usuario = await this.prisma.usuarioChat.findUnique({
      where: {
        adObjectGuid: user.adObjectGuid,
      },
    });

    if (!usuario) {
      throw new NotFoundException('Usuário não encontrado.');
    }

    const candidatoExistente =
      await this.prisma.recrutamentoInternoCandidato.findUnique({
        where: {
          recrutamentoId_colaboradorId: {
            recrutamentoId: body.recrutamentoId,
            colaboradorId: usuario.id,
          },
        },
      });

    if (candidatoExistente) {
      throw new ConflictException('Você já está inscrito nesta vaga.');
    }

    const arquivoCurriculo = curriculo
      ? {
          nomeOriginal: fixFileName(curriculo.originalname),
          nomeSalvo: curriculo.filename,
          caminho: `/downloads/curriculos-recrutamento/${curriculo.filename}`,
          mimeType: curriculo.mimetype,
          tamanho: curriculo.size,
        }
      : Prisma.JsonNull;

    const create = await this.prisma.recrutamentoInternoCandidato.create({
      data: {
        recrutamentoId: body.recrutamentoId,
        colaboradorId: usuario.id,
        resumoProfissional: body.resumoProfissional || null,
        curriculo: arquivoCurriculo,
      },
    });

    await this.prisma.audit_logs.create({
      data: {
        acao: `Criou o Candidato para a Vaga Interna ${create.id}`,
        entidade: user?.name,
        filialEntidade: user?.company,
        ipAddress: ip,
      },
    });

    return create;
  }

  async findByCandidato(adObjectGuid: string) {
    const usuario = await this.prisma.usuarioChat.findUnique({
      where: { adObjectGuid },
    });

    if (!usuario) {
      return [];
    }

    return await this.prisma.recrutamentoInternoCandidato.findMany({
      where: {
        colaboradorId: usuario.id,
      },
    });
  }

  async findByRecrutamento(idRecrutamento: string) {
    return await this.prisma.recrutamentoInternoCandidato.findMany({
      where: {
        recrutamentoId: idRecrutamento,
      },
      include: {
        UsuarioChat: true,
        RecrutamentoInternoCandidatoObservacao: {
          include: {
            UsuarioChat: true,
          },
          orderBy: {
            createdAt: 'desc',
          },
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
    });
  }

  async update(body: any, ip: string, user: any) {
    const usuario = await this.prisma.usuarioChat.findUnique({
      where: {
        adObjectGuid: user.adObjectGuid,
      },
    });

    if (!usuario) {
      throw new NotFoundException('Usuário não encontrado.');
    }

    const upd = await this.prisma.recrutamentoInternoCandidato.update({
      where: { id: body.id },
      data: {
        status: body.status,
        dataEntrevista: body.dataEntrevista || null,
        motivoReprovacao: body.motivoReprovacao || null,
      },
    });

    if (body.observacao?.trim()) {
      await this.prisma.recrutamentoInternoCandidatoObservacao.create({
        data: {
          candidaturaId: upd.id,
          criadoPorId: usuario.id,
          observacao: body.observacao.trim(),
        },
      });
    }

    await this.prisma.audit_logs.create({
      data: {
        acao: `Atualizou as informações do Candidato ${upd.id}`,
        entidade: user?.name,
        filialEntidade: user?.company,
        ipAddress: ip,
      },
    });

    return await this.prisma.recrutamentoInternoCandidato.findUnique({
      where: {
        id: upd.id,
      },
      include: {
        UsuarioChat: true,
        RecrutamentoInternoCandidatoObservacao: {
          include: {
            UsuarioChat: true,
          },
          orderBy: {
            createdAt: 'desc',
          },
        },
      },
    });
  }

  async countCandidatosInscritos(body: any) {
    const [ano, mes] = body.data.split('-').map(Number);

    const primeiroDiaMes = new Date(ano, mes - 1, 1);
    const primeiroDiaProximoMes = new Date(ano, mes, 1);

    const wherePeriodo = {
      createdAt: {
        gte: primeiroDiaMes,
        lt: primeiroDiaProximoMes,
      },
    };

    const total = await this.prisma.recrutamentoInternoCandidato.count({
      where: wherePeriodo,
    });

    const aprovados = await this.prisma.recrutamentoInternoCandidato.count({
      where: {
        ...wherePeriodo,
        status: 'APROVADO',
      },
    });

    const reprovados = await this.prisma.recrutamentoInternoCandidato.count({
      where: {
        ...wherePeriodo,
        status: 'REPROVADO',
      },
    });

    const emAberto = await this.prisma.recrutamentoInternoCandidato.count({
      where: {
        ...wherePeriodo,
        OR: [
          { status: 'PENDENTE' },
          { status: 'CONVERSA INICIADA' },
          { status: 'ENTREVISTA MARCADA' },
        ],
      },
    });

    return {
      mesReferencia: body.data,
      total,
      aprovados,
      reprovados,
      emAberto,
    };
  }

  async countMotivosReprovacao(body: any) {
    const [ano, mes] = body.data.split('-').map(Number);

    const primeiroDiaMes = new Date(ano, mes - 1, 1);
    const primeiroDiaProximoMes = new Date(ano, mes, 1);

    const wherePeriodo = {
      createdAt: {
        gte: primeiroDiaMes,
        lt: primeiroDiaProximoMes,
      },
    };

    const motivos = await this.prisma.recrutamentoInternoCandidato.groupBy({
      by: ['motivoReprovacao'],
      where: {
        ...wherePeriodo,
        motivoReprovacao: {
          not: null, // ignora registros sem motivo
        },
      },
      _count: {
        motivoReprovacao: true,
      },
      orderBy: {
        _count: {
          motivoReprovacao: 'desc',
        },
      },
    });

    return motivos.map((item) => ({
      nome: item.motivoReprovacao,
      quantidade: item._count.motivoReprovacao,
    }));
  }
}
