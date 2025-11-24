import { Body, Controller, Patch, Post, UseGuards } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { InventarioService } from './inventario.service';
import { AuthGuard } from 'src/auth/auth.guard';

@ApiTags('Inventario')
@Controller('inventario')
@UseGuards(AuthGuard)
export class InventarioController {
  constructor(private readonly inventarioService: InventarioService) {}

  @Post('create')
  @ApiOperation({ summary: 'Cria o item no Inventário' })
  async create(@Body() body: any) {
    return await this.inventarioService.create(body);
  }

  @Post('create-by-spreadsheet')
  @ApiOperation({ summary: 'Cria o item no Inventário por planilha Excel' })
  async createBySpreadsheet(@Body() body: any) {
    return await this.inventarioService.createBySpreadsheet(body);
  }

  @Post('find-by-filter')
  @ApiOperation({ summary: 'Busca o item no Inventário por meio de filtro' })
  async findByFilter(@Body() body: any) {
    return await this.inventarioService.findByFilter(body);
  }

  @Patch('update')
  @ApiOperation({ summary: 'Atualiza o item no Inventário' })
  async update(@Body() body: any) {
    return await this.inventarioService.update(body);
  }
}
