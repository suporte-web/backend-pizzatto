import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { AuthService } from './auth.service';

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(private readonly authService: AuthService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    if (!request.headers.authorization) {
      return false;
    }
    const token = request.headers.authorization.split(' ')[1];
    try {
      const user = await this.authService.validateUser(token);
      
      // Converte o documento Mongoose para objeto JavaScript simples
      const userObject = user.toObject ? user.toObject() : user;
      
      // Remove propriedades sensíveis
      const { senha, __v, _id, ...cleanUser } = userObject;
      
      // Adiciona id baseado no _id
      cleanUser.id = _id ? _id.toString() : userObject.id;
      
      request.user = cleanUser;
      return true;
    } catch (error) {
      return false;
    }
  }
}