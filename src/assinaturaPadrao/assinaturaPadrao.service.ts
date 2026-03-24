import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';

@Injectable()
export class AssinaturaPadraoService {
  constructor(private readonly prisma: PrismaService) {}

  async create(body: any, file: Express.Multer.File, ip: string, user: any) {
    console.log(body);

    if (!file) {
      throw new BadRequestException('Imagem de background é obrigatória.');
    }

    const caminhoBackground = `downloads/background-assinaturas/${file.filename}`;

    const corFont = String(body.corFont || '').trim();
    const fontSize = String(body.fontSize || '').trim();

    const photoX = Number(body.photoX);
    const photoY = Number(body.photoY);
    const photoSize = Number(body.photoSize);

    const nomeX = Number(body.nomeX);
    const nomeY = Number(body.nomeY);

    const departamentoX = Number(body.departamentoX);
    const departamentoY = Number(body.departamentoY);

    const telefoneX = Number(body.telefoneX);
    const telefoneY = Number(body.telefoneY);

    const logoX = Number(body.logoX);
    const logoY = Number(body.logoY);
    const logoHeight = Number(body.logoHeight);

    if (!corFont) {
      throw new BadRequestException('corFont é obrigatória.');
    }

    if (!fontSize) {
      throw new BadRequestException('fontSize é obrigatória.');
    }

    const numericFields = [
      { name: 'photoX', value: photoX },
      { name: 'photoY', value: photoY },
      { name: 'photoSize', value: photoSize },
      { name: 'nomeX', value: nomeX },
      { name: 'nomeY', value: nomeY },
      { name: 'departamentoX', value: departamentoX },
      { name: 'departamentoY', value: departamentoY },
      { name: 'telefoneX', value: telefoneX },
      { name: 'telefoneY', value: telefoneY },
      { name: 'logoX', value: logoX },
      { name: 'logoY', value: logoY },
      { name: 'logoHeight', value: logoHeight },
    ];

    const invalidField = numericFields.find((field) =>
      Number.isNaN(field.value),
    );

    if (invalidField) {
      throw new BadRequestException(
        `Campo numérico inválido: ${invalidField.name}`,
      );
    }

    await this.prisma.$transaction([
      this.prisma.assinaturaPadrao.updateMany({
        where: { isAtual: true },
        data: { isAtual: false },
      }),
      this.prisma.assinaturaPadrao.create({
        data: {
          caminhoBackground,
          corFont,
          fontSize,

          photoX,
          photoY,
          photoSize,

          nomeX,
          nomeY,

          departamentoX,
          departamentoY,

          telefoneX,
          telefoneY,

          logoX,
          logoY,
          logoHeight,

          criadoPor: user?.name || 'Sistema',
          isAtual: true,
        },
      }),
    ]);

    return await this.prisma.audit_logs.create({
      data: {
        acao: 'Criou a Assinatura pré-definida de E-mail',
        entidade: user?.name,
        filialEntidade: user?.filial,
        ipAddress: ip,
      },
    });
  }

  async findAtual() {
    return await this.prisma.assinaturaPadrao.findFirst({
      where: { isAtual: true },
    });
  }

  async findByFilter(body: any) {
    const page = Number(body.page) > 0 ? Number(body.page) : 1;
    const limit = Number(body.limit) > 0 ? Number(body.limit) : 10;
    const skip = (page - 1) * limit;

    const [result, total] = await Promise.all([
      this.prisma.assinaturaPadrao.findMany({
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.assinatura.count(),
    ]);

    return {
      result,
      total,
    };
  }
}
