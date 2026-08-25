import {
  BadRequestException,
  Body,
  Controller,
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
import { User } from '../decorator/user.decorator';
import { ClientIp } from '../decorator/client-ip.decorator';
import { FotoPerfilWhatsappService } from './fotoPerfilWhatsapp.service';

@ApiTags('Foto de Perfil - Whatsapp')
@Controller('foto-perfil-whatsapp')
@UseGuards(AuthGuard)
export class FotoPerfilWhatsappController {
  constructor(
    private readonly fotoPerfilWhatsappService: FotoPerfilWhatsappService,
  ) {}

  @Post('create')
  @ApiOperation({
    summary: 'Cria a Foto de Perfil de Whatsapp',
  })
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(
    FileInterceptor('foto', {
      storage: diskStorage({
        destination: './downloads/foto-perfil-whatsapp',
        filename: (req, file, callback) => {
          const uniqueName = `${Date.now()}-${Math.round(
            Math.random() * 1e9,
          )}${extname(file.originalname)}`;

          callback(null, uniqueName);
        },
      }),

      limits: {
        fileSize: 10 * 1024 * 1024,
      },

      fileFilter: (req, file, callback) => {
        if (!file.mimetype.startsWith('image/')) {
          return callback(
            new BadRequestException('O arquivo deve ser uma imagem.'),
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
    return await this.fotoPerfilWhatsappService.create(body, file, ip, user);
  }

  @Post('find-by-filter')
  @ApiOperation({ summary: 'Encontra a Foto de Perfil do WhatsApp filtrando' })
  async findByFilter(@Body() body: any) {
    return await this.fotoPerfilWhatsappService.findByFilter(body);
  }

  @Patch('update-validacao/:id')
  async updateValidacao(@Param('id') id: string, @Body() body: any) {
    return this.fotoPerfilWhatsappService.updateValidacao(id, body);
  }
}
