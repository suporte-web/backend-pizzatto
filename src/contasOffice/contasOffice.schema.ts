import mongoose from 'mongoose';

export const ContasOfficeSchema = new mongoose.Schema(
  {
    nome: { type: String, required: false },
    email: { type: String, required: false },
    senha: { type: String, required: false },
    ativo: { type: Boolean, required: false },
  },
  {
    timestamps: true,
  },
);
