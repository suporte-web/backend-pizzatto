import { AuthGuard } from '@/auth/auth.guard';
import { ClientIp } from '@/decorator/client-ip.decorator';
import { User } from '@/decorator/user.decorator';
import {
  Body,
  Controller,
  FileTypeValidator,
  Get,
  Headers,
  MaxFileSizeValidator,
  ParseFilePipe,
  Post,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { ApiConsumes, ApiOperation, ApiTags } from '@nestjs/swagger';
import { PeriodoAquisitivoFeriasService } from './periodoAquisitivoFerias.service';
import { SolicitacaoFeriasService } from './solicitacaoFerias.service';
import { StatusFeriasService } from './statusFerias.service';
import { AlertasFeriasService } from './alertasFerias.service';
import { FeriasEmailService } from './feriasEmail.service';
import { FileInterceptor } from '@nestjs/platform-express';

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
      body.parcelaId,
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
  @UseInterceptors(
    FileInterceptor('arquivo', {
      limits: {
        fileSize: 10 * 1024 * 1024,
      },
    }),
  )
  @ApiConsumes('multipart/form-data')
  @ApiOperation({
    summary: 'Disponibiliza documento PDF para uma parcela de férias',
  })
  async disponibilizarDocumento(
    @UploadedFile(
      new ParseFilePipe({
        validators: [
          new MaxFileSizeValidator({
            maxSize: 10 * 1024 * 1024,
          }),
          new FileTypeValidator({
            fileType: 'application/pdf',
          }),
        ],
        fileIsRequired: true,
      }),
    )
    arquivo: Express.Multer.File,

    @Body('parcelaId') parcelaId: string,

    @ClientIp() ip: string,

    @User() user: any,
  ) {
    return this.solicitacaoService.disponibilizarDocumento(
      {
        parcelaId,
        arquivo,
      },
      ip,
      user,
    );
  }

  @Post('parcela/documento/assinado')
  @UseInterceptors(
    FileInterceptor('arquivo', {
      limits: {
        fileSize: 10 * 1024 * 1024,
      },
    }),
  )
  @ApiConsumes('multipart/form-data')
  @ApiOperation({
    summary: 'Envia o documento de férias assinado pelo colaborador',
  })
  async enviarDocumentoAssinado(
    @UploadedFile(
      new ParseFilePipe({
        validators: [
          new MaxFileSizeValidator({
            maxSize: 10 * 1024 * 1024,
          }),
          new FileTypeValidator({
            fileType: 'application/pdf',
          }),
        ],
        fileIsRequired: true,
      }),
    )
    arquivo: Express.Multer.File,

    @Body('parcelaId') parcelaId: string,

    @ClientIp() ip: string,

    @User() user: any,
  ) {
    return await this.solicitacaoService.enviarDocumentoAssinado(
      {
        parcelaId,
        arquivo,
      },
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

  @Post('equipe/find-by-filter')
  @ApiOperation({
    summary: 'Lista períodos aquisitivos dos colaboradores da equipe do gestor',
  })
  async findByFilterEquipe(@Body() body: any, @User() user: any) {
    return this.periodoService.findByFilterEquipe(body, user);
  }
}
