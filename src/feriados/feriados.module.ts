import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { PrismaService } from '../prisma/prisma.service';
import { FeriadosController } from './feriados.controller';
import { FeriadosService } from './feriados.service';
import { FeriadosNotificacoesService } from './feriadosNotificacoes.service';
import { EmailModule } from '../email/email.module';

@Module({
  imports: [AuthModule, EmailModule],
  controllers: [FeriadosController],
  providers: [FeriadosService, PrismaService, FeriadosNotificacoesService],
})
export class FeriadosModule {}
