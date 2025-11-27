import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { error } from 'console';
import { User } from './user.model';
const bcrypt = require('bcrypt');
const senha = process.env.PASSWORD;

@Injectable()
export class UserService {
  constructor(@InjectModel('User') private readonly userModel: Model<User>) {}

  async create(body: any) {
    const saltRounds = 10;

    let encryptedPassword = await bcrypt.hash(senha, saltRounds);
    return await this.userModel.create({ ...body, senha: encryptedPassword });
  }

  async findAll() {
    return await this.userModel.find();
  }

  async findOne(_id: string) {
    return await this.userModel.findById(_id);
  }

  async findByFilter(body: any) {
    let { pesquisa, ativo, page, limit } = body;

    const skip = (page - 1) * limit;

    let query = {};

    if (pesquisa)
      query['$or'] = [
        {
          nome: { $regex: pesquisa, $options: 'i' },
          email: { $regex: pesquisa, $options: 'i' },
        },
      ];
    if (ativo) query['ativo'] = ativo;
    const result = await this.userModel.find(query).skip(skip).limit(limit);
    const total = await this.userModel.countDocuments(query);

    return { result, total };
  }

  async updateUser(id: string, body: any) {
    if (body.senha) {
      const hashedPassword = await bcrypt.hash(body.senha, 10);
      body.senha = hashedPassword;
    }
    return await this.userModel.findByIdAndUpdate(id, body);
  }

  async updateSenhaUser(body: any) {
    const { _id, senha1, senha2 } = body;

    if (senha1 !== senha2) {
      throw new error(
        'Senhas diferentes, lembre-se que a senha deve ser a mesma!',
      );
    }
    const saltRounds = 10;

    const encriptedPassword = await bcrypt.hash(senha1, saltRounds);

    return await this.userModel.findByIdAndUpdate(_id, {
      senha: encriptedPassword,
      primeiroAcesso: false,
    });
  }

  async getUsersAtivos() {
    return await this.userModel.find({ ativo: true });
  }
}
