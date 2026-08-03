import { AuthModule } from "@/auth/auth.module";
import { Module } from "@nestjs/common";
import { CasesSucessoController } from "./casesSucesso.controller";
import { CasesSucessoService } from "./casesSucesso.service";
import { PrismaService } from "@/prisma/prisma.service";

@Module({
    imports: [AuthModule],
    controllers: [CasesSucessoController],
    providers: [
        CasesSucessoService,
        PrismaService,
    ]
})

export class CasesSucessoModule {}