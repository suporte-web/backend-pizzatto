import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AuthModule } from 'src/auth/auth.module';
import { InventarioImpressorasController } from './inventarioImpressoras.controller';
import { InventarioImpressorasService } from './inventarioImpressoras.service';
import { InventarioImpressoraSchema } from './inventarioImpressoras.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: 'InventarioImpressora', schema: InventarioImpressoraSchema },
    ]),
    AuthModule,
  ],
  controllers: [InventarioImpressorasController],
  providers: [InventarioImpressorasService],
  exports: [InventarioImpressorasService],
})
export class InventarioImpressoraModule {}
