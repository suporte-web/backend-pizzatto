import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';

import { ApiConsumes, ApiOperation, ApiTags } from '@nestjs/swagger';

import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { extname } from 'path';

import { AuthGuard } from '../auth/auth.guard';
import { ClientIp } from '../decorator/client-ip.decorator';
import { User } from '../decorator/user.decorator';

import { FotoPerfilWhatsappPadraoService } from './fotoPerfilWhatsappPadrao.service';

@ApiTags('Foto de Perfil WhatsApp - Padrão')
@Controller('foto-perfil-whatsapp-padrao')
@UseGuards(AuthGuard)
export class FotoPerfilWhatsappPadraoController {
  constructor(
    private readonly fotoPerfilWhatsappPadraoService: FotoPerfilWhatsappPadraoService,
  ) {}

  @Post('create')
  @ApiOperation({
    summary: 'Cria um novo padrão de Foto de Perfil do WhatsApp',
  })
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(
    FileInterceptor('background', {
      storage: diskStorage({
        destination: './downloads/background-foto-perfil-whatsapp',

        filename: (req, file, callback) => {
          const uniqueName = `${Date.now()}-${Math.round(
            Math.random() * 1e9,
          )}${extname(file.originalname)}`;

          callback(null, uniqueName);
        },
      }),
    }),
  )
  async create(
    @Body() body: any,
    @UploadedFile() file: Express.Multer.File,
    @ClientIp() ip: string,
    @User() user: any,
  ) {
    return this.fotoPerfilWhatsappPadraoService.create(body, file, ip, user);
  }

  @Get('find-atual')
  @ApiOperation({
    summary:
      'Encontra o padrão de Foto de Perfil do WhatsApp utilizado atualmente',
  })
  async findAtual() {
    return this.fotoPerfilWhatsappPadraoService.findAtual();
  }

  @Post('find-by-filter')
  @ApiOperation({
    summary:
      'Encontra todos os padrões de Foto de Perfil do WhatsApp já criados',
  })
  async findByFilter(@Body() body: any) {
    return this.fotoPerfilWhatsappPadraoService.findByFilter(body);
  }

  @Patch('update')
  @ApiOperation({
    summary: 'Atualiza um padrão de Foto de Perfil do WhatsApp com base no ID',
  })
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(
    FileInterceptor('background', {
      storage: diskStorage({
        destination: './downloads/background-foto-perfil-whatsapp',

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
    @UploadedFile()
    file?: Express.Multer.File,
  ) {
    return this.fotoPerfilWhatsappPadraoService.update(body, file);
  }

  @Delete('delete')
  @ApiOperation({
    summary: 'Deleta um padrão de Foto de Perfil do WhatsApp com base no ID',
  })
  async delete(@Body() body: any) {
    return this.fotoPerfilWhatsappPadraoService.delete(body);
  }

  @Patch('change/:id')
  @ApiOperation({
    summary: 'Define um padrão de Foto de Perfil do WhatsApp como atual',
  })
  async changeFotoPerfilWhatsappPadrao(@Param('id') id: string) {
    return this.fotoPerfilWhatsappPadraoService.changeFotoPerfilWhatsappPadrao(
      id,
    );
  }

  @Get('find-disponiveis')
  findDisponiveis() {
    return this.fotoPerfilWhatsappPadraoService.findDisponiveis();
  }
}
