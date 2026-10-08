import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { PrismaService } from '../prisma/prisma.service';
import { FeriadosController } from './feriados.controller';
import { FeriadosService } from './feriados.service';

@Module({
  imports: [AuthModule],
  controllers: [FeriadosController],
  providers: [FeriadosService, PrismaService],
})
export class FeriadosModule {}