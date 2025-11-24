import { Document } from "mongoose";

export interface InventarioImpressoras extends Document {
    filial: string;
    marca: string;
    modelo: string;
    numeroSerie: string;
    ip: string;
    macLan: string;
    macWlan: string;
    localizacao: string;
    senhaAdministrador: string;
    etiqueta: string;
    createdAt: Date;
    updatedAt: Date;
} 