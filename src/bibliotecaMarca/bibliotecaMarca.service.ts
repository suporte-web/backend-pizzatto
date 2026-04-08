import { PrismaService } from '@/prisma/prisma.service';
import { Injectable } from '@nestjs/common';

@Injectable()
export class BibliotecaMarcaService {
  constructor(private readonly prisma: PrismaService) {}

  async create(body: any, file: Express.Multer.File, ip: string, user: any) {
    let caminhoArquivo = '';
    if (file) {
      caminhoArquivo = `/downloads/arquivo-biblioteca/${file.filename}`;
    }

    const create = await this.prisma.bibliotecaMarca.create({
      data: {
        nome: body.nome,
        caminhoArquivo: caminhoArquivo,
        descricao: body.descricao,
      },
    });

    await this.prisma.audit_logs.create({
      data: {
        acao: `Criou a Informação na Biblioteca Página ${create.nome}`,
        entidade: user?.name,
        filialEntidade: user?.company,
        ipAddress: ip,
      },
    });
  }

  async findByFilter(body: any) {
    const where: any = {};

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
}
