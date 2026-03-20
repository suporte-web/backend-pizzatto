import { Injectable, InternalServerErrorException } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";

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
  constructor(private readonly prisma: PrismaService) {}

  private async ensureConfig() {
    let config = await this.prisma.plantaoConfig.findFirst({
      orderBy: { createdAt: "asc" },
    });

    if (!config) {
      config = await this.prisma.plantaoConfig.create({
        data: {
          janelaSisInicio: "08:00",
          janelaSisFim: "18:00",
          janelaInfInicio: "08:00",
          janelaInfFim: "18:00",
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
        orderBy: { createdAt: "asc" },
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
        escalaSistemas: (config.escalaSistemas as EscalaSemanal) ?? escalaVazia(),
        escalaInfra: (config.escalaInfra as EscalaSemanal) ?? escalaVazia(),
        contatos: contatos as Array<{
          id: string;
          nome: string;
          telefone: string;
          area: Area;
        }>,
      };
    } catch (e) {
      console.error("[PLANTAO] getConfig error:", e);
      throw new InternalServerErrorException("Erro ao buscar config do Plantão");
    }
  }

  async saveConfig(payload: Omit<PlantaoConfigDTO, "configId">): Promise<{ ok: true }> {
    try {
      await this.prisma.$transaction(async (tx) => {
        let config = await tx.plantaoConfig.findFirst({
          orderBy: { createdAt: "asc" },
        });

        if (!config) {
          config = await tx.plantaoConfig.create({
            data: {
              janelaSisInicio: "08:00",
              janelaSisFim: "18:00",
              janelaInfInicio: "08:00",
              janelaInfFim: "18:00",
              escalaSistemas: escalaVazia(),
              escalaInfra: escalaVazia(),
            },
          });
        }

        const configId = config.id;

        await tx.plantaoConfig.update({
          where: { id: configId },
          data: {
            janelaSisInicio: payload.janelaSistemas?.inicio ?? "08:00",
            janelaSisFim: payload.janelaSistemas?.fim ?? "18:00",
            janelaInfInicio: payload.janelaInfra?.inicio ?? "08:00",
            janelaInfFim: payload.janelaInfra?.fim ?? "18:00",
            escalaSistemas: payload.escalaSistemas ?? escalaVazia(),
            escalaInfra: payload.escalaInfra ?? escalaVazia(),
          },
        });

        await tx.plantaoContato.deleteMany({
          where: { configId },
        });

        if (payload.contatos?.length) {
          await tx.plantaoContato.createMany({
            data: payload.contatos.map((c) => ({
              id: c.id?.trim() || crypto.randomUUID(),
              configId,
              nome: c.nome || "",
              telefone: c.telefone || "",
              area: c.area === "Infra" ? "Infra" : "Sistemas",
            })),
          });
        }
      });

      return { ok: true };
    } catch (e) {
      console.error("[PLANTAO] saveConfig error:", e);
      throw new InternalServerErrorException("Erro ao salvar config do Plantão");
    }
  }
}