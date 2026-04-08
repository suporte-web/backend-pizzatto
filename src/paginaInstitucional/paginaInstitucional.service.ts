import { PrismaService } from '@/prisma/prisma.service';
import { Injectable } from '@nestjs/common';

@Injectable()
export class PaginaInstitucionalService {
  constructor(private readonly prisma: PrismaService) {}

  async create(
    body: any,
    imagens: Express.Multer.File[],
    ip: string,
    user: any,
  ) {
    const caminhosImagem =
      imagens?.map(
        (img) => `/downloads/imagens-pagina-institucional/${img.filename}`,
      ) || [];

    const create = await this.prisma.paginaInstitucional.create({
      data: {
        titulo: body.titulo,
        descricao: body.descricao,
        caminhoImagem: caminhosImagem,
        dataAtualizacao: new Date().toISOString(),
      },
    });

    await this.prisma.audit_logs.create({
      data: {
        acao: `Criou a Informação na Página Institucional ${create.titulo}`,
        entidade: user?.name,
        filialEntidade: user?.company,
        ipAddress: ip,
      },
    });

    return create;
  }

  async findByFilter(body: any) {
    const where: any = {};

    if (body.pesquisa) {
      where.OR = [
        {
          titulo: {
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

    const result = await this.prisma.paginaInstitucional.findMany({
      where,
    });
    const total = await this.prisma.paginaInstitucional.count({
      where,
    });

    return { result, total };
  }

  async update(
    body: any,
    imagens: Express.Multer.File[],
    ip: string,
    user: any,
  ) {
    
    const { imagensAtuais, ...restoBody } = body;

    const novasImagens =
      imagens?.map(
        (img) => `/downloads/imagens-pagina-institucional/${img.filename}`,
      ) || [];

    const paginaAtual = await this.prisma.paginaInstitucional.findUnique({
      where: { id: body.id },
    });

    if (!paginaAtual) {
      throw new Error('Página institucional não encontrada');
    }

    let caminhoImagemFinal = paginaAtual.caminhoImagem || [];

    if (Array.isArray(imagensAtuais)) {
      // quando o front mandar as imagens restantes após exclusão
      caminhoImagemFinal = [...imagensAtuais, ...novasImagens];
    } else if (novasImagens.length > 0) {
      // quando apenas adicionar novas imagens sem excluir antigas
      caminhoImagemFinal = [...caminhoImagemFinal, ...novasImagens];
    }

    const upd = await this.prisma.paginaInstitucional.update({
      where: { id: body.id },
      data: {
        ...restoBody,
        caminhoImagem: caminhoImagemFinal,
      },
    });

    await this.prisma.audit_logs.create({
      data: {
        acao: `Atualizou as Informações na Página Institucional ${upd.titulo}`,
        entidade: user?.name,
        filialEntidade: user?.company,
        ipAddress: ip,
      },
    });

    return upd;
  }
}
