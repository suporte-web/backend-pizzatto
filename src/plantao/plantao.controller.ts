import { Body, Controller, Get, Put } from "@nestjs/common";
import { PlantaoService, PlantaoConfigDTO } from "./plantao.service";

@Controller("plantao")
export class PlantaoController {
  constructor(private readonly service: PlantaoService) {}

  @Get("config")
  getConfig() {
    return this.service.getConfig();
  }

  @Get('ping')
  ping() {
    return { ok: true, env: process.env.MARIADB_HOST };
  }


  @Put("update-config")
  saveConfig(@Body() body: any) {
    console.log("[PLANTAO] HIT update-config", {
      contatos: body?.contatos?.length,
      configId: body?.configId,
    });
    return this.service.saveConfig(body);
}
}
