import { BadRequestException, Injectable } from '@nestjs/common';
import { CreateInventarioImpressorasDto } from './dtos/createInventarioImpressoras.dto';
import { InventarioImpressoras } from './inventarioImpressoras.model';
import { Model } from 'mongoose';
import { InjectModel } from '@nestjs/mongoose';

@Injectable()
export class InventarioImpressorasService {
  constructor(
    @InjectModel('InventarioImpressora')
    private readonly inventarioImpressorasModel: Model<InventarioImpressoras>,
  ) {}

  async create(body: any) {
    return await this.inventarioImpressorasModel.create(body);
  }

  async createBySpreadsheet(
    body: CreateInventarioImpressorasDto[] | CreateInventarioImpressorasDto,
  ) {
    if (Array.isArray(body)) {
      // Processar múltiplos registros
      return await Promise.all(
        body.map((item) => this.createSingleRecord(item)),
      );
    } else {
      // Processar único registro
      return await this.createSingleRecord(body);
    }
  }

  private async createSingleRecord(data: CreateInventarioImpressorasDto) {
    if (!data) {
      throw new BadRequestException('Dados inválidos');
    }

    return await this.inventarioImpressorasModel.create({
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
    });
  }

  async findByFilter(body: any) {
    let { pesquisa, status, page, limit } = body;
    
    const skip = (page - 1) * limit;

    let query = {};

    if (pesquisa) {
      query['$or'] = [
        { filial: { $regex: pesquisa, $options: 'i' } },
        { marca: { $regex: pesquisa, $options: 'i' } },
        { modelo: { $regex: pesquisa, $options: 'i' } },
        { ip: { $regex: pesquisa, $options: 'i' } },
        { localizacao: { $regex: pesquisa, $options: 'i' } },
      ];
    }

    if (status) {
      query['status'] = { status };
    }

    const result = await this.inventarioImpressorasModel
      .find(query)
      .skip(skip)
      .limit(limit)
      .sort({ nomeComputador: 1 })
      .exec();
    const total = await this.inventarioImpressorasModel.countDocuments(query);
    return { result, total };
  }

  async update(body: any) {
    return await this.inventarioImpressorasModel.findByIdAndUpdate(
      body._id,
      body,
    );
  }
}
