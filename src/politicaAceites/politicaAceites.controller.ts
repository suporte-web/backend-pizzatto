import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { AuthGuard } from 'src/auth/auth.guard';
import { PoliticasAceitesService } from './politicaAceites.service';
import { ClientIp } from 'src/decorator/client-ip.decorator';
import { User } from 'src/decorator/user.decorator';

@ApiTags('Politicas-Aceites')
@Controller('politicas-aceites')
@UseGuards(AuthGuard)
export class PoliticasAceitesController {
  constructor(
    private readonly politicasAceitesService: PoliticasAceitesService,
  ) {}

  @Post('create')
  @ApiOperation({ summary: 'Cria os aceites das Politicas' })
  async create(@Body() body: any, @ClientIp() ip: string, @User() user: any) {
    return await this.politicasAceitesService.create(body, ip, user);
  }

  @Get('find-aceites-by-id-politicas/:id')
  @ApiOperation({
    summary: 'Encontra os aceites das Politicas pelo id da Politica',
  })
  async findAceitesByIdPoliticas(@Param('id') id: string) {
    return await this.politicasAceitesService.findAceitesByIdPoliticas(id);
  }
}
