import { AuthModule } from '@/auth/auth.module';
import { Module } from '@nestjs/common';
import { MotivosReprovacaoController } from './motivosReprovacao.controller';
import { MotivosReprovacaoService } from './motivosReprovacao.service';
import { PrismaService } from '@/prisma/prisma.service';

@Module({
  imports: [AuthModule],
  controllers: [MotivosReprovacaoController],
  providers: [MotivosReprovacaoService, PrismaService],
})
export class MotivosReprovacaoModule {}
