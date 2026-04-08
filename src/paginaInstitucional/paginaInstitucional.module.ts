import { AuthModule } from '@/auth/auth.module';
import { Module } from '@nestjs/common';
import { PaginaInstitucionalController } from './paginaInstitucional.controller';
import { PaginaInstitucionalService } from './paginaInstitucional.service';
import { PrismaService } from '@/prisma/prisma.service';

@Module({
  imports: [AuthModule],
  controllers: [PaginaInstitucionalController],
  providers: [PaginaInstitucionalService, PrismaService],
})
export class PaginaInstitucionalModule {}
