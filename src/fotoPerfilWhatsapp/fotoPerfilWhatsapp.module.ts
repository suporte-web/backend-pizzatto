import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { PrismaService } from '../prisma/prisma.service';
import { FotoPerfilWhatsappController } from './fotoPerfilWhatsapp.controller';
import { FotoPerfilWhatsappService } from './fotoPerfilWhatsapp.service';

@Module({
  imports: [AuthModule],
  controllers: [FotoPerfilWhatsappController],
  providers: [FotoPerfilWhatsappService, PrismaService],
})
export class FotoPerfilWhatsappModule {}
