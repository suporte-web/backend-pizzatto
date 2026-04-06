import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { InventarioImpressorasController } from './inventarioImpressoras.controller';
import { InventarioImpressorasService } from './inventarioImpressoras.service';
import { PrismaService } from '../prisma/prisma.service';

@Module({
  imports: [AuthModule],
  controllers: [InventarioImpressorasController],
  providers: [InventarioImpressorasService, PrismaService],
  exports: [InventarioImpressorasService],
})
export class InventarioImpressoraModule {}
