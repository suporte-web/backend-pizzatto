import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { InventarioSchema } from './inventario.schema';
import { InventarioController } from './inventario.controller';
import { InventarioService } from './inventario.service';
import { AuthModule } from 'src/auth/auth.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: 'Inventario', schema: InventarioSchema },
    ]),
    AuthModule,
  ],
  controllers: [InventarioController],
  providers: [InventarioService],
  exports: [InventarioService],
})
export class InventarioModule {}
