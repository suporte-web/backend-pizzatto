import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { ContasOffice } from './contasOffice.model';
import { CreateContaOfficeDto } from './dtos/CreateContaOffice.dto';

@Injectable()
export class ContasOfficeService {
  constructor(
    @InjectModel('ContasOffice')
    private readonly contasOfficeModel: Model<ContasOffice>,
  ) {}

  async create(body: any) {
    const find = await this.contasOfficeModel.findOne({ email: body.email });

    if (find) {
      throw new BadRequestException('Conta ja cadastrada');
    }

    return await this.contasOfficeModel.create({ ...body, ativo: true });
  }

  async createBySpreadsheet(
    body: CreateContaOfficeDto[] | CreateContaOfficeDto,
  ) {
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

  private async createOrUpdateRecord(data: CreateContaOfficeDto) {
    if (!data) {
      throw new BadRequestException('Dados inválidos');
    }

    const { Nome: nome, Email: email, Senha: senha } = data;

    // Verificar se existe algum registro com o mesmo nomeComputador OU nomeColaborador
    const existingRecord = await this.contasOfficeModel.findOne({ nome: nome });

    if (existingRecord) {
      // Atualizar registro existente
      return await this.contasOfficeModel.findByIdAndUpdate(
        existingRecord._id,
        {
          nome: nome,
          email: email,
          senha: senha,
        },
        { new: true },
      );
    } else {
      // Criar novo registro
      return await this.contasOfficeModel.create({
        nome: nome,
        email: email,
        senha: senha,
        ativo: true,
      });
    }
  }

  async findAtivos() {
    return await this.contasOfficeModel.find({ ativo: true });
  }

  async findAll() {
    return await this.contasOfficeModel.find();
  }

  async findOne(id: string) {
    return await this.contasOfficeModel.findById(id);
  }

  async findByFilter(body: any) {
    let { pesquisa, page, limit } = body;

    const skip = (page - 1) * limit;

    let query = {};

    if (pesquisa) {
      query['$or'] = [
        { nome: { $regex: pesquisa, $options: 'i' } },
        { email: { $regex: pesquisa, $options: 'i' } },
      ];
    }

    const result = await this.contasOfficeModel
      .find(query)
      .skip(skip)
      .limit(limit)
      .sort({ nomeComputador: 1 })
      .exec();
    const total = await this.contasOfficeModel.countDocuments(query);
    return { result, total };
  }

  async update(id: string, body: any) {
    return this.contasOfficeModel.findByIdAndUpdate(id, body);
  }

  async delete(id: string) {
    return this.contasOfficeModel.findByIdAndDelete(id);
  }
}
