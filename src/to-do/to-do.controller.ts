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
import { AuthGuard } from '../auth/auth.guard';

@ApiTags('ToDo')
@Controller('to-do')
@UseGuards(AuthGuard)
export class ToDoController {
  constructor(private readonly toDoService: ToDoService) {}

  @Post('create')
  @ApiOperation({
    summary: 'Cria o A Fazer',
  })
  create(@Body() body: any) {
    return this.toDoService.create(body);
  }

  @Get()
  @ApiOperation({
    summary: 'Encontra todos os A Fazeres criados',
  })
  findAll() {
    return this.toDoService.findAll();
  }

  @Get(':id')
  @ApiOperation({
    summary: 'Encontra o A Fazer com base no ID',
  })
  findOne(@Param('id') id: string) {
    return this.toDoService.findOne(id);
  }

  @Patch('update/:id')
  @ApiOperation({
    summary: 'Atualiza o A Fazer com base no ID',
  })
  update(@Param('id') id: string, @Body() body: any) {
    return this.toDoService.update(id, body);
  }

  @Delete(':id')
  @ApiOperation({
    summary: 'Deleta o A Fazer com base no ID',
  })
  delete(@Param('id') id: string) {
    return this.toDoService.delete(id);
  }

  @Post('find-by-filter')
  @ApiOperation({ summary: 'Busca o item no Inventário por meio de filtro' })
  async findByFilter(@Body() body: any) {
    return await this.toDoService.findByFilter(body);
  }
}
