import { Module } from '@nestjs/common';
import { PlantaoController } from './plantao.controller';
import { PlantaoService } from './plantao.service';
import { PrismaService } from 'src/prisma/prisma.service';
import { AuthModule } from 'src/auth/auth.module';

@Module({
  imports: [AuthModule],
  controllers: [PlantaoController],
  providers: [PlantaoService, PrismaService],
})
export class PlantaoModule {}
