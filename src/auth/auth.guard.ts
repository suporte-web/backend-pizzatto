import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { AuthService } from './auth.service';

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(private readonly authService: AuthService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();

    const authHeader: string | undefined = request.headers.authorization;
    if (!authHeader) throw new UnauthorizedException('Sem Authorization header');

    const [type, token] = authHeader.split(' ');
    if (type !== 'Bearer' || !token) throw new UnauthorizedException('Bearer token ausente');

    const payload = await this.authService.verifyAccessToken(token);

    // deixa disponível pro @User()
    request.user = payload;

    return true;
  }
}