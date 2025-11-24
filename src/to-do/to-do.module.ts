import { Module } from '@nestjs/common';
import { ToDoService } from './to-do.service';
import { ToDoController } from './to-do.controller';
import { MongooseModule } from '@nestjs/mongoose';
import { ToDoSchema } from './to-do.schema';
import { AuthModule } from 'src/auth/auth.module';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: 'ToDo', schema: ToDoSchema }]),
    AuthModule,
  ],
  controllers: [ToDoController],
  providers: [ToDoService],
})
export class ToDoModule {}
