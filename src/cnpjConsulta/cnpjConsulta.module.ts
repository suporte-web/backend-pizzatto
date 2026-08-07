import { Module } from '@nestjs/common';
import { PrismaService } from '@/prisma/prisma.service';
import { CnpjConsultaController } from './cnpjConsulta.controller';
import { CnpjConsultaService } from './cnpjConsulta.service';
import { AuthModule } from '@/auth/auth.module';

@Module({
  imports: [AuthModule],
  controllers: [CnpjConsultaController],
  providers: [CnpjConsultaService, PrismaService],
})
export class CnpjConsultaModule {}
