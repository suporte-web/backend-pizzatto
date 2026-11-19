jest.mock('../prisma/prisma.service', () => ({ PrismaService: class {} }));
jest.mock('../email/email.service', () => ({ EmailService: class {} }));
import { Logger } from '@nestjs/common';
import { FeriadosNotificacoesService } from './feriadosNotificacoes.service';

describe('Disparo automático de feriados (sem e-mails reais)', () => {
  const ambiente = process.env;
  const feriadoId = '4ae12ef3-8cff-4d10-8879-55db44917b60';
  const gestorId = '4ae12ef3-8cff-4d10-8879-55db44917b61';
  const gestor = {
    id: gestorId,
    nome: 'Gestor',
    email: 'gestor@example.com',
    filial: 'Costeira',
  };
  const agora = new Date('2026-10-28T11:00:00Z');
  let prisma: any;
  let email: any;
  let service: FeriadosNotificacoesService;
  let registros: any[];

  beforeEach(() => {
    jest.clearAllMocks();
    process.env = {
      ...ambiente,
      FERIADOS_EMAIL_GRH: 'grh@example.com',
    };
    const chaves = new Set();
    const identidades = new Set();
    registros = [];
    prisma = {
      gestores: { findMany: jest.fn().mockResolvedValue([gestor]) },
      feriado: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: feriadoId,
            nome: 'Dia de Finados',
            dataFeriado: new Date('2026-11-02T00:00:00Z'),
            tipoFeriado: 'NACIONAL',
            recorrente: true,
            filiais: ['Costeira'],
          },
        ]),
      },
      feriadoNotificacaoEnvio: {
        create: jest.fn(async ({ data }) => {
          const identidade = `${data.feriadoId}:${data.dataFeriado.toISOString()}:${data.gestorId}`;
          if (chaves.has(data.chave) || identidades.has(identidade))
            throw { code: 'P2002' };
          chaves.add(data.chave);
          identidades.add(identidade);
          const registro = {
            status: 'PROCESSANDO',
            enviadoEm: null,
            ...data,
            id: `envio-${registros.length + 1}`,
          };
          registros.push(registro);
          return registro;
        }),
        findMany: jest.fn(async ({ where }) =>
          registros
            .filter(
              (r) =>
                r.feriadoId === where.feriadoId &&
                r.dataFeriado.getTime() === where.dataFeriado.getTime(),
            )
            .map((r) => ({ ...r })),
        ),
        update: jest.fn(async ({ where, data }) => {
          const registro = registros.find((r) => r.id === where.id);
          if (!registro) throw new Error('Registro não encontrado');
          Object.assign(registro, data);
          return { ...registro };
        }),
        updateMany: jest.fn(async ({ where, data }) => {
          const selecionados = registros.filter((r) =>
            where.id.in.includes(r.id),
          );
          selecionados.forEach((r) => Object.assign(r, data));
          return { count: selecionados.length };
        }),
      },
    };
    prisma.$queryRaw = jest.fn().mockResolvedValue([{ adquirido: true }]);
    let fila = Promise.resolve();
    prisma.$transaction = jest.fn((work) => {
      const resultado = fila.then(() => work(prisma));
      fila = resultado.catch(() => undefined);
      return resultado;
    });
    email = {
      validarConfiguracao: jest.fn(),
      enviarEmCopiaOculta: jest.fn(async (emails: string[]) => ({
        aceitos: emails,
        rejeitados: [],
      })),
    };
    service = new FeriadosNotificacoesService(prisma, email);
    jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
  });
  afterEach(() => {
    process.env = ambiente;
    jest.restoreAllMocks();
  });

  it('consulta os destinatários pelo Prisma sem URL ou token do AD e envia em CCO', async () => {
    delete process.env.AUTH_API_URL;
    delete process.env.JWT_SECRET;
    await service.verificarFeriadosParaNotificar(agora);
    expect(prisma.gestores.findMany).toHaveBeenCalledWith({
      where: {
        ativo: true,
        recebeEmail: 'SIM',
        email: { not: null },
        filial: { not: null },
      },
      select: { id: true, nome: true, email: true, filial: true },
      orderBy: { nome: 'asc' },
    });
    expect(email.enviarEmCopiaOculta).toHaveBeenCalledWith(
      [gestor.email],
      expect.objectContaining({
        assunto: expect.stringContaining('02/11/2026'),
      }),
    );
    expect(prisma.feriadoNotificacaoEnvio.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: 'ENVIADO' }),
      }),
    );
  });
  it('não envia antes das 8h, fora da janela, em finais de semana ou no feriado', async () => {
    await service.verificarFeriadosParaNotificar(
      new Date('2026-10-28T10:59:00Z'),
    );
    for (const dia of [
      '2026-10-27',
      '2026-10-31',
      '2026-11-01',
      '2026-11-02',
      '2026-11-03',
    ]) {
      await service.verificarFeriadosParaNotificar(
        new Date(`${dia}T11:00:00Z`),
      );
    }
    expect(email.enviarEmCopiaOculta).not.toHaveBeenCalled();
  });
  it('protege verificações repetidas e simultâneas contra duplicidade', async () => {
    await Promise.all([
      service.verificarFeriadosParaNotificar(agora),
      service.verificarFeriadosParaNotificar(agora),
    ]);
    await service.verificarFeriadosParaNotificar(agora);
    expect(email.enviarEmCopiaOculta).toHaveBeenCalledTimes(1);
  });
  it('não presume destinatários se o banco falhar ou não retornar gestores', async () => {
    prisma.gestores.findMany
      .mockRejectedValueOnce(new Error('AD indisponível'))
      .mockResolvedValueOnce([]);
    await service.verificarFeriadosParaNotificar(agora);
    await service.verificarFeriadosParaNotificar(agora);
    expect(email.enviarEmCopiaOculta).not.toHaveBeenCalled();
    expect(prisma.feriadoNotificacaoEnvio.create).not.toHaveBeenCalled();
  });
  it('revalida as filiais, ignora endereços inválidos e deduplica a resposta', async () => {
    prisma.gestores.findMany.mockResolvedValue([
      gestor,
      { ...gestor, email: 'GESTOR@example.com' },
      { ...gestor, email: 'fora@example.com', filial: 'Matriz' },
      { ...gestor, email: 'invalido' },
      { ...gestor, email: null },
      { ...gestor, filial: null },
      { ...gestor, filial: '   ' },
    ]);
    await service.verificarFeriadosParaNotificar(agora);
    expect(email.enviarEmCopiaOculta).toHaveBeenCalledTimes(1);
    expect(email.enviarEmCopiaOculta.mock.calls[0][0]).toEqual([gestor.email]);
  });
  it.each(['P2021', 'P2022', 'P1001', 'P1002', 'P2024'])(
    'registra o diagnóstico %s sem expor o erro bruto e não reserva envios',
    async (code) => {
      prisma.gestores.findMany.mockRejectedValue({
        code,
        message: 'conexao-confidencial',
      });
      await service.verificarFeriadosParaNotificar(agora);
      const logs = (Logger.prototype.error as jest.Mock).mock.calls
        .flat()
        .join(' ');
      expect(logs).toContain(code);
      expect(logs).not.toContain('conexao-confidencial');
      expect(email.enviarEmCopiaOculta).not.toHaveBeenCalled();
      expect(prisma.feriadoNotificacaoEnvio.create).not.toHaveBeenCalled();
    },
  );
  it('registra falha SMTP e não repete uma entrega incerta', async () => {
    email.enviarEmCopiaOculta.mockRejectedValue(new Error('Timeout SMTP'));
    await service.verificarFeriadosParaNotificar(agora);
    await service.verificarFeriadosParaNotificar(agora);
    expect(email.enviarEmCopiaOculta).toHaveBeenCalledTimes(1);
    expect(prisma.feriadoNotificacaoEnvio.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: 'INCERTO' }),
      }),
    );
  });
  it('não envia nem registra reserva se faltar configuração do GRH ou falhar a persistência', async () => {
    delete process.env.FERIADOS_EMAIL_GRH;
    await service.verificarFeriadosParaNotificar(agora);
    expect(prisma.feriadoNotificacaoEnvio.create).not.toHaveBeenCalled();
    process.env.FERIADOS_EMAIL_GRH = 'grh@example.com';
    prisma.feriadoNotificacaoEnvio.create.mockRejectedValue(
      new Error('Banco indisponível'),
    );
    await service.verificarFeriadosParaNotificar(agora);
    expect(email.enviarEmCopiaOculta).not.toHaveBeenCalled();
  });
  it('não repete ao mudar de conta com o mesmo e-mail ou ao mudar e-mail do mesmo gestor', async () => {
    await service.verificarFeriadosParaNotificar(agora);
    prisma.gestores.findMany.mockResolvedValueOnce([
      { ...gestor, id: '4ae12ef3-8cff-4d10-8879-55db44917b62' },
    ]);
    await service.verificarFeriadosParaNotificar(agora);
    prisma.gestores.findMany.mockResolvedValueOnce([
      { ...gestor, email: 'novo@example.com' },
    ]);
    await service.verificarFeriadosParaNotificar(agora);
    expect(email.enviarEmCopiaOculta).toHaveBeenCalledTimes(1);
  });
  it('não reserva envios quando a configuração SMTP está incompleta', async () => {
    email.validarConfiguracao.mockImplementation(() => {
      throw new Error('SMTP não configurado');
    });
    await service.verificarFeriadosParaNotificar(agora);
    expect(prisma.feriadoNotificacaoEnvio.create).not.toHaveBeenCalled();
    expect(email.enviarEmCopiaOculta).not.toHaveBeenCalled();
  });
  it('agrupa todos os gestores elegíveis em uma única chamada SMTP', async () => {
    const outro = {
      ...gestor,
      id: '4ae12ef3-8cff-4d10-8879-55db44917b62',
      email: 'outro@example.com',
    };
    prisma.gestores.findMany.mockResolvedValue([gestor, outro]);
    await service.verificarFeriadosParaNotificar(agora);
    expect(email.enviarEmCopiaOculta).toHaveBeenCalledTimes(1);
    expect(email.enviarEmCopiaOculta).toHaveBeenCalledWith(
      [gestor.email, outro.email],
      expect.any(Object),
    );
    expect(prisma.feriadoNotificacaoEnvio.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: { in: ['envio-1', 'envio-2'] } },
        data: expect.objectContaining({ status: 'ENVIADO' }),
      }),
    );
  });
  it('registra corretamente quando o SMTP aceita apenas parte do grupo', async () => {
    const outro = {
      ...gestor,
      id: '4ae12ef3-8cff-4d10-8879-55db44917b62',
      email: 'outro@example.com',
    };
    prisma.gestores.findMany.mockResolvedValue([gestor, outro]);
    email.enviarEmCopiaOculta.mockResolvedValueOnce({
      aceitos: [gestor.email],
      rejeitados: [outro.email],
    });
    await service.verificarFeriadosParaNotificar(agora);
    expect(prisma.feriadoNotificacaoEnvio.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: { in: ['envio-1'] } },
        data: expect.objectContaining({ status: 'ENVIADO' }),
      }),
    );
    expect(prisma.feriadoNotificacaoEnvio.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: { in: ['envio-2'] } },
        data: expect.objectContaining({ status: 'RETENTAR' }),
      }),
    );
    await service.verificarFeriadosParaNotificar(agora);
    expect(email.enviarEmCopiaOculta).toHaveBeenCalledTimes(2);
    expect(email.enviarEmCopiaOculta.mock.calls[1][0]).toEqual([outro.email]);
    expect(registros.map((r) => r.status)).toEqual(['ENVIADO', 'ENVIADO']);
  });
  it('não envia um grupo incompleto se a reserva transacional falhar', async () => {
    const outro = {
      ...gestor,
      id: '4ae12ef3-8cff-4d10-8879-55db44917b62',
      email: 'outro@example.com',
    };
    prisma.gestores.findMany.mockResolvedValue([gestor, outro]);
    prisma.feriadoNotificacaoEnvio.create
      .mockResolvedValueOnce({ id: 'envio-1' })
      .mockRejectedValueOnce(new Error('Falha na reserva'));
    await service.verificarFeriadosParaNotificar(agora);
    expect(email.enviarEmCopiaOculta).not.toHaveBeenCalled();
  });
  it('não envia quando outra instância está reservando a mesma ocorrência', async () => {
    prisma.$queryRaw.mockResolvedValueOnce([{ adquirido: false }]);
    await service.verificarFeriadosParaNotificar(agora);
    expect(email.enviarEmCopiaOculta).not.toHaveBeenCalled();
    expect(prisma.feriadoNotificacaoEnvio.create).not.toHaveBeenCalled();
  });
  it.each(['2026-10-28', '2026-10-29', '2026-10-30'])(
    'envia no terceiro, segundo ou último dia útil: %s',
    async (dia) => {
      await service.verificarFeriadosParaNotificar(
        new Date(`${dia}T11:00:00Z`),
      );
      expect(email.enviarEmCopiaOculta).toHaveBeenCalledTimes(1);
    },
  );
  it.each([undefined, 'false'])(
    'funciona sem depender da antiga variável de ativação: %s',
    async (valor) => {
      if (valor === undefined) delete process.env.FERIADOS_NOTIFICACOES_ATIVAS;
      else process.env.FERIADOS_NOTIFICACOES_ATIVAS = valor;
      await service.verificarFeriadosParaNotificar(agora);
      expect(email.enviarEmCopiaOculta).toHaveBeenCalledTimes(1);
    },
  );
  it('recupera indisponibilidade do banco no último dia útil sem repetir quem recebeu', async () => {
    prisma.gestores.findMany
      .mockRejectedValueOnce(new Error('AD indisponível'))
      .mockRejectedValueOnce(new Error('AD indisponível'));
    await service.verificarFeriadosParaNotificar(agora);
    await service.verificarFeriadosParaNotificar(
      new Date('2026-10-29T11:00:00Z'),
    );
    expect(email.enviarEmCopiaOculta).not.toHaveBeenCalled();
    await service.verificarFeriadosParaNotificar(
      new Date('2026-10-30T11:00:00Z'),
    );
    await service.verificarFeriadosParaNotificar(
      new Date('2026-10-30T11:15:00Z'),
    );
    expect(email.enviarEmCopiaOculta).toHaveBeenCalledTimes(1);
    expect(registros[0].status).toBe('ENVIADO');
  });
  it('repete uma conexão SMTP recusada e reutiliza o registro da tentativa', async () => {
    email.enviarEmCopiaOculta.mockRejectedValueOnce(
      Object.assign(new Error('Conexão recusada'), { code: 'ECONNREFUSED' }),
    );
    await service.verificarFeriadosParaNotificar(agora);
    expect(registros[0].status).toBe('RETENTAR');
    await service.verificarFeriadosParaNotificar(
      new Date('2026-10-29T11:00:00Z'),
    );
    await service.verificarFeriadosParaNotificar(
      new Date('2026-10-30T11:00:00Z'),
    );
    expect(email.enviarEmCopiaOculta).toHaveBeenCalledTimes(2);
    expect(prisma.feriadoNotificacaoEnvio.create).toHaveBeenCalledTimes(1);
    expect(registros[0].status).toBe('ENVIADO');
  });
  it.each(['PROCESSANDO', 'INCERTO', 'FALHA', 'ENVIADO'])(
    'não repete registro bloqueado com status %s',
    async (status) => {
      registros.push({
        id: 'existente',
        feriadoId,
        dataFeriado: new Date('2026-11-02T00:00:00Z'),
        gestorId,
        destinatario: gestor.email,
        status,
        enviadoEm: null,
      });
      await service.verificarFeriadosParaNotificar(agora);
      expect(email.enviarEmCopiaOculta).not.toHaveBeenCalled();
    },
  );
  it('não repete registro com aceite SMTP anterior, mesmo que esteja marcado RETENTAR', async () => {
    registros.push({
      id: 'existente',
      feriadoId,
      dataFeriado: new Date('2026-11-02T00:00:00Z'),
      gestorId,
      destinatario: gestor.email,
      status: 'RETENTAR',
      enviadoEm: new Date(),
    });
    await service.verificarFeriadosParaNotificar(agora);
    expect(email.enviarEmCopiaOculta).not.toHaveBeenCalled();
  });
  it('bloqueia nova tentativa quando o SMTP não informa aceite nem rejeição', async () => {
    email.enviarEmCopiaOculta.mockResolvedValueOnce({
      aceitos: [],
      rejeitados: [],
    });
    await service.verificarFeriadosParaNotificar(agora);
    await service.verificarFeriadosParaNotificar(
      new Date('2026-10-29T11:00:00Z'),
    );
    expect(registros[0].status).toBe('INCERTO');
    expect(email.enviarEmCopiaOculta).toHaveBeenCalledTimes(1);
  });
  it('não tenta no feriado após falhar na última oportunidade', async () => {
    email.enviarEmCopiaOculta.mockRejectedValueOnce({ code: 'ECONNREFUSED' });
    await service.verificarFeriadosParaNotificar(
      new Date('2026-10-30T11:00:00Z'),
    );
    await service.verificarFeriadosParaNotificar(
      new Date('2026-11-02T11:00:00Z'),
    );
    expect(registros[0].status).toBe('RETENTAR');
    expect(email.enviarEmCopiaOculta).toHaveBeenCalledTimes(1);
  });
  it('usa o e-mail corrigido no AD para repetir uma tentativa comprovadamente não entregue', async () => {
    email.enviarEmCopiaOculta.mockRejectedValueOnce({
      code: 'EENVELOPE',
      command: 'RCPT TO',
      responseCode: 550,
    });
    await service.verificarFeriadosParaNotificar(agora);
    prisma.gestores.findMany.mockResolvedValue([
      { ...gestor, email: 'corrigido@example.com' },
    ]);
    await service.verificarFeriadosParaNotificar(
      new Date('2026-10-29T11:00:00Z'),
    );
    expect(email.enviarEmCopiaOculta.mock.calls[1][0]).toEqual([
      'corrigido@example.com',
    ]);
    expect(registros[0].destinatario).toBe('corrigido@example.com');
    expect(registros[0].status).toBe('ENVIADO');
  });
});
