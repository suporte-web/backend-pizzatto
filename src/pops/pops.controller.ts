import {
  Controller,
  Post,
  UseInterceptors,
  UploadedFile,
  Body,
  UseGuards,
  Patch,
  Delete,
  Param,
} from '@nestjs/common';

import { FileInterceptor } from '@nestjs/platform-express';

import {
  ApiOperation,
  ApiTags,
  ApiConsumes,
} from '@nestjs/swagger';

import { PopService } from './pops.service';

import { AuthGuard } from '../auth/auth.guard';

import { User } from '@/decorator/user.decorator';

import { diskStorage } from 'multer';

import { extname } from 'path';

import { ClientIp } from '@/decorator/client-ip.decorator';

import * as fs from 'fs';
import * as path from 'path';

const uploadPath = path.resolve('./downloads/pops');

if (!fs.existsSync(uploadPath)) {
  fs.mkdirSync(uploadPath, { recursive: true });
}

@ApiTags('Pop')
@Controller('pop')
@UseGuards(AuthGuard)
export class PopController {
  constructor(private readonly popService: PopService) {}

  @Post('create')
  @ApiOperation({ summary: 'Cria as Pops' })
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(
    FileInterceptor('arquivo', {
      storage: diskStorage({
        destination: (req, file, callback) => {
          callback(null, uploadPath);
        },

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
    return await this.popService.create(body, file, ip, user);
  }

  @Post('find-by-filter')
  @ApiOperation({
    summary: 'Encontra as POPs filtrando',
  })
  async findByFilter(@Body() body: any) {
    return await this.popService.findByFilter(body);
  }

  @Patch('update')
  @ApiOperation({
    summary: 'Atualiza a POP com base no ID',
  })
  async update(@Body() body: any) {
    return await this.popService.update(body);
  }

  @Delete('delete/:id')
  @ApiOperation({
    summary: 'Deleta a POP com base no ID',
  })
  async delete(@Param('id') id: string) {
    return await this.popService.delete(id);
  }
}
