import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { ContasEmailController } from './contasEmail.controller';
import { ContasEmailService } from './contasEmail.service';
import { AuthModule } from '@/auth/auth.module';

@Module({
  imports: [PrismaModule, AuthModule],
  controllers: [ContasEmailController],
  providers: [ContasEmailService],
  exports: [ContasEmailService],
})
export class ContasEmailModule {}
