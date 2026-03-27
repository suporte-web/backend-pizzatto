import { Module } from '@nestjs/common';
import { AuthModule } from 'src/auth/auth.module';
import { CalendarioController } from './calendario.controller';
import { CalendarioService } from './calendario.service';
import { PrismaService } from 'src/prisma/prisma.service';

@Module({
  imports: [AuthModule],
  controllers: [CalendarioController],
  providers: [CalendarioService, PrismaService],
})
export class CalendarioModule {}
