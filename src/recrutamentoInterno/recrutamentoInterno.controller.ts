import {
  Body,
  Controller,
  Patch,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';

import { AuthGuard } from '@/auth/auth.guard';

import { RecrutamentoInternoService } from './recrutamentoInterno.service';

@ApiTags('Recrutamento Interno')
@Controller('recrutamento-interno')
@UseGuards(AuthGuard)
export class RecrutamentoInternoController {
  constructor(
    private readonly recrutamentoInternoService: RecrutamentoInternoService,
  ) {}

  @Post('create')
  @ApiOperation({ summary: 'Cria o Recrutamento Interno' })
  async create(
    @Body() body: any,
    @Req() req: any,
  ) {
    return await this.recrutamentoInternoService.create(
      body,
      req.ip,
      req.user,
    );
  }

  @Post('findByFilter')
  @ApiOperation({ summary: 'Encontra o Recrutamento Interno filtrando' })
  async findByFilter(@Body() body: any) {
    return await this.recrutamentoInternoService.findByFilter(
      body,
    );
  }

  @Patch('update')
  @ApiOperation({ summary: 'Atualiza o Recrutamento Interno com base no ID passado' })
  async update(
    @Body() body: any,
    @Req() req: any,
  ) {
    return await this.recrutamentoInternoService.update(
      body,
      req.ip,
      req.user,
    );
  }
}