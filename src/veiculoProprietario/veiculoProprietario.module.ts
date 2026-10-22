import { AuthModule } from "@/auth/auth.module";
import { Module } from "@nestjs/common";
import { PrismaService } from "@/prisma/prisma.service";
import { KmmDatabaseModule } from "@/database/kmm/kmm-database.module";
import { VeiculoProprietarioController } from "./veiculoProprietario.controller";
import { VeiculoProprietarioService } from "./veiculoProprietario.service";

@Module({
    imports: [AuthModule, KmmDatabaseModule],
    controllers: [VeiculoProprietarioController],
    providers: [VeiculoProprietarioService, PrismaService]
})
export class VeiculoProprietarioModule {}