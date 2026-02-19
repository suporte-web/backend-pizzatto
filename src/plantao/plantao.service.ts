import { Injectable, InternalServerErrorException } from "@nestjs/common";
import { mariaPool } from "./db";

type Area = "Sistemas" | "Infra";

export type EscalaSemanal = {
  segunda: string;
  terca: string;
  quarta: string;
  quinta: string;
  sexta: string;
  sabado: string;
  domingo: string;
};

export type PlantaoConfigDTO = {
  configId: string;
  janelaSistemas: { inicio: string; fim: string };
  janelaInfra: { inicio: string; fim: string };
  escalaSistemas: EscalaSemanal;
  escalaInfra: EscalaSemanal;
  contatos: Array<{ id: string; nome: string; telefone: string; area: Area }>;
};

const escalaVazia = (): EscalaSemanal => ({
  segunda: "",
  terca: "",
  quarta: "",
  quinta: "",
  sexta: "",
  sabado: "",
  domingo: "",
});

@Injectable()
export class PlantaoService {
  private async ensureConfig(): Promise<any> {
    const [rows] = await mariaPool.query<any[]>(
      `SELECT * FROM plantao_config ORDER BY created_at ASC LIMIT 1`,
    );

    let config = rows?.[0];

    if (!config) {
      await mariaPool.query(
        `INSERT INTO plantao_config
         (id, janela_sis_inicio, janela_sis_fim, janela_inf_inicio, janela_inf_fim, escala_sistemas, escala_infra)
         VALUES
         (UUID(), '08:00','18:00','08:00','18:00',
          JSON_OBJECT('segunda','', 'terca','', 'quarta','', 'quinta','', 'sexta','', 'sabado','', 'domingo',''),
          JSON_OBJECT('segunda','', 'terca','', 'quarta','', 'quinta','', 'sexta','', 'sabado','', 'domingo','')
         )`,
      );

      const [rows2] = await mariaPool.query<any[]>(
        `SELECT * FROM plantao_config ORDER BY created_at ASC LIMIT 1`,
      );
      config = rows2?.[0];
    }

    return config;
  }

  async getConfig(): Promise<PlantaoConfigDTO> {
    try {
      const config = await this.ensureConfig();

      const [contatos] = await mariaPool.query<any[]>(
        `SELECT id, nome, telefone, area
         FROM plantao_contato
         WHERE config_id = ?
         ORDER BY created_at ASC`,
        [config.id],
      );

      const escalaSistemas =
        typeof config.escala_sistemas === "string"
          ? JSON.parse(config.escala_sistemas)
          : config.escala_sistemas;

      const escalaInfra =
        typeof config.escala_infra === "string"
          ? JSON.parse(config.escala_infra)
          : config.escala_infra;

      return {
        configId: String(config.id),
        janelaSistemas: { inicio: config.janela_sis_inicio, fim: config.janela_sis_fim },
        janelaInfra: { inicio: config.janela_inf_inicio, fim: config.janela_inf_fim },
        escalaSistemas: escalaSistemas ?? escalaVazia(),
        escalaInfra: escalaInfra ?? escalaVazia(),
        contatos: (contatos ?? []) as any,
      };
    } catch {
      throw new InternalServerErrorException("Erro ao buscar config do Plantão");
    }
  }

  async saveConfig(payload: Omit<PlantaoConfigDTO, "configId">): Promise<{ ok: true }> {
    const conn = await mariaPool.getConnection();
    try {
      await conn.beginTransaction();

      // garante config existente e pega o id UUID
      const [rows] = await conn.query<any[]>(
        `SELECT * FROM plantao_config ORDER BY created_at ASC LIMIT 1`,
      );
      let config = rows?.[0];

      if (!config) {
        await conn.query(
          `INSERT INTO plantao_config
           (id, janela_sis_inicio, janela_sis_fim, janela_inf_inicio, janela_inf_fim, escala_sistemas, escala_infra)
           VALUES
           (UUID(), '08:00','18:00','08:00','18:00',
            JSON_OBJECT('segunda','', 'terca','', 'quarta','', 'quinta','', 'sexta','', 'sabado','', 'domingo',''),
            JSON_OBJECT('segunda','', 'terca','', 'quarta','', 'quinta','', 'sexta','', 'sabado','', 'domingo','')
           )`,
        );

        const [rows2] = await conn.query<any[]>(
          `SELECT * FROM plantao_config ORDER BY created_at ASC LIMIT 1`,
        );
        config = rows2?.[0];
      }

      const configId = config.id;

      // atualiza a config existente (UUID)
      await conn.query(
        `UPDATE plantao_config
         SET janela_sis_inicio=?, janela_sis_fim=?,
             janela_inf_inicio=?, janela_inf_fim=?,
             escala_sistemas=?, escala_infra=?
         WHERE id=?`,
        [
          payload.janelaSistemas?.inicio ?? "08:00",
          payload.janelaSistemas?.fim ?? "18:00",
          payload.janelaInfra?.inicio ?? "08:00",
          payload.janelaInfra?.fim ?? "18:00",
          JSON.stringify(payload.escalaSistemas ?? escalaVazia()),
          JSON.stringify(payload.escalaInfra ?? escalaVazia()),
          configId,
        ],
      );

      // substitui contatos dessa config
      await conn.query(`DELETE FROM plantao_contato WHERE config_id = ?`, [configId]);

      if (payload.contatos?.length) {
        const values = payload.contatos.map((c) => [
          c.id || null, // se vier null -> UUID()
          configId,
          c.nome || "",
          c.telefone || "",
          c.area || "Sistemas",
        ]);

        const placeholders = values.map(() => `(COALESCE(?, UUID()), ?, ?, ?, ?)`).join(", ");

        await conn.query(
          `INSERT INTO plantao_contato (id, config_id, nome, telefone, area)
           VALUES ${placeholders}`,
          values.flat(),
        );
      }

      await conn.commit();
      return { ok: true };
    } catch {
      await conn.rollback();
      throw new InternalServerErrorException("Erro ao salvar config do Plantão");
    } finally {
      conn.release();
    }
  }
}
