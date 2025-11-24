import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Pop } from './pops.model';
import { Model } from 'mongoose';

@Injectable()
export class PopService {
  constructor(@InjectModel('Pop') private readonly popModel: Model<Pop>) {}

  async create(body: any) {
    const find = await this.popModel.findOne({
      originalName: body.originalName,
    });
    if (find) {
      return await this.popModel.findByIdAndUpdate(find._id, body);
    } else {
      return await this.popModel.create(body);
    }
  }

  async findById(id: any) {
    return await this.popModel.findById(id);
  }

  async findByFilter(body: any) {
    let { nome, page, limit } = body;

    const skip = (page - 1) * limit;

    let query = {};

    if (nome) query['originalName'] = { $regex: nome, $options: 'i' };

    const result = await this.popModel.find(query).skip(skip).limit(limit);
    const total = await this.popModel.countDocuments(query);

    return { result, total };
  }
}
