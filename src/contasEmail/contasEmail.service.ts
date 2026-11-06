import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateContaEmailDto } from './dtos/CreateContaEmail.dto';
import { UpdateContaEmailDto } from './dtos/UpdateContaEmail.dto';
import { FindByFilterContaEmailDto } from './dtos/FindByFilterContaEmail.dto';
import {
  criptografarSenha,
  descriptografarSenha,
} from './utils/contas-email-crypto';
import { Prisma, TipoContaEmail } from '../../generated/prisma/client';

@Injectable()
export class ContasEmailService {
  constructor(private readonly prisma: PrismaService) {}

  private readonly camposPublicos = {
    id: true,
    nome: true,
    email: true,
    tipoConta: true,
    plataforma: true,
    finalidade: true,
    empresa: true,
    departamento: true,
    responsavel: true,
    urlAcesso: true,
    observacoes: true,
    ativo: true,
    criadoEm: true,
    atualizadoEm: true,
  } satisfies Prisma.ContasEmailSelect;

  private texto(valor?: string | null) {
    return typeof valor === 'string' ? valor.trim() : '';
  }

  private emailNormalizado(valor?: string | null) {
    return this.texto(valor).toLowerCase();
  }

  private campoOpcional(valor?: string | null) {
    if (valor === null) return null;
    return this.texto(valor) || null;
  }

  private validarPermissao(user: any) {
    const roles = Array.isArray(user?.roles)
      ? user.roles
      : typeof user?.roles === 'string'
        ? [user.roles]
        : [];

    const autorizado = roles.some((role: unknown) =>
      ['ADMIN', 'TI'].includes(
        typeof role === 'string' ? role.toUpperCase() : '',
      ),
    );

    if (!autorizado) {
      throw new ForbiddenException(
        'Você não possui permissão para visualizar senhas.',
      );
    }
  }

  private prepararDados(body: CreateContaEmailDto) {
    const nome = this.texto(body?.nome);
    const email = this.emailNormalizado(body?.email);
    const senha = body?.senha;

    if (!nome || !email || !senha) {
      throw new BadRequestException('Nome, email e senha são obrigatórios.');
    }

    if (typeof senha !== 'string' || !senha.length) {
      throw new BadRequestException('Senha inválida.');
    }

    return {
      nome,
      email,
      senha: criptografarSenha(senha),
      tipoConta: this.validarTipoConta(body.tipoConta),
      plataforma: this.campoOpcional(body.plataforma),
      finalidade: this.campoOpcional(body.finalidade),
      empresa: this.campoOpcional(body.empresa),
      departamento: this.campoOpcional(body.departamento),
      responsavel: this.campoOpcional(body.responsavel),
      urlAcesso: this.campoOpcional(body.urlAcesso),
      observacoes: this.campoOpcional(body.observacoes),
      ativo: body.ativo ?? true,
    };
  }

  private validarTipoConta(valor?: string): TipoContaEmail {
    const tipo = (valor || 'OUTRO').trim().toUpperCase();

    if (!Object.values(TipoContaEmail).includes(tipo as TipoContaEmail)) {
      throw new BadRequestException(`Tipo de conta inválido: ${tipo}`);
    }

    return tipo as TipoContaEmail;
  }

  async create(body: CreateContaEmailDto) {
    const data = this.prepararDados(body);

    const existing = await this.prisma.contasEmail.findFirst({
      where: {
        email: data.email,
        tipoConta: this.validarTipoConta(body.tipoConta),
        plataforma: data.plataforma,
      },
    });

    if (existing) {
      throw new BadRequestException(
        'Já existe uma conta cadastrada com esse email, tipo e plataforma.',
      );
    }

    return this.prisma.contasEmail.create({
      data,
      select: this.camposPublicos,
    });
  }

  async createBySpreadsheet(body: CreateContaEmailDto[] | CreateContaEmailDto) {
    if (Array.isArray(body)) {
      const resultados: Awaited<
        ReturnType<ContasEmailService['createOrUpdateRecord']>
      >[] = [];

      for (const item of body) {
        resultados.push(await this.createOrUpdateRecord(item));
      }

      return resultados;
    }

    return this.createOrUpdateRecord(body);
  }

  private async createOrUpdateRecord(body: CreateContaEmailDto) {
    if (!body) {
      throw new BadRequestException('Dados inválidos.');
    }

    const email = this.emailNormalizado(body.email);
    const nome = this.texto(body.nome);
    const tipoConta = this.texto(body.tipoConta) || 'OUTRO';
    const plataforma = this.campoOpcional(body.plataforma);

    if (!nome || !email) {
      throw new BadRequestException('Nome e email são obrigatórios.');
    }

    const existing = await this.prisma.contasEmail.findFirst({
      where: {
        email,
        tipoConta: this.validarTipoConta(body.tipoConta),
        plataforma,
      },
    });

    if (existing) {
      const { senha, ...dados } = body;

      return this.update(existing.id, {
        ...dados,
        nome,
        email,
        tipoConta,
        plataforma: plataforma ?? undefined,
        ...(senha ? { senha } : {}),
      });
    }

    if (!body.senha) {
      throw new BadRequestException(
        `Senha obrigatória para a nova conta ${email}.`,
      );
    }

    return this.create({
      ...body,
      nome,
      email,
      tipoConta,
      plataforma: plataforma ?? undefined,
    });
  }

  async findAtivos() {
    return this.prisma.contasEmail.findMany({
      where: { ativo: true },
      select: this.camposPublicos,
      orderBy: { nome: 'asc' },
    });
  }

  async findAll() {
    return this.prisma.contasEmail.findMany({
      select: this.camposPublicos,
      orderBy: { nome: 'asc' },
    });
  }

  async findOne(id: string) {
    const conta = await this.prisma.contasEmail.findUnique({
      where: { id },
      select: this.camposPublicos,
    });

    if (!conta) {
      throw new NotFoundException('Conta não encontrada.');
    }

    return conta;
  }

  async findByFilter(body: FindByFilterContaEmailDto) {
    const pesquisa = this.texto(body?.pesquisa);

    const page = Math.max(1, Math.floor(Number(body?.page) || 1));

    const limit = Math.min(
      100,
      Math.max(1, Math.floor(Number(body?.limit) || 10)),
    );

    const skip = (page - 1) * limit;

    const where: Prisma.ContasEmailWhereInput = {
      ...(pesquisa && {
        OR: [
          {
            nome: {
              contains: pesquisa,
              mode: 'insensitive',
            },
          },
          {
            email: {
              contains: pesquisa,
              mode: 'insensitive',
            },
          },
          {
            finalidade: {
              contains: pesquisa,
              mode: 'insensitive',
            },
          },
          {
            responsavel: {
              contains: pesquisa,
              mode: 'insensitive',
            },
          },
          {
            plataforma: {
              contains: pesquisa,
              mode: 'insensitive',
            },
          },
        ],
      }),

      ...(body?.tipoConta && {
        tipoConta: this.validarTipoConta(body.tipoConta),
      }),

      ...(body?.plataforma && {
        plataforma: {
          contains: body.plataforma,
          mode: 'insensitive',
        },
      }),

      ...(body?.empresa && {
        empresa: {
          contains: body.empresa,
          mode: 'insensitive',
        },
      }),

      ...(body?.departamento && {
        departamento: {
          contains: body.departamento,
          mode: 'insensitive',
        },
      }),

      ...(typeof body?.ativo === 'boolean' && {
        ativo: body.ativo,
      }),
    };

    const [result, total] = await this.prisma.$transaction([
      this.prisma.contasEmail.findMany({
        where,
        skip,
        take: limit,
        select: this.camposPublicos,
        orderBy: { nome: 'asc' },
      }),

      this.prisma.contasEmail.count({ where }),
    ]);

    return {
      result,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  async update(id: string, body: UpdateContaEmailDto) {
    await this.findOne(id);

    if (!body || !Object.keys(body).length) {
      throw new BadRequestException(
        'Nenhuma informação enviada para atualização.',
      );
    }

    const data: Prisma.ContasEmailUpdateInput = {};

    if (body.nome !== undefined) {
      const nome = this.texto(body.nome);

      if (!nome) {
        throw new BadRequestException('Nome inválido.');
      }

      data.nome = nome;
    }

    if (body.email !== undefined) {
      const email = this.emailNormalizado(body.email);

      if (!email) {
        throw new BadRequestException('Email inválido.');
      }

      data.email = email;
    }

    if (body.senha !== undefined) {
      if (typeof body.senha !== 'string' || !body.senha.length) {
        throw new BadRequestException('Senha inválida.');
      }

      data.senha = criptografarSenha(body.senha);
    }

    if (body.tipoConta !== undefined) {
      data.tipoConta = this.validarTipoConta(body.tipoConta);
    }

    const opcionais = [
      'plataforma',
      'finalidade',
      'empresa',
      'departamento',
      'responsavel',
      'urlAcesso',
      'observacoes',
    ] as const;

    for (const campo of opcionais) {
      if (body[campo] !== undefined) {
        data[campo] = this.campoOpcional(body[campo]);
      }
    }

    if (body.ativo !== undefined) {
      if (typeof body.ativo !== 'boolean') {
        throw new BadRequestException('Status inválido.');
      }

      data.ativo = body.ativo;
    }

    return this.prisma.contasEmail.update({
      where: { id },
      data,
      select: this.camposPublicos,
    });
  }

  async revelarSenha(id: string, user: any) {
    this.validarPermissao(user);

    const conta = await this.prisma.contasEmail.findUnique({
      where: { id },
      select: {
        id: true,
        email: true,
        senha: true,
      },
    });

    if (!conta) {
      throw new NotFoundException('Conta não encontrada.');
    }

    return {
      id: conta.id,
      email: conta.email,
      senha: descriptografarSenha(conta.senha),
    };
  }

  async delete(id: string) {
    await this.findOne(id);

    return this.prisma.contasEmail.delete({
      where: { id },
      select: this.camposPublicos,
    });
  }
}
