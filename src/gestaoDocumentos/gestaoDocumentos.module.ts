import { AuthModule } from "@/auth/auth.module";
import { Module } from "@nestjs/common";
import { PrismaService } from "@/prisma/prisma.service";
import { GestaoDocumentosService } from "./gestaoDocumentos.service";
import { GestaoDocumentosController } from "./gestaoDocumentos.controller";

@Module({
    imports: [AuthModule],
    controllers: [GestaoDocumentosController],
    providers: [GestaoDocumentosService, PrismaService]
})
export class GestaoDocumentosModule {}