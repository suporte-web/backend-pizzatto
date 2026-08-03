import { PrismaService } from "@/prisma/prisma.service";
import { BadRequestException, Injectable } from "@nestjs/common";
import { Prisma } from "../../generated/prisma/client";

@Injectable()
export class CasesSucessoService {
  constructor(private readonly prisma: PrismaService) {}

  async createCasesSucesso(
    body: any,
    files: Express.Multer.File[] = [],
  ) {
    const titulo = String(body.titulo ?? '').trim();
    const descricao = String(body.descricao ?? '').trim();

    if (!titulo) {
      throw new BadRequestException('O título do case é obrigatório.');
    }

    const arquivos = files.map((file) => ({
      nomeOriginal: file.originalname,
      nomeSalvo: file.filename,
      caminho: `/downloads/recrutamento-interno/cases/${file.filename}`,
      mimeType: file.mimetype,
      tamanho: file.size,
    }));

    return this.prisma.recrutamentoInternoCasesSucesso.create({
      data: {
        titulo,
        descricao: descricao || null,
        arquivos: arquivos as Prisma.InputJsonValue,
        criadoPorId: body.criadoPorId?.trim() || null,
        criadoPor: body.criadoPor?.trim() || null,
        ativo: true,
      },
    });
  }

  async findByFilterCasesSucesso(body: any) {
    const pesquisa = String(body.pesquisa ?? '').trim();
    const page = Math.max(Number(body.page) || 1, 1);
    const limit = Math.max(Number(body.limit) || 10, 1);
    const skip = (page - 1) * limit;

    const where: Prisma.RecrutamentoInternoCasesSucessoWhereInput = {};

    if (pesquisa) {
      where.OR = [
        {
          titulo: {
            contains: pesquisa,
            mode: 'insensitive',
          },
        },
        {
          descricao: {
            contains: pesquisa,
            mode: 'insensitive',
          },
        },
      ];
    }

    if (typeof body.ativo === 'boolean') {
      where.ativo = body.ativo;
    }

    const [result, total] = await this.prisma.$transaction([
      this.prisma.recrutamentoInternoCasesSucesso.findMany({
        where,
        skip,
        take: limit,
        orderBy: {
          createdAt: 'desc',
        },
      }),

      this.prisma.recrutamentoInternoCasesSucesso.count({
        where,
      }),
    ]);

    return {
      result,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }
}