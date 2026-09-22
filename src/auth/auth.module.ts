import { forwardRef, Module } from '@nestjs/common';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { JwtModule } from '@nestjs/jwt';
import { AuthGuard } from './auth.guard';
import { FotoPerfilWhatsappModule } from '@/fotoPerfilWhatsapp/fotoPerfilWhatsapp.module';

@Module({
  imports: [
    JwtModule.register({}), // vamos passar secret no signAsync (como no service)
    forwardRef(() => FotoPerfilWhatsappModule),
  ],
  controllers: [AuthController],
  providers: [AuthService, AuthGuard],
  exports: [AuthService, AuthGuard],
})
export class AuthModule {}
