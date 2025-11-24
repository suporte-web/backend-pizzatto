import {
  Controller,
  Post,
  Get,
  Delete,
  Param,
  Query,
  Res,
  UseInterceptors,
  UploadedFile,
  UploadedFiles,
  Body,
} from '@nestjs/common';
import { FileInterceptor, FilesInterceptor } from '@nestjs/platform-express';
import type { Response } from 'express';
import { FileService } from './file.service';
import {
  DownloadResponse,
  FileListResponse,
} from './interface/fileResponse.interface';

@Controller('files')
export class FileController {
  constructor(private readonly fileService: FileService) {}

  @Post('upload')
  @UseInterceptors(FileInterceptor('file'))
  async uploadFile(
    @UploadedFile() file: Express.Multer.File,
    @Body('folder') folder?: string,
  ) {
    const result = await this.fileService.uploadFile(file, folder);
    return {
      success: true,
      message: 'Arquivo enviado com sucesso',
      data: result,
    };
  }

  @Post('upload-multiple')
  @UseInterceptors(FilesInterceptor('files', 10))
  async uploadMultipleFiles(
    @UploadedFiles() files: Array<Express.Multer.File>,
    @Body('folder') folder?: string,
  ) {
    const results = await this.fileService.uploadMultipleFiles(files, folder);
    return {
      success: true,
      message: `${results.length} arquivo(s) enviado(s) com sucesso`,
      data: results,
    };
  }

  @Post('convert/:folder/:filename')
  async convertWordToPdf(
    @Param('filename') filename: string,
    @Param('folder') folder: string,
  ) {
    const result = await this.fileService.convertWordToPdf(filename, folder);
    return {
      success: true,
      message: 'Arquivo convertido para PDF com sucesso',
      data: result,
    };
  }

  @Get('convertible')
  async listConvertibleFiles(@Query('folder') folder?: string) {
    return this.fileService.listConvertibleFiles(folder);
  }

  @Get('view-pdf/:folder/:filename')
  async viewWordAsPdf(
    @Param('filename') filename: string,
    @Param('folder') folder: string,
    @Res() res: Response,
  ) {
    const result = await this.fileService.viewWordAsPdf(filename, folder);

    if (!result?.success || !result?.data) {
      return res
        .status(404)
        .json({
          success: false,
          message: 'Arquivo não encontrado ou erro na conversão',
        });
    }

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader(
      'Content-Disposition',
      `inline; filename="${encodeURIComponent(result.data.filename)}"`,
    );

    return res.send(result.data.stream);
  }

  @Get('list')
  async listFiles(@Query('folder') folder?: string): Promise<FileListResponse> {
    return this.fileService.listFiles(folder);
  }

  @Get('folders')
  async listFolders() {
    return this.fileService.listFolders();
  }

  @Get('view/:folder/:filename')
  async viewFile(
    @Param('filename') filename: string,
    @Param('folder') folder: string,
    @Res() res: Response,
  ) {
    const result = await this.fileService.viewFile(filename, folder);

    if (!result?.success || !result?.data) {
      return res
        .status(404)
        .json({ success: false, message: 'Arquivo não encontrado' });
    }

    const mimetype: string = result.data.mimetype ?? 'application/octet-stream';
    const filenameHeader: string = result.data.filename ?? filename;
    const stream = result.data.stream;

    res.setHeader('Content-Type', mimetype);
    res.setHeader(
      'Content-Disposition',
      `inline; filename="${encodeURIComponent(filenameHeader)}"`,
    );

    // If it's a Node Readable stream, pipe it. Otherwise send the buffer/string.
    if (stream && typeof (stream as any).pipe === 'function') {
      (stream as NodeJS.ReadableStream).pipe(res);
      return;
    }

    return res.send(stream);
  }

  @Get('download/:filename')
  async downloadFile(
    @Param('filename') filename: string,
    @Res() res: Response,
    @Query('folder') folder?: string,
  ) {
    const result: DownloadResponse = await this.fileService.downloadFile(
      filename,
      folder,
    );

    if (!result.success || !result.data) {
      return res.status(404).json({
        success: false,
        message: 'Arquivo não encontrado',
      });
    }

    res.setHeader('Content-Type', result.data.mimetype);
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${result.data.originalName}"`,
    );
    res.setHeader('Content-Length', result.data.stream.length);

    return res.send(result.data.stream);
  }

  @Delete(':filename')
  async deleteFile(
    @Param('filename') filename: string,
    @Query('folder') folder?: string,
  ) {
    const result = await this.fileService.deleteFile(filename, folder);
    return result;
  }

  @Post('folder/create')
  async createFolder(@Body('folderName') folderName: string) {
    return this.fileService.createFolder(folderName);
  }

  @Delete('folder/:folderName')
  async deleteFolder(@Param('folderName') folderName: string) {
    return this.fileService.deleteFolder(folderName);
  }
}
