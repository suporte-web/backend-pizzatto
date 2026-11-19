# Notificações de feriados

O `FeriadosNotificacoesService` funciona automaticamente pelo Cron, sem variável de ativação no ambiente. A cada 15 minutos, a partir das 8h em `America/Sao_Paulo`, verifica os feriados ativos cuja ocorrência esteja entre três e um dia útil à frente.

## Janela de envio

- Tenta nos três dias úteis anteriores ao feriado: terceira, segunda e última oportunidade. Pode recuperar uma execução perdida no dia inicial.
- Não tenta em sábados, domingos, feriados aplicáveis, no próprio feriado ou depois dele.
- Exclui feriados nacionais ativos e os feriados ativos das filiais envolvidas. Para várias filiais, usa o calendário conjunto. Pontos facultativos não bloqueiam a contagem.
- Recorrências e virada de ano são consideradas. 29/02 é ignorado em anos não bissextos; feriados móveis precisam da data de cada ano.
- Exemplo: para 20/11/2026, sem outro feriado no intervalo, tenta em 17, 18 e 19/11. Com o feriado de teste ativo em 18/11, tenta em 16, 17 e 19/11.
- O backend precisa estar em execução. Uma nova tentativa ocorre no próximo intervalo de 15 minutos enquanto estiver dentro da janela, a partir das 8h.

## Destinatários e CCO

Consulta o backend AD por `GET /gestores/destinatarios-feriados?feriadoId=...` usando `AUTH_API_URL` e um JWT de curta duração. O `JWT_SECRET` do backend-pizzatto deve corresponder à chave de verificação dos tokens no AD.

Somente gestores ativos, com recebimento habilitado, e-mail válido e filial correspondente recebem. Cada grupo pendente é enviado em uma única mensagem com os gestores em CCO, preservando seus endereços. O histórico continua individual na tabela `FeriadoNotificacaoEnvio`.

Reservas e novas tentativas usam uma transação e uma trava por ocorrência. Registros já aceitos pelo SMTP nunca são incluídos novamente. Os limites de destinatários do servidor precisam comportar o grupo; não há divisão automática em várias mensagens.

## Resultados e novas tentativas

- `ENVIADO`: aceito pelo servidor SMTP; não significa leitura ou entrega na caixa de entrada. Nunca repete.
- `RETENTAR`: falha conhecida antes do aceite ou rejeição explícita do SMTP. Reutiliza o registro e tenta novamente dentro da janela, respeitando os filtros atuais do gestor.
- `INCERTO`: sem confirmação de aceite ou rejeição, como timeout após o envio do conteúdo. Exige conferência manual; não repete automaticamente.
- `PROCESSANDO`: reserva ativa ou interrompida. Não repete automaticamente, pois pode ter ocorrido envio antes de uma queda.
- `FALHA` legado: registros antigos não distinguem rejeição de entrega incerta. Permanecem bloqueados até conferência; não são convertidos automaticamente para `RETENTAR`.

Se parte do grupo for aceita e parte rejeitada, somente os rejeitados são tentados novamente. Falhas de consulta ao AD ou de configuração antes da reserva não criam registros e são recuperadas no próximo intervalo útil.

Uma tentativa comprovadamente não entregue pode usar o e-mail atual corrigido no AD, atualizando o registro existente. Correspondências ambíguas entre múltiplos registros são mantidas para conferência, sem envio automático.

## Configuração existente

O Cron é registrado pelo `FeriadosModule` e pelo `ScheduleModule` do aplicativo. Não é necessário criar chave de ativação no `.env`.

Permanecem necessárias as configurações normais de conexão ao banco, `AUTH_API_URL`, `JWT_SECRET` e `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS` e `SMTP_FROM`. Para comunicados que abrangem Costeira, `FERIADOS_EMAIL_GRH` informa o endereço completo do GRH usado no corpo da mensagem. Os dados de conexão e o endereço do GRH não são controles de ativação.

## Validação

Execute `npm test -- --runInBand feriadosNotificacoes email-retry email.service` e `npm run build` no backend-pizzatto. Os testes simulam AD, SMTP e persistência, sem disparos reais.
