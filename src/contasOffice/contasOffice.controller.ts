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
import { ContasOfficeService } from './contasOffice.service';
import { AuthGuard } from '../auth/auth.guard';
import { ApiOperation, ApiTags } from '@nestjs/swagger';

@ApiTags('ContasOffice')
@Controller('contas-office')
@UseGuards(AuthGuard)
export class ContasOfficeController {
  constructor(private readonly contasOfficeService: ContasOfficeService) {}

  @Post('create')
  @ApiOperation({
    summary: 'Cria a Conta de Office',
  })
  create(@Body() body: any) {
    return this.contasOfficeService.create(body);
  }

  @Post('create-by-spreadsheet')
  @ApiOperation({
    summary: 'Criar a Conta de Office por meio de planilha',
  })
  createBySpreadsheet(@Body() body: any) {
    return this.contasOfficeService.createBySpreadsheet(body);
  }

  @Get('find-ativos')
  @ApiOperation({
    summary: 'Encontra as Contas de Office ativas',
  })
  findAtivos() {
    return this.contasOfficeService.findAtivos();
  }

  @Post('find-by-filter')
  @ApiOperation({
    summary: 'Encontra a Contas de Office filtrando',
  })
  @ApiOperation({ summary: 'Busca as contas do office por meio de filtro' })
  async findByFilter(@Body() body: any) {
    return await this.contasOfficeService.findByFilter(body);
  }

  @Get()
  @ApiOperation({
    summary: 'Encontra todas as Contas de Office',
  })
  findAll() {
    return this.contasOfficeService.findAll();
  }

  @Get(':id')
  @ApiOperation({
    summary: 'Encontra uma Conta de Ofice com base no ID',
  })
  findOne(@Param('id') id: string) {
    return this.contasOfficeService.findOne(id);
  }

  @Patch('update/:id')
  @ApiOperation({
    summary: 'Atualiza a Conta de Office com base no ID',
  })
  update(@Param('id') id: string, @Body() body: any) {
    return this.contasOfficeService.update(id, body);
  }

  @Delete(':id')
  @ApiOperation({
    summary: 'Deleta a Conta de Office com base no ID',
  })
  delete(@Param('id') id: string) {
    return this.contasOfficeService.delete(id);
  }
}
