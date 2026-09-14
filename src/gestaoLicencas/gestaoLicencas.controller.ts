import { AuthGuard } from '@/auth/auth.guard';
import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { GestaoLicencasService } from './gestaoLicencas.service';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { User } from '@/decorator/user.decorator';
import { ClientIp } from '@/decorator/client-ip.decorator';
import { extname } from 'path';
import { randomUUID } from 'crypto';
import { mkdirSync } from 'fs';

@ApiTags('Gestão de Licenças')
@Controller('gestao-licencas')
@UseGuards(AuthGuard)
export class GestaoLicencasController {
  constructor(private readonly gestaoLicencasService: GestaoLicencasService) {}

  @Post('licenca/create')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: diskStorage({
        destination: './downloads/gestao-licencas',
        filename: (_req, file, callback) => {
          const extensao = extname(file.originalname);
          const nomeArquivo = `${crypto.randomUUID()}${extensao}`;

          callback(null, nomeArquivo);
        },
      }),

      fileFilter: (_req, file, callback) => {
        const tiposPermitidos = [
          'application/pdf',
          'application/msword',
          'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
          'application/vnd.ms-excel',
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        ];

        if (!tiposPermitidos.includes(file.mimetype)) {
          return callback(
            new BadRequestException('Formato de arquivo não permitido.'),
            false,
          );
        }

        callback(null, true);
      },
    }),
  )
  async create(
    @Body() body: any,
    @UploadedFile() file: Express.Multer.File,
    @ClientIp() ip: string,
    @User() user: any,
  ) {
    return this.gestaoLicencasService.create(body, file, ip, user);
  }

  @Post('licenca/find-by-filter')
  @ApiOperation({
    summary: 'Encontra todas as Licenças filtrando',
  })
  async findByFilterLicencas(@Body() body: any, @User() user: any) {
    return await this.gestaoLicencasService.findByFilterLicencas(body, user);
  }

  @Get('licenca/find-by-filial/:filial')
  @ApiOperation({
    summary: 'Encontra todas as Licenças cadastradas pela filial',
  })
  async findLicencasByFilial(@Param('filial') filial: any, @User() user: any) {
    return await this.gestaoLicencasService.findLicencasByFilial(filial, user);
  }

  @Post('filial/create')
  @ApiOperation({
    summary: 'Cria a Filial',
  })
  createLicencaFilial(
    @Body() body: any,
    @ClientIp() ip: string,
    @User() user: any,
  ) {
    return this.gestaoLicencasService.createLicencaFilial(body, ip, user);
  }

  @Post('filial/find-by-filter')
  @ApiOperation({
    summary: 'Encontra todas as Filiais filtrando',
  })
  async findByFilterLicencasFiliais(@Body() body: any, @User() user: any) {
    return await this.gestaoLicencasService.findByFilterLicencasFiliais(body, user);
  }

  @Get('filial/find-all-ativos')
  @ApiOperation({
    summary: 'Encontra todas as Filiais ativas',
  })
  findAllLicencasFiliaisAtivos() {
    return this.gestaoLicencasService.findAllLicencasFiliaisAtivos();
  }

  @Post('filial/find-with-licencas')
  async findFiliaisComLicencas(@Body() body: any, @User() user: any) {
    return this.gestaoLicencasService.findByFilterFiliaisComLicencas(
      body,
      user,
    );
  }

  @Get('filial/find-by-id/:id')
  async findById(@Param('id') id: string) {
    return this.gestaoLicencasService.findById(id);
  }
  
  @Patch('filial/update')
  async updateFilial(@Body() body: any) {
    return this.gestaoLicencasService.updateFilial(body);
  }

  @Patch('licenca/update')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: diskStorage({
        destination: (_request, _file, callback) => {
          const destino = './downloads/gestao-licencas';

          mkdirSync(destino, {
            recursive: true,
          });

          callback(null, destino);
        },

        filename: (_request, file, callback) => {
          const extensao = extname(file.originalname).toLowerCase();

          callback(null, `${randomUUID()}${extensao}`);
        },
      }),

      limits: {
        fileSize: 30 * 1024 * 1024,
      },
    }),
  )
  async updateLicenca(
    @Body() body: any,
    @UploadedFile() file: Express.Multer.File,
    @ClientIp() ip: string,
    @User() user: any,
  ) {
    return this.gestaoLicencasService.updateLicenca(body, file, ip, user);
  }

  @Get('dashboard')
  async dashboard(@User() user: any) {
    return this.gestaoLicencasService.dashboardLicencas(user);
  }
}
