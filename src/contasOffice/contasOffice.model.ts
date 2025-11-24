import { Document } from "mongoose";

export interface ContasOffice extends Document {
    nome: string;
    email: string;
    senha: string;
    ativo: boolean;
    createdAt: Date;
    updatedAt: Date;
}