import { ApiProperty } from '@nestjs/swagger';
import { IsString } from 'class-validator';

export class CreateInventarioDto {
  @ApiProperty({
    example: 'NOTEBOOK',
    description: 'Tipo de Equipamento',
    required: false,
  })
  @IsString()
  EQUIPAMENTO?: String;
  
  @ApiProperty({
    example: '00001',
    description: 'Númeração do Patrimônio',
    required: false,
  })
  @IsString()
  'PATRIMÔNIO'?: String;
  
  @ApiProperty({
    example: 'ABCDE1',
    description: 'Etiqueta do Produto',
    required: false,
  })
  @IsString()
  TAG?: String;
  
  @ApiProperty({
    example: 'DPL-001',
    description: 'Nome de Registro no Windows do computador',
    required: false,
  })
  @IsString()
  'NOME DO COMPUTADOR'?: String;
  
  @ApiProperty({
    example: 'Joao da Silva',
    description: 'Nome do Colaborador',
    required: false,
  })
  @IsString()
  'NOME FUNCIONÁRIO'?: String;
  
  @ApiProperty({
    example: 'Matriz',
    description: 'Localização',
    required: false,
  })
  @IsString()
  LOCAL?: String;
}
