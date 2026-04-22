import {
  HttpException,
  HttpStatus,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as ldap from 'ldapjs';

@Injectable()
export class AuthService {
  constructor(
    private readonly jwt: JwtService,
  ) {}

  private readonly accessSecret = process.env.JWT_SECRET as string;

  async verifyAccessToken(token: string) {
    try {
      // retorna o payload que você colocou no login()
      return await this.jwt.verifyAsync(token, { secret: this.accessSecret });
      
    } catch {
      throw new UnauthorizedException('Token inválido');
    }
  }
}
