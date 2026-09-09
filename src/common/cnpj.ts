import { BadRequestException } from '@nestjs/common';

export function assertValidCnpj(rawCnpj: unknown): string {
  if (rawCnpj === null || rawCnpj === undefined || rawCnpj === '') {
    throw new BadRequestException('CNPJ é obrigatório.');
  }

  const cnpj = String(rawCnpj).replace(/\D/g, '');

  if (cnpj.length !== 14) {
    throw new BadRequestException('CNPJ deve conter 14 dígitos.');
  }

  if (/^(\d)\1{13}$/.test(cnpj)) {
    throw new BadRequestException('CNPJ inválido.');
  }

  const weights1 = [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
  const weights2 = [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];

  const calcDigit = (base: string, weights: number[]) => {
    let sum = 0;
    for (let i = 0; i < weights.length; i++) {
      sum += parseInt(base[i], 10) * weights[i];
    }
    const mod = sum % 11;
    return mod < 2 ? 0 : 11 - mod;
  };

  const base12 = cnpj.slice(0, 12);
  const d1 = calcDigit(base12, weights1);
  const d2 = calcDigit(base12 + d1, weights2);
  const expected = base12 + d1 + d2;

  console.log('Recebido :', cnpj);
  console.log('Esperado :', expected);
  console.log('DV recebido:', cnpj.slice(12));
  console.log('DV esperado:', expected.slice(12));

  if (cnpj !== base12 + d1 + d2) {
    throw new BadRequestException('CNPJ inválido (dígitos verificadores).');
  }

  return cnpj;
}
