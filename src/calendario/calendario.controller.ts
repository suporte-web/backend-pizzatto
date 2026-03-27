import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { AuthGuard } from 'src/auth/auth.guard';
import { CalendarioService } from './calendario.service';
import { ClientIp } from 'src/decorator/client-ip.decorator';
import { User } from 'src/decorator/user.decorator';

@ApiTags('Calendario')
@Controller('calendario')
@UseGuards(AuthGuard)
export class CalendarioController {
  constructor(private readonly calendarioService: CalendarioService) {}

  @Post('create')
  @ApiOperation({ summary: 'Cria o Evento no Calendario' })
  async create(@Body() body: any, @ClientIp() ip: string, @User() user: any) {
    return await this.calendarioService.create(body, ip, user);
  }

  @Post('find-by-filter')
  @ApiOperation({ summary: 'Busca todos os Eventos no Calendario filtrando' })
  async findByFilter(@Body() body: any) {
    return await this.calendarioService.findByFilter(body);
  }


}
