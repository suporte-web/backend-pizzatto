import { BadRequestException, Injectable } from '@nestjs/common';
import moment from 'moment';
import { PrismaService } from 'src/prisma/prisma.service';

@Injectable()
export class PoliticasService {
  constructor(private readonly prisma: PrismaService) {}

  async create(body: any, file: Express.Multer.File, ip: string, user: any) {
    if (!file) {
      throw new BadRequestException('Arquivo de Politica é obrigatória.');
    }

    const caminhoArquivo = `downloads/politicas/${file.filename}`;
    const create = await this.prisma.politicas.create({
      data: {
        nome: body.nome,
        tipoPolitica: body.tipoPolitica,
        departamento: body.departamento,
        descricao: body.descricao,
        responsavel: user?.name,
        criadoPor: user?.name,
        dataUpload: moment().format('YYYY-MM-DD HH:mm'),
        caminhoArquivo,
      },
    });

    await this.prisma.audit_logs.create({
      data: {
        acao: `Criou a Politica ${create.nome}`,
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
        {
          departamento: {
            contains: body.pesquisa,
            mode: 'insensitive',
          },
        },
        {
          tipoPolitica: {
            contains: body.pesquisa,
            mode: 'insensitive',
          },
        },
      ];
    }

    const result = await this.prisma.politicas.findMany({
      where,
    });
    const total = await this.prisma.politicas.count({
      where,
    });

    return { result, total };
  }

  async update(body: any, ip: string, user: any) {
    const patch = await this.prisma.politicas.update({
      where: { id: body.id },
      data: body,
    });

    return await this.prisma.audit_logs.create({
      data: {
        acao: `Atualizou a Politica ${patch.nome}`,
        entidade: user?.name,
        filialEntidade: user?.company,
        ipAddress: ip,
      },
    });
  }

  async findPoliticaLiberadaVisualizacao() {
    return await this.prisma.politicas.findMany({
      where: {
        liberadoVisualizacao: true,
      },
    });
  }

  async findAllAceitesByUser(user: any) {
    const politicas = await this.prisma.politicas.findMany({
      where: {
        liberadoVisualizacao: true,

        // 👇 aqui está o segredo
        PoliticaAceites: {
          none: {
            colaborador: user?.name,
          },
        },
      },
    });

    return politicas;
  }
}
