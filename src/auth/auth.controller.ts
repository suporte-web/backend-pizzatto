import { Body, Controller, Get, Post, Req, UseGuards } from '@nestjs/common';
import { AuthGuard } from './auth.guard';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { AuthService } from './auth.service';
import { User } from '../decorator/user.decorator';

@ApiTags('Auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

//   @Post('login')
//   login(@Body() body: { username: string; password: string }) {
//     return this.auth.login(body);
//   }

//   @UseGuards(AuthGuard)
//   @Post('logout')
//   logout(@Req() req: any) {
//     return this.auth.logout(req.user.sub);
//   }

  // @Post('refresh')
  // refresh(@Body() body: { userId: string; refreshToken: string }) {
  //   return this.auth.refresh(body.userId, body.refreshToken);
  // }

  @Get('me')
  @ApiOperation({ summary: 'Retorna o usuário logado' })
  @UseGuards(AuthGuard)
  async me(@User() user) {
    return user;
  }
}
