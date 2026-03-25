import { ApiProperty } from '@nestjs/swagger';
import { IsString } from 'class-validator';

type Area = 'Sistemas' | 'Infra';

export type EscalaSemanal = {
  segunda: string;
  terca: string;
  quarta: string;
  quinta: string;
  sexta: string;
  sabado: string;
  domingo: string;
};

export class PlantaoConfigDTO {
  @ApiProperty({ example: 'id', description: 'ID da Config' })
  @IsString()
  configId: string;

  @ApiProperty({
    example: '08:00 as 18:00',
    description: 'Horario do Plantão Sistemas',
  })
  janelaSistemas: { inicio: string; fim: string };

  @ApiProperty({
    example: '08:00 as 18:00',
    description: 'Horario do Plantão Infra',
  })
  janelaInfra: { inicio: string; fim: string };

  @ApiProperty({
    example: 'terça: Robson Guimarães',
    description: 'Array da Semana Sistemas',
  })
  escalaSistemas: EscalaSemanal;

  @ApiProperty({
    example: 'segunda: João da Silva',
    description: 'Array da Semana Infra',
  })
  escalaInfra: EscalaSemanal;

  @ApiProperty({
    example: '(99) 99999-9999',
    description: 'Telefone para Contato',
  })
  contatos: Array<{ id: string; nome: string; telefone: string; area: Area }>;
}
