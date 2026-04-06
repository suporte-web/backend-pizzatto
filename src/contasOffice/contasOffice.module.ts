import { Module } from '@nestjs/common';
import { ContasOfficeService } from './contasOffice.service';
import { ContasOfficeController } from './contasOffice.controller';
import { AuthModule } from '../auth/auth.module';
import { PrismaService } from '../prisma/prisma.service';

@Module({
  imports: [AuthModule],
  controllers: [ContasOfficeController],
  providers: [ContasOfficeService, PrismaService],
})
export class ContasOfficeModule {}
