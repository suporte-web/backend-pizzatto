import { Body, Controller, Get, Put } from "@nestjs/common";
import { PlantaoService, PlantaoConfigDTO } from "./plantao.service";
import { ApiTags } from "@nestjs/swagger";

@ApiTags("Plantao")
@Controller("plantao")
export class PlantaoController {
  constructor(private readonly service: PlantaoService) {}

  @Get("config")
  async getConfig() {
    return await this.service.getConfig();
  }

  @Get("ping")
  ping() {
    return {
      ok: true,
      env: process.env.DATABASE_URL,
    };
  }

  @Put("update-config")
  async saveConfig(@Body() body: PlantaoConfigDTO) {
    console.log("[PLANTAO] HIT update-config", {
      contatos: body?.contatos?.length,
      configId: body?.configId,
    });

    return await this.service.saveConfig(body);
  }
}