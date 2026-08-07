import { AuthGuard } from '@/auth/auth.guard';
import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  UploadedFiles,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { ApiConsumes, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CnpjConsultaService } from './cnpjConsulta.service';
import { extname } from 'node:path';
import { randomUUID } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { diskStorage } from 'multer';
import { FilesInterceptor } from '@nestjs/platform-express';

@ApiTags('CNPJ Consulta')
@Controller('cnpj-consultas')
@UseGuards(AuthGuard)
export class CnpjConsultaController {
  constructor(private readonly cnpjConsultaService: CnpjConsultaService) {}

  @Post('consultar')
  @ApiOperation({
    summary: 'Consultar dados externos de um CNPJ sem salvar',
  })
  async consultar(@Body() body: any) {
    return this.cnpjConsultaService.consultar(body.cnpj);
  }

  @Post('create')
  @ApiConsumes('multipart/form-data')
  @ApiOperation({
    summary: 'Criar uma consulta de CNPJ com certidões',
  })
  @UseInterceptors(
    FilesInterceptor('arquivos', 10, {
      storage: diskStorage({
        destination: (_request, _file, callback) => {
          const destino = './uploads/cnpj-certidoes';

          mkdirSync(destino, {
            recursive: true,
          });

          callback(null, destino);
        },

        filename: (_request, file, callback) => {
          const extensao = extname(file.originalname).toLowerCase() || '.pdf';

          callback(null, `${randomUUID()}${extensao}`);
        },
      }),

      limits: {
        fileSize: 10 * 1024 * 1024,
        files: 10,
      },

      fileFilter: (_request, file, callback) => {
        const ehPdf =
          file.mimetype === 'application/pdf' &&
          extname(file.originalname).toLowerCase() === '.pdf';

        if (!ehPdf) {
          return callback(
            new BadRequestException('Somente arquivos PDF são permitidos.'),
            false,
          );
        }

        callback(null, true);
      },
    }),
  )
  async create(
    @Body() body: any,
    @UploadedFiles()
    arquivos: Express.Multer.File[],
  ) {
    return this.cnpjConsultaService.create(body, arquivos ?? []);
  }

  @Post('find-by-filter')
  @ApiOperation({
    summary: 'Listar consultas de CNPJ utilizando filtros',
  })
  async findByFilter(@Body() body: any) {
    return this.cnpjConsultaService.findByFilter(body);
  }

  @Get('find-by-id/:id')
  @ApiOperation({
    summary: 'Buscar uma consulta pelo ID',
  })
  async findById(@Param('id') id: string) {
    return this.cnpjConsultaService.findById(id);
  }

  @Get('find-by-cnpj/:cnpj')
  @ApiOperation({
    summary: 'Buscar o histórico de consultas de um CNPJ',
  })
  async findByCnpj(@Param('cnpj') cnpj: string) {
    return this.cnpjConsultaService.findByCnpj(cnpj);
  }

  @Patch('update/:id')
  @ApiOperation({
    summary: 'Atualizar uma consulta de CNPJ',
  })
  async update(@Param('id') id: string, @Body() body: any) {
    return this.cnpjConsultaService.update(id, body);
  }

  @Delete('delete/:id')
  @ApiOperation({
    summary: 'Excluir uma consulta de CNPJ',
  })
  async delete(@Param('id') id: string) {
    return this.cnpjConsultaService.delete(id);
  }
}
