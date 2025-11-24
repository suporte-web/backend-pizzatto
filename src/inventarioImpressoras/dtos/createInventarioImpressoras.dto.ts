import { ApiProperty } from '@nestjs/swagger';
import { IsString } from 'class-validator';

export class CreateInventarioImpressorasDto {
  @ApiProperty({
    example: 'Araraquara',
    description: 'Filial que fica a Impressora',
    required: false,
  })
  @IsString()
  Filial?: String;

  @ApiProperty({
    example: 'Dell',
    description: 'Marca da Impressora',
    required: false,
  })
  @IsString()
  Marca?: String;

  @ApiProperty({
    example: 'ABC-1212AS',
    description: 'Modelo da Impressora',
    required: false,
  })
  @IsString()
  Modelo?: String;

  @ApiProperty({
    example: 'U12U3213BUB',
    description: 'Número de Série da Impressora',
    required: false,
  })
  @IsString()
  'N° Série'?: String;

  @ApiProperty({
    example: '111.112.11.1',
    description: 'IP da Impressora',
    required: false,
  })
  @IsString()
  IP?: String;

  @ApiProperty({
    example: '10-10-1a-a1-aa-1a',
    description: 'MAC LAN da Impressora',
    required: false,
  })
  @IsString()
  'MAC LAN'?: String;

  @ApiProperty({
    example: '10-10-1a-a1-aa-1a',
    description: 'MAC WLAN da Impressora',
    required: false,
  })
  @IsString()
  'MAC WLAN'?: String;

  @ApiProperty({
    example: 'Barracão',
    description: 'Local da Impressora',
    required: false,
  })
  @IsString()
  Local?: String;

  @ApiProperty({
    example: '321',
    description: 'Senha da Impressora',
    required: false,
  })
  @IsString()
  'Senha Admin'?: String;

  @ApiProperty({
    example: 'Zebra',
    description: 'Etiqueta da Impressora',
    required: false,
  })
  @IsString()
  Etiqueta?: String;
}
