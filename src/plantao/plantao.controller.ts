import { Body, Controller, Get, Put, UseGuards } from '@nestjs/common';
import { PlantaoService } from './plantao.service';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { PlantaoConfigDTO } from './dtos/plantao.dto';
import { AuthGuard } from 'src/auth/auth.guard';
import { ClientIp } from 'src/decorator/client-ip.decorator';
import { User } from 'src/decorator/user.decorator';

@ApiTags('Plantao')
@Controller('plantao')
export class PlantaoController {
  constructor(private readonly service: PlantaoService) {}

  @UseGuards(AuthGuard)
  @Get('config')
  @ApiOperation({ summary: 'Encontra as informações do Plantão' })
  async getConfig() {
    return await this.service.getConfig();
  }

  // @Get('ping')
  // @ApiOperation({ summary: 'Atualiza as informações do Plantão' })
  // ping() {
  //   return {
  //     ok: true,
  //     env: process.env.DATABASE_URL,
  //   };
  // }

  @UseGuards(AuthGuard)
  @Put('update-horarios')
  @ApiOperation({ summary: 'Atualiza as informações do Horario' })
  async updateHorario(
    @Body() body: any,
    @ClientIp() ip: string,
    @User() user: any,
  ) {
    return await this.service.updateHorarios(body, ip, user);
  }

  @UseGuards(AuthGuard)
  @Put('update-membros-equipe')
  @ApiOperation({ summary: 'Atualiza as informações dos Membros da Equipe' })
  async updateMembrosEquipe(
    @Body() body: any,
    @ClientIp() ip: string,
    @User() user: any,
  ) {
    return await this.service.updateMembrosEquipe(body, ip, user);
  }

  @UseGuards(AuthGuard)
  @Put('update-escalas')
  @ApiOperation({ summary: 'Atualiza as informações das Escalas' })
  async updateEscalas(
    @Body() body: any,
    @ClientIp() ip: string,
    @User() user: any,
  ) {
    return await this.service.updateEscalas(body, ip, user);
  }

  @UseGuards(AuthGuard)
  @Get('find-all-plantonistas')
  @ApiOperation({ summary: 'Encontra todos os Plantonistas' })
  async getAllPlantonistas() {
    return await this.service.getAllPlantonistas();
  }

  @UseGuards(AuthGuard)
  @Get('find-all-escalas-and-horarios')
  @ApiOperation({ summary: 'Encontra todas as Escalas e Horarios' })
  async getAllEscalasAndHorarios() {
    return await this.service.getAllEscalasAndHorarios();
  }

  @Get('find-plantonista-dia-semana')
  @ApiOperation({ summary: 'Encontra os plantonistas do dia Atual' })
  async getPlantonistaDiaSemana() {
    return await this.service.getPlantonistaDiaSemana();
  }
}
