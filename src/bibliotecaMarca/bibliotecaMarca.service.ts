import { PrismaService } from '@/prisma/prisma.service';
import { Injectable } from '@nestjs/common';

export function fixFileName(name: string) {
  return Buffer.from(name, 'latin1').toString('utf8').normalize('NFC');
}

@Injectable()
export class BibliotecaMarcaService {
  constructor(private readonly prisma: PrismaService) {}

  async create(body: any, files: Express.Multer.File[], ip: string, user: any) {
    const arquivos =
      files?.map((file) => ({
        nomeOriginal: fixFileName(file.originalname),
        nomeSalvo: file.filename,
        caminho: `/downloads/arquivo-biblioteca/${file.filename}`,
        mimeType: file.mimetype,
        tamanho: file.size,
      })) || [];

    const create = await this.prisma.bibliotecaMarca.create({
      data: {
        nome: body.nome,
        arquivos,
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

    return create;
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
      orderBy: {
        createdAt: 'desc',
      },
    });

    const total = await this.prisma.bibliotecaMarca.count({
      where,
    });

    return { result, total };
  }

  async update(body: any, files: Express.Multer.File[], ip: string, user: any) {
    const arquivosExistentes = Array.isArray(body.arquivosExistentes)
      ? body.arquivosExistentes.map((item) => JSON.parse(item))
      : body.arquivosExistentes
        ? [JSON.parse(body.arquivosExistentes)]
        : [];

    const novosArquivos =
      files?.map((file) => ({
        nomeOriginal: fixFileName(file.originalname),
        nomeSalvo: file.filename,
        caminho: `/downloads/arquivo-biblioteca/${file.filename}`,
        mimeType: file.mimetype,
        tamanho: file.size,
      })) || [];

    const arquivos = [...arquivosExistentes, ...novosArquivos];

    const upd = await this.prisma.bibliotecaMarca.update({
      where: {
        id: body.id,
      },
      data: {
        nome: body.nome,
        descricao: body.descricao,
        arquivos,
      },
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