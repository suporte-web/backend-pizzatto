import { PrismaService } from '@/prisma/prisma.service';
import { Injectable, NotFoundException } from '@nestjs/common';

@Injectable()
export class MotivosReprovacaoService {
  constructor(private readonly prisma: PrismaService) {}

  async create(body: any, ip: string, user: any) {
    const motivo = await this.prisma.motivosReprovacao.findUnique({
      where: {
        nome: body.nome,
      },
    });

    if (motivo) {
      throw new NotFoundException('Motivo ja existe.');
    }

    const create = await this.prisma.motivosReprovacao.create({
      data: {
        nome: body.nome,
      },
    });

    await this.prisma.audit_logs.create({
      data: {
        acao: `Criou o Motivo de Reprovação ${create.id}`,
        entidade: user?.name,
        filialEntidade: user?.company,
        ipAddress: ip,
      },
    });

    return create;
  }

  async findAllAtivos() {
    return await this.prisma.motivosReprovacao.findMany({
      where: { ativo: true },
    });
  }

  async findByFilter(body: any) {
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

    const result = await this.prisma.motivosReprovacao.findMany({
      where,
      skip,
      take: limit,
      orderBy: {
        nome: 'asc',
      },
    });

    const total = await this.prisma.motivosReprovacao.count({
      where,
    });

    return {
      result,
      total,
    };
  }

  async update(body: any, ip: string, user: any) {
    const upd = await this.prisma.motivosReprovacao.update({
      where: {
        id: body.id,
      },
      data: {
        nome: body.nome,
        ativo: body.ativo,
      },
    });

    await this.prisma.audit_logs.create({
      data: {
        acao: `Atualizou o Motivo de Reprovação ${upd.nome}`,
        entidade: user?.name,
        filialEntidade: user?.company,
        ipAddress: ip,
      },
    });

    return upd;
  }
}
