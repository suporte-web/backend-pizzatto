import { Module } from '@nestjs/common';
import { ToDoService } from './to-do.service';
import { ToDoController } from './to-do.controller';
import { AuthModule } from '../auth/auth.module';
import { PrismaService } from '../prisma/prisma.service';

@Module({
  imports: [
    AuthModule,
  ],
  controllers: [ToDoController],
  providers: [ToDoService, PrismaService],
})
export class ToDoModule {}
