import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { AuthGuard } from '../auth/auth.guard';
import { CreateContaEmailDto } from './dtos/CreateContaEmail.dto';
import { UpdateContaEmailDto } from './dtos/UpdateContaEmail.dto';
import { FindByFilterContaEmailDto } from './dtos/FindByFilterContaEmail.dto';
import { ContasEmailService } from './contasEmail.service';

@ApiTags('Contas Email')
@Controller('contas-email')
@UseGuards(AuthGuard)
export class ContasEmailController {
  constructor(private readonly contasEmailService: ContasEmailService) {}

  @Post('create')
  @ApiOperation({ summary: 'Cadastrar conta de email' })
  create(@Body() body: CreateContaEmailDto) {
    return this.contasEmailService.create(body);
  }

  @Post('create-by-spreadsheet')
  @ApiOperation({ summary: 'Importar contas por planilha' })
  createBySpreadsheet(
    @Body() body: CreateContaEmailDto[] | CreateContaEmailDto,
  ) {
    return this.contasEmailService.createBySpreadsheet(body);
  }

  @Get('find-ativos')
  @ApiOperation({ summary: 'Listar contas ativas' })
  findAtivos() {
    return this.contasEmailService.findAtivos();
  }

  @Get('find-all')
  @ApiOperation({ summary: 'Listar todas as contas' })
  findAll() {
    return this.contasEmailService.findAll();
  }

  @Post('find-by-filter')
  @ApiOperation({ summary: 'Pesquisar contas com filtros' })
  findByFilter(@Body() body: FindByFilterContaEmailDto) {
    return this.contasEmailService.findByFilter(body);
  }

  @Get('find-by-id/:id')
  @ApiOperation({ summary: 'Buscar conta pelo ID' })
  findOne(@Param('id') id: string) {
    return this.contasEmailService.findOne(id);
  }

  @Post('revelar-senha/:id')
  @ApiOperation({ summary: 'Revelar senha da conta' })
  revelarSenha(
    @Param('id') id: string,
    @Req() req: any,
    @Res({ passthrough: true }) res: Response,
  ) {
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Pragma', 'no-cache');

    return this.contasEmailService.revelarSenha(id, req.user);
  }

  @Patch('update/:id')
  @ApiOperation({ summary: 'Atualizar conta' })
  update(@Param('id') id: string, @Body() body: UpdateContaEmailDto) {
    return this.contasEmailService.update(id, body);
  }

  @Delete('delete/:id')
  @ApiOperation({ summary: 'Excluir conta' })
  delete(@Param('id') id: string) {
    return this.contasEmailService.delete(id);
  }
}
