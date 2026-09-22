import { FotoPerfilWhatsappService } from '@/fotoPerfilWhatsapp/fotoPerfilWhatsapp.service';
import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';

@Injectable()
export class AuthService {
  constructor(
    private readonly jwt: JwtService,
    private readonly fotoPerfilWhatsappService: FotoPerfilWhatsappService,
  ) {}

  private readonly accessSecret = process.env.JWT_SECRET as string;

  async verifyAccessToken(token: string) {
    try {
      const payload = await this.jwt.verifyAsync(token, {
        secret: this.accessSecret,
      });

      const nomeUsuario =
        payload.name || payload.nome || payload.displayName || payload.usuario;

      const fotoPerfil = nomeUsuario
        ? await this.fotoPerfilWhatsappService.getFotoByUsuario(nomeUsuario)
        : null;

      return {
        ...payload,

        photo: fotoPerfil?.caminhoImagem || null,
      };
    } catch {
      throw new UnauthorizedException('Token inválido');
    }
  }
}
