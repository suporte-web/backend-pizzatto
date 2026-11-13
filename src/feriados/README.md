# Notificações de feriados

O `FeriadosNotificacoesService` envia o comunicado padrão três dias úteis antes do feriado, a partir das 8h em `America/Sao_Paulo`. A rotina verifica pendências a cada 15 minutos e consulta o backend AD por `GET /gestores/destinatarios-feriados?feriadoId=...`. Apenas gestores ativos, habilitados para receber e-mails, com endereço válido e filial correspondente recebem o aviso.

## Configuração

1. No **backend-active-directory**, aplicar a migration Prisma de notificações com o fluxo de migrations do projeto (`prisma migrate deploy` no ambiente de publicação). O model-fonte está separado em `prisma/schema/93-feriadoNotificacaoEnvio.model.prisma`. A migration foi gerada pelo Prisma a partir da alteração do schema, sem script SQL avulso.
2. Gerar o Prisma Client dos dois backends. No AD, usar `npm run prisma:generate`. No `backend-pizzatto`, que usa o schema consolidado, usar `npx prisma generate`. O model no schema consolidado desse backend reflete a mesma tabela do banco compartilhado.
3. No `backend-pizzatto`, conferir `AUTH_API_URL` (base do backend AD), `JWT_SECRET` (mesmo segredo de assinatura do backend AD) e as variáveis SMTP existentes. O serviço usa um token de curta duração para consultar os destinatários, sem depender de sessão de usuário.
4. Informar `FERIADOS_EMAIL_GRH` com o endereço completo do GRH. Ele é obrigatório para os comunicados que abrangem Costeira. Essa orientação é omitida para outras filiais.
5. Ativar com `FERIADOS_NOTIFICACOES_ATIVAS=true` e reiniciar o backend. O valor padrão é desativado. Há um exemplo em `.env.feriados.example`.

## Contagem e entregas

- A contagem exclui finais de semana, feriados nacionais ativos e os feriados ativos das filiais envolvidas. Para várias filiais, usa o calendário conjunto, garantindo a antecedência a todas. Depende do cadastro estar completo. Pontos facultativos não bloqueiam a contagem.
- Feriados recorrentes são projetados anualmente, incluindo a virada do ano. 29/02 é ignorado em anos não bissextos. Feriados móveis devem ter a data cadastrada para cada ano.
- Exemplo: Finados em 02/11/2026 gera o envio em 28/10/2026, sem outros feriados no intervalo.
- O backend precisa estar em execução. É possível recuperar o envio durante o mesmo dia caso haja indisponibilidade às 8h. Não há envio retroativo de datas de disparo já passadas.
- Cada gestor recebe uma mensagem individual. O registro por ocorrência/e-mail e ocorrência/gestor é reservado no banco antes do SMTP para evitar duplicidades entre verificações, reinícios e instâncias.
- `ENVIADO` significa que o SMTP aceitou a mensagem. `FALHA` ou `PROCESSANDO` antigo exige conferir a entrega; não há repetição automática de uma entrega incerta. Falhas de consulta ao AD são registradas no log e podem ser recuperadas no próximo intervalo do mesmo dia.
- A implementação e seus testes não disparam e-mails reais durante a compilação. Os testes usam AD, SMTP e persistência simulados.

## Validação

No `backend-pizzatto`: `npm test -- --runInBand feriadosNotificacoes` e `npm run build`.
