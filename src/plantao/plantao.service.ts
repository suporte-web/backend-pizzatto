import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import moment from 'moment';

export type EscalaSemanal = {
  segunda: string;
  terca: string;
  quarta: string;
  quinta: string;
  sexta: string;
  sabado: string;
  domingo: string;
};

@Injectable()
export class PlantaoService {
  constructor(private readonly prisma: PrismaService) {}

  async updateMembrosEquipe(
    body: any,
    ip: string,
    user: any,
  ): Promise<{ ok: true }> {
    try {
      if (!body.contatos?.length) {
        throw new BadRequestException('Nenhum membro da equipe foi informado');
      }

      type ContatoInput = {
        nome: string;
        telefone: string;
        area: 'Infra' | 'Sistemas';
      };

      const contatosNormalizados: ContatoInput[] = body.contatos.map(
        (c: any) => ({
          nome: (c.nome || '').trim(),
          telefone: (c.telefone || '').trim(),
          area: c.area === 'Infra' ? 'Infra' : 'Sistemas',
        }),
      );

      const contatosInvalidos = contatosNormalizados.filter(
        (c) => !c.nome || !c.telefone,
      );

      if (contatosInvalidos.length > 0) {
        throw new BadRequestException(
          'Todos os membros precisam ter nome e telefone',
        );
      }

      const contatosUnicos: ContatoInput[] = Array.from(
        new Map<string, ContatoInput>(
          contatosNormalizados.map((c) => [c.nome.toLowerCase(), c]),
        ).values(),
      );

      const existentes = await this.prisma.plantaoContato.findMany({
        where: {
          nome: {
            in: contatosUnicos.map((c) => c.nome),
          },
        },
        select: {
          nome: true,
        },
      });

      const nomesExistentes = new Set(
        existentes.map((e) => e.nome.toLowerCase()),
      );

      const contatosParaCriar: ContatoInput[] = contatosUnicos.filter(
        (c) => !nomesExistentes.has(c.nome.toLowerCase()),
      );

      await this.prisma.$transaction(async (tx) => {
        if (contatosParaCriar.length > 0) {
          await tx.plantaoContato.createMany({
            data: contatosParaCriar,
          });
        }

        await tx.audit_logs.create({
          data: {
            acao: 'Atualizou os Membros de Equipe do Plantão',
            entidade: user?.name,
            filialEntidade: user?.filial,
            ipAddress: ip,
          },
        });
      });

      return { ok: true };
    } catch (e) {
      console.error('[PLANTAO] updateMembrosEquipe error:', e);

      if (e instanceof BadRequestException) {
        throw e;
      }

      throw new InternalServerErrorException(
        'Erro ao atualizar membros da equipe do Plantão',
      );
    }
  }

  async getAllPlantonistas() {
    return await this.prisma.plantaoContato.findMany({
      orderBy: {
        nome: 'asc',
      },
    });
  }

  async getAllEscalasAndHorarios() {
    return await this.prisma.plantaoConfig.findMany({
      include: {
        PlantaoContato: true,
      },
      orderBy: [
        {
          dataJanela: 'asc',
        },
        {
          diaSemana: 'asc',
        },
        {
          janelaInicio: 'asc',
        },
      ],
    });
  }

  async getPlantonistasSemanaAtual() {
    try {
      const diasSemana: Record<number, string> = {
        0: 'domingo',
        1: 'segunda',
        2: 'terca',
        3: 'quarta',
        4: 'quinta',
        5: 'sexta',
        6: 'sabado',
      };

      const plantoes = await this.prisma.plantaoConfig.findMany({
        include: {
          PlantaoContato: true,
        },
      });

      const retorno = plantoes.map((plantao) => {
        const isRecorrente = plantao.status === 'RECORRENTE';

        const dataPlantao = isRecorrente
          ? moment().startOf('isoWeek').day(Number(plantao.diaSemana))
          : moment(plantao.dataJanela, 'YYYY-MM-DD');

        const numeroDiaSemana = dataPlantao.day();

        return {
          id: plantao.id,
          status: plantao.status,
          dataJanela: dataPlantao.format('YYYY-MM-DD'),
          diaSemana: diasSemana[numeroDiaSemana],
          diaSemanaNumero: numeroDiaSemana,
          nome: plantao.PlantaoContato?.nome || '',
          telefone: plantao.PlantaoContato?.telefone || '',
          area: plantao.PlantaoContato?.area || '',
          janelaInicio: plantao.janelaInicio || '',
          janelaFim: plantao.janelaFim || '',
        };
      });

      return retorno.sort((a, b) => {
        if (a.dataJanela !== b.dataJanela) {
          return a.dataJanela.localeCompare(b.dataJanela);
        }

        return a.janelaInicio.localeCompare(b.janelaInicio);
      });
    } catch (e) {
      console.error('[PLANTAO] getPlantonistasSemanaAtual error:', e);
      throw new InternalServerErrorException(
        'Erro ao buscar plantonistas cadastrados',
      );
    }
  }

  async create(body: any, ip: string, user: any) {
    const isRecorrente = body.status === 'RECORRENTE';

    const dataJanela = isRecorrente
      ? null
      : moment(body.dataJanela || moment()).format('YYYY-MM-DD');

    const diaSemana = isRecorrente ? Number(body.diaSemana) : null;

    if (isRecorrente && diaSemana === null) {
      throw new BadRequestException(
        'Dia da semana é obrigatório para recorrência',
      );
    }

    if (!isRecorrente && !dataJanela) {
      throw new BadRequestException('Data da janela é obrigatória');
    }

    const alreadyExists = await this.prisma.plantaoConfig.findFirst({
      where: {
        plantonistaId: body.plantonistaId,
        status: body.status,
        ...(isRecorrente ? { diaSemana } : { dataJanela }),
      },
    });

    if (alreadyExists) {
      return {
        skipped: true,
        message: isRecorrente
          ? 'Plantão recorrente já existente para este plantonista neste dia da semana'
          : 'Plantão já existente para este plantonista nesta data',
        data: alreadyExists,
      };
    }

    const create = await this.prisma.plantaoConfig.create({
      data: {
        dataJanela,
        diaSemana,
        janelaInicio: body.janelaInicio,
        janelaFim: body.janelaFim,
        plantonistaId: body.plantonistaId,
        status: body.status,
      },
    });

    await this.prisma.audit_logs.create({
      data: {
        acao: `Criou a data de Plantão ${create.id}`,
        entidade: user?.name,
        filialEntidade: user?.company,
        ipAddress: ip,
      },
    });

    return {
      skipped: false,
      data: create,
    };
  }

  async createBySpreadsheet(body: any, ip: string, user: any) {
    if (Array.isArray(body)) {
      const results = await Promise.all(
        body.map((item) => this.createOrUpdateRecord(item, ip, user)),
      );

      return {
        total: results.length,
        criados: results.filter((r) => !r.skipped),
        pulados: results.filter((r) => r.skipped),
      };
    }

    return this.createOrUpdateRecord(body, ip, user);
  }

  private async createOrUpdateRecord(data: any, ip: string, user: any) {
    console.log(data);

    if (!data) {
      throw new BadRequestException('Dados inválidos');
    }

    const nome = data.Nome?.trim();
    const janelaInicio = data.JanelaInicio?.trim().toLowerCase();
    const janelaFim = data.JanelaFim?.trim().toLowerCase();
    const dataJanela = moment(data.DataJanela?.trim()).format('YYYY-MM-DD');
    const status = data.Status?.trim();

    if (!nome || !janelaInicio || !janelaFim || !dataJanela) {
      throw new BadRequestException(
        'Nome, Janela de Inicio, Janela de Fim e Data da Janela são obrigatórios',
      );
    }

    const existingRecord = await this.prisma.plantaoContato.findFirst({
      where: { nome },
    });

    if (!existingRecord) {
      throw new BadRequestException(
        'Nome do Plantonista não encontrado, favor colocar o nome do Plantonista correto',
      );
    }

    const existingPlantao = await this.prisma.plantaoConfig.findFirst({
      where: {
        plantonistaId: existingRecord.id,
        dataJanela,
      },
    });

    if (existingPlantao) {
      return {
        skipped: true,
        message: `Plantão já existe para ${nome} na data ${dataJanela}`,
        data: existingPlantao,
      };
    }

    const create = await this.prisma.plantaoConfig.create({
      data: {
        plantonistaId: existingRecord.id,
        janelaInicio,
        janelaFim,
        dataJanela,
        status,
      },
    });

    await this.prisma.audit_logs.create({
      data: {
        acao: `Criou a data de Plantão ${create.id}`,
        entidade: user?.name,
        filialEntidade: user?.company,
        ipAddress: ip,
      },
    });

    return {
      skipped: false,
      data: create,
    };
  }

  async deleteContatos(id: string, ip: string, user: any) {
    const upd = await this.prisma.plantaoContato.delete({
      where: { id },
    });

    await this.prisma.audit_logs.create({
      data: {
        acao: `Deletou o Plantão Contato ${upd.id}`,
        entidade: user?.name,
        filialEntidade: user?.company,
        ipAddress: ip,
      },
    });

    return upd;
  }

  async deletePlantao(id: string, ip: string, user: any) {
    const del = await this.prisma.plantaoConfig.delete({
      where: { id },
    });

    await this.prisma.audit_logs.create({
      data: {
        acao: `Deletou o Plantão Config ${del.id}`,
        entidade: user?.name,
        filialEntidade: user?.company,
        ipAddress: ip,
      },
    });

    return del;
  }

  async updatePlantao(body: any, ip: string, user: any) {
    try {
      if (!body.id) {
        throw new BadRequestException('ID do plantão é obrigatório');
      }

      if (!body.plantonistaId) {
        throw new BadRequestException('Plantonista é obrigatório');
      }

      if (!body.janelaInicio || !body.janelaFim) {
        throw new BadRequestException(
          'Janela início e janela fim são obrigatórias',
        );
      }

      const update = await this.prisma.plantaoConfig.update({
        where: {
          id: body.id,
        },
        data: {
          plantonistaId: body.plantonistaId,
          janelaInicio: body.janelaInicio,
          janelaFim: body.janelaFim,
        },
      });

      await this.prisma.audit_logs.create({
        data: {
          acao: `Atualizou o Plantão Config ${update.id}`,
          entidade: user?.name,
          filialEntidade: user?.company,
          ipAddress: ip,
        },
      });

      return update;
    } catch (e) {
      console.error('[PLANTAO] updatePlantao error:', e);

      if (e instanceof BadRequestException) {
        throw e;
      }

      throw new InternalServerErrorException('Erro ao atualizar plantão');
    }
  }
}
