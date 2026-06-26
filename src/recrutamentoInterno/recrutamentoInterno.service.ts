import { BadRequestException, Injectable } from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class RecrutamentoInternoService {
  constructor(private readonly prisma: PrismaService) {}

  async create(body: any, ip: string, user: any) {
    const create = await this.prisma.recrutamentoInterno.create({
      data: {
        vaga: body.vaga,
        descricao: body.descricao,
        requisitos: body.requisitos,
        diferenciais: body.diferenciais,
        beneficios: body.beneficios,
        departamento: body.departamento,
        filial: body.filial,
        modalidade: body.modalidade,
        senioridade: body.senioridade,
        quantidadeVagas: body.quantidadeVagas
          ? Number(body.quantidadeVagas)
          : 1,
        dataLimite: body.dataLimite ? new Date(body.dataLimite) : null,
        dataInicio: body.dataInicio ? new Date(body.dataInicio) : null,
        gestorResponsavel: body.gestorResponsavel,
        emailContato: body.emailContato,
        ativo:
          body.ativo === true ||
          body.ativo === 'true' ||
          body.ativo === undefined,
      },
    });

    await this.prisma.audit_logs.create({
      data: {
        acao: `Criou a vaga interna ${create.vaga}`,
        entidade: user?.name,
        filialEntidade: user?.company,
        ipAddress: ip,
      },
    });

    return create;
  }

  async findByFilter(body: any) {
    const page = Number(body?.page) > 0 ? Number(body.page) : 1;
    const limit = Number(body?.limit) > 0 ? Number(body.limit) : 10;

    const skip = (page - 1) * limit;

    const where: any = {};

    if (body.ativo === true || body.ativo === 'true') {
      where.ativo = true;
    }

    if (body.ativo === false || body.ativo === 'false') {
      where.ativo = false;
    }

    if (body.departamento) {
      where.departamento = {
        contains: body.departamento,
        mode: 'insensitive',
      };
    }

    if (body.filial) {
      where.filial = {
        contains: body.filial,
        mode: 'insensitive',
      };
    }

    if (body.modalidade) {
      where.modalidade = {
        contains: body.modalidade,
        mode: 'insensitive',
      };
    }

    if (body.senioridade) {
      where.senioridade = {
        contains: body.senioridade,
        mode: 'insensitive',
      };
    }

    if (body.pesquisa) {
      where.OR = [
        {
          vaga: {
            contains: body.pesquisa,
            mode: 'insensitive',
          },
        },
        {
          descricao: {
            contains: body.pesquisa,
            mode: 'insensitive',
          },
        },
        {
          requisitos: {
            contains: body.pesquisa,
            mode: 'insensitive',
          },
        },
        {
          diferenciais: {
            contains: body.pesquisa,
            mode: 'insensitive',
          },
        },
        {
          departamento: {
            contains: body.pesquisa,
            mode: 'insensitive',
          },
        },
        {
          filial: {
            contains: body.pesquisa,
            mode: 'insensitive',
          },
        },
        {
          modalidade: {
            contains: body.pesquisa,
            mode: 'insensitive',
          },
        },
        {
          senioridade: {
            contains: body.pesquisa,
            mode: 'insensitive',
          },
        },
      ];
    }

    const result = await this.prisma.recrutamentoInterno.findMany({
      where,
      skip,
      include: {
        RecrutamentoInternoCandidato: true,
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    const total = await this.prisma.recrutamentoInterno.count({
      where,
    });

    return { result, total };
  }

  async update(body: any, ip: string, user: any) {
    const { id, ...data } = body;

    if (!id) {
      throw new BadRequestException('ID da vaga é obrigatório.');
    }

    const vaga = await this.prisma.recrutamentoInterno.findUnique({
      where: {
        id,
      },
    });

    if (!vaga) {
      throw new BadRequestException('Vaga interna não encontrada.');
    }

    const patch = await this.prisma.recrutamentoInterno.update({
      where: {
        id,
      },
      data: {
        ...data,
        quantidadeVagas: data.quantidadeVagas
          ? Number(data.quantidadeVagas)
          : undefined,
        dataLimite: data.dataLimite ? new Date(data.dataLimite) : undefined,
        dataInicio: data.dataInicio ? new Date(data.dataInicio) : undefined,
      },
    });

    await this.prisma.audit_logs.create({
      data: {
        acao: `Atualizou a vaga interna ${patch.vaga}`,
        entidade: user?.name,
        filialEntidade: user?.company,
        ipAddress: ip,
      },
    });

    return patch;
  }

  async countRecrutamentosCriados(body: any) {
    const hoje = new Date();

    const primeiroDiaMesAtual = new Date(
      hoje.getFullYear(),
      hoje.getMonth(),
      1,
    );

    const primeiroDiaMesPassado = new Date(
      hoje.getFullYear(),
      hoje.getMonth() - 1,
      1,
    );

    const total = await this.prisma.recrutamentoInterno.count({
      where: {
        createdAt: {
          gte: primeiroDiaMesPassado,
          lt: primeiroDiaMesAtual,
        },
      },
    });

    const abertas = await this.prisma.recrutamentoInterno.count({
      where: {
        createdAt: {
          gte: primeiroDiaMesPassado,
          lt: primeiroDiaMesAtual,
        },
        dataLimite: {
          gte: hoje,
        },
      },
    });

    const fechadas = await this.prisma.recrutamentoInterno.count({
      where: {
        createdAt: {
          gte: primeiroDiaMesPassado,
          lt: primeiroDiaMesAtual,
        },
        dataLimite: {
          lt: hoje,
        },
      },
    });

    return {
      mesReferencia: `${primeiroDiaMesPassado.getFullYear()}-${String(
        primeiroDiaMesPassado.getMonth() + 1,
      ).padStart(2, '0')}`,
      total,
      abertas,
      fechadas,
    };
  }
}
