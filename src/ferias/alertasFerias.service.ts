import { PrismaService } from '@/prisma/prisma.service';
import { Injectable } from '@nestjs/common';
import { FeriasEmailService } from './feriasEmail.service';

@Injectable()
export class AlertasFeriasService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly emailService: FeriasEmailService,
  ) {}

  private inicioDoDiaUtc(data: Date) {
    return new Date(
      Date.UTC(data.getUTCFullYear(), data.getUTCMonth(), data.getUTCDate()),
    );
  }

  private diferencaDias(dataInicial: Date, dataFinal: Date) {
    const inicio = this.inicioDoDiaUtc(dataInicial);

    const fim = this.inicioDoDiaUtc(dataFinal);

    const diferenca = fim.getTime() - inicio.getTime();

    return Math.floor(diferenca / (1000 * 60 * 60 * 24));
  }

  async verificarAlertasVencimento() {
    const hoje = this.inicioDoDiaUtc(new Date());

    /*
     * ========================================
     * Períodos que ainda precisam de controle
     * ========================================
     */

    const periodos = await this.prisma.periodoAquisitivoFerias.findMany({
      where: {
        status: {
          in: ['DISPONIVEL', 'PROGRAMADO', 'EM_ANDAMENTO'],
        },

        dataLimiteConcessivo: {
          gte: hoje,
        },

        UsuarioChat: {
          ativo: true,
        },

        OR: [
          {
            alerta90EnviadoEm: null,
          },
          {
            alerta60EnviadoEm: null,
          },
        ],
      },

      include: {
        UsuarioChat: {
          select: {
            id: true,
            usuario: true,
            nome: true,
            email: true,
            empresa: true,
            departamento: true,
            cargo: true,
          },
        },

        SolicitacaoFerias: {
          where: {
            status: {
              in: ['AGUARDANDO_APROVACAO', 'APROVADO', 'EM_ANDAMENTO'],
            },
          },

          orderBy: {
            createdAt: 'desc',
          },

          take: 1,

          select: {
            id: true,
            status: true,
            gestorUsuario: true,
            gestorNome: true,
            gestorEmail: true,
          },
        },
      },
    });

    let alertas90 = 0;
    let alertas60 = 0;

    const alertas: any[] = [];

    for (const periodo of periodos) {
      const diasRestantes = this.diferencaDias(
        hoje,
        periodo.dataLimiteConcessivo,
      );

      const usuario = periodo.UsuarioChat;

      const solicitacao = periodo.SolicitacaoFerias[0];

      /*
       * ========================================
       * ALERTA 90 DIAS
       * ========================================
       */

      if (
        diasRestantes <= 90 &&
        diasRestantes > 60 &&
        !periodo.alerta90EnviadoEm
      ) {
        const dadosAlerta = {
          tipo: 'ALERTA_90_DIAS',

          periodoId: periodo.id,

          anoVigencia: periodo.anoVigencia,

          dataLimiteConcessivo: periodo.dataLimiteConcessivo,

          diasRestantes,

          colaborador: {
            usuario: usuario.usuario,

            nome: usuario.nome,

            email: usuario.email,

            empresa: usuario.empresa,
          },

          gestor: solicitacao
            ? {
                usuario: solicitacao.gestorUsuario,

                nome: solicitacao.gestorNome,

                email: solicitacao.gestorEmail,
              }
            : null,
        };

        await this.emailService.enviarAlerta90Dias({
          colaboradorNome: usuario.nome,

          colaboradorEmail: usuario.email,

          gestorNome: solicitacao?.gestorNome,

          gestorEmail: solicitacao?.gestorEmail,

          rhEmail: process.env.FERIAS_RH_EMAIL,

          anoVigencia: periodo.anoVigencia,

          dataLimiteConcessivo: periodo.dataLimiteConcessivo,

          diasRestantes,
        });

        await this.prisma.$transaction(async (tx) => {
          await tx.periodoAquisitivoFerias.update({
            where: {
              id: periodo.id,
            },

            data: {
              alerta90EnviadoEm: new Date(),
            },
          });

          /*
           * Só cria HistóricoSolicitacaoFerias
           * se já existir solicitação.
           */
          if (solicitacao) {
            await tx.historicoSolicitacaoFerias.create({
              data: {
                solicitacaoId: solicitacao.id,

                tipoEvento: 'ALERTA_90_DIAS',

                descricao:
                  'Alerta automático de 90 dias para vencimento das férias.',

                responsavelUsuario: 'SISTEMA',

                responsavelNome: 'Sistema',

                responsavelEmail: null,

                ipAddress: null,

                dadosNovos: {
                  diasRestantes,

                  dataLimiteConcessivo:
                    periodo.dataLimiteConcessivo.toISOString(),

                  colaborador: usuario.nome,
                },
              },
            });
          }
        });

        alertas.push(dadosAlerta);

        alertas90++;
      }

      /*
       * ========================================
       * ALERTA 60 DIAS
       * ========================================
       */

      if (
        diasRestantes <= 60 &&
        diasRestantes >= 0 &&
        !periodo.alerta60EnviadoEm
      ) {
        const dadosAlerta = {
          tipo: 'ALERTA_60_DIAS',

          periodoId: periodo.id,

          anoVigencia: periodo.anoVigencia,

          dataLimiteConcessivo: periodo.dataLimiteConcessivo,

          diasRestantes,

          colaborador: {
            usuario: usuario.usuario,

            nome: usuario.nome,

            email: usuario.email,

            empresa: usuario.empresa,
          },

          gestor: solicitacao
            ? {
                usuario: solicitacao.gestorUsuario,

                nome: solicitacao.gestorNome,

                email: solicitacao.gestorEmail,
              }
            : null,
        };

        await this.emailService.enviarAlerta60Dias({
          colaboradorNome: usuario.nome,

          colaboradorEmail: usuario.email,

          gestorNome: solicitacao?.gestorNome,

          gestorEmail: solicitacao?.gestorEmail,

          rhEmail: process.env.FERIAS_RH_EMAIL,

          anoVigencia: periodo.anoVigencia,

          dataLimiteConcessivo: periodo.dataLimiteConcessivo,

          diasRestantes,
        });

        await this.prisma.$transaction(async (tx) => {
          await tx.periodoAquisitivoFerias.update({
            where: {
              id: periodo.id,
            },

            data: {
              alerta60EnviadoEm: new Date(),
            },
          });

          if (solicitacao) {
            await tx.historicoSolicitacaoFerias.create({
              data: {
                solicitacaoId: solicitacao.id,

                tipoEvento: 'ALERTA_60_DIAS',

                descricao:
                  'Alerta automático de 60 dias para vencimento das férias.',

                responsavelUsuario: 'SISTEMA',

                responsavelNome: 'Sistema',

                responsavelEmail: null,

                ipAddress: null,

                dadosNovos: {
                  diasRestantes,

                  dataLimiteConcessivo:
                    periodo.dataLimiteConcessivo.toISOString(),

                  colaborador: usuario.nome,
                },
              },
            });
          }
        });

        alertas.push(dadosAlerta);

        alertas60++;
      }
    }

    return {
      periodosVerificados: periodos.length,

      alertas90,

      alertas60,

      alertas,
    };
  }
}
