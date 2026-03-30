import {
  Body,
  Controller,
  Get,
  Patch,
  Post,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { ApiConsumes, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AuthGuard } from 'src/auth/auth.guard';
import { PoliticasService } from './politicas.service';
import { ClientIp } from 'src/decorator/client-ip.decorator';
import { User } from 'src/decorator/user.decorator';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { extname } from 'path';

@ApiTags('Politicas')
@Controller('politicas')
@UseGuards(AuthGuard)
export class PoliticasController {
  constructor(private readonly politicasService: PoliticasService) {}

  @Post('create')
  @ApiOperation({ summary: 'Cria as Politicas' })
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(
    FileInterceptor('arquivo', {
      storage: diskStorage({
        destination: './downloads/politicas',
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
    return await this.politicasService.create(body, file, ip, user);
  }

  @Post('find-by-filter')
  @ApiOperation({ summary: 'Encontra as Politicas filtrando' })
  async findByFilter(@Body() body: any) {
    return await this.politicasService.findByFilter(body);
  }

  @Patch('update')
  @ApiOperation({ summary: 'Atualiza as Politicas com base no ID passado' })
  async update(@Body() body: any, @ClientIp() ip: string, @User() user: any) {
    return await this.politicasService.update(body, ip, user);
  }

  @Get('find-politica-liberada-visualizacao')
  @ApiOperation({ summary: 'Atualiza as Politicas com base no ID passado' })
  async findPoliticaLiberadaVisualizacao() {
    return await this.politicasService.findPoliticaLiberadaVisualizacao();
  }

  @Get('find-all-aceites-by-user')
  @ApiOperation({ summary: 'Atualiza as Politicas com base no ID passado' })
  async findAllAceitesByUser(@User() user: any) {
    return await this.politicasService.findAllAceitesByUser(user);
  }
}
