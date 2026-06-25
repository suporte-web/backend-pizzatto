import { PrismaService } from '@/prisma/prisma.service';
import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

@Injectable()
export class RecrutamentoInternoCandidatoService {
  constructor(private readonly prisma: PrismaService) {}

  async create(body: any, ip: string, user: any) {
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

    const create = await this.prisma.recrutamentoInternoCandidato.create({
      data: {
        recrutamentoId: body.recrutamentoId,
        colaboradorId: usuario.id,
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
}
