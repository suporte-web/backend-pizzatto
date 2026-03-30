import { Module } from "@nestjs/common";
import { AuthModule } from "src/auth/auth.module";
import { PoliticasService } from "./politicas.service";
import { PoliticasController } from "./politicas.controller";
import { PrismaService } from "src/prisma/prisma.service";

@Module({
    imports: [AuthModule],
    controllers: [PoliticasController],
    providers: [PoliticasService, PrismaService],
})
export class PoliticasModule {}