import { AuthGuard } from '@/auth/auth.guard';
import { ClientIp } from '@/decorator/client-ip.decorator';
import { User } from '@/decorator/user.decorator';
import { Body, Controller, Get, Headers, Post, UseGuards } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { PeriodoAquisitivoFeriasService } from './periodoAquisitivoFerias.service';
import { SolicitacaoFeriasService } from './solicitacaoFerias.service';
import { StatusFeriasService } from './statusFerias.service';
import { AlertasFeriasService } from './alertasFerias.service';
import { FeriasEmailService } from './feriasEmail.service';

@ApiTags('Férias')
@Controller('ferias')
@UseGuards(AuthGuard)
export class FeriasController {
  constructor(
    private readonly periodoService: PeriodoAquisitivoFeriasService,

    private readonly solicitacaoService: SolicitacaoFeriasService,

    private readonly statusFeriasService: StatusFeriasService,

    private readonly alertasFeriasService: AlertasFeriasService,

    private readonly emailService: FeriasEmailService,
  ) {}

  @Post('gerar-periodos-aquisitivos')
  @ApiOperation({
    summary: 'Gera os períodos aquisitivos de férias',
  })
  async gerarPeriodosAquisitivos() {
    return await this.periodoService.gerarPeriodosAquisitivos();
  }

  @Post('solicitacao/create')
  @ApiOperation({
    summary: 'Cria uma solicitação de férias',
  })
  async createSolicitacao(
    @Body() body: any,
    @ClientIp() ip: string,
    @User() user: any,
  ) {
    return await this.solicitacaoService.create(body, ip, user);
  }

  @Post('solicitacao/find-by-filter')
  @ApiOperation({
    summary: 'Lista as solicitações de férias por filtros',
  })
  async findByFilter(@Body() body: any, @User() user: any) {
    return this.solicitacaoService.findByFilter(body, user);
  }

  @Post('solicitacao/aprovar')
  @ApiOperation({
    summary: 'Aprova uma solicitação de férias',
  })
  async aprovarSolicitacao(
    @Body() body: any,
    @ClientIp() ip: string,
    @User() user: any,
    @Headers('authorization')
    authorization: string,
  ) {
    return await this.solicitacaoService.aprovarSolicitacao(
      body.solicitacaoId,
      ip,
      user,
      authorization,
    );
  }

  @Post('solicitacao/update')
  @ApiOperation({
    summary: 'Altera uma solicitação de férias pelo RH',
  })
  async updateSolicitacao(
    @Body() body: any,
    @ClientIp() ip: string,
    @User() user: any,
  ) {
    return await this.solicitacaoService.updateSolicitacao(body, ip, user);
  }

  @Post('parcela/documento/disponibilizar')
  @ApiOperation({
    summary: 'Disponibiliza documento de férias para uma parcela',
  })
  async disponibilizarDocumento(
    @Body() body: any,
    @ClientIp() ip: string,
    @User() user: any,
  ) {
    return await this.solicitacaoService.disponibilizarDocumento(
      body,
      ip,
      user,
    );
  }

  @Post('parcela/documento/assinado')
  @ApiOperation({
    summary: 'Envia o documento de férias assinado pelo colaborador',
  })
  async enviarDocumentoAssinado(
    @Body() body: any,
    @ClientIp() ip: string,
    @User() user: any,
  ) {
    return await this.solicitacaoService.enviarDocumentoAssinado(
      body,
      ip,
      user,
    );
  }

  @Post('atualizar-status-automaticos')
  @ApiOperation({
    summary: 'Atualiza automaticamente os status das férias',
  })
  async atualizarStatusAutomaticos() {
    return await this.statusFeriasService.atualizarStatusAutomaticos();
  }

  @Post('verificar-alertas-vencimento')
  @ApiOperation({
    summary: 'Verifica alertas de vencimento de férias',
  })
  async verificarAlertasVencimento() {
    return await this.alertasFeriasService.verificarAlertasVencimento();
  }

  @Get('periodos/disponiveis')
  @ApiOperation({
    summary: 'Busca os períodos aquisitivos disponíveis do usuário autenticado',
  })
  async findPeriodosDisponiveis(@User() user: any) {
    return await this.periodoService.findDisponiveis(user);
  }
}
