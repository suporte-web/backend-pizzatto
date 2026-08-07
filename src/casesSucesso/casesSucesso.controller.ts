import {
  BadRequestException,
  Body,
  Controller,
  Post,
  UploadedFiles,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import { randomUUID } from 'crypto';
import { diskStorage } from 'multer';
import { extname, resolve } from 'path';
import { ApiTags } from '@nestjs/swagger';
import { AuthGuard } from '@/auth/auth.guard';
import { CasesSucessoService } from './casesSucesso.service';
import { existsSync, mkdirSync } from 'fs';

const DIRETORIO_CASES = resolve(
  process.cwd(),
  'downloads',
  'recrutamento-interno',
  'cases',
);

@ApiTags('Recrutamento Interno - Cases de Sucesso')
@Controller('recrutamento-interno-cases-sucesso')
@UseGuards(AuthGuard)
export class CasesSucessoController {
  constructor(private readonly service: CasesSucessoService) {}

  @Post('create')
  @UseInterceptors(
    FilesInterceptor('arquivos', 10, {
      storage: diskStorage({
        destination: (_request, _file, callback) => {
          if (!existsSync(DIRETORIO_CASES)) {
            mkdirSync(DIRETORIO_CASES, {
              recursive: true,
            });
          }

          callback(null, DIRETORIO_CASES);
        },

        filename: (_request, file, callback) => {
          const extensao = extname(file.originalname).toLowerCase();
          const nomeSalvo = `${randomUUID()}${extensao}`;

          callback(null, nomeSalvo);
        },
      }),

      limits: {
        files: 10,
        // fileSize: 250 * 1024 * 1024,
      },

      fileFilter: (_request, file, callback) => {
        const tiposPermitidos = [
          'image/jpeg',
          'image/png',
          'image/webp',
          'application/pdf',
        ];

        if (!tiposPermitidos.includes(file.mimetype)) {
          return callback(
            new BadRequestException(
              `Tipo de arquivo não permitido: ${file.mimetype}`,
            ),
            false,
          );
        }

        callback(null, true);
      },
    }),
  )
  createCasesSucesso(
    @Body() body: any,
    @UploadedFiles() files: Express.Multer.File[],
  ) {
    return this.service.createCasesSucesso(body, files);
  }

  @Post('find-by-filter')
  findByFilterCasesSucesso(@Body() body: any) {
    return this.service.findByFilterCasesSucesso(body);
  }
}
