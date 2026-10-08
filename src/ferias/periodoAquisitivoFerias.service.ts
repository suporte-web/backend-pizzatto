import { PrismaService } from '@/prisma/prisma.service';
import { BadRequestException, Injectable } from '@nestjs/common';

@Injectable()
export class PeriodoAquisitivoFeriasService {
  constructor(private readonly prisma: PrismaService) {}

  private adicionarAnos(data: Date, anos: number) {
    const novaData = new Date(data);

    novaData.setUTCFullYear(novaData.getUTCFullYear() + anos);

    return novaData;
  }

  private adicionarDias(data: Date, dias: number) {
    const novaData = new Date(data);

    novaData.setUTCDate(novaData.getUTCDate() + dias);

    return novaData;
  }

  private inicioDoDiaUtc(data: Date) {
    return new Date(
      Date.UTC(data.getUTCFullYear(), data.getUTCMonth(), data.getUTCDate()),
    );
  }

  async gerarPeriodosAquisitivos() {
    const usuarios = await this.prisma.usuarioChat.findMany({
      where: {
        ativo: true,

        dataAdmissao: {
          not: null,
        },
      },

      select: {
        id: true,
        nome: true,
        usuario: true,
        ativo: true,
        dataAdmissao: true,
        dataDemissao: true,
        tipoContratacao: true,
      },
    });

    let criados = 0;
    let atualizados = 0;
    let ignorados = 0;
    let existentes = 0;

    const hoje = this.inicioDoDiaUtc(new Date());

    /*
     * O módulo passa a considerar períodos
     * que ainda tenham período concessivo
     * alcançando 2027.
     *
     * Ou seja:
     *
     * concessivo terminou em 2026
     * -> ignora
     *
     * concessivo termina em 2027+
     * -> considera
     */
    const inicioModulo = new Date(Date.UTC(2027, 0, 1));

    /*
     * Continuamos gerando até o próximo
     * ano para já deixar o próximo período
     * preparado.
     *
     * Em 2026 -> até 2027.
     */
    const anoMaximoAquisicao = Math.max(2027, hoje.getUTCFullYear() + 1);

    for (const usuario of usuarios) {
      if (!usuario.dataAdmissao) {
        ignorados++;
        continue;
      }

      const dataAdmissao = this.inicioDoDiaUtc(usuario.dataAdmissao);

      const dataDemissao = usuario.dataDemissao
        ? this.inicioDoDiaUtc(usuario.dataDemissao)
        : null;

      let dataInicioAquisitivo = dataAdmissao;

      while (true) {
        /*
         * Exemplo:
         *
         * início = 20/10/2025
         *
         * + 1 ano = 20/10/2026
         * - 1 dia = 19/10/2026
         */
        const dataFimAquisitivo = this.adicionarDias(
          this.adicionarAnos(dataInicioAquisitivo, 1),
          -1,
        );

        const anoVigencia = dataFimAquisitivo.getUTCFullYear();

        /*
         * Evita gerar períodos
         * indefinidamente para frente.
         */
        if (anoVigencia > anoMaximoAquisicao) {
          break;
        }

        /*
         * Se o funcionário foi desligado
         * antes do início deste período,
         * não existem períodos seguintes.
         */
        if (dataDemissao && dataInicioAquisitivo >= dataDemissao) {
          break;
        }

        /*
         * O direito fica disponível
         * no dia seguinte ao fim
         * do período aquisitivo.
         *
         * Exemplo:
         *
         * fim aquisição:
         * 19/10/2026
         *
         * disponível:
         * 20/10/2026
         */
        const dataDisponibilidade = this.adicionarDias(dataFimAquisitivo, 1);

        /*
         * Período concessivo:
         *
         * 20/10/2026
         * até
         * 19/10/2027
         *
         * Utilizamos -1 dia porque
         * trabalhamos com intervalos
         * inclusivos.
         */
        const dataLimiteConcessivo = this.adicionarDias(
          this.adicionarAnos(dataDisponibilidade, 1),
          -1,
        );

        /*
         * Agora a regra correta:
         *
         * ignoramos somente períodos cujo
         * prazo concessivo inteiro terminou
         * antes de 2027.
         */
        if (dataLimiteConcessivo < inicioModulo) {
          ignorados++;

          dataInicioAquisitivo = this.adicionarDias(dataFimAquisitivo, 1);

          continue;
        }

        /*
         * Antes da dataDisponibilidade:
         * EM_AQUISICAO
         *
         * Na dataDisponibilidade ou depois:
         * DISPONIVEL
         */
        const statusCalculado =
          hoje >= dataDisponibilidade ? 'DISPONIVEL' : 'EM_AQUISICAO';

        const existente = await this.prisma.periodoAquisitivoFerias.findUnique({
          where: {
            usuarioId_anoVigencia: {
              usuarioId: usuario.id,

              anoVigencia,
            },
          },
        });

        if (existente) {
          /*
           * Só fazemos automaticamente:
           *
           * EM_AQUISICAO
           *       ↓
           * DISPONIVEL
           *
           * Não alteramos PROGRAMADO,
           * EM_ANDAMENTO, CONCLUIDO etc.
           */
          if (
            existente.status === 'EM_AQUISICAO' &&
            statusCalculado === 'DISPONIVEL'
          ) {
            await this.prisma.periodoAquisitivoFerias.update({
              where: {
                id: existente.id,
              },

              data: {
                status: 'DISPONIVEL',

                /*
                 * Também garante que as
                 * datas estejam corretas
                 * caso tenhamos ajustado
                 * a regra posteriormente.
                 */
                dataInicioAquisitivo,
                dataFimAquisitivo,
                dataLimiteConcessivo,
              },
            });

            atualizados++;
          }

          existentes++;
        } else {
          await this.prisma.periodoAquisitivoFerias.create({
            data: {
              usuarioId: usuario.id,

              anoVigencia,

              dataInicioAquisitivo,

              dataFimAquisitivo,

              dataLimiteConcessivo,

              quantidadeDiasDireito: 30,

              diasUtilizados: 0,

              diasVendidos: 0,

              status: statusCalculado,
            },
          });

          criados++;
        }

        /*
         * Próximo período aquisitivo.
         *
         * 20/10/2025 -> 19/10/2026
         *
         * próximo:
         *
         * 20/10/2026 -> 19/10/2027
         */
        dataInicioAquisitivo = this.adicionarDias(dataFimAquisitivo, 1);
      }
    }

    return {
      usuariosEncontrados: usuarios.length,

      criados,
      atualizados,
      existentes,
      ignorados,
    };
  }

  async findDisponiveis(user: any) {
    const usuarioAd = String(user?.sam || '')
      .trim()
      .toLowerCase();

    if (!usuarioAd) {
      throw new BadRequestException(
        'Não foi possível identificar o usuário autenticado.',
      );
    }

    const usuario = await this.prisma.usuarioChat.findFirst({
      where: {
        usuario: {
          equals: usuarioAd,

          mode: 'insensitive',
        },

        ativo: true,
      },

      select: {
        id: true,
        nome: true,
        usuario: true,
        cargo: true,
        empresa: true,
        tipoContratacao: true,
      },
    });

    if (!usuario) {
      throw new BadRequestException(
        'Usuário não encontrado no cadastro interno.',
      );
    }

    const periodos = await this.prisma.periodoAquisitivoFerias.findMany({
      where: {
        usuarioId: usuario.id,

        status: 'DISPONIVEL',
      },

      orderBy: {
        anoVigencia: 'asc',
      },

      select: {
        id: true,
        anoVigencia: true,

        dataInicioAquisitivo: true,

        dataFimAquisitivo: true,

        dataLimiteConcessivo: true,

        quantidadeDiasDireito: true,

        diasUtilizados: true,

        diasVendidos: true,

        status: true,
      },
    });

    return {
      usuario,

      result: periodos,

      total: periodos.length,
    };
  }
}
