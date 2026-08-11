import { AuthGuard } from '@/auth/auth.guard';
import { Body, Controller, Param, Post, UseGuards } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { AniversariantesKmmService } from './aniversariantesKmm.service';

@ApiTags('Aniversariantes KMM')
@Controller('aniversariantes-kmm')
@UseGuards(AuthGuard)
export class AniversariantesKmmController {
  constructor(
    private readonly aniversariantesKmmService: AniversariantesKmmService,
  ) {}

  @Post('find-all-aniversariantes')
  @ApiOperation({
    summary: 'Encontra todos os aniversariantes pelo KMM',
  })
  async findAllAniversariantes(@Body() body: any) {
    return await this.aniversariantesKmmService.findAllAniversariantes(body);
  }
}
