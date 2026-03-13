import {
  HttpException,
  HttpStatus,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { LoginDto } from './dtos/login.dto';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { User } from 'src/user/user.model';
import { JwtService } from '@nestjs/jwt';

@Injectable()
export class AuthService {
  constructor(
    @InjectModel('User') private readonly userModel: Model<User>,
    private readonly jwtService: JwtService,
  ) {}

  private readonly accessSecret = process.env.JWT_SECRET as string;

  async login(loginDto: LoginDto) {
    try {
      if (!this.accessSecret) {
        throw new HttpException(
          'JWT secret is not defined',
          HttpStatus.INTERNAL_SERVER_ERROR,
        );
      }

      const user = await this.userModel.findOne({
        email: loginDto.email,
      });

      if (!user) {
        throw new HttpException(
          'Usuário não encontrado',
          HttpStatus.UNAUTHORIZED,
        );
      }

      const isPasswordValid = await bcrypt.compare(loginDto.senha, user.senha);

      if (!isPasswordValid) {
        throw new HttpException('Senha inválida', HttpStatus.UNAUTHORIZED);
      }

      if (user.ativo === false) {
        throw new HttpException(
          'Usuário inativo',
          HttpStatus.UNPROCESSABLE_ENTITY,
        );
      }

      const payload = {
        id: user._id,
        email: user.email,
        nome: user.nome,
        ativo: user.ativo,
      };

      return {
        access_token: await this.jwtService.signAsync(payload, {
          secret: this.accessSecret,
          expiresIn: '12h',
        }),
        user: payload,
      };
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }

      throw new HttpException(
        'Erro ao realizar login',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  async validateUser(token: string) {
    try {
      if (!this.accessSecret) {
        throw new HttpException(
          'JWT secret is not defined',
          HttpStatus.INTERNAL_SERVER_ERROR,
        );
      }

      const decoded = await this.jwtService.verifyAsync(token, {
        secret: this.accessSecret,
      });

      const user = await this.userModel.findById(decoded.id);

      if (!user) {
        throw new UnauthorizedException('Token inválido');
      }

      return decoded;
    } catch (error) {
      throw new UnauthorizedException('Token inválido');
    }
  }

  async createJwt(user: any) {
    if (!this.accessSecret) {
      throw new HttpException(
        'JWT secret is not defined',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }

    const payload = {
      id: user._id || user.id,
      email: user.email,
      nome: user.nome,
      ativo: user.ativo,
    };

    return this.jwtService.signAsync(payload, {
      secret: this.accessSecret,
      expiresIn: '12h',
    });
  }

  async logout() {
    return {
      status: 200,
      message: 'Deslogado com sucesso!',
    };
  }

  async verifyAccessToken(token: string) {
    try {
      return await this.jwtService.verifyAsync(token, {
        secret: this.accessSecret,
      });
    } catch {
      throw new UnauthorizedException('Token inválido');
    }
  }
}
