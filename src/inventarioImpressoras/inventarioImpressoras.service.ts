import { BadRequestException, Injectable } from '@nestjs/common';
import { CreateInventarioImpressorasDto } from './dtos/createInventarioImpressoras.dto';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class InventarioImpressorasService {
  constructor(private readonly prisma: PrismaService) {}

  async create(body: any) {
    return await this.prisma.inventarioImpressoras.create({
      data: body,
    });
  }

  async createBySpreadsheet(
    body: CreateInventarioImpressorasDto[] | CreateInventarioImpressorasDto,
  ) {
    if (Array.isArray(body)) {
      return await Promise.all(body.map((item) => this.createSingleRecord(item)));
    }

    return await this.createSingleRecord(body);
  }

  private async createSingleRecord(data: CreateInventarioImpressorasDto) {
    if (!data) {
      throw new BadRequestException('Dados inválidos');
    }

    return await this.prisma.inventarioImpressoras.create({
      data: {
        filial: data.Filial,
        marca: data.Marca,
        modelo: data.Modelo,
        numeroSerie: data['N° Série'],
        ip: data.IP,
        macLan: data['MAC LAN'],
        macWlan: data['MAC WLAN'],
        localizacao: data.Local,
        senhaAdministrador: data['Senha Admin'],
        etiqueta: data.Etiqueta,
      },
    });
  }

  async findByFilter(body: any) {
    const { pesquisa, status, page = 1, limit = 10 } = body;

    const skip = (page - 1) * limit;

    const where: any = {};

    if (pesquisa) {
      where.OR = [
        { filial: { contains: pesquisa, mode: 'insensitive' } },
        { marca: { contains: pesquisa, mode: 'insensitive' } },
        { modelo: { contains: pesquisa, mode: 'insensitive' } },
        { ip: { contains: pesquisa, mode: 'insensitive' } },
        { localizacao: { contains: pesquisa, mode: 'insensitive' } },
      ];
    }

    if (status) {
      where.status = status;
    }

    const [result, total] = await Promise.all([
      this.prisma.inventarioImpressoras.findMany({
        where,
        skip,
        take: limit,
        orderBy: {
          modelo: 'asc', // troque para outro campo se quiser
        },
      }),
      this.prisma.inventarioImpressoras.count({
        where,
      }),
    ]);

    return { result, total };
  }

  async update(body: any) {
    const { id, ...data } = body;

    if (!id) {
      throw new BadRequestException('ID é obrigatório');
    }

    return await this.prisma.inventarioImpressoras.update({
      where: { id },
      data,
    });
  }
}