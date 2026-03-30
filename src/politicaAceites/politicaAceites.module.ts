import { Module } from '@nestjs/common';
import { AuthModule } from 'src/auth/auth.module';
import { PrismaService } from 'src/prisma/prisma.service';
import { PoliticasAceitesController } from './politicaAceites.controller';
import { PoliticasAceitesService } from './politicaAceites.service';

@Module({
  imports: [AuthModule],
  controllers: [PoliticasAceitesController],
  providers: [PoliticasAceitesService, PrismaService],
})
export class PoliticasAceitesModule {}
