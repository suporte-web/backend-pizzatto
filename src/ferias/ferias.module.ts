import { Module } from '@nestjs/common';
import { AuthModule } from '@/auth/auth.module';
import { PrismaService } from '@/prisma/prisma.service';
import { KmmDatabaseModule } from '@/database/kmm/kmm-database.module';
import { FeriasController } from './ferias.controller';
import { PeriodoAquisitivoFeriasService } from './periodoAquisitivoFerias.service';
import { FeriasRegrasService } from './feriasRegras.service';
import { SolicitacaoFeriasService } from './solicitacaoFerias.service';
import { HttpModule } from '@nestjs/axios';
import { StatusFeriasService } from './statusFerias.service';
import { AlertasFeriasService } from './alertasFerias.service';
import { FeriasEmailService } from './feriasEmail.service';
import { FeriasSchedulerService } from './feriasScheduler.service';
import { AniversariantesKmmModule } from '@/aniversariantesKmm/aniversariantesKmm.module';

@Module({
  imports: [
    AuthModule,
    HttpModule,
    KmmDatabaseModule,
    AniversariantesKmmModule,
  ],
  controllers: [FeriasController],
  providers: [
    PeriodoAquisitivoFeriasService,
    FeriasRegrasService,
    SolicitacaoFeriasService,
    StatusFeriasService,
    PrismaService,
    AlertasFeriasService,
    FeriasEmailService,
    FeriasSchedulerService,
  ],
})
export class FeriasModule {}
