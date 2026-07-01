import { AuthGuard } from '@/auth/auth.guard';
import { Body, Controller, Get, Patch, Post, UseGuards } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { MotivosReprovacaoService } from './motivosReprovacao.service';
import { ClientIp } from '@/decorator/client-ip.decorator';
import { User } from '@/decorator/user.decorator';

@ApiTags('Motivos-Reprovacao')
@Controller('motivos-reprovacao')
@UseGuards(AuthGuard)
export class MotivosReprovacaoController {
  constructor(
    private readonly motivosReprovacaoService: MotivosReprovacaoService,
  ) {}

  @Post('create')
  @ApiOperation({
    summary: 'Cria o Motivo de Reprovação',
  })
  async create(@Body() body: any, @ClientIp() ip: string, @User() user: any) {
    return await this.motivosReprovacaoService.create(body, ip, user);
  }

  @Get('find-all-ativos')
  @ApiOperation({
    summary: 'Encontra todos os Motivos de Reprovação ativos',
  })
  async findAllAtivos() {
    return await this.motivosReprovacaoService.findAllAtivos();
  }

  @Post('find-by-filter')
  @ApiOperation({
    summary: 'Encontra todos os Motivos de Reprovação filtrando',
  })
  async findByFilter(@Body() body: any) {
    return await this.motivosReprovacaoService.findByFilter(body);
  }

  @Patch('update')
  @ApiOperation({
    summary: 'Atualiza o Motivo de Reprovação com base no ID',
  })
  async update(@Body() body: any, @ClientIp() ip: string, @User() user: any) {
    return await this.motivosReprovacaoService.update(body, ip, user);
  }
}
