import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Inventario } from './inventario.model';
import { CreateInventarioDto } from './dtos/createInventario.dto';

@Injectable()
export class InventarioService {
  constructor(
    @InjectModel('Inventario')
    private readonly inventarioModel: Model<Inventario>,
  ) {}

  async create(body: any) {
    const get = await this.inventarioModel.findOne({ tag: body.tag });

    if (get) {
      throw new BadRequestException('Item ja existe no Inventário');
    }
    return await this.inventarioModel.create(body);
  }

  async createBySpreadsheet(body: CreateInventarioDto[] | CreateInventarioDto) {
    if (Array.isArray(body)) {
      // Processar múltiplos registros
      return await Promise.all(
        body.map((item) => this.createOrUpdateRecord(item)),
      );
    } else {
      // Processar único registro
      return await this.createOrUpdateRecord(body);
    }
  }

  private async createOrUpdateRecord(data: CreateInventarioDto) {
    if (!data) {
      throw new BadRequestException('Dados inválidos');
    }

    const {
      EQUIPAMENTO,
      PATRIMÔNIO,
      TAG,
      'NOME DO COMPUTADOR': nomeComputador,
      'NOME FUNCIONÁRIO': nomeColaborador,
      LOCAL: localizacao,
    } = data;

    // Verificar se existe algum registro com o mesmo nomeComputador OU nomeColaborador
    const existingRecord = await this.inventarioModel.findOne({
      $or: [
        { nomeComputador: nomeComputador },
        { nomeColaborador: nomeColaborador },
      ],
    });

    if (existingRecord) {
      // Atualizar registro existente
      return await this.inventarioModel.findByIdAndUpdate(
        existingRecord._id,
        {
          equipamento: EQUIPAMENTO,
          patrimonio: PATRIMÔNIO,
          tag: TAG,
          nomeComputador: nomeComputador,
          nomeColaborador: nomeColaborador,
          localizacao: localizacao,
        },
        { new: true }, // Retorna o documento atualizado
      );
    } else {
      // Criar novo registro
      return await this.inventarioModel.create({
        equipamento: EQUIPAMENTO,
        patrimonio: PATRIMÔNIO,
        tag: TAG,
        nomeComputador: nomeComputador,
        nomeColaborador: nomeColaborador,
        localizacao: localizacao,
      });
    }
  }

  async findByFilter(body: any) {
    let { pesquisa, equipamento, setor, status, page, limit } = body;

    const skip = (page - 1) * limit;

    let query = {};

    if (pesquisa) {
      query['$or'] = [
        { nomeColaborador: { $regex: pesquisa, $options: 'i' } },
        { nomeComputador: { $regex: pesquisa, $options: 'i' } },
        { patrimonio: { $regex: pesquisa, $options: 'i' } },
        { tag: { $regex: pesquisa, $options: 'i' } },
        { localizacao: { $regex: pesquisa, $options: 'i' } },
      ];
    }
    if (equipamento)
      query['equipamento'] = { $regex: equipamento, $options: 'i' };
    if (setor) query['setor'] = { $regex: setor, $options: 'i' };
    if (status) query['status'] = status;

    const result = await this.inventarioModel
      .find(query)
      .skip(skip)
      .limit(limit)
      .sort({ nomeComputador: 1 })
      .exec();
    const total = await this.inventarioModel.countDocuments(query);
    return { result, total };
  }

  async update(body: any) {
    return await this.inventarioModel.findByIdAndUpdate(body._id, body);
  }
}
