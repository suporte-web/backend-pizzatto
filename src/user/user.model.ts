import { Document } from "mongoose";

export interface UserAcessos {
    administrador: boolean;
    financeiro: boolean;
    rh: boolean;
    comercial: boolean;
    contratos: boolean;
    retropatio: boolean;
}

export interface User extends Document {
    email: string;
    senha: string;
    nome: string;
    acessos: UserAcessos;
    primeiroAcesso: boolean;
    ativo: boolean;
    politicaAceita: boolean;
    dataAtualizacaoPassword: boolean;
    createdAt: Date;
    updatedAt: Date;
}