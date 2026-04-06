import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { AssinaturaPadraoService } from "./assinaturaPadrao.service";
import { PrismaService } from "../prisma/prisma.service";
import { AssinaturaPadraoController } from "./assinaturaPadrao.controller";

@Module({
    imports: [AuthModule],
    controllers: [AssinaturaPadraoController],
    providers: [AssinaturaPadraoService, PrismaService],
})
export class AssinaturaPadraoModule {}