import { AuthGuard } from '@/auth/auth.guard';
import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { VeiculoProprietarioService } from './veiculoProprietario.service';

@ApiTags('Veiculo Proprietario')
@Controller('veiculo-proprietario')
@UseGuards(AuthGuard)
export class VeiculoProprietarioController {
  constructor(private readonly service: VeiculoProprietarioService) {}

  @Post('create')
  @ApiOperation({
    summary: 'Cria com base nas Placas o Proprietario delas',
  })
  async create(@Body() body: any) {
    return await this.service.create(body);
  }

  @Post('find-by-filter')
  @ApiOperation({
    summary: 'Encontrar o VeiculoProprietario filtrando',
  })
  async findByFilter(@Body() body: any) {
    return await this.service.findByFilter(body);
  }
}
