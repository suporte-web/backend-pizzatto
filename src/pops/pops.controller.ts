// pops.controller.ts
import {
  Controller,
  Post,
  UseInterceptors,
  UploadedFile,
  Body,
  BadRequestException,
  UseGuards,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiOperation, ApiTags, ApiConsumes } from '@nestjs/swagger';
import { PopService } from './pops.service';
import { FileService } from 'src/file/file.service';
import { AuthGuard } from 'src/auth/auth.guard';

@ApiTags('Pop')
@Controller('pop')
@UseGuards(AuthGuard)
export class PopController {
  constructor(
    private readonly popService: PopService,
    private readonly fileService: FileService,
  ) {}

  @Post('create')
  @ApiOperation({ summary: 'Cria a POP' })
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(FileInterceptor('file'))
  async create(@UploadedFile() file: Express.Multer.File, @Body() body: any) {
    if (!file) {
      throw new BadRequestException('Nenhum arquivo enviado');
    }

    // Upload do arquivo para a pasta específica (ex: 'pops')
    const createFile = await this.fileService.uploadFile(file, 'pops');

    // Cria o POP com as informações do arquivo + dados adicionais
    const popData = {
      originalName: body.originalName || file.originalname,
      mimetype: body.mimetype || file.mimetype,
      size: body.size || file.size,
      filePath: body.filePath || createFile.path,
      filename: createFile.filename,
      folder: createFile.folder,
      ...body,
    };

    const createPop = await this.popService.create(popData);

    return { createFile, createPop };
  }

  @Post('find-by-filter')
  @ApiOperation({ summary: 'Encotra as POPs por meio de filtro' })
  async findByFilter(@Body() body: any) {
    return await this.popService.findByFilter(body);
  }
}
