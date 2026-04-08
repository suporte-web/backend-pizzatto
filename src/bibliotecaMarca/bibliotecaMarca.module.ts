import { AuthModule } from "@/auth/auth.module";
import { Module } from "@nestjs/common";
import { BibliotecaMarcaController } from "./bibliotecaMarca.controller";
import { BibliotecaMarcaService } from "./bibliotecaMarca.service";
import { PrismaService } from "@/prisma/prisma.service";

@Module({
    imports: [AuthModule],
    controllers: [BibliotecaMarcaController],
    providers: [BibliotecaMarcaService, PrismaService]
})
export class BibliotecaMarcaModule {}