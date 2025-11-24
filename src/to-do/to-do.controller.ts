import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  UseGuards,
} from '@nestjs/common';
import { ToDoService } from './to-do.service';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { AuthGuard } from 'src/auth/auth.guard';

@ApiTags('ToDo')
@Controller('to-do')
@UseGuards(AuthGuard)
export class ToDoController {
  constructor(private readonly toDoService: ToDoService) {}

  @Post('create')
  create(@Body() body: any) {
    return this.toDoService.create(body);
  }

  @Get()
  findAll() {
    return this.toDoService.findAll();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.toDoService.findOne(id);
  }

  @Patch('update/:id')
  update(@Param('id') id: string, @Body() body: any) {
    return this.toDoService.update(id, body);
  }

  @Delete(':id')
  delete(@Param('id') id: string) {
    return this.toDoService.delete(id);
  }

  @Post('find-by-filter')
  @ApiOperation({ summary: 'Busca o item no Inventário por meio de filtro' })
  async findByFilter(@Body() body: any) {
    return await this.toDoService.findByFilter(body);
  }
}
