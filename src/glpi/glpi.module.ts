import { Module } from '@nestjs/common';
import { GlpiService } from './glpi.service';
import { GlpiController } from './glpi.controller';
import { AuthModule } from 'src/auth/auth.module';
import { HttpModule } from '@nestjs/axios';

@Module({
  imports: [AuthModule, HttpModule],
  controllers: [GlpiController],
  providers: [GlpiService],
})
export class GlpiModule {}
