jest.mock('../prisma/prisma.service', () => ({ PrismaService: class {} }));
jest.mock('../email/email.service', () => ({ EmailService: class {} }));
jest.mock('jsonwebtoken', () => ({ sign: jest.fn(() => 'service-token') }));
jest.mock('axios', () => ({ __esModule: true, default: { get: jest.fn() } }));
import axios from 'axios';
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

  beforeEach(() => {
    jest.clearAllMocks();
    process.env = {
      ...ambiente,
      FERIADOS_NOTIFICACOES_ATIVAS: 'true',
      FERIADOS_EMAIL_GRH: 'grh@example.com',
      AUTH_API_URL: 'https://ad.example.com',
      JWT_SECRET: 'segredo-teste',
    };
    const chaves = new Set();
    const identidades = new Set();
    const registros: any[] = [];
    prisma = {
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
          const registro = { ...data, id: `envio-${registros.length + 1}` };
          registros.push(registro);
          return registro;
        }),
        findMany: jest.fn(async () => registros),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
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
    (axios.get as jest.Mock).mockResolvedValue({ data: [gestor] });
  });
  afterEach(() => {
    process.env = ambiente;
    jest.restoreAllMocks();
  });

  it('consulta os destinatários do feriado no AD com autenticação e envia mensagem em CCO', async () => {
    await service.verificarFeriadosParaNotificar(agora);
    expect(axios.get).toHaveBeenCalledWith(
      'https://ad.example.com/gestores/destinatarios-feriados',
      expect.objectContaining({
        params: { feriadoId },
        headers: { Authorization: 'Bearer service-token' },
      }),
    );
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
  it('não envia antes das 8h, em outro dia ou com automação desligada', async () => {
    await service.verificarFeriadosParaNotificar(
      new Date('2026-10-28T10:59:00Z'),
    );
    await service.verificarFeriadosParaNotificar(
      new Date('2026-10-29T11:00:00Z'),
    );
    process.env.FERIADOS_NOTIFICACOES_ATIVAS = 'false';
    await service.verificarFeriadosParaNotificar(agora);
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
  it('não presume destinatários se o AD falhar ou não retornar gestores', async () => {
    (axios.get as jest.Mock)
      .mockRejectedValueOnce(new Error('AD indisponível'))
      .mockResolvedValueOnce({ data: [] });
    await service.verificarFeriadosParaNotificar(agora);
    await service.verificarFeriadosParaNotificar(agora);
    expect(email.enviarEmCopiaOculta).not.toHaveBeenCalled();
    expect(prisma.feriadoNotificacaoEnvio.create).not.toHaveBeenCalled();
  });
  it('revalida as filiais, ignora endereços inválidos e deduplica a resposta', async () => {
    (axios.get as jest.Mock).mockResolvedValue({
      data: [
        gestor,
        { ...gestor, email: 'GESTOR@example.com' },
        { ...gestor, email: 'fora@example.com', filial: 'Matriz' },
        { ...gestor, email: 'invalido' },
      ],
    });
    await service.verificarFeriadosParaNotificar(agora);
    expect(email.enviarEmCopiaOculta).toHaveBeenCalledTimes(1);
    expect(email.enviarEmCopiaOculta.mock.calls[0][0]).toEqual([gestor.email]);
  });
  it('registra falha SMTP e não repete uma entrega incerta', async () => {
    email.enviarEmCopiaOculta.mockRejectedValue(new Error('Timeout SMTP'));
    await service.verificarFeriadosParaNotificar(agora);
    await service.verificarFeriadosParaNotificar(agora);
    expect(email.enviarEmCopiaOculta).toHaveBeenCalledTimes(1);
    expect(prisma.feriadoNotificacaoEnvio.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: 'FALHA' }),
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
    (axios.get as jest.Mock).mockResolvedValueOnce({
      data: [{ ...gestor, id: '4ae12ef3-8cff-4d10-8879-55db44917b62' }],
    });
    await service.verificarFeriadosParaNotificar(agora);
    (axios.get as jest.Mock).mockResolvedValueOnce({
      data: [{ ...gestor, email: 'novo@example.com' }],
    });
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
    (axios.get as jest.Mock).mockResolvedValue({ data: [gestor, outro] });
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
    (axios.get as jest.Mock).mockResolvedValue({ data: [gestor, outro] });
    email.enviarEmCopiaOculta.mockResolvedValue({
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
        data: expect.objectContaining({ status: 'FALHA' }),
      }),
    );
    await service.verificarFeriadosParaNotificar(agora);
    expect(email.enviarEmCopiaOculta).toHaveBeenCalledTimes(1);
  });
  it('não envia um grupo incompleto se a reserva transacional falhar', async () => {
    const outro = {
      ...gestor,
      id: '4ae12ef3-8cff-4d10-8879-55db44917b62',
      email: 'outro@example.com',
    };
    (axios.get as jest.Mock).mockResolvedValue({ data: [gestor, outro] });
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
});
