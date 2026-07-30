import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Ip,
  Param,
  Patch,
  Post,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { extname } from 'path';
import { GestaoDocumentosService } from './gestaoDocumentos.service';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { AuthGuard } from '@/auth/auth.guard';
import { User } from '@/decorator/user.decorator';

@ApiTags('Gestão de Documentos')
@Controller('gestao-documentos')
@UseGuards(AuthGuard)
export class GestaoDocumentosController {
  constructor(
    private readonly gestaoDocumentosService: GestaoDocumentosService,
  ) {}

  @Post('documento/create')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: diskStorage({
        destination: './downloads/gestao-documentos',

        filename: (_req, file, callback) => {
          const extensao = extname(file.originalname);
          const nomeArquivo = `${crypto.randomUUID()}${extensao}`;

          callback(null, nomeArquivo);
        },
      }),

      limits: {
        fileSize: 30 * 1024 * 1024,
      },

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
    @Ip() ip: string,
    @User() user: any,
  ) {
    return this.gestaoDocumentosService.create(body, file, ip, user);
  }

  @Post('documento/find-by-filter')
  @ApiOperation({
    summary: 'Encontra todos os Documentos filtrando',
  })
  async findByFilterDocumentos(@Body() body: any) {
    return await this.gestaoDocumentosService.findByFilterDocumentos(body);
  }

  @Get('documento/find-by-setor/:setor')
  @ApiOperation({
    summary: 'Encontra todos os Documentos cadastrados pelo setor',
  })
  async findDocumentosBySetor(@Param('setor') setor: any) {
    return await this.gestaoDocumentosService.findDocumentosBySetor(setor);
  }

  @Post('documento/find-by-setor-and-categoria/:setor/:categoriaId')
  @ApiOperation({
    summary: 'Encontra todos os Documentos cadastrados pelo Setor e Categoria',
  })
  async findDocumentosBySetorAndCategoria(
    @Param('setor') setor: string,
    @Param('categoriaId') categoriaId: string,
    @Body() body: any,
  ) {
    return await this.gestaoDocumentosService.findDocumentosBySetorAndCategoria(
      setor,
      categoriaId,
      body,
    );
  }

  @Patch('documento/update')
  @ApiOperation({
    summary: 'Atualiza o Documento com base no ID',
  })
  @UseInterceptors(
    FileInterceptor('file', {
      storage: diskStorage({
        destination: './downloads/gestao-documentos',

        filename: (_req, file, callback) => {
          const extensao = extname(file.originalname);
          const nomeArquivo = `${crypto.randomUUID()}${extensao}`;

          callback(null, nomeArquivo);
        },
      }),

      limits: {
        fileSize: 30 * 1024 * 1024,
      },

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
  async updateDocumento(
    @Body() body: any,
    @UploadedFile()
    file: Express.Multer.File | undefined,
    @Ip() ip: string,
    @User() user: any,
  ) {
    return this.gestaoDocumentosService.updateDocumento(body, file, ip, user);
  }

  @Post('categoria/create')
  @ApiOperation({
    summary: 'Cria a Categoria',
  })
  createDocumentoCategoria(
    @Body() body: any,
    @Ip() ip: string,
    @User() user: any,
  ) {
    return this.gestaoDocumentosService.createDocumentoCategoria(
      body,
      ip,
      user,
    );
  }

  @Post('categoria/find-by-filter')
  @ApiOperation({
    summary: 'Encontra todas as Categorias filtrando',
  })
  async findByFilterCadastrosCategorias(@Body() body: any) {
    return await this.gestaoDocumentosService.findByFilterCadastrosCategorias(
      body,
    );
  }

  @Get('categoria/find-all-ativos')
  @ApiOperation({
    summary: 'Encontra todas as Categorias ativas',
  })
  findAllCadastrosCategoriasAtivos() {
    return this.gestaoDocumentosService.findAllCadastrosCategoriasAtivos();
  }

  @Patch('categoria/update')
  @ApiOperation({
    summary: 'Atualiza a Categoria com base no ID',
  })
  updateDocumentoCategoria(
    @Body() body: any,
    @Ip() ip: string,
    @User() user: any,
  ) {
    return this.gestaoDocumentosService.updateDocumentoCategoria(
      body,
      ip,
      user,
    );
  }

  @Post('favoritos/change-favoritos')
  @ApiOperation({
    summary: 'Cria e Atualiza os Documentos Favoritados',
  })
  changeFavoritos(@Body() body: any, @Ip() ip: string, @User() user: any) {
    return this.gestaoDocumentosService.changeFavoritos(body, ip, user);
  }

  @Post('favoritos/find-by-filter')
  @ApiOperation({
    summary: 'Encontra os Documentos Favoritados filtrando',
  })
  findFavoritos(@Body() body: any, @User() user: any) {
    return this.gestaoDocumentosService.findFavoritos(body, user);
  }

  @Post('documento-leitura/find-pendentes')
  async findPendentesLeitura(@User() user: any) {
    return this.gestaoDocumentosService.findPendentesLeitura(user);
  }

  @Post('documento-leitura/confirmar')
  async confirmarLeitura(
    @Body()
    body: {
      documentoId: string;
      documentoVersaoId: string;
    },
    @Ip() ip: string,
    @User() user: any,
  ) {
    return this.gestaoDocumentosService.confirmarLeitura(body, ip, user);
  }

  @Get('documento-aceite/visualizar/:idDocumento')
  async visualizarAceites(@Param('idDocumento') idDocumento: string) {
    return this.gestaoDocumentosService.visualizarAceites(idDocumento);
  }
}
