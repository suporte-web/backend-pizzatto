import { PrismaService } from '@/prisma/prisma.service';
import { BadRequestException, Injectable } from '@nestjs/common';

@Injectable()
export class FeriadosService {
  constructor(private readonly prisma: PrismaService) {}

  private async verificarDuplicidade(
    nome: string,
    dataFeriado: Date,
    recorrente: boolean,
    ignorarId?: string,
  ) {
    const candidatos = await this.prisma.feriado.findMany({
      where: {
        nome: {
          equals: nome,
          mode: 'insensitive',
        },
        ...(ignorarId ? { id: { not: ignorarId } } : {}),
      },
      select: {
        id: true,
        dataFeriado: true,
        recorrente: true,
      },
    });

    const duplicado = candidatos.some((feriado) => {
      const mesmaData = feriado.dataFeriado.getTime() === dataFeriado.getTime();

      const mesmoDiaMes =
        feriado.dataFeriado.getUTCDate() === dataFeriado.getUTCDate() &&
        feriado.dataFeriado.getUTCMonth() === dataFeriado.getUTCMonth();

      return mesmaData || ((recorrente || feriado.recorrente) && mesmoDiaMes);
    });

    if (duplicado) {
      throw new BadRequestException(
        'Já existe um feriado com este nome e data ou recorrência.',
      );
    }
  }

  async create(body: any, ip: string, user: any) {
    const nome = String(body.nome || '').trim();

    const recorrente = body.recorrente === true;

    const dataFeriado = this.converterDataFeriado(body.dataFeriado);

    if (!nome || Number.isNaN(dataFeriado.getTime())) {
      throw new BadRequestException('Nome ou data do feriado inválidos.');
    }

    await this.verificarDuplicidade(nome, dataFeriado, recorrente);

    const create = await this.prisma.feriado.create({
      data: {
        nome,
        dataFeriado,
        tipoFeriado: body.tipoFeriado,
        recorrente,
        observacao: body.observacao?.trim() || null,
        filiais: body.filiais,
      },
    });

    await this.prisma.audit_logs.create({
      data: {
        acao: `Criou o Feriado ${create.nome} - ${
          recorrente ? 'Recorrente' : 'Data específica'
        }`,
        entidade: user?.name,
        filialEntidade: user?.company,
        ipAddress: ip,
      },
    });

    return create;
  }

  async findByFilter(body: any) {
    const pesquisa = body.pesquisa?.trim();

    const page = Number(body.page ?? 1);
    const limit = Number(body.limit ?? 10);

    const skip = (page - 1) * limit;

    const where: any = {};

    if (pesquisa) {
      where.OR = [
        {
          nome: {
            contains: pesquisa,
            mode: 'insensitive',
          },
        },
        {
          observacao: {
            contains: pesquisa,
            mode: 'insensitive',
          },
        },
      ];
    }

    if (
      body.recorrente !== undefined &&
      body.recorrente !== null &&
      body.recorrente !== ''
    ) {
      where.recorrente = body.recorrente === true || body.recorrente === 'true';
    }

    if (body.tipoFeriado) {
      where.tipoFeriado = body.tipoFeriado;
    }

    if (body.filial) {
      where.filiais = {
        has: body.filial,
      };
    }

    if (body.ativo !== undefined && body.ativo !== null) {
      where.ativo = body.ativo === true || body.ativo === 'true';
    }

    const [result, total] = await Promise.all([
      this.prisma.feriado.findMany({
        where,
        skip,
        take: limit,
        orderBy: [
          {
            dataFeriado: 'asc',
          },
          {
            nome: 'asc',
          },
        ],
      }),

      this.prisma.feriado.count({
        where,
      }),
    ]);

    return {
      result,
      total,
      page,
      limit,
      totalPaginas: Math.ceil(total / limit),
    };
  }

  async update(body: any, ip: string, user: any) {
    const feriado = await this.prisma.feriado.findUnique({
      where: {
        id: body.id,
      },
    });

    if (!feriado) {
      throw new BadRequestException('Feriado não encontrado');
    }

    const dataFeriado = this.converterDataFeriado(body.dataFeriado);

    if (Number.isNaN(dataFeriado.getTime())) {
      throw new BadRequestException('Data do feriado inválida');
    }

    const recorrente = body.recorrente === true;

    await this.verificarDuplicidade(
      body.nome.trim(),
      dataFeriado,
      recorrente,
      body.id,
    );

    const update = await this.prisma.feriado.update({
      where: {
        id: body.id,
      },
      data: {
        nome: body.nome.trim(),
        dataFeriado,
        tipoFeriado: body.tipoFeriado,
        recorrente,
        observacao: body.observacao?.trim() || null,
        filiais: body.filiais,
      },
    });

    await this.prisma.audit_logs.create({
      data: {
        acao: `Alterou o Feriado ${update.nome}`,
        entidade: user?.name,
        filialEntidade: user?.company,
        ipAddress: ip,
      },
    });

    return update;
  }

  async findByAno(ano: number, filial: any) {
    if (!Number.isInteger(ano) || ano < 1900 || ano > 9999) {
      throw new BadRequestException('Ano inválido.');
    }

    const feriados = await this.prisma.feriado.findMany({
      where: {
        ativo: true,
        filiais: {
          has: filial,
        },
        OR: [
          {
            recorrente: true,
          },
          {
            dataFeriado: {
              gte: new Date(Date.UTC(ano, 0, 1)),
              lt: new Date(Date.UTC(ano + 1, 0, 1)),
            },
          },
        ],
      },
    });

    return feriados.flatMap((feriado) => {
      const mes = feriado.dataFeriado.getUTCMonth();
      const dia = feriado.dataFeriado.getUTCDate();

      const data = feriado.recorrente
        ? new Date(Date.UTC(ano, mes, dia))
        : feriado.dataFeriado;

      // Evita transformar 29/02 em 01/03 nos anos não bissextos.
      if (
        feriado.recorrente &&
        (data.getUTCMonth() !== mes || data.getUTCDate() !== dia)
      ) {
        return [];
      }

      return [
        {
          ...feriado,
          dataFeriado: data,
        },
      ];
    });
  }

  private converterDataFeriado(valor: string): Date {
    if (typeof valor !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(valor)) {
      throw new BadRequestException('A data deve estar no formato YYYY-MM-DD.');
    }

    const [ano, mes, dia] = valor.split('-').map(Number);

    const data = new Date(Date.UTC(ano, mes - 1, dia));

    if (
      data.getUTCFullYear() !== ano ||
      data.getUTCMonth() !== mes - 1 ||
      data.getUTCDate() !== dia
    ) {
      throw new BadRequestException('Data do feriado inválida.');
    }

    return data;
  }
}
