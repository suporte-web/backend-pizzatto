import { AuthGuard } from '@/auth/auth.guard';
import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Res,
  UploadedFiles,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { ApiConsumes, ApiOperation, ApiTags } from '@nestjs/swagger';
import { BibliotecaMarcaService } from './bibliotecaMarca.service';
import { diskStorage } from 'multer';
import { ClientIp } from '@/decorator/client-ip.decorator';
import { User } from '@/decorator/user.decorator';
import { FilesInterceptor } from '@nestjs/platform-express';
import { extname } from 'path';
import type { Response } from 'express';

@ApiTags('Biblioteca-Marca')
@Controller('biblioteca-marca')
@UseGuards(AuthGuard)
export class BibliotecaMarcaController {
  constructor(
    private readonly bibliotecaMarcaService: BibliotecaMarcaService,
  ) {}

  @Post('create')
  @ApiOperation({
    summary: 'Cria a Biblioteca',
  })
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(
    FilesInterceptor('arquivo', 10, {
      storage: diskStorage({
        destination: './downloads/arquivo-biblioteca',
        filename: (req, file, callback) => {
          const uniqueName = `${Date.now()}-${Math.round(Math.random() * 1e9)}${extname(file.originalname)}`;
          callback(null, uniqueName);
        },
      }),
    }),
  )
  async create(
    @Body() body: any,
    @UploadedFiles() file: Express.Multer.File[],
    @ClientIp() ip: string,
    @User() user: any,
  ) {
    return await this.bibliotecaMarcaService.create(body, file, ip, user);
  }

  @Post('find-by-filter')
  @ApiOperation({
    summary: 'Encontra as Bibliotecas filtrando',
  })
  async findByFilter(@Body() body: any) {
    return await this.bibliotecaMarcaService.findByFilter(body);
  }

  @Get('download/:nomeArquivo')
  downloadArquivo(
    @Param('nomeArquivo') nomeArquivo: string,
    @Res() res: Response,
  ) {
    return res.download(`./downloads/arquivo-biblioteca/${nomeArquivo}`);
  }

  @Patch('update')
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(
    FilesInterceptor('files', 10, {
      storage: diskStorage({
        destination: './downloads/arquivo-biblioteca',
        filename: (req, file, callback) => {
          const uniqueName = `${Date.now()}-${Math.round(
            Math.random() * 1e9,
          )}${extname(file.originalname)}`;

          callback(null, uniqueName);
        },
      }),
    }),
  )
  async update(
    @Body() body: any,
    @UploadedFiles() files: Express.Multer.File[],
    @ClientIp() ip: string,
    @User() user: any,
  ) {
    return this.bibliotecaMarcaService.update(body, files, ip, user);
  }
}
