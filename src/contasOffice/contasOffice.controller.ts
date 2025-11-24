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
import { AuthGuard } from 'src/auth/auth.guard';
import { ApiOperation, ApiTags } from '@nestjs/swagger';

@ApiTags('ContasOffice')
@Controller('contas-office')
@UseGuards(AuthGuard)
export class ContasOfficeController {
  constructor(private readonly contasOfficeService: ContasOfficeService) {}

  @Post('create')
  create(@Body() body: any) {
    return this.contasOfficeService.create(body);
  }

  @Post('create-by-spreadsheet')
  createBySpreadsheet(@Body() body: any) {
    return this.contasOfficeService.createBySpreadsheet(body);
  }

  @Get('find-ativos')
  findAtivos() {
    return this.contasOfficeService.findAtivos();
  }

  @Post('find-by-filter')
  @ApiOperation({ summary: 'Busca as contas do office por meio de filtro' })
  async findByFilter(@Body() body: any) {
    return await this.contasOfficeService.findByFilter(body);
  }

  @Get()
  findAll() {
    return this.contasOfficeService.findAll();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.contasOfficeService.findOne(id);
  }

  @Patch('update/:id')
  update(@Param('id') id: string, @Body() body: any) {
    return this.contasOfficeService.update(id, body);
  }

  @Delete(':id')
  delete(@Param('id') id: string) {
    return this.contasOfficeService.delete(id);
  }
}
