import { BadRequestException, Injectable } from '@nestjs/common';
import { Model } from 'mongoose';
import { ToDo } from './to-do.model';
import { InjectModel } from '@nestjs/mongoose';

@Injectable()
export class ToDoService {
  constructor(@InjectModel('ToDo') private readonly toDoModel: Model<ToDo>) {}

  async create(body: any) {
    const find = await this.toDoModel.findOne({ nome: body.nome });

    if (find) {
      throw new BadRequestException('Item a Fazer ja existe na Lista!');
    }
    return await this.toDoModel.create(body);
  }

  async findAll() {
    return await this.toDoModel.find();
  }

  async findOne(id: string) {
    return await this.toDoModel.findById(id);
  }

  async update(id: string, body: any) {
    return await this.toDoModel.findByIdAndUpdate(id, body);
  }

  async delete(id: string) {
    return await this.toDoModel.findByIdAndDelete(id);
  }

  async findByFilter(body: any) {
    let { pesquisa, page, limit, finalizado, responsavel } = body;

    const skip = (page - 1) * limit;

    let query = {};

    if (pesquisa) {
      query['$or'] = [
        { nome: { $regex: pesquisa, $options: 'i' } },
        { descricao: { $regex: pesquisa, $options: 'i' } },
        { responsavel: { $regex: pesquisa, $options: 'i' } },
      ];
    }

    if (finalizado === true) {
      // Somente finalizados
      query['finalizado'] = true;
    } else if (finalizado === false) {
      // Finalizados = false OU campo não existe
      query['$or'] = [
        ...(query['$or'] || []), // preserva OR da pesquisa se existir
        { finalizado: false },
        { finalizado: { $exists: false } },
      ];
    }

    if (responsavel) {
      query['responsavel'] = { $regex: responsavel, $options: 'i' };
    }

    const result = await this.toDoModel
      .find(query)
      .skip(skip)
      .limit(limit)
      .sort({ createdAt: 1 })
      .exec();
    const total = await this.toDoModel.countDocuments(query);
    return { result, total };
  }
}
