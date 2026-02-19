import { Module } from "@nestjs/common";
import { PlantaoController } from "./plantao.controller";
import { PlantaoService } from "./plantao.service";

@Module({
  controllers: [PlantaoController],
  providers: [PlantaoService],
})
export class PlantaoModule {}
