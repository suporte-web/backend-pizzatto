import { AuthGuard } from '@/auth/auth.guard';
import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { RecrutamentoInternoCandidatoService } from './recrutamentoInternoCandidato.service';
import { ClientIp } from '@/decorator/client-ip.decorator';
import { User } from '@/decorator/user.decorator';

@ApiTags('Recrutamento Interno Candidato')
@Controller('recrutamento-interno-candidato')
@UseGuards(AuthGuard)
export class RecrutamentoInternoCandidatoController {
  constructor(
    private readonly recrutamentoInternoCandidatoService: RecrutamentoInternoCandidatoService,
  ) {}

  @Post('create')
  @ApiOperation({ summary: 'Cria o Candidato do Recrutamento Interno' })
  async create(@Body() body: any, @ClientIp() ip: string, @User() user: any) {
    return await this.recrutamentoInternoCandidatoService.create(
      body,
      ip,
      user,
    );
  }

  @Get('find-by-recrutamento/:idRecrutamento')
  @ApiOperation({
    summary: 'Busca as candidaturas feitas pelo ID do Recrutamento',
  })
  async findByRecrutamento(@Param('idRecrutamento') idRecrutamento: string) {
    return await this.recrutamentoInternoCandidatoService.findByRecrutamento(
      idRecrutamento,
    );
  }

  @Get('find-by-candidato/:idCandidato')
  @ApiOperation({
    summary: 'Busca as candidaturas feitas pelo ID do Candidato',
  })
  async findByCandidato(@Param('idCandidato') idCandidato: string) {
    return await this.recrutamentoInternoCandidatoService.findByCandidato(
      idCandidato,
    );
  }

  @Patch('update')
  @ApiOperation({ summary: 'Atualiza o candidato com base no ID passado' })
  async update(@Body() body: any, @ClientIp() ip: string, @User() user: any) {
    return await this.recrutamentoInternoCandidatoService.update(
      body,
      ip,
      user,
    );
  }

  @Post('count-candidatos-inscritos')
  @ApiOperation({ summary: 'Conta os candidatos com base no mês de referencia passado' })
  async countCandidatosInscritos(@Body() body: any) {
    return await this.recrutamentoInternoCandidatoService.countCandidatosInscritos(
      body,
    );
  }
}
