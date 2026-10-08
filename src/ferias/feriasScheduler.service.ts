import { AniversariantesKmmService } from '@/aniversariantesKmm/aniversariantesKmm.service';
import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';

import { PeriodoAquisitivoFeriasService } from './periodoAquisitivoFerias.service';
import { StatusFeriasService } from './statusFerias.service';
import { AlertasFeriasService } from './alertasFerias.service';

@Injectable()
export class FeriasSchedulerService {
  private readonly logger = new Logger(FeriasSchedulerService.name);

  private executando = false;

  constructor(
    private readonly aniversariantesKmmService: AniversariantesKmmService,
    private readonly periodoAquisitivoFeriasService: PeriodoAquisitivoFeriasService,
    private readonly statusFeriasService: StatusFeriasService,
    private readonly alertasFeriasService: AlertasFeriasService,
  ) {}

  @Cron('0 2 * * *', {
    name: 'sincronizacao-ferias-diaria',
    timeZone: 'America/Sao_Paulo',
    waitForCompletion: true,
  })
  async executarRotinaDiaria() {
    if (this.executando) {
      this.logger.warn('Rotina de férias já está em execução.');

      return {
        sucesso: false,
        mensagem: 'Rotina de férias já está em execução.',
      };
    }

    this.executando = true;

    const inicio = Date.now();

    try {
      this.logger.log('========================================');
      this.logger.log('Iniciando rotina diária de férias.');
      this.logger.log('========================================');

      // ==========================================
      // 1. SINCRONIZAR COLABORADORES COM O KMM
      // ==========================================

      this.logger.log('[1/4] Sincronizando colaboradores com o KMM...');

      const resultadoUsuarios =
        await this.aniversariantesKmmService.sincronizarDatasUsuarioChat();

      this.logger.log(
        `[1/4] Funcionários consultados no KMM: ${resultadoUsuarios.totalFuncionariosKmm}`,
      );

      this.logger.log(
        `[1/4] Usuários atualizados: ${resultadoUsuarios.totalUsuariosAtualizados}`,
      );

      // ==========================================
      // 2. GERAR E ATUALIZAR PERÍODOS AQUISITIVOS
      // ==========================================

      this.logger.log('[2/4] Gerando e atualizando períodos aquisitivos...');

      const resultadoPeriodos =
        await this.periodoAquisitivoFeriasService.gerarPeriodosAquisitivos();

      this.logger.log(
        `[2/4] Colaboradores encontrados: ${resultadoPeriodos.usuariosEncontrados}`,
      );

      this.logger.log(`[2/4] Períodos criados: ${resultadoPeriodos.criados}`);

      this.logger.log(
        `[2/4] Períodos atualizados: ${resultadoPeriodos.atualizados}`,
      );

      this.logger.log(
        `[2/4] Períodos existentes: ${resultadoPeriodos.existentes}`,
      );

      this.logger.log(
        `[2/4] Períodos ignorados: ${resultadoPeriodos.ignorados}`,
      );

      // ==========================================
      // 3. ATUALIZAR STATUS DAS FÉRIAS
      // ==========================================

      this.logger.log('[3/4] Atualizando status das férias...');

      const resultadoStatus =
        await this.statusFeriasService.atualizarStatusAutomaticos();

      this.logger.log(`[3/4] Resultado: ${JSON.stringify(resultadoStatus)}`);

      // ==========================================
      // 4. VERIFICAR ALERTAS DE VENCIMENTO
      // ==========================================

      this.logger.log('[4/4] Verificando alertas de vencimento...');

      const resultadoAlertas =
        await this.alertasFeriasService.verificarAlertasVencimento();

      this.logger.log(
        `[4/4] Períodos verificados: ${resultadoAlertas.periodosVerificados}`,
      );

      this.logger.log(
        `[4/4] Alertas de 90 dias: ${resultadoAlertas.alertas90}`,
      );

      this.logger.log(
        `[4/4] Alertas de 60 dias: ${resultadoAlertas.alertas60}`,
      );

      // ==========================================
      // FINALIZAR ROTINA
      // ==========================================

      const duracaoSegundos = Number(((Date.now() - inicio) / 1000).toFixed(2));

      this.logger.log('========================================');

      this.logger.log(
        `Rotina diária de férias finalizada em ${duracaoSegundos}s.`,
      );

      this.logger.log('========================================');

      return {
        sucesso: true,
        mensagem: 'Rotina diária de férias executada com sucesso.',
        colaboradores: resultadoUsuarios,
        periodos: resultadoPeriodos,
        status: resultadoStatus,
        alertas: resultadoAlertas,
        duracaoSegundos,
      };
    } catch (error) {
      this.logger.error(
        'Erro durante a rotina diária de férias.',
        error instanceof Error ? error.stack : String(error),
      );

      throw error;
    } finally {
      this.executando = false;
    }
  }
}
