import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

import { AppController } from './app.controller';
import { AppService } from './app.service';

import { PlantaoModule } from './plantao/plantao.module.';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    PlantaoModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
