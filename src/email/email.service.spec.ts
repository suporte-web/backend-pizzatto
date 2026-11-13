jest.mock('nodemailer', () => ({ createTransport: jest.fn() }));
import * as nodemailer from 'nodemailer';
import { EmailService } from './email.service';

describe('Envio em cópia oculta (SMTP simulado)', () => {
  const ambiente = process.env;
  const mensagem = {
    assunto: 'Comunicado',
    html: '<p>Aviso</p>',
    texto: 'Aviso',
  };
  let service: EmailService;
  let sendMail: jest.Mock;
  let close: jest.Mock;
  beforeEach(() => {
    jest.clearAllMocks();
    process.env = {
      ...ambiente,
      SMTP_HOST: 'smtp.example.com',
      SMTP_FROM: 'intranet@example.com',
      SMTP_PORT: '465',
      SMTP_USER: '',
      SMTP_PASS: '',
    };
    service = new EmailService();
    sendMail = jest.fn().mockResolvedValue({
      accepted: ['a@example.com', 'b@example.com'],
      rejected: [],
    });
    close = jest.fn();
    (nodemailer.createTransport as jest.Mock).mockReturnValue({
      sendMail,
      close,
    });
  });
  afterEach(() => {
    process.env = ambiente;
  });

  it('faz um único envio com todos em CCO, sem endereços em Para ou CC', async () => {
    await service.enviarEmCopiaOculta(
      ['a@example.com', 'b@example.com'],
      mensagem,
    );
    expect(sendMail).toHaveBeenCalledTimes(1);
    const opcoes = sendMail.mock.calls[0][0];
    expect(opcoes.bcc).toEqual(['a@example.com', 'b@example.com']);
    expect(opcoes).not.toHaveProperty('to');
    expect(opcoes).not.toHaveProperty('cc');
    expect(close).toHaveBeenCalledTimes(1);
  });
  it('remove endereços repetidos e normaliza a resposta SMTP', async () => {
    sendMail.mockResolvedValue({
      accepted: [{ address: 'A@EXAMPLE.COM' }],
      rejected: ['B@EXAMPLE.COM'],
    });
    const resultado = await service.enviarEmCopiaOculta(
      [' A@example.com ', 'a@example.com', 'b@example.com'],
      mensagem,
    );
    expect(sendMail.mock.calls[0][0].bcc).toEqual([
      'a@example.com',
      'b@example.com',
    ]);
    expect(resultado).toEqual({
      aceitos: ['a@example.com'],
      rejeitados: ['b@example.com'],
    });
  });
  it.each([
    { emails: [] },
    { emails: ['invalido'] },
    { emails: ['a@example.com\r\nCc: outra@example.com'] },
  ])('recusa grupo vazio ou inválido: %s', async ({ emails }) => {
    await expect(service.enviarEmCopiaOculta(emails, mensagem)).rejects.toThrow(
      'destinatários válidos',
    );
    expect(sendMail).not.toHaveBeenCalled();
  });
  it('fecha a conexão quando o SMTP falha, sem tentar novamente', async () => {
    sendMail.mockRejectedValue(new Error('SMTP indisponível'));
    await expect(
      service.enviarEmCopiaOculta(['a@example.com'], mensagem),
    ).rejects.toThrow('SMTP indisponível');
    expect(sendMail).toHaveBeenCalledTimes(1);
    expect(close).toHaveBeenCalledTimes(1);
  });
});
