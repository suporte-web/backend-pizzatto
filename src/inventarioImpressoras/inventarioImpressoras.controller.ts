import { Body, Controller, Patch, Post, UseGuards } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { AuthGuard } from '../auth/auth.guard';
import { InventarioImpressorasService } from './inventarioImpressoras.service';

@ApiTags('InventarioImpressoras')
@Controller('inventarioImpressoras')
@UseGuards(AuthGuard)
export class InventarioImpressorasController {
  constructor(
    private readonly inventarioImpressorasService: InventarioImpressorasService,
  ) {}

  @Post('create')
  @ApiOperation({ summary: 'Cria o item no Inventário de Impressora' })
  async create(@Body() body: any) {
    return await this.inventarioImpressorasService.create(body);
  }

  @Post('create-by-spreadsheet')
  @ApiOperation({
    summary: 'Cria o item no Inventário de Impressora por planilha Excel',
  })
  async createBySpreadsheet(@Body() body: any) {
    return await this.inventarioImpressorasService.createBySpreadsheet(body);
  }

  @Post('find-by-filter')
  @ApiOperation({ summary: 'Busca o item no Inventário por meio de filtro' })
  async findByFilter(@Body() body: any) {
    return await this.inventarioImpressorasService.findByFilter(body);
  }

  @Patch('update')
    @ApiOperation({ summary: 'Atualiza o item no Inventário' })
    async update(@Body() body: any) {
      return await this.inventarioImpressorasService.update(body);
    }
}
