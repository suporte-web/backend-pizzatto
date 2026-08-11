import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { Pool, PoolClient, QueryResult, QueryResultRow } from 'pg';

@Injectable()
export class KmmDatabaseService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(KmmDatabaseService.name);

  private readonly pool: Pool;

  constructor() {
    const sslEnabled =
      String(process.env.KMM_SSL ?? 'false').toLowerCase() === 'true';

    const host = process.env.KMM_HOST;
    const port = Number(process.env.KMM_PORT ?? 5430);
    const database = process.env.KMM_DATABASE;
    const user = process.env.KMM_USER;
    const password = process.env.KMM_PASSWORD;

    if (!host || !database || !user || !password) {
      throw new Error(
        'Configurações obrigatórias do KMM não foram informadas no ambiente.',
      );
    }

    if (!Number.isInteger(port) || port <= 0) {
      throw new Error(`KMM_PORT inválida: "${process.env.KMM_PORT}".`);
    }

    this.logger.log(
      `[KMM] Configurando conexão: ${host}:${port}/${database} - usuário: ${user}`,
    );

    this.pool = new Pool({
      host,
      port,
      database,
      user,
      password,
      ssl: sslEnabled
        ? {
            rejectUnauthorized: false,
          }
        : false,
      max: 10,
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 10_000,
    });

    this.pool.on('error', (error) => {
      this.logger.error(
        `Erro inesperado no pool KMM: ${error.message}`,
        error.stack,
      );
    });
  }

  async onModuleInit(): Promise<void> {
    try {
      await this.checkConnection();

      this.logger.log('Conexão com o banco KMM estabelecida com sucesso.');
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Erro desconhecido';

      this.logger.error(`Erro ao conectar no banco KMM: ${message}`);

      throw error;
    }
  }

  async query<T extends QueryResultRow>(
    sql: string,
    params: unknown[] = [],
  ): Promise<QueryResult<T>> {
    return this.pool.query<T>(sql, params);
  }

  async getConnection(): Promise<PoolClient> {
    return this.pool.connect();
  }

  async checkConnection(): Promise<boolean> {
    const result = await this.pool.query<{
      ok: number;
    }>('SELECT 1 AS ok');

    return result.rows[0]?.ok === 1;
  }

  async onModuleDestroy(): Promise<void> {
    this.logger.log('Encerrando conexão com o banco KMM...');

    await this.pool.end();
  }
}
