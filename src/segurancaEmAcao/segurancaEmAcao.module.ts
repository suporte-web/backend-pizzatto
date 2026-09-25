import { Module } from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service';
import { AuthModule } from '@/auth/auth.module';
import { SegurancaEmAcaoService } from './segurancaEmAcao.service';
import { SegurancaEmAcaoController } from './segurancaEmAcao.controller';

@Module({
  imports: [AuthModule],
  controllers: [SegurancaEmAcaoController],
  providers: [SegurancaEmAcaoService, PrismaService],
  exports: [SegurancaEmAcaoService],
})
export class SegurancaEmAcaoModule {}
