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
  try {
    const plantoes = await this.prisma.plantaoConfig.findMany({
      where: {
        deletedAt: null,
      },
      include: {
        PlantaoContato: true,
      },
      orderBy: [
        {
          status: 'asc',
        },
        {
          diaSemana: 'asc',
        },
        {
          inicioPlantao: 'asc',
        },
      ],
    });

    return plantoes.map((plantao) => {
      const isFixo = plantao.status === 'FIXO_SEMANAL';

      if (isFixo) {
        return {
          id: plantao.id,
          status: plantao.status,
          plantonistaId: plantao.plantonistaId,

          diaSemana: plantao.diaSemana,
          diaSemanaNumero: plantao.diaSemana,

          inicioPlantao: null,
          fimPlantao: null,

          dataJanela: null,
          janelaInicio: plantao.janelaInicio,
          janelaFim: plantao.janelaFim,

          nome: plantao.PlantaoContato?.nome || '',
          telefone: plantao.PlantaoContato?.telefone || '',
          area: plantao.PlantaoContato?.area || '',
        };
      }

      const inicioPlantao = moment(plantao.inicioPlantao);
      const fimPlantao = moment(plantao.fimPlantao);

      return {
        id: plantao.id,
        status: plantao.status,

        inicioPlantao: inicioPlantao.format('YYYY-MM-DDTHH:mm:ss'),
        fimPlantao: fimPlantao.format('YYYY-MM-DDTHH:mm:ss'),

        dataJanela: inicioPlantao.format('YYYY-MM-DD'),
        janelaInicio: inicioPlantao.format('HH:mm'),
        janelaFim: fimPlantao.format('HH:mm'),

        plantonistaId: plantao.plantonistaId,
        nome: plantao.PlantaoContato?.nome || '',
        telefone: plantao.PlantaoContato?.telefone || '',
        area: plantao.PlantaoContato?.area || '',
      };
    });
  } catch (e) {
    console.error('[PLANTAO] getAllEscalasAndHorarios error:', e);
    throw new InternalServerErrorException(
      'Erro ao buscar escalas e horários do Plantão',
    );
  }
}

async getPlantonistasSemanaAtual() {
  try {
    const inicioSemanaMoment = moment().startOf('isoWeek');
    const fimSemanaMoment = moment().endOf('isoWeek');

    const inicioSemana = inicioSemanaMoment.toDate();
    const fimSemana = fimSemanaMoment.toDate();

    const diasSemana: Record<number, string> = {
      0: 'domingo',
      1: 'segunda',
      2: 'terca',
      3: 'quarta',
      4: 'quinta',
      5: 'sexta',
      6: 'sabado',
    };

    const fixos = await this.prisma.plantaoConfig.findMany({
      where: {
        status: 'FIXO_SEMANAL',
        deletedAt: null,
      },
      include: {
        PlantaoContato: true,
      },
      orderBy: [
        {
          diaSemana: 'asc',
        },
        {
          janelaInicio: 'asc',
        },
      ],
    });

    const manuais = await this.prisma.plantaoConfig.findMany({
      where: {
        status: 'MANUAL',
        deletedAt: null,
        inicioPlantao: {
          lt: fimSemana,
        },
        fimPlantao: {
          gt: inicioSemana,
        },
      },
      include: {
        PlantaoContato: true,
      },
      orderBy: [
        {
          inicioPlantao: 'asc',
        },
        {
          fimPlantao: 'asc',
        },
      ],
    });

    const fixosFormatados = fixos.map((plantao) => {
      const diaSemana = Number(plantao.diaSemana);
      const dataInicio = moment()
        .startOf('isoWeek')
        .add(diaSemana - 1, 'days');

      const inicioPlantao = moment(
        `${dataInicio.format('YYYY-MM-DD')}T${plantao.janelaInicio}:00`,
        'YYYY-MM-DDTHH:mm:ss',
        true,
      );

      const fimBase = moment(
        `${dataInicio.format('YYYY-MM-DD')}T${plantao.janelaFim}:00`,
        'YYYY-MM-DDTHH:mm:ss',
        true,
      );

      const fimPlantao = fimBase.isAfter(inicioPlantao)
        ? fimBase
        : fimBase.add(1, 'day');

      const numeroDiaSemana = inicioPlantao.day();

      return {
        id: plantao.id,
        status: plantao.status,
        inicioPlantao: inicioPlantao.format('YYYY-MM-DDTHH:mm:ss'),
        fimPlantao: fimPlantao.format('YYYY-MM-DDTHH:mm:ss'),
        dataJanela: inicioPlantao.format('YYYY-MM-DD'),
        diaSemana: diasSemana[numeroDiaSemana],
        diaSemanaNumero: numeroDiaSemana,
        nome: plantao.PlantaoContato?.nome || '',
        telefone: plantao.PlantaoContato?.telefone || '',
        area: plantao.PlantaoContato?.area || '',
        janelaInicio: plantao.janelaInicio || '',
        janelaFim: plantao.janelaFim || '',
      };
    });

    const manuaisFormatados = manuais.map((plantao) => {
      const inicioPlantao = moment(plantao.inicioPlantao);
      const fimPlantao = moment(plantao.fimPlantao);
      const numeroDiaSemana = inicioPlantao.day();

      return {
        id: plantao.id,
        status: plantao.status,
        inicioPlantao: inicioPlantao.format('YYYY-MM-DDTHH:mm:ss'),
        fimPlantao: fimPlantao.format('YYYY-MM-DDTHH:mm:ss'),
        dataJanela: inicioPlantao.format('YYYY-MM-DD'),
        diaSemana: diasSemana[numeroDiaSemana],
        diaSemanaNumero: numeroDiaSemana,
        nome: plantao.PlantaoContato?.nome || '',
        telefone: plantao.PlantaoContato?.telefone || '',
        area: plantao.PlantaoContato?.area || '',
        janelaInicio: inicioPlantao.format('HH:mm'),
        janelaFim: fimPlantao.format('HH:mm'),
      };
    });

    return [...fixosFormatados, ...manuaisFormatados].sort((a, b) =>
      a.inicioPlantao.localeCompare(b.inicioPlantao),
    );
  } catch (e) {
    console.error('[PLANTAO] getPlantonistasSemanaAtual error:', e);
    throw new InternalServerErrorException(
      'Erro ao buscar plantonistas cadastrados',
    );
  }
}


  // incluido o inicio plantão e fim plantão 

async create(body: any, ip: string, user: any) {
  try {
    if (!body?.plantonistaId) {
      throw new BadRequestException('Plantonista é obrigatório');
    }

    const status = body.status || 'MANUAL';

    if (status === 'FIXO_SEMANAL') {
      if (body.diaSemana === undefined || body.diaSemana === null || body.diaSemana === '') {
        throw new BadRequestException('Dia da semana é obrigatório');
      }

      if (!body.janelaInicio || !body.janelaFim) {
        throw new BadRequestException('Janela início e janela fim são obrigatórias');
      }

      const diaSemana = Number(body.diaSemana);

      if (!Number.isInteger(diaSemana) || diaSemana < 1 || diaSemana > 5) {
        throw new BadRequestException('Dia da semana deve ser entre 1 e 5');
      }

      const alreadyExists = await this.prisma.plantaoConfig.findFirst({
        where: {
          plantonistaId: body.plantonistaId,
          status: 'FIXO_SEMANAL',
          diaSemana,
          deletedAt: null,
        },
      });

      if (alreadyExists) {
        return {
          skipped: true,
          message: 'Plantão fixo semanal já existe para este plantonista neste dia',
          data: alreadyExists,
        };
      }

      const create = await this.prisma.plantaoConfig.create({
        data: {
          plantonistaId: body.plantonistaId,
          status: 'FIXO_SEMANAL',
          diaSemana,
          janelaInicio: body.janelaInicio,
          janelaFim: body.janelaFim,
          dataJanela: null,
          inicioPlantao: null,
          fimPlantao: null,
        },
      });

      await this.prisma.audit_logs.create({
        data: {
          acao: `Criou Plantão Fixo Semanal ${create.id}`,
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

    if (!body.inicioPlantao) {
      throw new BadRequestException('Início do plantão é obrigatório');
    }

    if (!body.fimPlantao) {
      throw new BadRequestException('Fim do plantão é obrigatório');
    }

    const inicioPlantaoMoment = moment(body.inicioPlantao, moment.ISO_8601, true);
    const fimPlantaoMoment = moment(body.fimPlantao, moment.ISO_8601, true);

    if (!inicioPlantaoMoment.isValid()) {
      throw new BadRequestException('Início do plantão inválido');
    }

    if (!fimPlantaoMoment.isValid()) {
      throw new BadRequestException('Fim do plantão inválido');
    }

    if (!fimPlantaoMoment.isAfter(inicioPlantaoMoment)) {
      throw new BadRequestException('Fim do plantão precisa ser maior que o início');
    }

    const inicioPlantao = inicioPlantaoMoment.toDate();
    const fimPlantao = fimPlantaoMoment.toDate();

    const conflito = await this.prisma.plantaoConfig.findFirst({
      where: {
        status: 'MANUAL',
        plantonistaId: body.plantonistaId,
        inicioPlantao: {
          lt: fimPlantao,
        },
        fimPlantao: {
          gt: inicioPlantao,
        },
      },
    });

    if (conflito) {
      return {
        skipped: true,
        message: 'Já existe um plantão manual que conflita com este intervalo',
        data: conflito,
      };
    }

    const create = await this.prisma.plantaoConfig.create({
      data: {
        plantonistaId: body.plantonistaId,
        status: 'MANUAL',
        inicioPlantao,
        fimPlantao,
        dataJanela: inicioPlantaoMoment.format('YYYY-MM-DD'),
        janelaInicio: inicioPlantaoMoment.format('HH:mm'),
        janelaFim: fimPlantaoMoment.format('HH:mm'),
        diaSemana: null,
      },
    });

    await this.prisma.audit_logs.create({
      data: {
        acao: `Criou Plantão Manual ${create.id}`,
        entidade: user?.name,
        filialEntidade: user?.company,
        ipAddress: ip,
      },
    });

    return {
      skipped: false,
      data: create,
    };
  } catch (e) {
    console.error('[PLANTAO] create error:', e);

    if (e instanceof BadRequestException) {
      throw e;
    }

    throw new InternalServerErrorException('Erro ao criar plantão');
  }
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

  // Planilha ajustada

private async createOrUpdateRecord(data: any, ip: string, user: any) {
  try {
    if (!data) {
      throw new BadRequestException('Dados inválidos');
    }

    const nome = data.Nome?.trim();
    const dataInicio = data.DataInicio?.trim();
    const horaInicio = data.HoraInicio?.trim();
    const dataFim = data.DataFim?.trim();
    const horaFim = data.HoraFim?.trim();

    if (!nome || !dataInicio || !horaInicio || !dataFim || !horaFim) {
      throw new BadRequestException(
        'Nome, DataInicio, HoraInicio, DataFim e HoraFim são obrigatórios',
      );
    }

    const inicioPlantaoMoment = moment(
      `${dataInicio}T${horaInicio}:00`,
      'YYYY-MM-DDTHH:mm:ss',
      true,
    );

    const fimPlantaoMoment = moment(
      `${dataFim}T${horaFim}:00`,
      'YYYY-MM-DDTHH:mm:ss',
      true,
    );

    if (!inicioPlantaoMoment.isValid()) {
      throw new BadRequestException(
        `Início do plantão inválido para ${nome}. Use DataInicio no formato YYYY-MM-DD e HoraInicio no formato HH:mm`,
      );
    }

    if (!fimPlantaoMoment.isValid()) {
      throw new BadRequestException(
        `Fim do plantão inválido para ${nome}. Use DataFim no formato YYYY-MM-DD e HoraFim no formato HH:mm`,
      );
    }

    if (!fimPlantaoMoment.isAfter(inicioPlantaoMoment)) {
      throw new BadRequestException(
        `Fim do plantão precisa ser maior que o início para ${nome}`,
      );
    }

    const inicioPlantao = inicioPlantaoMoment.toDate();
    const fimPlantao = fimPlantaoMoment.toDate();

    const dataJanela = inicioPlantaoMoment.format('YYYY-MM-DD');
    const janelaInicio = inicioPlantaoMoment.format('HH:mm');
    const janelaFim = fimPlantaoMoment.format('HH:mm');

    const existingRecord = await this.prisma.plantaoContato.findFirst({
      where: { nome },
    });

    if (!existingRecord) {
      throw new BadRequestException(
        `Plantonista "${nome}" não encontrado na tabela de contatos`,
      );
    }

    const conflito = await this.prisma.plantaoConfig.findFirst({
      where: {
        plantonistaId: existingRecord.id,
        inicioPlantao: {
          lt: fimPlantao,
        },
        fimPlantao: {
          gt: inicioPlantao,
        },
      },
    });

    if (conflito) {
      return {
        skipped: true,
        message: `Já existe um plantão para ${nome} que conflita com este intervalo`,
        data: conflito,
      };
    }

    const create = await this.prisma.plantaoConfig.create({
      data: {
        plantonistaId: existingRecord.id,

        inicioPlantao,
        fimPlantao,

        dataJanela,
        janelaInicio,
        janelaFim,

        diaSemana: null,
        status: 'MANUAL',
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
  } catch (e) {
    console.error('[PLANTAO] createOrUpdateRecord error:', e);

    if (e instanceof BadRequestException) {
      throw e;
    }

    throw new InternalServerErrorException('Erro ao importar plantão');
  }
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

  // auto log para quando o usuário deletar ficar registrado no banco 

async deletePlantao(id: string, ip: string, user: any) {
  try {
    const plantao = await this.prisma.plantaoConfig.findUnique({
      where: {
        id,
      },
      include: {
        PlantaoContato: true,
      },
    });

    if (!plantao) {
      throw new BadRequestException('Plantão não encontrado');
    }

    if (plantao.deletedAt) {
      throw new BadRequestException('Plantão já foi deletado');
    }

    const del = await this.prisma.plantaoConfig.update({
      where: {
        id,
      },
      data: {
        deletedAt: new Date(),
        deletedBy: user?.name || user?.email || 'Usuário não identificado',
      },
    });

    await this.prisma.audit_logs.create({
      data: {
        acao: `Deletou o Plantão Config ${del.id} - Plantonista: ${
          plantao.PlantaoContato?.nome || 'Não informado'
        } - Status: ${plantao.status || 'Não informado'} - DiaSemana: ${
          plantao.diaSemana ?? 'Não informado'
        } - Janela: ${plantao.janelaInicio || 'Não informado'} até ${
          plantao.janelaFim || 'Não informado'
        }`,
        entidade: user?.name || user?.email || 'Usuário não identificado',
        filialEntidade: user?.company,
        ipAddress: ip,
      },
    });

    return del;
  } catch (e) {
    console.error('[PLANTAO] deletePlantao error:', e);

    if (e instanceof BadRequestException) {
      throw e;
    }

    throw new InternalServerErrorException('Erro ao deletar plantão');
  }
}

async updatePlantao(body: any, ip: string, user: any) {
  try {
    if (!body.id) {
      throw new BadRequestException('ID do plantão é obrigatório');
    }

    if (!body.plantonistaId) {
      throw new BadRequestException('Plantonista é obrigatório');
    }

    const status = body.status || 'MANUAL';

    if (status === 'FIXO_SEMANAL') {
      if (body.diaSemana === undefined || body.diaSemana === null || body.diaSemana === '') {
        throw new BadRequestException('Dia da semana é obrigatório');
      }

      if (!body.janelaInicio || !body.janelaFim) {
        throw new BadRequestException('Janela início e janela fim são obrigatórias');
      }

      const diaSemana = Number(body.diaSemana);

      const conflito = await this.prisma.plantaoConfig.findFirst({
        where: {
          id: {
            not: body.id,
          },
          deletedAt: null,
          status: 'FIXO_SEMANAL',
          diaSemana,
          plantonistaId: body.plantonistaId,
        },
      });

      if (conflito) {
        throw new BadRequestException(
          'Já existe outro plantão fixo para este plantonista neste dia',
        );
      }

      const update = await this.prisma.plantaoConfig.update({
        where: {
          id: body.id,
        },
        data: {
          plantonistaId: body.plantonistaId,
          status: 'FIXO_SEMANAL',
          diaSemana,
          janelaInicio: body.janelaInicio,
          janelaFim: body.janelaFim,
          dataJanela: null,
          inicioPlantao: null,
          fimPlantao: null,
        },
      });

      return update;
    }

    if (!body.inicioPlantao || !body.fimPlantao) {
      throw new BadRequestException('Início e fim do plantão são obrigatórios');
    }

    const inicioPlantaoMoment = moment(body.inicioPlantao, moment.ISO_8601, true);
    const fimPlantaoMoment = moment(body.fimPlantao, moment.ISO_8601, true);

    if (!inicioPlantaoMoment.isValid() || !fimPlantaoMoment.isValid()) {
      throw new BadRequestException('Início ou fim do plantão inválido');
    }

    if (!fimPlantaoMoment.isAfter(inicioPlantaoMoment)) {
      throw new BadRequestException('Fim do plantão precisa ser maior que o início');
    }

    const inicioPlantao = inicioPlantaoMoment.toDate();
    const fimPlantao = fimPlantaoMoment.toDate();

    const conflito = await this.prisma.plantaoConfig.findFirst({
      where: {
        id: {
          not: body.id,
        },
        deletedAt: null,
        status: 'MANUAL',
        plantonistaId: body.plantonistaId,
        inicioPlantao: {
          lt: fimPlantao,
        },
        fimPlantao: {
          gt: inicioPlantao,
        },
      },
    });

    if (conflito) {
      throw new BadRequestException(
        'Já existe outro plantão manual que conflita com este intervalo',
      );
    }

    const update = await this.prisma.plantaoConfig.update({
      where: {
        id: body.id,
      },
      data: {
        plantonistaId: body.plantonistaId,
        status: 'MANUAL',
        inicioPlantao,
        fimPlantao,
        dataJanela: inicioPlantaoMoment.format('YYYY-MM-DD'),
        janelaInicio: inicioPlantaoMoment.format('HH:mm'),
        janelaFim: fimPlantaoMoment.format('HH:mm'),
        diaSemana: null,
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