import mongoose from "mongoose";

// Define the schema
export const UserSchema = new mongoose.Schema({
    email: String,
    senha: String,
    nome: String,
    acessos: Object,
    primeiroAcesso: {
        type: Boolean,
        default: true
    },
    ativo: {
        type: Boolean,
        default: true
    },
    politicaAceita: {
        type: Boolean,
        default: false
    },
    dataAtualizacaoPassword: {
        type: String,
        default: false
    },
}, {
    timestamps: true
});