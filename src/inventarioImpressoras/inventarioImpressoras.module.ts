import { Module } from '@nestjs/common';
import { AuthModule } from 'src/auth/auth.module';
import { InventarioImpressorasController } from './inventarioImpressoras.controller';
import { InventarioImpressorasService } from './inventarioImpressoras.service';
import { PrismaService } from 'src/prisma/prisma.service';

@Module({
  imports: [AuthModule],
  controllers: [InventarioImpressorasController],
  providers: [InventarioImpressorasService, PrismaService],
  exports: [InventarioImpressorasService],
})
export class InventarioImpressoraModule {}
