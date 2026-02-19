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


  @Put("config")
  saveConfig(@Body() body: Omit<PlantaoConfigDTO, "configId">) {
    return this.service.saveConfig(body);
  }
}
