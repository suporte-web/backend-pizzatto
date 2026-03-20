import { Module } from '@nestjs/common';
import { AuthModule } from 'src/auth/auth.module';
import { PopController } from './pops.controller';
import { FileModule } from 'src/file/file.module';
import { FileService } from 'src/file/file.service';
import { PopService } from './pops.service';
import { PrismaService } from 'src/prisma/prisma.service';

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
