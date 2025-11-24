import { Module } from '@nestjs/common';
import { ContasOfficeService } from './contasOffice.service';
import { ContasOfficeController } from './contasOffice.controller';
import { MongooseModule } from '@nestjs/mongoose';
import { ContasOfficeSchema } from './contasOffice.schema';
import { AuthModule } from 'src/auth/auth.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: 'ContasOffice', schema: ContasOfficeSchema },
    ]),
    AuthModule,
  ],
  controllers: [ContasOfficeController],
  providers: [ContasOfficeService],
})
export class ContasOfficeModule {}
