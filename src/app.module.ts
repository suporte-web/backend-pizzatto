import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AuthModule } from './auth/auth.module';
import { MongooseModule } from '@nestjs/mongoose';
import { UserModule } from './user/user.module';
import { PopModule } from './pops/pops.module';
import { FileModule } from './file/file.module';
import { InventarioModule } from './inventario/inventario.module';
import { InventarioImpressoraModule } from './inventarioImpressoras/inventarioImpressoras.module';
import { ContasOfficeModule } from './contasOffice/contasOffice.module';
import { ToDoModule } from './to-do/to-do.module';
import { GlpiModule } from './glpi/glpi.module';
import { ConfigModule } from '@nestjs/config';
import { PlantaoModule } from './plantao/plantao.module.';

@Module({
  imports: [
    MongooseModule.forRoot(
      process.env.MONGO_URI || 'mongodb://localhost:27017/defaultdb',
    ),
    ConfigModule.forRoot({
      isGlobal: true, // importantíssimo
    }),
    UserModule,
    AuthModule,
    PopModule,
    FileModule,
    InventarioModule,
    InventarioImpressoraModule,
    ContasOfficeModule,
    GlpiModule,
    ToDoModule,
    PlantaoModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
