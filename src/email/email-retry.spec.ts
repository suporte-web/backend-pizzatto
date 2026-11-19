import { podeRepetirEnvio } from './email-retry';

describe('Classificação segura de falhas SMTP', () => {
  it.each([
    { code: 'ECONNREFUSED' },
    { code: 'EAUTH' },
    { code: 'EDNS' },
    { code: 'EENVELOPE', command: 'RCPT TO', responseCode: 550 },
    { code: 'EENVELOPE', command: 'DATA', responseCode: 451 },
    { code: 'EMESSAGE', command: 'DATA', responseCode: 451 },
    { code: 'ESOCKET', syscall: 'connect' },
  ])('permite repetir quando não houve aceite: %j', (erro) => {
    expect(podeRepetirEnvio(erro)).toBe(true);
  });
  it.each([
    { code: 'ETIMEDOUT', command: 'CONN' },
    { code: 'ECONNECTION', command: 'CONN' },
    { code: 'ESOCKET', command: 'DATA' },
    { code: 'EMESSAGE', command: 'DATA' },
    new Error('Falha desconhecida'),
    null,
  ])('não repete erro que pode ocorrer após DATA: %j', (erro) => {
    expect(podeRepetirEnvio(erro)).toBe(false);
  });
});
