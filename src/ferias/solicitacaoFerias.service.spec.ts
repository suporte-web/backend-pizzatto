jest.mock('@/prisma/prisma.service', () => ({ PrismaService: class {} }), {
  virtual: true,
});
jest.mock('./feriasRegras.service', () => ({ FeriasRegrasService: class {} }));
jest.mock('../../generated/prisma/client', () => ({ Prisma: {} }));

import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { SolicitacaoFeriasService } from './solicitacaoFerias.service';

describe('Visibilidade e cancelamento das solicitações de férias', () => {
  let prisma: any;
  let service: SolicitacaoFeriasService;
  const gestor = { sam: 'gestor.equipe', roles: [] };

  beforeEach(() => {
    prisma = {
      solicitacaoFerias: {
        findMany: jest.fn().mockResolvedValue([]),
        count: jest.fn().mockResolvedValue(0),
        findUnique: jest.fn(),
        update: jest.fn(),
      },
      parcelaFerias: { updateMany: jest.fn() },
      periodoAquisitivoFerias: { update: jest.fn() },
      historicoSolicitacaoFerias: { create: jest.fn() },
    };
    prisma.$transaction = jest.fn((work) =>
      typeof work === 'function' ? work(prisma) : Promise.all(work),
    );
    service = new SolicitacaoFeriasService(prisma, {} as any, {} as any);
  });

  it('permite ao gestor listar todos os status apenas da equipe sob sua responsabilidade', async () => {
    await service.findByFilter(
      { tipoVisualizacao: 'MINHA_EQUIPE', gestorUsuario: 'outro.gestor' },
      gestor,
    );
    const { where } = prisma.solicitacaoFerias.findMany.mock.calls[0][0];
    expect(where.AND).toContainEqual({
      gestorUsuario: { equals: gestor.sam, mode: 'insensitive' },
    });
    expect(where.AND.some((filtro) => filtro.status)).toBe(false);
    expect(prisma.solicitacaoFerias.count).toHaveBeenCalledWith({ where });
  });

  it('aceita o filtro de reprovadas sem perder a restrição da equipe e pagina o histórico', async () => {
    const result = await service.findByFilter(
      {
        tipoVisualizacao: 'MINHA_EQUIPE',
        status: 'REPROVADO',
        page: 2,
        limit: 20,
      },
      gestor,
    );
    const { where, skip, take } =
      prisma.solicitacaoFerias.findMany.mock.calls[0][0];
    expect(where.AND).toContainEqual({ status: 'REPROVADO' });
    expect(where.AND).toContainEqual({
      gestorUsuario: { equals: gestor.sam, mode: 'insensitive' },
    });
    expect({ skip, take }).toEqual({ skip: 20, take: 20 });
    expect(result.pagination.page).toBe(2);
  });

  it('mantém somente pendências na fila para aprovar', async () => {
    await service.findByFilter({ tipoVisualizacao: 'PARA_APROVAR' }, gestor);
    const { where } = prisma.solicitacaoFerias.findMany.mock.calls[0][0];
    expect(where.AND).toContainEqual({
      gestorUsuario: { equals: gestor.sam, mode: 'insensitive' },
    });
    expect(where.AND).toContainEqual({
      status: { in: ['AGUARDANDO_APROVACAO', 'APROVADO_PARCIALMENTE'] },
    });
  });

  it('não libera as solicitações de outras equipes para um gestor comum', async () => {
    await expect(
      service.findByFilter({ tipoVisualizacao: 'TODAS' }, gestor),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.solicitacaoFerias.findMany).not.toHaveBeenCalled();
  });

  it('exige usuário autenticado para consultar a equipe', async () => {
    await expect(
      service.findByFilter({ tipoVisualizacao: 'MINHA_EQUIPE' }, {}),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.solicitacaoFerias.findMany).not.toHaveBeenCalled();
  });

  const body = {
    solicitacaoId: 'solicitacao',
    motivoCancelamento: 'Alteração da programação',
  };
  const dp = { sam: 'usuario.dp', roles: ['DEPARTAMENTO_PESSOAL'] };
  const aprovada = {
    id: body.solicitacaoId,
    status: 'APROVADO',
    periodoAquisitivoId: 'periodo',
    ParcelaFerias: [{ id: 'parcela', status: 'APROVADO' }],
  };

  it('permite ao DP cancelar férias aprovadas, libera o período e registra o motivo no histórico', async () => {
    prisma.solicitacaoFerias.findUnique.mockResolvedValue(aprovada);
    await service.cancelarSolicitacao(body, '127.0.0.1', dp);
    expect(prisma.solicitacaoFerias.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: 'CANCELADO',
          motivoCancelamento: body.motivoCancelamento,
        }),
      }),
    );
    expect(prisma.parcelaFerias.updateMany).toHaveBeenCalledWith({
      where: { solicitacaoId: body.solicitacaoId },
      data: { status: 'CANCELADO' },
    });
    expect(prisma.periodoAquisitivoFerias.update).toHaveBeenCalledWith({
      where: { id: 'periodo' },
      data: { status: 'DISPONIVEL' },
    });
    expect(prisma.historicoSolicitacaoFerias.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          tipoEvento: 'CANCELAMENTO',
          statusAnterior: 'APROVADO',
          responsavelUsuario: dp.sam,
          dadosNovos: {
            status: 'CANCELADO',
            motivoCancelamento: body.motivoCancelamento,
          },
        }),
      }),
    );
  });

  it('não permite que o perfil de gestor sozinho cancele férias', async () => {
    await expect(
      service.cancelarSolicitacao(body, '127.0.0.1', gestor),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it.each(['CANCELADO', 'CONCLUIDO'])(
    'bloqueia cancelamento no status %s',
    async (status) => {
      prisma.solicitacaoFerias.findUnique.mockResolvedValue({
        ...aprovada,
        status,
      });
      await expect(
        service.cancelarSolicitacao(body, '127.0.0.1', dp),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.$transaction).not.toHaveBeenCalled();
    },
  );

  it('bloqueia cancelamento quando alguma parcela já foi retirada', async () => {
    prisma.solicitacaoFerias.findUnique.mockResolvedValue({
      ...aprovada,
      ParcelaFerias: [{ status: 'FERIAS_RETIRADAS' }, { status: 'APROVADO' }],
    });
    await expect(
      service.cancelarSolicitacao(body, '127.0.0.1', dp),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('exige motivo para cancelar férias aprovadas', async () => {
    await expect(
      service.cancelarSolicitacao(
        { ...body, motivoCancelamento: ' ' },
        '127.0.0.1',
        dp,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
});
