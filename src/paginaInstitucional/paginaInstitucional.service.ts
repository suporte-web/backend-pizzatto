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
    const arquivos =
      imagens?.map((img) => ({
        nomeOriginal: img.originalname,
        nomeSalvo: img.filename,
        caminho: `/downloads/imagens-pagina-institucional/${img.filename}`,
        mimeType: img.mimetype,
        tamanho: img.size,
      })) || [];

    const create = await this.prisma.paginaInstitucional.create({
      data: {
        titulo: body.titulo,
        descricao: body.descricao,
        arquivos,
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

    if (body.status === true || body.status === 'true') {
      where.status = true;
    }

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
    const { id, titulo, descricao, imagensAtuais } = body;

    const novosArquivos: any[] =
      imagens?.map((img) => ({
        nomeOriginal: img.originalname,
        nomeSalvo: img.filename,
        caminho: `/downloads/imagens-pagina-institucional/${img.filename}`,
        mimeType: img.mimetype,
        tamanho: img.size,
      })) || [];

    const paginaAtual = await this.prisma.paginaInstitucional.findUnique({
      where: { id },
    });

    if (!paginaAtual) {
      throw new Error('Página institucional não encontrada');
    }

    let arquivosAtuais: any[] = [];

    if (Array.isArray(imagensAtuais)) {
      arquivosAtuais = imagensAtuais.map((item) => JSON.parse(item));
    } else if (imagensAtuais) {
      arquivosAtuais = [JSON.parse(imagensAtuais)];
    } else {
      arquivosAtuais = (paginaAtual.arquivos || []).filter(
        (item) => item !== null,
      );
    }

    const arquivosFinal = [...arquivosAtuais, ...novosArquivos];

    const upd = await this.prisma.paginaInstitucional.update({
      where: { id },
      data: {
        titulo,
        descricao,
        arquivos: arquivosFinal as any,
        dataAtualizacao: new Date().toISOString(),
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

  async ativarInativarPagina(body: any, ip: string, user: any) {
    const upd = await this.prisma.paginaInstitucional.update({
      where: { id: body.id },
      data: { status: body.status },
    });

    await this.prisma.audit_logs.create({
      data: {
        acao: `${body.status === true ? 'Ativou' : 'Inativou'} as Informações na Página Institucional ${upd.titulo}`,
        entidade: user?.name,
        filialEntidade: user?.company,
        ipAddress: ip,
      },
    });

    return upd;
  }
}
