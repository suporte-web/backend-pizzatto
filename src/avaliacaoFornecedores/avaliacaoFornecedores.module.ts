import { AuthModule } from "@/auth/auth.module";
import { Module } from "@nestjs/common";
import { AvaliacaoFornecedoresController } from "./avaliacaoFornecedores.controller";
import { AvaliacaoFornecedoresService } from "./avaliacaoFornecedores.service";
import { PrismaService } from "@/prisma/prisma.service";

@Module({
    imports: [AuthModule],
    controllers: [AvaliacaoFornecedoresController],
    providers: [AvaliacaoFornecedoresService, PrismaService],
})
export class AvaliacaoFornecedoresModule {}