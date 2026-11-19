import { JwtService } from '@nestjs/jwt';
import { ThirdPartyAccessGuard } from './third-party-access.guard';

describe('Restrição global do perfil TERCEIRO', () => {
  const secret = 'segredo-unitario-terceiros';
  const jwt = new JwtService();
  const guard = new ThirdPartyAccessGuard(jwt);
  let original: string | undefined;
  beforeAll(() => {
    original = process.env.JWT_SECRET;
    process.env.JWT_SECRET = secret;
  });
  afterAll(() => {
    if (original === undefined) delete process.env.JWT_SECRET;
    else process.env.JWT_SECRET = original;
  });
  const contexto = (
    path: string,
    method = 'GET',
    roles: string[] = ['TERCEIRO'],
    token?: string,
  ) => {
    const request = {
      path,
      method,
      headers: {
        authorization:
          'Bearer ' +
          (token ?? jwt.sign({ roles }, { secret, expiresIn: '5m' })),
      },
    };
    return { switchToHttp: () => ({ getRequest: () => request }) } as any;
  };
  it.each([
    ['GET', '/auth/me'],
    ['POST', '/auth/logout'],
    ['GET', '/foto-perfil-whatsapp/get-foto-by-usuario/Colaborador'],
    ['GET', '/foto-perfil-whatsapp/get-foto-by-user'],
  ])('permite o recurso necessário %s %s', async (method, path) => {
    expect(await guard.canActivate(contexto(path, method))).toBe(true);
  });
  it.each([
    ['GET', '/plantao/page-principal'],
    ['POST', '/feriados/find-by-filter'],
    ['POST', '/foto-perfil-whatsapp/create'],
    ['GET', '/feed'],
    ['GET', '/foto-perfil-whatsapp'],
    ['GET', '/foto-perfil-whatsapp/get-foto-by-usuario-malicioso'],
  ])('bloqueia inclusive rotas públicas: %s %s', async (method, path) => {
    await expect(guard.canActivate(contexto(path, method))).rejects.toThrow(
      'somente ao Organograma',
    );
  });
  it('não permite elevar acesso combinando TERCEIRO e ADMIN', async () => {
    await expect(
      guard.canActivate(
        contexto('/gestores/find-by-filter', 'POST', [
          'TERCEIRO',
          'ADMIN',
          'DESENVOLVIMENTO',
        ]),
      ),
    ).rejects.toThrow('somente ao Organograma');
  });
  it('preserva os outros perfis', async () => {
    expect(
      await guard.canActivate(
        contexto('/gestores/find-by-filter', 'POST', ['DESENVOLVIMENTO']),
      ),
    ).toBe(true);
  });
  it('mantém visitantes anônimos sob os guards existentes', async () => {
    const ctx = {
      switchToHttp: () => ({
        getRequest: () => ({ path: '/publico', method: 'GET', headers: {} }),
      }),
    } as any;
    expect(await guard.canActivate(ctx)).toBe(true);
  });
  it('recusa token expirado ou assinado com outra chave', async () => {
    const outro = jwt.sign(
      { roles: ['TERCEIRO'] },
      { secret: 'chave-incorreta' },
    );
    await expect(
      guard.canActivate(contexto('/auth/me', 'GET', [], outro)),
    ).rejects.toThrow('Token inválido');
    const expirado = jwt.sign(
      { roles: ['TERCEIRO'] },
      { secret, expiresIn: -1 },
    );
    await expect(
      guard.canActivate(contexto('/auth/me', 'GET', [], expirado)),
    ).rejects.toThrow('Token inválido');
  });
});
