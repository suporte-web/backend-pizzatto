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
import { diskStorage } from 'multer';
import { extname } from 'path';
import { AuthGuard } from '../auth/auth.guard';
import { AssinaturasEmailService } from './assinaturasEmail.service';
import { User } from '../decorator/user.decorator';
import { ClientIp } from '../decorator/client-ip.decorator';

@ApiTags('AssinaturasEmail')
@Controller('assinaturas-email')
@UseGuards(AuthGuard)
export class AssinaturasEmailController {
  constructor(
    private readonly assinaturasEmailService: AssinaturasEmailService,
  ) {}

  @Post('create')
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(
    FileInterceptor('foto', {
      storage: diskStorage({
        destination: './downloads/assinaturas',
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
    return await this.assinaturasEmailService.create(body, file, ip, user);
  }

  @Post('find-by-filter')
  @ApiOperation({ summary: 'Encontra a Assinatura de E-mail Filtrando' })
  async findByFilter(@Body() body: any) {
    return await this.assinaturasEmailService.findByFilter(body);
  }

  @Patch('update-validacao/:id')
  @ApiOperation({
    summary:
      'Atualiza Validação feita pelo EndoMarketing na Assinatura de E-mail',
  })
  async updateValidacao(@Param('id') id: string, @Body() body: any) {
    return await this.assinaturasEmailService.updateValidacao(id, body);
  }
}
