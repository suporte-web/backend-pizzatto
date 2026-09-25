import { Module } from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service';
import { AuthModule } from '@/auth/auth.module';
import { SaudeEmDiaController } from './saudeEmDia.controller';
import { SaudeEmDiaService } from './saudeEmDia.service';

@Module({
  imports: [AuthModule],
  controllers: [SaudeEmDiaController],
  providers: [SaudeEmDiaService, PrismaService],
  exports: [SaudeEmDiaService],
})
export class SaudeEmDiaModule {}
