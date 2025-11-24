import mongoose from 'mongoose';

export const InventarioImpressoraSchema = new mongoose.Schema(
  {
    filial: String,
    marca: String,
    modelo: String,
    numeroSerie: String,
    ip: String,
    macLan: String,
    macWlan: String,
    localizacao: String,
    senhaAdministrador: String,
    etiqueta: String,
  },
  {
    timestamps: true,
  },
);
