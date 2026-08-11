import { Module } from '@nestjs/common';
import { AuthModule } from '@/auth/auth.module';
import { AniversariantesKmmController } from './aniversariantesKmm.controller';
import { AniversariantesKmmService } from './aniversariantesKmm.service';
import { PrismaService } from '@/prisma/prisma.service';
import { KmmDatabaseModule } from '@/database/kmm/kmm-database.module';

@Module({
  imports: [AuthModule, KmmDatabaseModule],
  controllers: [AniversariantesKmmController],
  providers: [AniversariantesKmmService, PrismaService],
})
export class AniversariantesKmmModule {}
