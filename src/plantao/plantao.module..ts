import { Module } from '@nestjs/common';
import { PlantaoController } from './plantao.controller';
import { PlantaoService } from './plantao.service';
import { PrismaService } from '../prisma/prisma.service';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [AuthModule],
  controllers: [PlantaoController],
  providers: [PlantaoService, PrismaService],
})
export class PlantaoModule {}
