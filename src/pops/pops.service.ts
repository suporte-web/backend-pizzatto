import {
  BadRequestException,
  Injectable,
} from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service';

import * as fs from 'fs';

@Injectable()
export class PopService {
  constructor(private readonly prisma: PrismaService) {}

  async create(
    body: any,
    file: Express.Multer.File,
    ip: string,
    user: any,
  ) {
    if (!file) {
      throw new BadRequestException(
        'Arquivo do Pop é obrigatória.',
      );
    }

    const create = await this.prisma.pops.create({
      data: {
        filename: file.filename,
        originalName: file.originalname,
        mimetype: file.mimetype,
        size: String(file.size),
        filePath: `downloads/pops/${file.filename}`,
        folder: 'pops',
        departamento: user?.department,
        criadoPor: user?.sam,
      },
    });

    await this.prisma.audit_logs.create({
      data: {
        acao: `Criou a POP ${file.originalname}`,
        entidade: user?.name,
        filialEntidade: user?.company,
        ipAddress: ip,
      },
    });

    return create;
  }

  async update(body: any) {
    return await this.prisma.pops.update({
      where: {
        id: body.id,
      },

      data: {
        originalName: body.originalName,
        departamento: body.departamento,
      },
    });
  }

  async delete(id: string) {
    const pop = await this.prisma.pops.findUnique({
      where: { id },
    });

    if (!pop) {
      throw new BadRequestException(
        'POP não encontrada',
      );
    }

    try {
      if (pop.filePath && fs.existsSync(pop.filePath)) {
        fs.unlinkSync(pop.filePath);
      }
    } catch (error) {
      console.log(error);
    }

    return await this.prisma.pops.delete({
      where: {
        id,
      },
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
    const {
      nome,
      page = 1,
      limit = 10,
      departamento,
    } = body;

    const skip = (page - 1) * limit;

    const where: any = {};

    if (nome) {
      where.originalName = {
        contains: nome,
        mode: 'insensitive',
      };
    }

    if (departamento) {
      where.departamento = {
        contains: departamento,
        mode: 'insensitive',
      };
    }

    const [result, total] = await Promise.all([
      this.prisma.pops.findMany({
        where,
        skip,
        take: limit,
        orderBy: {
          createdAt: 'desc',
        },
      }),

      this.prisma.pops.count({
        where,
      }),
    ]);

    return {
      result,
      total,
    };
  }
}
