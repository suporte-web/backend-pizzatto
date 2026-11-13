export interface FeriadoNotificavel {
  id: string;
  nome: string;
  dataFeriado: Date;
  tipoFeriado: string;
  recorrente: boolean;
  filiais: string[];
}

// Compatibilidade com os códigos Prisma usados no backend-pizzatto.
const nomesFiliais: Record<string, string> = {
  CEP_Port_o: 'CEP Portão',
  Cama_ari: 'Camaçari',
  S_o_Gon_alo_dos_Campos: 'São Gonçalo dos Campos',
};
export const filialChave = (filial: string) =>
  (nomesFiliais[filial] || filial)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');

export const emailValido = (email: unknown): email is string =>
  typeof email === 'string' &&
  email.length <= 254 &&
  /^[^\s<>@,;]+@[^\s<>@,;]+\.[^\s<>@,;]+$/.test(email);

export function dataSaoPaulo(agora: Date) {
  const partes = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(agora);
  const valor = (tipo: string) =>
    Number(partes.find((p) => p.type === tipo)!.value);
  return new Date(Date.UTC(valor('year'), valor('month') - 1, valor('day')));
}

export function ocorrencia(
  feriado: FeriadoNotificavel,
  ano: number,
): Date | null {
  const original = feriado.dataFeriado;
  if (!feriado.recorrente)
    return original.getUTCFullYear() === ano ? original : null;
  const data = new Date(
    Date.UTC(ano, original.getUTCMonth(), original.getUTCDate()),
  );
  return data.getUTCMonth() === original.getUTCMonth() ? data : null;
}

export function tresDiasUteisAntes(
  data: Date,
  filiais: string[],
  calendario: FeriadoNotificavel[],
) {
  const dataEnvio = new Date(data);
  const filiaisAlvo = new Set(filiais.map(filialChave));
  let dias = 0;
  while (dias < 3) {
    dataEnvio.setUTCDate(dataEnvio.getUTCDate() - 1);
    if ([0, 6].includes(dataEnvio.getUTCDay())) continue;
    const feriadoNoDia = calendario.some((f) => {
      if (f.tipoFeriado === 'PONTO_FACULTATIVO') return false;
      if (
        f.tipoFeriado !== 'NACIONAL' &&
        !f.filiais.some((filial) => filiaisAlvo.has(filialChave(filial)))
      )
        return false;
      return (
        ocorrencia(f, dataEnvio.getUTCFullYear())?.getTime() ===
        dataEnvio.getTime()
      );
    });
    if (!feriadoNoDia) dias++;
  }
  return dataEnvio;
}

const escapar = (valor: string) =>
  valor.replace(
    /[&<>"']/g,
    (c) =>
      ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;',
      })[c]!,
  );

export function montarMensagem(
  feriado: FeriadoNotificavel,
  data: Date,
  emailGrh?: string,
) {
  const costeira = feriado.filiais.some((f) => filialChave(f) === 'costeira');
  if (costeira && !emailValido(emailGrh))
    throw new Error(
      'Configure FERIADOS_EMAIL_GRH com o endereço completo do GRH.',
    );
  const tipos: Record<string, string> = {
    NACIONAL: 'feriado nacional',
    ESTADUAL: 'feriado estadual',
    MUNICIPAL: 'feriado municipal',
    EMPRESA: 'feriado da empresa',
    PONTO_FACULTATIVO: 'ponto facultativo',
  };
  const dataLonga = data.toLocaleDateString('pt-BR', {
    timeZone: 'UTC',
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  });
  const texto = [
    'Prezados,',
    `Informamos que o dia ${dataLonga} será ${tipos[feriado.tipoFeriado] || 'feriado'}, em homenagem ao ${feriado.nome}.`,
    'Diante disso, ficará a critério de cada gestor definir e alinhar a escala de trabalho de sua equipe.',
    'Ressaltamos que, nessa data, não haverá fornecimento de refeições.',
    ...(costeira
      ? [
          `Solicitamos que as escalas de trabalho presencial da equipe da Filial Costeira sejam encaminhadas para o e-mail ${emailGrh}, para que possamos providenciar o reembolso do crédito correspondente no cartão Alelo.`,
        ]
      : []),
  ].join('\n\n');
  const diaSemana = data.toLocaleDateString('pt-BR', {
    timeZone: 'UTC',
    weekday: 'long',
  });
  const html = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Comunicado de feriado</title>
</head>
<body style="margin:0;padding:0;background-color:#f1f5f9;font-family:Arial,Helvetica,sans-serif;color:#334155;">
  <div style="display:none;max-height:0;overflow:hidden;mso-hide:all;">${escapar(feriado.nome)} em ${escapar(dataLonga)}. Confira as orientações para sua equipe.</div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#f1f5f9;">
    <tr><td align="center" style="padding:28px 12px;">
      <!--[if mso]><table role="presentation" width="640" cellpadding="0" cellspacing="0" border="0"><tr><td><![endif]-->
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:640px;background-color:#ffffff;border:1px solid #e2e8f0;border-radius:16px;overflow:hidden;">
        <tr><td style="padding:28px 28px 24px;background-color:#142a43;border-bottom:4px solid #14b8a6;">
          <p style="margin:0 0 16px;color:#a5f3fc;font-size:11px;line-height:16px;letter-spacing:2px;font-weight:bold;">PIZZATTO &nbsp; / &nbsp; DEPARTAMENTO PESSOAL</p>
          <h1 style="margin:0;color:#ffffff;font-size:26px;line-height:34px;font-weight:bold;">Comunicado de feriado</h1>
          <p style="margin:8px 0 0;color:#cbd5e1;font-size:14px;line-height:22px;">Informações para o planejamento da sua equipe</p>
        </td></tr>
        <tr><td style="padding:28px 28px 0;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#f0fdfa;border:1px solid #99f6e4;border-radius:12px;">
            <tr><td style="padding:22px;">
              <p style="margin:0 0 10px;color:#0f766e;font-size:11px;line-height:16px;font-weight:bold;letter-spacing:1.4px;text-transform:uppercase;">${tipos[feriado.tipoFeriado] || 'feriado'}</p>
              <h2 style="margin:0 0 8px;color:#134e4a;font-size:23px;line-height:30px;overflow-wrap:anywhere;">${escapar(feriado.nome)}</h2>
              <p style="margin:0;color:#115e59;font-size:17px;line-height:26px;"><strong>${escapar(dataLonga)}</strong></p>
              <p style="margin:4px 0 0;color:#0f766e;font-size:13px;line-height:20px;text-transform:capitalize;">${escapar(diaSemana)}</p>
            </td></tr>
          </table>
        </td></tr>
        <tr><td style="padding:26px 28px 0;font-size:14px;line-height:24px;">
          <p style="margin:0 0 14px;color:#142a43;font-weight:bold;">Prezados,</p>
          <p style="margin:0;">Informamos que o dia <strong>${escapar(dataLonga)}</strong> será ${tipos[feriado.tipoFeriado] || 'feriado'}, em homenagem ao <strong>${escapar(feriado.nome)}</strong>.</p>
        </td></tr>
        <tr><td style="padding:24px 28px 0;">
          <p style="margin:0 0 8px;color:#142a43;font-size:15px;line-height:22px;font-weight:bold;">Escalas de trabalho</p>
          <p style="margin:0;color:#475569;font-size:14px;line-height:24px;">Diante disso, ficará a critério de cada gestor definir e alinhar a escala de trabalho de sua equipe.</p>
        </td></tr>
        <tr><td style="padding:24px 28px 0;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#fff7ed;border:1px solid #fed7aa;border-left:4px solid #f59e0b;border-radius:8px;">
            <tr><td style="padding:18px 20px;">
              <p style="margin:0 0 6px;color:#9a3412;font-size:12px;line-height:18px;font-weight:bold;letter-spacing:0.8px;text-transform:uppercase;">Atenção às refeições</p>
              <p style="margin:0;color:#7c2d12;font-size:14px;line-height:23px;">Ressaltamos que, nessa data, <strong>não haverá fornecimento de refeições</strong>.</p>
            </td></tr>
          </table>
        </td></tr>
        ${
          costeira
            ? `<tr><td style="padding:24px 28px 0;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;">
            <tr><td style="padding:20px;">
              <p style="margin:0 0 10px;color:#142a43;font-size:15px;line-height:22px;font-weight:bold;">Filial Costeira · Reembolso Alelo</p>
              <p style="margin:0;color:#475569;font-size:14px;line-height:24px;">Solicitamos que as escalas de trabalho presencial da equipe da Filial Costeira sejam encaminhadas para o e-mail <a href="mailto:${escapar(emailGrh!)}" style="color:#0f766e;text-decoration:underline;overflow-wrap:anywhere;">${escapar(emailGrh!)}</a>, para que possamos providenciar o reembolso do crédito correspondente no cartão Alelo.</p>
            </td></tr>
          </table>
        </td></tr>`
            : ''
        }
        <tr><td style="padding:28px;">
          <p style="margin:0;color:#64748b;font-size:13px;line-height:22px;">Atenciosamente,<br /><strong style="color:#142a43;">Departamento Pessoal</strong></p>
        </td></tr>
        <tr><td style="padding:16px 28px;background-color:#f8fafc;border-top:1px solid #e2e8f0;">
          <p style="margin:0;color:#64748b;font-size:11px;line-height:18px;">Intranet Pizzatto &nbsp; · &nbsp; Comunicação interna</p>
        </td></tr>
      </table>
      <!--[if mso]></td></tr></table><![endif]-->
    </td></tr>
  </table>
</body>
</html>`;
  return {
    assunto: `Comunicado de feriado — ${feriado.nome} — ${data.toLocaleDateString('pt-BR', { timeZone: 'UTC' })}`,
    texto,
    html,
  };
}
