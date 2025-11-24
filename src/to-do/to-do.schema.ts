import mongoose from 'mongoose';

export const ToDoSchema = new mongoose.Schema(
  {
    nome: { type: String, required: false },
    descricao: { type: String, required: false },
    prazoLimite: { type: String, required: false },
    responsavel: { type: String, required: false },
    finalizado: { type: Boolean, required: false },
    dataFinalizado: { type: String, required: false },
  },
  { timestamps: true },
);
