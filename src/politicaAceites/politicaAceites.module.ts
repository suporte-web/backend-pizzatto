import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { PrismaService } from '../prisma/prisma.service';
import { PoliticasAceitesController } from './politicaAceites.controller';
import { PoliticasAceitesService } from './politicaAceites.service';

@Module({
  imports: [AuthModule],
  controllers: [PoliticasAceitesController],
  providers: [PoliticasAceitesService, PrismaService],
})
export class PoliticasAceitesModule {}
