import { BadRequestException, Injectable } from '@nestjs/common';

import moment from 'moment';

import { PrismaService } from '../prisma/prisma.service';

import * as fs from 'fs';

@Injectable()
export class PoliticasService {
  constructor(private readonly prisma: PrismaService) {}

  async create(
    body: any,
    file: Express.Multer.File,
    ip: string,
    user: any,
  ) {
    if (!file) {
      throw new BadRequestException(
        'Arquivo de Politica é obrigatória.',
      );
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

    return create;
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
      orderBy: {
        createdAt: 'desc',
      },
    });

    const total = await this.prisma.politicas.count({
      where,
    });

    return { result, total };
  }

  async update(body: any, ip: string, user: any) {
    const { id, ...data } = body;

    const patch = await this.prisma.politicas.update({
      where: {
        id,
      },

      data,
    });

    await this.prisma.audit_logs.create({
      data: {
        acao: `Atualizou a Politica ${patch.nome}`,
        entidade: user?.name,
        filialEntidade: user?.company,
        ipAddress: ip,
      },
    });

    return patch;
  }

  async delete(id: string, ip: string, user: any) {
    const politica = await this.prisma.politicas.findUnique({
      where: {
        id,
      },
    });

    if (!politica) {
      throw new BadRequestException(
        'Política não encontrada',
      );
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.politicaAceites.deleteMany({
        where: {
          politicaId: id,
        },
      });

      await tx.politicas.delete({
        where: {
          id,
        },
      });

      await tx.audit_logs.create({
        data: {
          acao: `Removeu a Politica ${politica.nome}`,
          entidade: user?.name,
          filialEntidade: user?.company,
          ipAddress: ip,
        },
      });
    });

    try {
      if (
        politica.caminhoArquivo &&
        fs.existsSync(politica.caminhoArquivo)
      ) {
        fs.unlinkSync(politica.caminhoArquivo);
      }
    } catch (error) {
      console.log(error);
    }

    return { ok: true };
  }

  async findPoliticaLiberadaVisualizacao() {
    return await this.prisma.politicas.findMany({
      where: {
        liberadoVisualizacao: true,
      },
    });
  }

  async findAllAceitesByUser(user: any) {
    return await this.prisma.politicas.findMany({
      where: {
        liberadoVisualizacao: true,

        PoliticaAceites: {
          none: {
            colaborador: user?.name,
          },
        },
      },
    });
  }
}
