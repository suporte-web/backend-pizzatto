import { AuthGuard } from '@/auth/auth.guard';
import {
  Body,
  Controller,
  Post,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { ApiConsumes, ApiOperation, ApiTags } from '@nestjs/swagger';
import { BibliotecaMarcaService } from './bibliotecaMarca.service';
import { diskStorage } from 'multer';
import { ClientIp } from '@/decorator/client-ip.decorator';
import { User } from '@/decorator/user.decorator';
import { FileInterceptor } from '@nestjs/platform-express';
import { extname } from 'path';

@ApiTags('BibliotecaMarca')
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
    FileInterceptor('arquivo', {
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
    @UploadedFile() file: Express.Multer.File,
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
}
