import { AuthModule } from "@/auth/auth.module";
import { Module } from "@nestjs/common";
import { RecrutamentoInternoService } from "./recrutamentoInterno.service";
import { PrismaService } from "@/prisma/prisma.service";
import { RecrutamentoInternoController } from "./recrutamentoInterno.controller";

@Module({
    imports: [AuthModule],
    controllers: [RecrutamentoInternoController],
    providers: [RecrutamentoInternoService, PrismaService]
})
export class RecrutamentoInternoModule {}