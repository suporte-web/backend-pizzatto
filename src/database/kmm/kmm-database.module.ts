import { Module } from '@nestjs/common';
import { KmmDatabaseService } from './kmm-database.service';

@Module({
  providers: [KmmDatabaseService],
  exports: [KmmDatabaseService],
})
export class KmmDatabaseModule {}