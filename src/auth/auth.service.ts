import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import * as jwt from 'jsonwebtoken';
import * as bcrypt from 'bcrypt';
import { LoginDto } from './dtos/login.dto';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { User } from 'src/user/user.model';
const SECRET = process.env.JWT_SECRET;

@Injectable()
export class AuthService {

    constructor(
        @InjectModel('User') private readonly userModel: Model<User>,
    ) { }

    async login(loginDto: LoginDto) {
        try {
            const user = await this.userModel.findOne({
                email: loginDto.email
            });
            if (!user) {
                throw new HttpException('Usuário não encontrado', 401);
            }
            const isPasswordValid = await bcrypt.compare(loginDto.senha, user.senha);
            if (!isPasswordValid) {
                throw new HttpException('Senha inválida', 401);
            }
            if (user.ativo === false) {
                throw new HttpException(`Usuario inativo`, 422)
            }

            const payload = { ...user, senha: null, id: user._id };

            return jwt.sign(payload, SECRET, { expiresIn: '12h' })
        } catch (error) {
            throw new HttpException(
                'Erro ao verificar o código',
                HttpStatus.INTERNAL_SERVER_ERROR,
            );
        }
    }

    async validateUser(token: string) {
        try {
            if (!SECRET || typeof SECRET !== 'string') {
                throw new HttpException('JWT secret is not defined', 500);
            }
            const decoded: any = jwt.verify(token, SECRET);
            const user = await this.userModel.findById(decoded.id);
            if (!user) {
                throw new HttpException('Invalid token', 401);
            }
            return decoded;
        } catch (error) {
            throw new HttpException('Invalid token', 401);
        }
    }

    async createJwt(user: any) {
        return jwt.sign(user, SECRET)
    }

    async logout() {
        try {
            return { status: 200, message: 'Deslogado com sucesso!' }
        } catch (error) {
            throw new HttpException('Problem to logout', 401);
        }
    }
}