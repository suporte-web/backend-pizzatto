import { Module } from '@nestjs/common';
import { AuthModule } from 'src/auth/auth.module';
import { AssinaturasEmailController } from './assinaturasEmail.controller';
import { AssinaturasEmailService } from './assinaturasEmail.service';
import { PrismaService } from 'src/prisma/prisma.service';

@Module({
  imports: [AuthModule],
  controllers: [AssinaturasEmailController],
  providers: [AssinaturasEmailService, PrismaService],
})
export class AssinaturasEmailModule {}
