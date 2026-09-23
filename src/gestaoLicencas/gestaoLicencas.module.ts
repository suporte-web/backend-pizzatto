import { AuthModule } from '@/auth/auth.module';
import { Module } from '@nestjs/common';
import { GestaoLicencasController } from './gestaoLicencas.controller';
import { GestaoLicencasService } from './gestaoLicencas.service';
import { PrismaService } from '@/prisma/prisma.service';
import { LicencaNotificacaoService } from './licencaNotificacao.service';

@Module({
  imports: [AuthModule],
  controllers: [GestaoLicencasController],
  providers: [GestaoLicencasService, LicencaNotificacaoService, PrismaService],
})
export class GestaoLicencasModule {}
