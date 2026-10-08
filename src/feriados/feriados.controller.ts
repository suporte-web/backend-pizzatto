import { AuthGuard } from '@/auth/auth.guard';
import { ClientIp } from '@/decorator/client-ip.decorator';
import { User } from '@/decorator/user.decorator';
import {
  Body,
  Controller,
  Get,
  ParseIntPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { FeriadosService } from './feriados.service';
import { FilialFeriado } from '../../generated/prisma/enums';

@ApiTags('Feriados')
@Controller('feriados')
@UseGuards(AuthGuard)
export class FeriadosController {
  constructor(private readonly service: FeriadosService) {}

  @Post('create')
  @ApiOperation({ summary: 'Cria o Feriado' })
  async create(@Body() body: any, @ClientIp() ip: string, @User() user: any) {
    return await this.service.create(body, ip, user);
  }

  @Post('find-by-filter')
  @ApiOperation({ summary: 'Busca todos os Feriados filtrando' })
  async findByFilter(@Body() body: any) {
    return await this.service.findByFilter(body);
  }

  @Patch('update')
  @ApiOperation({
    summary: 'Atualiza o Feriado',
  })
  async update(@Body() body: any, @ClientIp() ip: string, @User() user: any) {
    return await this.service.update(body, ip, user);
  }

  @Get('find-by-ano')
  @ApiOperation({
    summary: 'Lista feriados de um ano, incluindo os recorrentes',
  })
  async findByAno(
    @Query('ano', ParseIntPipe) ano: number,
    @Query('filial') filial: FilialFeriado,
  ) {
    return this.service.findByAno(ano, filial);
  }
}
