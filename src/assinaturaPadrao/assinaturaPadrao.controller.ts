import {
  Body,
  Controller,
  Get,
  Post,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { ApiConsumes, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AuthGuard } from 'src/auth/auth.guard';
import { AssinaturaPadraoService } from './assinaturaPadrao.service';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { ClientIp } from 'src/decorator/client-ip.decorator';
import { User } from 'src/decorator/user.decorator';
import { extname } from 'path';

@ApiTags('AssinaturaPadrao')
@Controller('assinatura-padrao')
@UseGuards(AuthGuard)
export class AssinaturaPadraoController {
  constructor(
    private readonly assinaturaPadraoService: AssinaturaPadraoService,
  ) {}

  @Post('create')
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(
    FileInterceptor('background', {
      storage: diskStorage({
        destination: './downloads/background-assinaturas',
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
    return await this.assinaturaPadraoService.create(body, file, ip, user);
  }

  @Get('find-atual')
  @ApiOperation({
    summary: 'Encontra a Assinatura que está sendo utilizada atualmente',
  })
  async findAtual() {
    return await this.assinaturaPadraoService.findAtual();
  }

  @Post('find-by-filter')
  @ApiOperation({
    summary: 'Encontra todas as Assinatura ja criadas',
  })
  async findByFilter(@Body() body: any) {
    return await this.assinaturaPadraoService.findByFilter(body);
  }
}
