import { Module } from "@nestjs/common";
import { PlantaoController } from "./plantao.controller";
import { PlantaoService } from "./plantao.service";
import { PrismaService } from "src/prisma/prisma.service";

@Module({
  controllers: [PlantaoController],
  providers: [PlantaoService, PrismaService],
})
export class PlantaoModule {}
