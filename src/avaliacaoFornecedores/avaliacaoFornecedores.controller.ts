import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { User } from '@/decorator/user.decorator';
import { AvaliacaoFornecedoresService } from './avaliacaoFornecedores.service';
import { AuthGuard } from '@/auth/auth.guard';

@ApiTags('Avaliação de Fornecedores')
@Controller('avaliacao-fornecedores')
@UseGuards(AuthGuard)
export class AvaliacaoFornecedoresController {
  constructor(
    private readonly avaliacaoFornecedoresService: AvaliacaoFornecedoresService,
  ) {}

  @Post('create')
  @ApiOperation({
    summary: 'Cadastrar avaliação anual de fornecedor',
  })
  async create(@Body() body: any, @User() user: any) {
    return this.avaliacaoFornecedoresService.create(body, user);
  }

  @Post('find-by-filter')
  @ApiOperation({
    summary: 'Consultar avaliações com filtros e paginação',
  })
  async findByFilter(@Body() body: any) {
    return this.avaliacaoFornecedoresService.findByFilter(body);
  }

  @Get('find-by-cnpj-ano')
  @ApiOperation({
    summary: 'Verificar avaliação de um fornecedor em determinado ano',
  })
  async findByCnpjAno(
    @Query('cnpj') cnpj: string,
    @Query('anoReferencia') anoReferencia: string,
  ) {
    return this.avaliacaoFornecedoresService.findByCnpjAno(
      cnpj,
      Number(anoReferencia),
    );
  }

  @Get(':id')
  @ApiOperation({
    summary: 'Consultar avaliação pelo ID',
  })
  async findById(@Param('id') id: string) {
    return this.avaliacaoFornecedoresService.findById(id);
  }

  @Patch('update/:id')
  @ApiOperation({
    summary: 'Atualizar avaliação de fornecedor',
  })
  async update(@Param('id') id: string, @Body() body: any, @User() user: any) {
    return this.avaliacaoFornecedoresService.update(id, body, user);
  }

  @Patch('delete/:id')
  @ApiOperation({
    summary: 'Inativar avaliação de fornecedor',
  })
  async delete(@Param('id') id: string, @User() user: any) {
    return this.avaliacaoFornecedoresService.delete(id, user);
  }
}
