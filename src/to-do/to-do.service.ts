import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class ToDoService {
  constructor(private readonly prisma: PrismaService) {}

  async create(body: any) {
    const find = await this.prisma.toDo.findFirst({
      where: {
        nome: body.nome,
      },
    });

    if (find) {
      throw new BadRequestException('Item a Fazer ja existe na Lista!');
    }

    return await this.prisma.toDo.create({
      data: body,
    });
  }

  async findAll() {
    return await this.prisma.toDo.findMany({
      orderBy: {
        createdAt: 'asc',
      },
    });
  }

  async findOne(id: string) {
    return await this.prisma.toDo.findUnique({
      where: {
        id,
      },
    });
  }

  async update(id: string, body: any) {
    return await this.prisma.toDo.update({
      where: {
        id,
      },
      data: body,
    });
  }

  async delete(id: string) {
    return await this.prisma.toDo.delete({
      where: {
        id,
      },
    });
  }

  async findByFilter(body: any) {
    const { pesquisa, page = 1, limit = 10, finalizado, responsavel } = body;

    const skip = (page - 1) * limit;

    const where: any = {
      AND: [],
    };

    if (pesquisa) {
      where.AND.push({
        OR: [
          { nome: { contains: pesquisa, mode: 'insensitive' } },
          { descricao: { contains: pesquisa, mode: 'insensitive' } },
          { responsavel: { contains: pesquisa, mode: 'insensitive' } },
        ],
      });
    }

    if (finalizado === true) {
      where.AND.push({
        finalizado: true,
      });
    } else if (finalizado === false) {
      where.AND.push({
        finalizado: false,
      });
    }

    if (responsavel) {
      where.AND.push({
        responsavel: {
          contains: responsavel,
          mode: 'insensitive',
        },
      });
    }

    if (where.AND.length === 0) {
      delete where.AND;
    }

    const [result, total] = await Promise.all([
      this.prisma.toDo.findMany({
        where,
        skip,
        take: limit,
        orderBy: {
          createdAt: 'asc',
        },
      }),
      this.prisma.toDo.count({
        where,
      }),
    ]);

    return { result, total };
  }
}
