import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Put,
  UseGuards,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { AuthGuard } from 'src/auth/auth.guard';
import { UserService } from './user.service';

@ApiTags('User')
@Controller('user')
export class UserController {
  constructor(private readonly userService: UserService) {}

  @Post('create')
  @ApiOperation({ summary: 'Cria o usuário' })
  async create(@Body() body: any) {
    return this.userService.create(body);
  }

  @Get('find-all')
  @UseGuards(AuthGuard)
  @ApiOperation({ summary: 'Encontra todos os usuários' })
  async findAll() {
    return this.userService.findAll();
  }

  @Post('find-by-filter')
  @UseGuards(AuthGuard)
  @ApiOperation({ summary: 'Encontra o usuário filtrando' })
  async findByFilter(@Body() body: any) {
    return this.userService.findByFilter(body);
  }

  @Put('update/:id')
  @UseGuards(AuthGuard)
  @ApiOperation({ summary: 'Atualiza o usuário' })
  async updateUser(@Param('id') id: string, @Body() body: any) {
    return this.userService.updateUser(id, body);
  }

  @Get(':id')
  @UseGuards(AuthGuard)
  @ApiOperation({ summary: 'Busca apenas 1 usuário' })
  async findOne(@Param('id') id: string) {
    return this.userService.findOne(id);
  }

  @Patch('update-senha')
  @UseGuards(AuthGuard)
  @ApiOperation({ summary: 'Atualiza a senha de apenas 1 usuário' })
  async updateSenhaUser(@Body() body: any) {
    return this.userService.updateSenhaUser(body);
  }
}
