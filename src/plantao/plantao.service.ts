import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { PlantaoConfigDTO } from './dtos/plantao.dto';

type Area = 'Sistemas' | 'Infra';

type DiaSemana =
  | 'segunda'
  | 'terca'
  | 'quarta'
  | 'quinta'
  | 'sexta'
  | 'sabado'
  | 'domingo';

export type EscalaSemanal = {
  segunda: string;
  terca: string;
  quarta: string;
  quinta: string;
  sexta: string;
  sabado: string;
  domingo: string;
};

const escalaVazia = (): EscalaSemanal => ({
  segunda: '',
  terca: '',
  quarta: '',
  quinta: '',
  sexta: '',
  sabado: '',
  domingo: '',
});

@Injectable()
export class PlantaoService {
  constructor(private readonly prisma: PrismaService) {}

  private async ensureConfig() {
    let config = await this.prisma.plantaoConfig.findFirst({
      orderBy: { createdAt: 'asc' },
    });

    if (!config) {
      config = await this.prisma.plantaoConfig.create({
        data: {
          janelaSisInicio: '08:00',
          janelaSisFim: '18:00',
          janelaInfInicio: '08:00',
          janelaInfFim: '18:00',
          escalaSistemas: escalaVazia(),
          escalaInfra: escalaVazia(),
        },
      });
    }

    return config;
  }

  async getConfig(): Promise<PlantaoConfigDTO> {
    try {
      const config = await this.ensureConfig();

      const contatos = await this.prisma.plantaoContato.findMany({
        where: { configId: config.id },
        orderBy: { createdAt: 'asc' },
        select: {
          id: true,
          nome: true,
          telefone: true,
          area: true,
        },
      });

      return {
        configId: config.id,
        janelaSistemas: {
          inicio: config.janelaSisInicio,
          fim: config.janelaSisFim,
        },
        janelaInfra: {
          inicio: config.janelaInfInicio,
          fim: config.janelaInfFim,
        },
        escalaSistemas:
          (config.escalaSistemas as EscalaSemanal) ?? escalaVazia(),
        escalaInfra: (config.escalaInfra as EscalaSemanal) ?? escalaVazia(),
        contatos: contatos as Array<{
          id: string;
          nome: string;
          telefone: string;
          area: Area;
        }>,
      };
    } catch (e) {
      console.error('[PLANTAO] getConfig error:', e);
      throw new InternalServerErrorException(
        'Erro ao buscar config do Plantão',
      );
    }
  }

  async updateHorarios(body: any, ip: string, user: any) {
    try {
      const config = await this.ensureConfig();

      await this.prisma.plantaoConfig.update({
        where: { id: config.id },
        data: {
          janelaSisInicio: body.janelaSistemas?.inicio ?? '08:00',
          janelaSisFim: body.janelaSistemas?.fim ?? '18:00',
          janelaInfInicio: body.janelaInfra?.inicio ?? '08:00',
          janelaInfFim: body.janelaInfra?.fim ?? '18:00',
        },
      });

      await this.prisma.audit_logs.create({
        data: {
          acao: 'Atualizou os Horarios do Plantão',
          entidade: user?.name,
          filialEntidade: user?.filial,
          ipAddress: ip,
        },
      });

      return { ok: true };
    } catch (e) {
      console.error('[PLANTAO] updateHorarios error:', e);
      throw new InternalServerErrorException(
        'Erro ao atualizar horários do Plantão',
      );
    }
  }

  async updateMembrosEquipe(
    body: any,
    ip: string,
    user: any,
  ): Promise<{ ok: true }> {
    try {
      const config = await this.ensureConfig();

      await this.prisma.plantaoContato.deleteMany({
        where: { configId: config.id },
      });

      if (body.contatos?.length) {
        await this.prisma.plantaoContato.createMany({
          data: body.contatos.map((c) => ({
            configId: config.id,
            nome: c.nome || '',
            telefone: c.telefone || '',
            area: c.area === 'Infra' ? 'Infra' : 'Sistemas',
          })),
        });

        await this.prisma.audit_logs.create({
          data: {
            acao: 'Atualizou os Membros de Equipe do Plantão',
            entidade: user?.name,
            filialEntidade: user?.filial,
            ipAddress: ip,
          },
        });
      }

      return { ok: true };
    } catch (e) {
      console.error('[PLANTAO] updateMembrosEquipe error:', e);
      throw new InternalServerErrorException(
        'Erro ao atualizar membros da equipe do Plantão',
      );
    }
  }

  async updateEscalas(body: any, ip: string, user: any): Promise<{ ok: true }> {
    try {
      const config = await this.ensureConfig();

      await this.prisma.plantaoConfig.update({
        where: { id: config.id },
        data: {
          escalaSistemas: body.escalaSistemas ?? escalaVazia(),
          escalaInfra: body.escalaInfra ?? escalaVazia(),
        },
      });

      await this.prisma.audit_logs.create({
        data: {
          acao: 'Atualizou a Escala de Plantão',
          entidade: user?.name,
          filialEntidade: user?.filial,
          ipAddress: ip,
        },
      });

      return { ok: true };
    } catch (e) {
      console.error('[PLANTAO] updateEscalas error:', e);
      throw new InternalServerErrorException(
        'Erro ao atualizar escalas do Plantão',
      );
    }
  }

  async getAllPlantonistas() {
    return await this.prisma.plantaoContato.findMany();
  }

  async getAllEscalasAndHorarios() {
    return await this.prisma.plantaoConfig.findFirst();
  }

  async getPlantonistaDiaSemana() {
    try {
      const config = await this.ensureConfig();

      const diasSemana: Record<number, DiaSemana> = {
        0: 'domingo',
        1: 'segunda',
        2: 'terca',
        3: 'quarta',
        4: 'quinta',
        5: 'sexta',
        6: 'sabado',
      };

      const hoje = new Date();
      const diaAtual = diasSemana[hoje.getDay()];

      const escalaSistemas: EscalaSemanal =
        (config.escalaSistemas as EscalaSemanal) ?? {
          segunda: '',
          terca: '',
          quarta: '',
          quinta: '',
          sexta: '',
          sabado: '',
          domingo: '',
        };

      const escalaInfra: EscalaSemanal =
        (config.escalaInfra as EscalaSemanal) ?? {
          segunda: '',
          terca: '',
          quarta: '',
          quinta: '',
          sexta: '',
          sabado: '',
          domingo: '',
        };

      const nomePlantonistaSistemas = escalaSistemas[diaAtual] || '';
      const nomePlantonistaInfra = escalaInfra[diaAtual] || '';

      const nomesPlantonistas = [
        nomePlantonistaSistemas,
        nomePlantonistaInfra,
      ].filter(Boolean);

      const contatosPlantao =
        nomesPlantonistas.length > 0
          ? await this.prisma.plantaoContato.findMany({
              where: {
                nome: {
                  in: nomesPlantonistas,
                },
              },
            })
          : [];

      const telefoneSistemas =
        contatosPlantao.find(
          (contato) => contato.nome === nomePlantonistaSistemas,
        )?.telefone || '';

      const telefoneInfra =
        contatosPlantao.find((contato) => contato.nome === nomePlantonistaInfra)
          ?.telefone || '';

      const retorno = {
        diaSemana: diaAtual,
        sistemas: {
          nome: nomePlantonistaSistemas,
          inicio: config.janelaSisInicio,
          fim: config.janelaSisFim,
          telefone: telefoneSistemas,
        },
        infra: {
          nome: nomePlantonistaInfra,
          inicio: config.janelaInfInicio,
          fim: config.janelaInfFim,
          telefone: telefoneInfra,
        },
      };

      return retorno;
    } catch (e) {
      console.error('[PLANTAO] getPlantonistaDiaSemana error:', e);
      throw new InternalServerErrorException(
        'Erro ao buscar plantonistas do dia',
      );
    }
  }
}
