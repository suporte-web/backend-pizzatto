import { PrismaService } from '@/prisma/prisma.service';
import { Injectable, NotFoundException } from '@nestjs/common';

@Injectable()
export class BibliotecaMarcaService {
  constructor(private readonly prisma: PrismaService) {}

  async create(body: any, files: Express.Multer.File[], ip: string, user: any) {
    console.log(body);

    const caminhosArquivo =
      files?.map((img) => `/downloads/arquivo-biblioteca/${img.filename}`) ||
      [];

    const create = await this.prisma.bibliotecaMarca.create({
      data: {
        nome: body.nome,
        caminhoArquivo: caminhosArquivo,
        descricao: body.descricao,
      },
    });

    await this.prisma.audit_logs.create({
      data: {
        acao: `Criou a Informação na Biblioteca Página - ${create.nome}`,
        entidade: user?.name,
        filialEntidade: user?.company,
        ipAddress: ip,
      },
    });
  }

  async findByFilter(body: any) {
    const where: any = {};

    if (body.status === true || body.status === 'true') {
      where.status = true;
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
      ];
    }

    const result = await this.prisma.bibliotecaMarca.findMany({
      where,
    });
    const total = await this.prisma.bibliotecaMarca.count({
      where,
    });

    return { result, total };
  }

  async update(body: any, ip: string, user: any) {
    const upd = await this.prisma.bibliotecaMarca.update({
      where: {
        id: body.id,
      },
      data: body,
    });

    await this.prisma.audit_logs.create({
      data: {
        acao: `Atualizou informações na Biblioteca Página - ${upd.nome}`,
        entidade: user?.name,
        filialEntidade: user?.company,
        ipAddress: ip,
      },
    });

    return upd;
  }
}
