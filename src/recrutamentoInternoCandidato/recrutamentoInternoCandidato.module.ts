import { AuthModule } from '@/auth/auth.module';
import { Module } from '@nestjs/common';
import { RecrutamentoInternoCandidatoController } from './recrutamentoInternoCandidato.controller';
import { RecrutamentoInternoCandidatoService } from './recrutamentoInternoCandidato.service';
import { PrismaService } from '@/prisma/prisma.service';

@Module({
  imports: [AuthModule],
  controllers: [RecrutamentoInternoCandidatoController],
  providers: [RecrutamentoInternoCandidatoService, PrismaService],
})
export class RecrutamentoInternoCandidatoModule {}
