import {
  Controller,
  Get,
  Post,
  Param,
  UseGuards,
  Query,
  Body,
} from '@nestjs/common';
import { GlpiService } from './glpi.service';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { AuthGuard } from 'src/auth/auth.guard';

@ApiTags('GLPI')
@Controller('glpi')
@UseGuards(AuthGuard)
export class GlpiController {
  constructor(private readonly glpiService: GlpiService) {}

  @Post('login')
  @ApiOperation({ summary: 'Acessa no GLPI' })
  async login() {
    const sessionToken = await this.glpiService.initSession();
    return { session_token: sessionToken };
  }

  @Get('computers')
  @ApiOperation({
    summary: 'Lista computadores (paginado, com IDs resolvidos em nomes)',
  })
  async computers(
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('filter') filter?: string,
  ) {
    return this.glpiService.getAllComputers({
      page: page ? Number(page) : 1,
      limit: limit ? Number(limit) : 10,
      filter: filter ?? '',
    });
  }

  @Post('create-termo-compromisso')
  @ApiOperation({
    summary: 'Criar o Termo de Compromisso com as informações passadas',
  })
  async createTermoCompromisso(@Body() body: any) {
    return await this.glpiService.createPdfTermo(body);
  }

  @Get('computers/:id')
  async computerById(@Param('id') id: string) {
    return this.glpiService.getComputerByIdFull(Number(id));
  }
}
