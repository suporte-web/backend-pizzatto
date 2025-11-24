import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { PopSchema } from './pops.schema';
import { AuthModule } from 'src/auth/auth.module';
import { PopService } from './pops.service';
import { PopController } from './pops.controller';
import { FileModule } from 'src/file/file.module';
import { FileService } from 'src/file/file.service';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: 'Pop', schema: PopSchema }]),
    AuthModule,
    FileModule
  ],
  controllers: [PopController],
  providers: [PopService, FileService],
  exports: [PopService],
})
export class PopModule {}
