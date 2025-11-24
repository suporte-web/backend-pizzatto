import {
  Injectable,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { promises as fs } from 'fs';
import * as path from 'path';
import { v4 as uuidv4 } from 'uuid';
import * as libre from 'libreoffice-convert';
import { promisify } from 'util';
import {
  DownloadResponse,
  FileListResponse,
  FileResponse,
} from './interface/fileResponse.interface';
import * as mammoth from 'mammoth';
import puppeteer from 'puppeteer';

const libreConvert = promisify(libre.convert);

@Injectable()
export class FileService {
  private readonly baseDir = path.join(process.cwd(), 'downloads');
  private readonly supportedWordExtensions = ['.doc', '.docx', '.odt', '.rtf'];

  constructor() {
    this.ensureBaseDirectory();
  }

  private async ensureBaseDirectory() {
    try {
      await fs.access(this.baseDir);
    } catch {
      await fs.mkdir(this.baseDir, { recursive: true });
    }
  }

  private async ensureDirectory(folder: string) {
    const folderPath = path.join(this.baseDir, folder);
    try {
      await fs.access(folderPath);
    } catch {
      await fs.mkdir(folderPath, { recursive: true });
    }
    return folderPath;
  }

  async uploadFile(
    file: Express.Multer.File,
    folder: string = 'default',
  ): Promise<FileResponse> {
    if (!file) {
      throw new BadRequestException('Nenhum arquivo enviado');
    }

    try {
      const folderPath = await this.ensureDirectory(folder);
      const fileExtension = path.extname(file.originalname);
      const fileName = `${uuidv4()}${fileExtension}`;
      const filePath = path.join(folderPath, fileName);

      await fs.writeFile(filePath, file.buffer);

      return {
        filename: fileName,
        originalName: file.originalname,
        path: filePath,
        size: file.size,
        mimetype: file.mimetype,
        uploadDate: new Date(),
        folder: folder,
      };
    } catch (error) {
      throw new BadRequestException(`Erro ao salvar arquivo: ${error.message}`);
    }
  }

  async uploadMultipleFiles(
    files: Express.Multer.File[],
    folder: string = 'default',
  ): Promise<FileResponse[]> {
    if (!files || files.length === 0) {
      throw new BadRequestException('Nenhum arquivo enviado');
    }

    const uploadPromises = files.map((file) => this.uploadFile(file, folder));
    return Promise.all(uploadPromises);
  }

  async listFiles(folder: string = 'default'): Promise<FileListResponse> {
    try {
      const folderPath = await this.ensureDirectory(folder);
      const files = await fs.readdir(folderPath);

      const fileDetails: FileResponse[] = [];

      for (const file of files) {
        const filePath = path.join(folderPath, file);
        const stats = await fs.stat(filePath);

        fileDetails.push({
          filename: file,
          originalName: file,
          path: filePath,
          size: stats.size,
          mimetype: this.getMimeType(path.extname(file)),
          uploadDate: stats.birthtime,
          folder: folder,
        });
      }

      fileDetails.sort(
        (a, b) => b.uploadDate.getTime() - a.uploadDate.getTime(),
      );

      return {
        success: true,
        files: fileDetails,
        total: fileDetails.length,
        folder: folder,
      };
    } catch (error) {
      throw new BadRequestException(
        `Erro ao listar arquivos: ${error.message}`,
      );
    }
  }

  async listFolders(): Promise<{ success: boolean; folders: string[] }> {
    try {
      const items = await fs.readdir(this.baseDir);
      const folders: string[] = [];

      for (const item of items) {
        const itemPath = path.join(this.baseDir, item);
        const stats = await fs.stat(itemPath);
        if (stats.isDirectory()) {
          folders.push(item);
        }
      }

      return {
        success: true,
        folders: folders.sort(),
      };
    } catch (error) {
      throw new BadRequestException(`Erro ao listar pastas: ${error.message}`);
    }
  }

  async downloadFile(
    filename: string,
    folder: string = 'default',
  ): Promise<DownloadResponse> {
    try {
      const folderPath = await this.ensureDirectory(folder);
      const filePath = path.join(folderPath, filename);

      await fs.access(filePath);

      const stats = await fs.stat(filePath);
      const originalName = filename;

      return {
        success: true,
        data: {
          stream: await fs.readFile(filePath),
          filename: filename,
          originalName: originalName,
          mimetype: this.getMimeType(path.extname(filename)),
          folder: folder,
        },
      };
    } catch (error) {
      if (error.code === 'ENOENT') {
        throw new NotFoundException('Arquivo não encontrado');
      }
      throw new BadRequestException(`Erro ao baixar arquivo: ${error.message}`);
    }
  }

  async viewFile(
    filename: string,
    folder: string = 'default',
  ): Promise<DownloadResponse> {
    try {
      const folderPath = await this.ensureDirectory(folder);
      const filePath = path.join(folderPath, filename);

      await fs.access(filePath);

      const stats = await fs.stat(filePath);
      const originalName = filename;

      return {
        success: true,
        data: {
          stream: await fs.readFile(filePath),
          filename: filename,
          originalName: originalName,
          mimetype: this.getMimeType(path.extname(filename)),
          folder: folder,
        },
      };
    } catch (error) {
      if (error.code === 'ENOENT') {
        throw new NotFoundException('Arquivo não encontrado');
      }
      throw new BadRequestException(
        `Erro ao visualizar arquivo: ${error.message}`,
      );
    }
  }

  async deleteFile(
    filename: string,
    folder: string = 'default',
  ): Promise<{ success: boolean; message: string }> {
    try {
      const folderPath = await this.ensureDirectory(folder);
      const filePath = path.join(folderPath, filename);
      await fs.unlink(filePath);

      return {
        success: true,
        message: 'Arquivo deletado com sucesso',
      };
    } catch (error) {
      if (error.code === 'ENOENT') {
        throw new NotFoundException('Arquivo não encontrado');
      }
      throw new BadRequestException(
        `Erro ao deletar arquivo: ${error.message}`,
      );
    }
  }

  async createFolder(
    folderName: string,
  ): Promise<{ success: boolean; message: string }> {
    try {
      await this.ensureDirectory(folderName);
      return {
        success: true,
        message: `Pasta '${folderName}' criada com sucesso`,
      };
    } catch (error) {
      throw new BadRequestException(`Erro ao criar pasta: ${error.message}`);
    }
  }

  async deleteFolder(
    folderName: string,
  ): Promise<{ success: boolean; message: string }> {
    try {
      const folderPath = path.join(this.baseDir, folderName);

      await fs.access(folderPath);

      const files = await fs.readdir(folderPath);
      if (files.length > 0) {
        throw new BadRequestException('A pasta não está vazia');
      }

      await fs.rmdir(folderPath);

      return {
        success: true,
        message: `Pasta '${folderName}' deletada com sucesso`,
      };
    } catch (error) {
      if (error.code === 'ENOENT') {
        throw new NotFoundException('Pasta não encontrada');
      }
      throw new BadRequestException(`Erro ao deletar pasta: ${error.message}`);
    }
  }

  private getMimeType(extension: string): string {
    const mimeTypes = {
      '.pdf': 'application/pdf',
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.png': 'image/png',
      '.gif': 'image/gif',
      '.txt': 'text/plain',
      '.doc': 'application/msword',
      '.docx':
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      '.odt': 'application/vnd.oasis.opendocument.text',
      '.rtf': 'application/rtf',
      '.xls': 'application/vnd.ms-excel',
      '.xlsx':
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    };

    return mimeTypes[extension.toLowerCase()] || 'application/octet-stream';
  }

  // Método para verificar se um arquivo é conversível
  isFileConvertible(filename: string): boolean {
    const extension = path.extname(filename).toLowerCase();
    return this.supportedWordExtensions.includes(extension);
  }

  // Método para listar arquivos conversíveis
  async listConvertibleFiles(
    folder: string = 'default',
  ): Promise<FileListResponse> {
    const allFiles = await this.listFiles(folder);
    const convertibleFiles = allFiles.files.filter((file) =>
      this.isFileConvertible(file.filename),
    );

    return {
      ...allFiles,
      files: convertibleFiles,
      total: convertibleFiles.length,
    };
  }

  async convertWordToPdf(
    filename: string,
    folder: string = 'default',
  ): Promise<FileResponse> {
    try {
      const folderPath = await this.ensureDirectory(folder);
      const filePath = path.join(folderPath, filename);

      // Verificar se o arquivo existe
      await fs.access(filePath);

      // Verificar se é um arquivo Word suportado
      const fileExtension = path.extname(filename).toLowerCase();
      if (!this.supportedWordExtensions.includes(fileExtension)) {
        throw new BadRequestException(
          `Tipo de arquivo não suportado para conversão. Formatos suportados: ${this.supportedWordExtensions.join(', ')}`,
        );
      }

      // Ler o arquivo Word
      const wordFileBuffer = await fs.readFile(filePath);

      // Converter para HTML usando Mammoth
      const result = await mammoth.convertToHtml({ buffer: wordFileBuffer });
      const htmlContent = result.value;

      // Gerar PDF a partir do HTML
      const browser = await puppeteer.launch({
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox'],
      });

      const page = await browser.newPage();

      // Estilos básicos para melhor visualização
      const styledHtml = `
        <!DOCTYPE html>
        <html>
          <head>
            <meta charset="utf-8">
            <style>
              body { 
                font-family: Arial, sans-serif; 
                line-height: 1.6; 
                margin: 20px; 
                color: #333;
              }
              h1, h2, h3 { color: #2c3e50; }
              table { border-collapse: collapse; width: 100%; margin: 10px 0; }
              th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
              th { background-color: #f2f2f2; }
              img { max-width: 100%; height: auto; }
            </style>
          </head>
          <body>${htmlContent}</body>
        </html>
      `;

      await page.setContent(styledHtml, { waitUntil: 'networkidle0' });

      // Gerar PDF
      const pdfBuffer = await page.pdf({
        format: 'A4',
        printBackground: true,
        margin: {
          top: '20mm',
          right: '20mm',
          bottom: '20mm',
          left: '20mm',
        },
      });

      await browser.close();

      // Salvar o arquivo PDF (opcional - se quiser salvar)
      const pdfFilename = `${path.parse(filename).name}.pdf`;
      const pdfFilePath = path.join(folderPath, pdfFilename);
      await fs.writeFile(pdfFilePath, pdfBuffer);

      const stats = await fs.stat(pdfFilePath);

      return {
        filename: pdfFilename,
        originalName: pdfFilename,
        path: pdfFilePath,
        size: stats.size,
        mimetype: 'application/pdf',
        uploadDate: new Date(),
        folder: folder,
      };
    } catch (error) {
      if (error.code === 'ENOENT') {
        throw new NotFoundException('Arquivo não encontrado');
      }
      if (error instanceof BadRequestException) {
        throw error;
      }
      throw new BadRequestException(
        `Erro ao converter arquivo: ${error.message}`,
      );
    }
  }

  async convertAndViewWordAsPdf(
    filename: string,
    folder: string = 'default',
  ): Promise<DownloadResponse> {
    try {
      const result = await this.convertWordToPdf(filename, folder);

      return {
        success: true,
        data: {
          stream: await fs.readFile(result.path),
          filename: result.filename,
          originalName: result.originalName,
          mimetype: result.mimetype,
          folder: result.folder,
        },
      };
    } catch (error) {
      throw new BadRequestException(
        `Erro ao converter e visualizar arquivo: ${error.message}`,
      );
    }
  }

  // Método simplificado apenas para visualização (não salva arquivo)
  async viewWordAsPdf(
    filename: string,
    folder: string = 'default',
  ): Promise<DownloadResponse> {
    try {
      const folderPath = await this.ensureDirectory(folder);
      const filePath = path.join(folderPath, filename);

      await fs.access(filePath);

      const fileExtension = path.extname(filename).toLowerCase();
      if (!this.supportedWordExtensions.includes(fileExtension)) {
        throw new BadRequestException(
          'Tipo de arquivo não suportado para conversão',
        );
      }

      const wordFileBuffer = await fs.readFile(filePath);
      const result = await mammoth.convertToHtml({ buffer: wordFileBuffer });
      const htmlContent = result.value;

      const browser = await puppeteer.launch({
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox'],
      });

      const page = await browser.newPage();

      const styledHtml = `
        <!DOCTYPE html>
        <html>
          <head>
            <meta charset="utf-8">
            <style>
              body { 
                font-family: Arial, sans-serif; 
                line-height: 1.6; 
                margin: 20px; 
                color: #333;
              }
              h1, h2, h3 { color: #2c3e50; }
              table { border-collapse: collapse; width: 100%; margin: 10px 0; }
              th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
              th { background-color: #f2f2f2; }
              img { max-width: 100%; height: auto; }
            </style>
          </head>
          <body>${htmlContent}</body>
        </html>
      `;

      await page.setContent(styledHtml, { waitUntil: 'networkidle0' });

      const pdfBuffer = await page.pdf({
        format: 'A4',
        printBackground: true,
        margin: {
          top: '20mm',
          right: '20mm',
          bottom: '20mm',
          left: '20mm',
        },
      });

      await browser.close();

      return {
        success: true,
        data: {
          stream: pdfBuffer,
          filename: `${path.parse(filename).name}.pdf`,
          originalName: `${path.parse(filename).name}.pdf`,
          mimetype: 'application/pdf',
          folder: folder,
        },
      };
    } catch (error) {
      if (error.code === 'ENOENT') {
        throw new NotFoundException('Arquivo não encontrado');
      }
      throw new BadRequestException(
        `Erro ao visualizar arquivo como PDF: ${error.message}`,
      );
    }
  }
}
