import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AuthModule } from './auth/auth.module';
import { PopModule } from './pops/pops.module';
import { FileModule } from './file/file.module';
import { InventarioImpressoraModule } from './inventarioImpressoras/inventarioImpressoras.module';
import { ContasOfficeModule } from './contasOffice/contasOffice.module';
import { ToDoModule } from './to-do/to-do.module';
import { GlpiModule } from './glpi/glpi.module';
import { PlantaoModule } from './plantao/plantao.module.';
import { PrismaModule } from './prisma/prisma.module';
import { AssinaturasEmailModule } from './assinaturasEmail/assinaturasEmail.module';
import { AssinaturaPadraoModule } from './assinaturaPadrao/assinaturaPadrao.module';

@Module({
  imports: [
    PrismaModule,
    AuthModule,
    PopModule,
    FileModule,
    InventarioImpressoraModule,
    ContasOfficeModule,
    GlpiModule,
    ToDoModule,
    PlantaoModule,
    AssinaturasEmailModule,
    AssinaturaPadraoModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
