import { PartialType } from '@nestjs/mapped-types';
import { CreateContaEmailDto } from './CreateContaEmail.dto';

export class UpdateContaEmailDto extends PartialType(CreateContaEmailDto) {
  nome?: string;
  email?: string;
  senha?: string;
  tipoConta?: string;
  plataforma?: string;
  finalidade?: string;
  empresa?: string;
  departamento?: string;
  responsavel?: string;
  urlAcesso?: string;
  observacoes?: string;
  ativo?: boolean;
}
