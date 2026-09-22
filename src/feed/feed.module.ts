import { Module } from '@nestjs/common';

import { FeedController } from './feed.controller';
import { FeedService } from './feed.service';
import { AuthModule } from '@/auth/auth.module';
import { PrismaService } from '@/prisma/prisma.service';

@Module({
  imports: [AuthModule],

  controllers: [FeedController],

  providers: [FeedService, PrismaService],

  exports: [FeedService],
})
export class FeedModule {}
