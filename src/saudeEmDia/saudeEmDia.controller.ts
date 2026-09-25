import {
  BadRequestException,
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
import { ApiBody, ApiConsumes, ApiTags } from '@nestjs/swagger';
import { AuthGuard } from '@/auth/auth.guard';
import { extname, join } from 'path';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { existsSync, mkdirSync } from 'fs';
import { randomUUID } from 'crypto';
import { SaudeEmDiaService } from './saudeEmDia.service';

const diretorioBeneficios = join(process.cwd(), 'downloads', 'saude-em-dia');

@ApiTags('Saúde em Dia')
@Controller('saude-em-dia')
@UseGuards(AuthGuard)
export class SaudeEmDiaController {
  constructor(private readonly saudeEmDiaService: SaudeEmDiaService) {}

  @Post('create')
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      required: ['titulo'],
      properties: {
        titulo: {
          type: 'string',
          example: 'Plano de saúde',
        },
        descricao: {
          type: 'string',
          nullable: true,
        },
        link: {
          type: 'string',
          nullable: true,
        },
        ativo: {
          type: 'boolean',
          default: true,
        },
        imagem: {
          type: 'string',
          format: 'binary',
          nullable: true,
        },
      },
    },
  })
  @UseInterceptors(
    FileInterceptor('imagem', {
      storage: diskStorage({
        destination: (_request, _file, callback) => {
          if (!existsSync(diretorioBeneficios)) {
            mkdirSync(diretorioBeneficios, {
              recursive: true,
            });
          }

          callback(null, diretorioBeneficios);
        },
        filename: (_request, file, callback) => {
          const extensao = extname(file.originalname).toLowerCase();

          callback(null, `${randomUUID()}${extensao}`);
        },
      }),
      fileFilter: (_request, file, callback) => {
        const tiposPermitidos = ['image/jpeg', 'image/png', 'image/webp'];

        if (!tiposPermitidos.includes(file.mimetype)) {
          return callback(
            new BadRequestException(
              'Formato de imagem inválido. Utilize PNG, JPG, JPEG ou WEBP.',
            ),
            false,
          );
        }

        callback(null, true);
      },
      limits: {
        fileSize: 5 * 1024 * 1024,
        files: 1,
      },
    }),
  )
  create(@Body() body: any, @UploadedFile() imagem?: Express.Multer.File) {
    return this.saudeEmDiaService.create(body, imagem);
  }

  @Post('find-by-filter')
  findByFilter(@Body() body: any) {
    return this.saudeEmDiaService.findByFilter(body);
  }

  @Get('find-all-ativos')
  findAllAtivos() {
    return this.saudeEmDiaService.findAllAtivos();
  }

  @Get('find-by-id/:id')
  findById(@Param('id') id: string) {
    return this.saudeEmDiaService.findById(id);
  }

  @Patch('update')
  @UseInterceptors(
    FileInterceptor('imagem', {
      storage: diskStorage({
        destination: (_request, _file, callback) => {
          if (!existsSync(diretorioBeneficios)) {
            mkdirSync(diretorioBeneficios, {
              recursive: true,
            });
          }

          callback(null, diretorioBeneficios);
        },
        filename: (_request, file, callback) => {
          const extensao = extname(file.originalname).toLowerCase();

          callback(null, `${randomUUID()}${extensao}`);
        },
      }),
      fileFilter: (_request, file, callback) => {
        const tiposPermitidos = ['image/jpeg', 'image/png', 'image/webp'];

        if (!tiposPermitidos.includes(file.mimetype)) {
          return callback(
            new BadRequestException(
              'Formato de imagem inválido. Utilize PNG, JPG, JPEG ou WEBP.',
            ),
            false,
          );
        }

        callback(null, true);
      },
      limits: {
        fileSize: 5 * 1024 * 1024,
        files: 1,
      },
    }),
  )
  update(@Body() body: any, @UploadedFile() imagem?: Express.Multer.File) {
    return this.saudeEmDiaService.update(body, imagem);
  }

  @Patch('alterar-status')
  alterarStatus(@Body() body: any) {
    return this.saudeEmDiaService.alterarStatus(body);
  }

  @Delete('delete/:id')
  delete(@Param('id') id: string) {
    return this.saudeEmDiaService.delete(id);
  }
}
