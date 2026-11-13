import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import * as nodemailer from 'nodemailer';

export interface ResultadoEnvioEmail {
  aceitos: string[];
  rejeitados: string[];
}

@Injectable()
export class EmailService {
  validarConfiguracao() {
    if (!process.env.SMTP_HOST || !process.env.SMTP_FROM) {
      throw new ServiceUnavailableException(
        'Configure SMTP_HOST e SMTP_FROM para enviar e-mails.',
      );
    }
    const port = Number(process.env.SMTP_PORT || 465);
    if (!Number.isInteger(port) || port < 1 || port > 65535) {
      throw new ServiceUnavailableException('SMTP_PORT inválida.');
    }
    if (process.env.SMTP_USER && !process.env.SMTP_PASS) {
      throw new ServiceUnavailableException(
        'Configure SMTP_PASS para autenticar no SMTP.',
      );
    }
  }

  async enviar(
    destinatario: string,
    mensagem: { assunto: string; html: string; texto: string },
  ) {
    const resultado = await this.enviarMensagem({ to: destinatario }, mensagem);
    if (!resultado.aceitos.includes(destinatario.trim().toLowerCase())) {
      throw new ServiceUnavailableException(
        'O servidor SMTP não aceitou o destinatário.',
      );
    }
  }

  async enviarEmCopiaOculta(
    destinatarios: string[],
    mensagem: { assunto: string; html: string; texto: string },
  ): Promise<ResultadoEnvioEmail> {
    const emails = [
      ...new Set(destinatarios.map((email) => email.trim().toLowerCase())),
    ];
    if (
      !emails.length ||
      emails.some(
        (email) => !/^[^\s<>@,;]+@[^\s<>@,;]+\.[^\s<>@,;]+$/.test(email),
      )
    ) {
      throw new ServiceUnavailableException(
        'Informe destinatários válidos para o envio em cópia oculta.',
      );
    }
    return this.enviarMensagem({ bcc: emails }, mensagem);
  }

  private async enviarMensagem(
    destinatarios: { to?: string; bcc?: string[] },
    mensagem: { assunto: string; html: string; texto: string },
  ): Promise<ResultadoEnvioEmail> {
    this.validarConfiguracao();
    const port = Number(process.env.SMTP_PORT || 465);
    const transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port,
      secure: process.env.SMTP_SECURE
        ? process.env.SMTP_SECURE === 'true'
        : port === 465,
      requireTLS: port !== 465,
      auth: process.env.SMTP_USER
        ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
        : undefined,
      connectionTimeout: 15000,
      greetingTimeout: 15000,
      socketTimeout: 30000,
    });
    try {
      const resultado = await transporter.sendMail({
        from: process.env.SMTP_FROM,
        ...destinatarios,
        subject: mensagem.assunto,
        html: mensagem.html,
        text: mensagem.texto,
      });
      const enderecos = (lista: Array<string | { address: string }> = []) =>
        lista
          .map((item) => (typeof item === 'string' ? item : item.address))
          .map((email) => email.trim().toLowerCase());
      return {
        aceitos: enderecos(resultado.accepted),
        rejeitados: enderecos(resultado.rejected),
      };
    } finally {
      transporter.close();
    }
  }
}
