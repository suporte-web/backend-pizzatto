import { AuthModule } from "@/auth/auth.module";
import { Module } from "@nestjs/common";
import { GestaoLicencasController } from "./gestaoLicencas.controller";
import { GestaoLicencasService } from "./gestaoLicencas.service";
import { PrismaService } from "@/prisma/prisma.service";

@Module({
    imports: [AuthModule],
    controllers: [GestaoLicencasController],
    providers: [
        GestaoLicencasService,
        PrismaService,
    ]
})
export class GestaoLicencasModule {}