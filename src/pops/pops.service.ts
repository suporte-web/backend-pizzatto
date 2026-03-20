import { Injectable } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';

@Injectable()
export class PopService {
  constructor(private readonly prisma: PrismaService) {}

  async create(body: any) {
    const find = await this.prisma.pops.findFirst({
      where: {
        originalName: body.originalName,
      },
    });

    if (find) {
      return await this.prisma.pops.update({
        where: {
          id: find.id,
        },
        data: body,
      });
    }

    return await this.prisma.pops.create({
      data: body,
    });
  }

  async findById(id: string) {
    return await this.prisma.pops.findUnique({
      where: {
        id,
      },
    });
  }

  async findByFilter(body: any) {
    const { nome, page = 1, limit = 10 } = body;

    const skip = (page - 1) * limit;

    const where: any = {};

    if (nome) {
      where.originalName = {
        contains: nome,
        mode: 'insensitive',
      };
    }

    const [result, total] = await Promise.all([
      this.prisma.pops.findMany({
        where,
        skip,
        take: limit,
        orderBy: {
          originalName: 'asc',
        },
      }),
      this.prisma.pops.count({
        where,
      }),
    ]);

    return { result, total };
  }
}