import { ApiProperty } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';

export class CreateInventarioImpressorasDto {
  @ApiProperty({
    example: 'Araraquara',
    description: 'Filial que fica a Impressora',
  })
  @IsString()
  Filial: string;

  @ApiProperty({
    example: 'Dell',
    description: 'Marca da Impressora',
  })
  @IsString()
  Marca: string;

  @ApiProperty({
    example: 'ABC-1212AS',
    description: 'Modelo da Impressora',
  })
  @IsString()
  Modelo: string;

  @ApiProperty({
    example: 'U12U3213BUB',
    description: 'Número de Série da Impressora',
    required: false,
  })
  @IsOptional()
  @IsString()
  'N° Série'?: string;

  @ApiProperty({
    example: '111.112.11.1',
    description: 'IP da Impressora',
    required: false,
  })
  @IsString()
  IP: string;

  @ApiProperty({
    example: '10-10-1a-a1-aa-1a',
    description: 'MAC LAN da Impressora',
    required: false,
  })
  @IsString()
  'MAC LAN': string;

  @ApiProperty({
    example: '10-10-1a-a1-aa-1a',
    description: 'MAC WLAN da Impressora',
    required: false,
  })
  @IsOptional()
  @IsString()
  'MAC WLAN'?: string;

  @ApiProperty({
    example: 'Barracão',
    description: 'Local da Impressora',
    required: false,
  })
  @IsOptional()
  @IsString()
  Local?: string;

  @ApiProperty({
    example: '321',
    description: 'Senha da Impressora',
    required: false,
  })
  @IsOptional()
  @IsString()
  'Senha Admin'?: string;

  @ApiProperty({
    example: 'Zebra',
    description: 'Etiqueta da Impressora',
    required: false,
  })
  @IsOptional()
  @IsString()
  Etiqueta?: string;
}