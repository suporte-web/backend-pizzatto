import { Module } from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service';
import { BeneficiosController } from './beneficios.controller';
import { BeneficiosService } from './beneficios.service';
import { AuthModule } from '@/auth/auth.module';

@Module({
  imports: [AuthModule],
  controllers: [BeneficiosController],
  providers: [BeneficiosService, PrismaService],
  exports: [BeneficiosService],
})
export class BeneficiosModule {}
