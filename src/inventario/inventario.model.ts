import { Document } from "mongoose";

export interface Inventario extends Document {
  equipamento: string;
  patrimonio: string;
  tag: string;
  nomeComputador: string;
  nomeColaborador: string;
  localizacao: string;
  setor: string;
  dataEntrega: string;
  status: string;
  descricao: string;
  maquina: string;
  createdAt: Date;
  updatedAt: Date;
}
