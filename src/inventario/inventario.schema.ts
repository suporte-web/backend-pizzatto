import mongoose from 'mongoose';

export const InventarioSchema = new mongoose.Schema(
  {
    equipamento: String,
    patrimonio: String,
    tag: String,
    nomeComputador: String,
    nomeColaborador: String,
    localizacao: String,
    setor: String,
    dataEntrega: String,
    status: String,
    descricao: String,
  },
  {
    timestamps: true,
  },
);
