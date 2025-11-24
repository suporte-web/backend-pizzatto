import { Document } from 'mongoose';

export interface ToDo extends Document {
  nome: string;
  descricao: string;
  prazoLimite: string;
  responsavel: string;
  finalizado: Boolean;
  dataFinalizado: string;
  createdAt: Date;
  updatedAt: Date;
}
