// Só permite repetir quando há evidência de que o SMTP não aceitou a mensagem.
export function podeRepetirEnvio(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const erro = error as {
    code?: string;
    command?: string;
    responseCode?: number;
    syscall?: string;
  };
  if (
    [
      'EAUTH',
      'EDNS',
      'EENVELOPE',
      'ECONNREFUSED',
      'ENOTFOUND',
      'EAI_AGAIN',
    ].includes(erro.code || '')
  )
    return true;
  if (erro.code === 'ESOCKET' && erro.syscall === 'connect') return true;
  return (
    erro.code === 'EMESSAGE' &&
    erro.command === 'DATA' &&
    Number(erro.responseCode) >= 400 &&
    Number(erro.responseCode) <= 599
  );
  // Timeout/conexão encerrada podem ocorrer depois de DATA; não são prova de rejeição.
}
