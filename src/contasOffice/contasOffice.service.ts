import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { CreateContaOfficeDto } from './dtos/CreateContaOffice.dto';

type FindByFilterDto = {
  pesquisa?: string;
  page?: number;
  limit?: number;
};

@Injectable()
export class ContasOfficeService {
  constructor(private readonly prisma: PrismaService) {}

  async create(body: CreateContaOfficeDto) {
    const email = body.Email?.trim().toLowerCase();
    const nome = body.Nome?.trim();
    const senha = body.Senha?.trim();

    if (!email || !nome || !senha) {
      throw new BadRequestException('Nome, email e senha são obrigatórios');
    }

    const existing = await this.prisma.contasOffice.findFirst({
      where: { email },
    });

    if (existing) {
      throw new BadRequestException('Conta já cadastrada');
    }

    return this.prisma.contasOffice.create({
      data: {
        nome,
        email,
        senha,
        ativo: true,
      },
    });
  }

  async createBySpreadsheet(
    body: CreateContaOfficeDto[] | CreateContaOfficeDto,
  ) {
    if (Array.isArray(body)) {
      return Promise.all(body.map((item) => this.createOrUpdateRecord(item)));
    }

    return this.createOrUpdateRecord(body);
  }

  private async createOrUpdateRecord(data: CreateContaOfficeDto) {
    if (!data) {
      throw new BadRequestException('Dados inválidos');
    }

    const nome = data.Nome?.trim();
    const email = data.Email?.trim().toLowerCase();
    const senha = data.Senha?.trim();

    if (!nome || !email || !senha) {
      throw new BadRequestException('Nome, email e senha são obrigatórios');
    }

    const existingRecord = await this.prisma.contasOffice.findFirst({
      where: { nome },
    });

    if (existingRecord) {
      return this.prisma.contasOffice.update({
        where: { id: existingRecord.id },
        data: {
          nome,
          email,
          senha,
        },
      });
    }

    return this.prisma.contasOffice.create({
      data: {
        nome,
        email,
        senha,
        ativo: true,
      },
    });
  }

  async findAtivos() {
    return this.prisma.contasOffice.findMany({
      where: { ativo: true },
      orderBy: { nome: 'asc' },
    });
  }

  async findAll() {
    return this.prisma.contasOffice.findMany({
      orderBy: { nome: 'asc' },
    });
  }

  async findOne(id: string) {
    const conta = await this.prisma.contasOffice.findUnique({
      where: { id },
    });

    if (!conta) {
      throw new BadRequestException('Conta não encontrada');
    }

    return conta;
  }

  async findByFilter(body: FindByFilterDto) {
    const pesquisa = body?.pesquisa?.trim();
    const page = Number(body?.page) > 0 ? Number(body.page) : 1;
    const limit = Number(body?.limit) > 0 ? Number(body.limit) : 10;

    const skip = (page - 1) * limit;

    const where = pesquisa
      ? {
          OR: [
            {
              nome: {
                contains: pesquisa,
                mode: 'insensitive' as const,
              },
            },
            {
              email: {
                contains: pesquisa,
                mode: 'insensitive' as const,
              },
            },
          ],
        }
      : {};

    const [result, total] = await Promise.all([
      this.prisma.contasOffice.findMany({
        where,
        skip,
        take: limit,
        orderBy: { nome: 'asc' },
      }),
      this.prisma.contasOffice.count({ where }),
    ]);

    return {
      result,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  async update(
    id: string,
    body: Partial<{
      nome: string;
      email: string;
      senha: string;
      ativo: boolean;
    }>,
  ) {
    const existing = await this.prisma.contasOffice.findUnique({
      where: { id },
    });

    if (!existing) {
      throw new BadRequestException('Conta não encontrada');
    }

    return this.prisma.contasOffice.update({
      where: { id },
      data: {
        ...(body.nome !== undefined && { nome: body.nome.trim() }),
        ...(body.email !== undefined && {
          email: body.email.trim().toLowerCase(),
        }),
        ...(body.senha !== undefined && { senha: body.senha.trim() }),
        ...(body.ativo !== undefined && { ativo: body.ativo }),
      },
    });
  }

  async delete(id: string) {
    const existing = await this.prisma.contasOffice.findUnique({
      where: { id },
    });

    if (!existing) {
      throw new BadRequestException('Conta não encontrada');
    }

    return this.prisma.contasOffice.delete({
      where: { id },
    });
  }
}