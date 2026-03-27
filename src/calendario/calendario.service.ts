import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';

@Injectable()
export class CalendarioService {
  constructor(private readonly prisma: PrismaService) {}

  async create(body: any, ip: string, user: any) {
    const find = await this.prisma.calendario.findFirst({
      where: {
        horario: body.horario,
        data: body.data,
        departamento: { hasSome: body.departamento },
      },
    });

    if (find) {
      throw new BadRequestException(
        'Não é possivel cadastrar outro Evento, em Area e Horarios ja preenchidos',
      );
    }

    const create = await this.prisma.calendario.create({
      data: {
        nome: body.nome,
        horario: body.horario,
        data: body.data,
        departamento: body.departamento,
        local: body.local,
        descricao: body.descricao,
        criadoPor: user?.name,
      },
    });

    await this.prisma.audit_logs.create({
      data: {
        acao: `Criou no Calendário o Evento ${create.nome}`,
        entidade: user?.name,
        filialEntidade: user?.company,
        ipAddress: ip,
      },
    });
  }

  async findByFilter(body: any) {
    const baseDate = new Date(body.data);

    const firstDayCurrentMonth = new Date(
      baseDate.getFullYear(),
      baseDate.getMonth(),
      1,
      0,
      0,
      0,
      0,
    );

    const lastDayCurrentMonth = new Date(
      baseDate.getFullYear(),
      baseDate.getMonth() + 1,
      0,
      23,
      59,
      59,
      999,
    );

    const where: any = {
      data: {
        gte: firstDayCurrentMonth.toISOString(),
        lte: lastDayCurrentMonth.toISOString(),
      },
    };

    if (body.departamento) {
      where.departamento = body.departamento;
    }

    if (body.pesquisa) {
      where.OR = [
        {
          nome: {
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
          local: {
            contains: body.pesquisa,
            mode: 'insensitive',
          },
        },
      ];
    }

    const result = await this.prisma.calendario.findMany({
      where,
    });
    const total = await this.prisma.calendario.count({
      where,
    });

    return { result, total };
  }
}
