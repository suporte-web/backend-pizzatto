import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';

@Injectable()
export class ThirdPartyAccessGuard implements CanActivate {
  constructor(private readonly jwt: JwtService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const path =
      String(request.path || request.url?.split('?')[0] || '').replace(
        /\/+$/,
        '',
      ) || '/';
    const method = String(request.method || '').toUpperCase();
    if (method === 'POST' && path === '/auth/login') return true;
    const authorization = request.headers?.authorization;
    if (!authorization) return true;
    const [type, token] =
      typeof authorization === 'string' ? authorization.split(' ') : [];
    if (type !== 'Bearer' || !token)
      throw new UnauthorizedException('Bearer token inválido.');
    let payload;
    try {
      payload = await this.jwt.verifyAsync(token, {
        secret: process.env.JWT_SECRET,
      });
    } catch {
      throw new UnauthorizedException('Token inválido.');
    }
    if (!Array.isArray(payload.roles) || !payload.roles.includes('TERCEIRO'))
      return true;
    request.user = payload;
    const session =
      (method === 'GET' && path === '/auth/me') ||
      (method === 'POST' && path === '/auth/logout');
    const organograma =
      method === 'GET' &&
      (path === '/foto-perfil-whatsapp/get-foto-by-user' ||
        path.startsWith('/foto-perfil-whatsapp/get-foto-by-usuario/'));
    if (session || organograma) return true;
    throw new ForbiddenException(
      'Este perfil possui acesso somente ao Organograma.',
    );
  }
}
