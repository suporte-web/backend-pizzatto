import { AuthGuard } from '@/auth/auth.guard';
import {
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

import { memoryStorage } from 'multer';

import { AniversariantesKmmService } from './aniversariantesKmm.service';
import { User } from '@/decorator/user.decorator';

@ApiTags('Aniversariantes KMM')
@Controller('aniversariantes-kmm')
@UseGuards(AuthGuard)
export class AniversariantesKmmController {
  constructor(
    private readonly aniversariantesKmmService: AniversariantesKmmService,
  ) {}

  @Post('find-all-aniversariantes')
  @ApiOperation({
    summary: 'Encontra todos os aniversariantes pelo KMM',
  })
  async findAllAniversariantes(@Body() body: any, @User() user: any) {
    return await this.aniversariantesKmmService.findAllAniversariantes(
      body,
      user,
    );
  }

  @Post('create-aniversariantes-pj')
  @ApiOperation({
    summary: 'Cria um aniversariante PJ manualmente',
  })
  async createAniversariantesPj(@Body() body: any) {
    return this.aniversariantesKmmService.createAniversariantesPj(body);
  }

  @Post('import-aniversariantes-pj')
  @ApiConsumes('multipart/form-data')
  @ApiOperation({
    summary: 'Importa aniversariantes PJ por planilha',
  })
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: {
        fileSize: 10 * 1024 * 1024,
      },
    }),
  )
  async importAniversariantesPj(@UploadedFile() file: Express.Multer.File) {
    return this.aniversariantesKmmService.importAniversariantesPj(file);
  }

  @Patch('update/:id')
  async updateAniversariantesPj(@Param('id') id: string, @Body() body: any) {
    return await this.aniversariantesKmmService.updateAniversariantesPj(
      id,
      body,
    );
  }
}
