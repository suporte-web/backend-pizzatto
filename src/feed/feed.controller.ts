import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UploadedFiles,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';

import { FilesInterceptor } from '@nestjs/platform-express';

import { diskStorage } from 'multer';
import { extname } from 'path';
import { mkdirSync } from 'fs';

import { FeedService } from './feed.service';

import { CreateFeedDto } from './dtos/create-feed.dto';
import { UpdateFeedDto } from './dtos/update-feed.dto';
import { FindFeedDto } from './dtos/find-feed.dto';

import { AuthGuard } from '@/auth/auth.guard';
import { User } from '@/decorator/user.decorator';
import { ApiTags } from '@nestjs/swagger';

@ApiTags('Feed')
@Controller('feed')
@UseGuards(AuthGuard)
export class FeedController {
  constructor(private readonly feedService: FeedService) {}

  @Post()
  @UseInterceptors(
    FilesInterceptor('midias', 10, {
      storage: diskStorage({
        destination: (req, file, cb) => {
          const pasta = './downloads/feed';

          mkdirSync(pasta, {
            recursive: true,
          });

          cb(null, pasta);
        },

        filename: (req, file, cb) => {
          const extensao = extname(file.originalname);

          const nomeArquivo = `${Date.now()}-${Math.round(
            Math.random() * 1e9,
          )}${extensao}`;

          cb(null, nomeArquivo);
        },
      }),

      fileFilter: (req, file, cb) => {
        const permitido =
          file.mimetype.startsWith('image/') ||
          file.mimetype.startsWith('video/');

        if (!permitido) {
          return cb(
            new BadRequestException('Somente imagens e vídeos são permitidos.'),
            false,
          );
        }

        cb(null, true);
      },

      limits: {
        files: 10,

        // 500 MB por arquivo
        fileSize: 500 * 1024 * 1024,
      },
    }),
  )
  create(
    @Body() body: CreateFeedDto,
    @UploadedFiles()
    midias: Express.Multer.File[],
    @User()
    user: any,
  ) {
    return this.feedService.create(body, midias || [], user);
  }

  /**
   * POST porque você normalmente utiliza body
   * nos filtros da intranet.
   */
  @Post('find-by-filter')
  findAll(
    @Body() body: FindFeedDto,
    @User()
    user: any,
    y,
  ) {
    return this.feedService.findAll(body, user);
  }

  @Get(':id')
  findById(
    @Param('id') id: string,
    @User()
    user: any,
  ) {
    return this.feedService.findById(id, user);
  }

  @Patch(':id')
  @UseInterceptors(
    FilesInterceptor('midias', 10, {
      storage: diskStorage({
        destination: (req, file, cb) => {
          const pasta = './downloads/feed';

          mkdirSync(pasta, {
            recursive: true,
          });

          cb(null, pasta);
        },

        filename: (req, file, cb) => {
          const extensao = extname(file.originalname);

          const nomeArquivo = `${Date.now()}-${Math.round(
            Math.random() * 1e9,
          )}${extensao}`;

          cb(null, nomeArquivo);
        },
      }),

      fileFilter: (req, file, cb) => {
        const permitido =
          file.mimetype.startsWith('image/') ||
          file.mimetype.startsWith('video/');

        if (!permitido) {
          return cb(
            new BadRequestException('Somente imagens e vídeos são permitidos.'),
            false,
          );
        }

        cb(null, true);
      },

      limits: {
        files: 10,

        // 500 MB por arquivo
        fileSize: 500 * 1024 * 1024,
      },
    }),
  )
  update(
    @Param('id')
    id: string,

    @Body()
    body: UpdateFeedDto,

    @UploadedFiles()
    midias: Express.Multer.File[],

    @User()
    user: any,
  ) {
    return this.feedService.update(id, body, midias || [], user);
  }

  @Delete(':id')
  remove(
    @Param('id') id: string,
    @User()
    user: any,
  ) {
    return this.feedService.remove(id, user);
  }

  /**
   * =====================================================
   * CURTIDAS
   * =====================================================
   */

  @Post(':id/curtir')
  toggleCurtida(
    @Param('id') publicacaoId: string,
    @User()
    user: any,
  ) {
    return this.feedService.toggleCurtida(publicacaoId, user);
  }

  /**
   * =====================================================
   * COMENTÁRIOS
   * =====================================================
   */

  @Post(':id/comentarios')
  createComentario(
    @Param('id') publicacaoId: string,

    @Body()
    body: {
      texto: string;
    },
    @User()
    user: any,
  ) {
    return this.feedService.createComentario(publicacaoId, body.texto, user);
  }

  @Get(':id/comentarios')
  findComentarios(
    @Param('id') publicacaoId: string,

    @Query('page') page?: string,

    @Query('pageSize') pageSize?: string,
  ) {
    return this.feedService.findComentarios(
      publicacaoId,
      Number(page || 1),
      Number(pageSize || 20),
    );
  }

  @Patch('comentarios/:comentarioId')
  updateComentario(
    @Param('comentarioId')
    comentarioId: string,

    @Body()
    body: {
      texto: string;
    },
    @User()
    user: any,
  ) {
    return this.feedService.updateComentario(comentarioId, body.texto, user);
  }

  @Delete('comentarios/:comentarioId')
  removeComentario(
    @Param('comentarioId')
    comentarioId: string,
    @User()
    user: any,
  ) {
    return this.feedService.removeComentario(comentarioId, user);
  }

  @Post('comentarios/:comentarioId/curtir')
  toggleLikeComentario(
    @Param('comentarioId') comentarioId: string,
    @User()
    user: any,
  ) {
    return this.feedService.toggleLikeComentario(comentarioId, user);
  }

  @Get('find-likes-by-publicacao/:publicacaoId')
  async findLikesByPublicacaoId(@Param('publicacaoId') publicacaoId: string) {
    return await this.feedService.findLikesByPublicacaoId(publicacaoId);
  }

  @Get('find-likes-by-comentario/:comentarioId')
  async findLikesByComentarioId(@Param('comentarioId') comentarioId: string) {
    return await this.feedService.findLikesByComentarioId(comentarioId);
  }
}
