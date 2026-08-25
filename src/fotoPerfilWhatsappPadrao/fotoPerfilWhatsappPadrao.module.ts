import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { PrismaService } from '../prisma/prisma.service';
import { FotoPerfilWhatsappPadraoController } from './fotoPerfilWhatsappPadrao.controller';
import { FotoPerfilWhatsappPadraoService } from './fotoPerfilWhatsappPadrao.service';

@Module({
  imports: [AuthModule],
  controllers: [FotoPerfilWhatsappPadraoController],
  providers: [FotoPerfilWhatsappPadraoService, PrismaService],
})
export class FotoPerfilWhatsappPadraoModule {}
