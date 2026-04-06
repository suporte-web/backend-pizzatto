import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { PopController } from './pops.controller';
import { FileModule } from '../file/file.module';
import { FileService } from '../file/file.service';
import { PopService } from './pops.service';
import { PrismaService } from '../prisma/prisma.service';

@Module({
  imports: [
    AuthModule,
    FileModule
  ],
  controllers: [PopController],
  providers: [PopService, FileService, PrismaService],
  exports: [PopService],
})
export class PopModule {}
