import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

const ALGORITHM = 'aes-256-gcm';

function obterChave(): Buffer {
  const chave = process.env.CONTAS_EMAIL_ENCRYPTION_KEY;

  if (!chave || !/^[0-9a-fA-F]{64}$/.test(chave)) {
    throw new Error('CONTAS_EMAIL_ENCRYPTION_KEY inválida.');
  }

  return Buffer.from(chave, 'hex');
}

export function criptografarSenha(senha: string): string {
  const iv = randomBytes(12);

  const cipher = createCipheriv(ALGORITHM, obterChave(), iv);

  const dados = Buffer.concat([cipher.update(senha, 'utf8'), cipher.final()]);

  return [
    'v1',
    iv.toString('hex'),
    cipher.getAuthTag().toString('hex'),
    dados.toString('hex'),
  ].join(':');
}

export function descriptografarSenha(valor: string): string {
  const partes = valor.split(':');

  if (partes.length !== 4 || partes[0] !== 'v1') {
    throw new Error('Formato de senha inválido.');
  }

  const [, iv, authTag, dados] = partes;

  if (
    !/^[0-9a-f]{24}$/i.test(iv) ||
    !/^[0-9a-f]{32}$/i.test(authTag) ||
    !/^(?:[0-9a-f]{2})+$/i.test(dados)
  ) {
    throw new Error('Dados criptografados inválidos.');
  }

  const decipher = createDecipheriv(
    ALGORITHM,
    obterChave(),
    Buffer.from(iv, 'hex'),
  );

  decipher.setAuthTag(Buffer.from(authTag, 'hex'));

  return Buffer.concat([
    decipher.update(Buffer.from(dados, 'hex')),
    decipher.final(),
  ]).toString('utf8');
}
