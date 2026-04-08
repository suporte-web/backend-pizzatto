import { AuthGuard } from '@/auth/auth.guard';
import {
  Body,
  Controller,
  Param,
  Patch,
  Post,
  UploadedFiles,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { ApiConsumes, ApiOperation, ApiTags } from '@nestjs/swagger';
import { PaginaInstitucionalService } from './paginaInstitucional.service';
import { User } from '@/decorator/user.decorator';
import { FilesInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { extname } from 'path';
import { ClientIp } from '@/decorator/client-ip.decorator';

@ApiTags('Pagina-Institucional')
@Controller('pagina-institucional')
@UseGuards(AuthGuard)
export class PaginaInstitucionalController {
  constructor(
    private readonly paginaInstitucionalService: PaginaInstitucionalService,
  ) {}

  @Post('create')
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(
    FilesInterceptor('imagens', 10, {
      storage: diskStorage({
        destination: './downloads/imagens-pagina-institucional',
        filename: (req, file, callback) => {
          const uniqueSuffix = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
          const fileExt = extname(file.originalname);
          callback(null, `pagina-${uniqueSuffix}${fileExt}`);
        },
      }),
    }),
  )
  async create(
    @Body() body: any,
    @UploadedFiles() imagens: Express.Multer.File[],
    @ClientIp() ip: string,
    @User() user: any,
  ) {
    return await this.paginaInstitucionalService.create(
      body,
      imagens,
      ip,
      user,
    );
  }

  @Post('find-by-filter')
  @ApiOperation({ summary: 'Encontra as Páginas Institucionais filtrando' })
  async findByFilter(@Body() body: any) {
    return await this.paginaInstitucionalService.findByFilter(body);
  }

  @Patch('update')
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(
    FilesInterceptor('novasImagens', 10, {
      storage: diskStorage({
        destination: './downloads/imagens-pagina-institucional',
        filename: (req, file, callback) => {
          const uniqueSuffix = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
          const fileExt = extname(file.originalname);
          callback(null, `pagina-${uniqueSuffix}${fileExt}`);
        },
      }),
    }),
  )
  @ApiOperation({
    summary: 'Atualiza as Páginas Institucionais com base no id',
  })
  async update(
    @Body() body: any,
    @UploadedFiles() imagens: Express.Multer.File[],
    @ClientIp() ip: string,
    @User() user: any,
  ) {
    return await this.paginaInstitucionalService.update(
      body,
      imagens,
      ip,
      user,
    );
  }
}
