import { ApiProperty } from '@nestjs/swagger';
import { IsString } from 'class-validator';

export class CreateContaOfficeDto {
  @ApiProperty({
    example: 'CURITIBA',
    description: 'Nome da Localização para colocar a conta do Office',
    required: false,
  })
  @IsString()
  Nome?: String;

  @ApiProperty({
    example: 'teste@teste.com.br',
    description: 'E-mail da conta do Office',
    required: false,
  })
  @IsString()
  Email?: String;

  @ApiProperty({
    example: 'senha',
    description: 'E-mail da conta do Office',
    required: false,
  })
  @IsString()
  Senha?: String;
}
