import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { PrismaService } from '@/prisma/prisma.service';
import { Prisma } from '../../generated/prisma/client';

type AvaliacaoPayload = {
  razaoSocial: string;
  cnpj: string;

  categoria?: string | null;
  setorResponsavel?: string | null;
  anoReferencia: number;

  qualidade?: number | null;
  prazoOtd?: number | null;
  preco?: number | null;
  atendimento?: number | null;
  condicoesComerciais?: number | null;
  documentacaoFiscal?: number | null;
  flexibilidade?: number | null;
  posVenda?: number | null;

  planoAcao?: string | null;
  observacoes?: string | null;
};

@Injectable()
export class AvaliacaoFornecedoresService {
  constructor(private readonly prisma: PrismaService) {}

  private limparCnpj(cnpj: string): string {
    return String(cnpj ?? '').replace(/\D/g, '');
  }

  private validarNota(valor: unknown, campo: string): number {
    const nota = Number(valor);

    if (
      valor === null ||
      valor === undefined ||
      valor === '' ||
      !Number.isInteger(nota) ||
      nota < 1 ||
      nota > 5
    ) {
      throw new BadRequestException(
        `O critério ${campo} deve receber uma nota de 1 a 5.`,
      );
    }

    return nota;
  }

  private calcularClassificacao(
    notaFinal: number,
  ): Prisma.AvaliacaoFornecedoresCreateInput['classificacao'] {
    if (notaFinal >= 4.5) return 'EXCELENTE';
    if (notaFinal >= 4.0) return 'BOM';
    if (notaFinal >= 3.0) return 'REGULAR';
    if (notaFinal >= 2.0) return 'RUIM';

    return 'CRITICO';
  }

  private calcularNotaFinal(body: AvaliacaoPayload): number {
    const notaFinal =
      this.validarNota(body.qualidade, 'Qualidade') * 0.25 +
      this.validarNota(body.prazoOtd, 'Prazo OTD') * 0.2 +
      this.validarNota(body.preco, 'Preço') * 0.2 +
      this.validarNota(body.atendimento, 'Atendimento') * 0.1 +
      this.validarNota(body.condicoesComerciais, 'Condições Comerciais') * 0.1 +
      this.validarNota(body.documentacaoFiscal, 'Documentação Fiscal') * 0.05 +
      this.validarNota(body.flexibilidade, 'Flexibilidade') * 0.05 +
      this.validarNota(body.posVenda, 'Pós-venda') * 0.05;

    return Number(notaFinal.toFixed(2));
  }

  private validarAno(ano: unknown): number {
    const valor = Number(ano);

    if (!Number.isInteger(valor) || valor < 2000 || valor > 2100) {
      throw new BadRequestException('Ano de referência inválido.');
    }

    return valor;
  }

  private validarTexto(valor: unknown, campo: string): string {
    const texto = String(valor ?? '').trim();

    if (!texto) {
      throw new BadRequestException(`${campo} é obrigatório.`);
    }

    return texto;
  }

  private normalizarPayload(body: AvaliacaoPayload) {
    const cnpj = this.limparCnpj(body.cnpj);

    if (!/^\d{14}$/.test(cnpj)) {
      throw new BadRequestException('O CNPJ deve conter 14 dígitos.');
    }

    return {
      razaoSocial: this.validarTexto(body.razaoSocial, 'Razão social'),
      cnpj,
      categoria: this.validarTexto(body.categoria, 'Categoria'),
      setorResponsavel: this.validarTexto(
        body.setorResponsavel,
        'Setor responsável',
      ),
      anoReferencia: this.validarAno(body.anoReferencia),

      qualidade: this.validarNota(body.qualidade, 'Qualidade'),
      prazoOtd: this.validarNota(body.prazoOtd, 'Prazo OTD'),
      preco: this.validarNota(body.preco, 'Preço'),
      atendimento: this.validarNota(body.atendimento, 'Atendimento'),
      condicoesComerciais: this.validarNota(
        body.condicoesComerciais,
        'Condições Comerciais',
      ),
      documentacaoFiscal: this.validarNota(
        body.documentacaoFiscal,
        'Documentação Fiscal',
      ),
      flexibilidade: this.validarNota(body.flexibilidade, 'Flexibilidade'),
      posVenda: this.validarNota(body.posVenda, 'Pós-venda'),

      planoAcao: body.planoAcao?.trim() || null,
      observacoes: body.observacoes?.trim() || null,

      notaFinal: this.calcularNotaFinal(body),
    };
  }

  async findByCnpjAno(cnpj: string, anoReferencia: number) {
    const cnpjLimpo = this.limparCnpj(cnpj);
    const ano = this.validarAno(anoReferencia);

    const avaliacao = await this.prisma.avaliacaoFornecedores.findUnique({
      where: {
        cnpj_anoReferencia: {
          cnpj: cnpjLimpo,
          anoReferencia: ano,
        },
      },
    });

    return {
      possuiAvaliacao: avaliacao !== null,
      avaliacao,
    };
  }

  async findById(id: string) {
    const avaliacao = await this.prisma.avaliacaoFornecedores.findUnique({
      where: { id },
    });

    if (!avaliacao) {
      throw new NotFoundException('Avaliação não encontrada.');
    }

    return avaliacao;
  }

  async findByFilter(body: any) {
    const page = Math.max(Number(body.page) || 1, 1);

    const limit = Math.min(Math.max(Number(body.limit) || 10, 1), 100);

    const pesquisa = String(body.pesquisa ?? '').trim();

    const where: Prisma.AvaliacaoFornecedoresWhereInput = {
      ativo:
        body.ativo === undefined
          ? true
          : body.ativo === true || body.ativo === 'true',

      ...(body.anoReferencia && {
        anoReferencia: this.validarAno(body.anoReferencia),
      }),

      ...(body.categoria && {
        categoria: body.categoria,
      }),

      ...(body.setorResponsavel && {
        setorResponsavel: body.setorResponsavel,
      }),

      ...(body.classificacao && {
        classificacao: body.classificacao,
      }),

      ...(pesquisa && {
        OR: [
          {
            razaoSocial: {
              contains: pesquisa,
              mode: 'insensitive',
            },
          },
          {
            cnpj: {
              contains: this.limparCnpj(pesquisa),
            },
          },
        ],
      }),
    };

    const [result, total] = await this.prisma.$transaction([
      this.prisma.avaliacaoFornecedores.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: {
          createdAt: 'desc',
        },
      }),

      this.prisma.avaliacaoFornecedores.count({
        where,
      }),
    ]);

    return {
      result,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  async create(body: AvaliacaoPayload, user: any) {
    if (!body || typeof body !== 'object') {
      throw new BadRequestException('Informe os dados da avaliação.');
    }

    const dados = this.normalizarPayload(body);

    const avaliacaoExistente =
      await this.prisma.avaliacaoFornecedores.findUnique({
        where: {
          cnpj_anoReferencia: {
            cnpj: dados.cnpj,
            anoReferencia: dados.anoReferencia,
          },
        },
      });

    if (avaliacaoExistente) {
      throw new ConflictException(
        `O fornecedor ${dados.razaoSocial} já possui uma avaliação cadastrada para ${dados.anoReferencia}.`,
      );
    }

    const classificacao = this.calcularClassificacao(dados.notaFinal);

    const avaliadoPorNome = user?.name ?? user?.nome ?? null;

    const avaliadoPorUsuario =
      user?.samAccountName ?? user?.sam ?? user?.usuario ?? null;

    const avaliadoPorGuid = user?.objectGuid ?? user?.adObjectGuid ?? null;

    try {
      const avaliacao = await this.prisma.avaliacaoFornecedores.create({
        data: {
          ...dados,
          classificacao,

          avaliadoPorNome,
          avaliadoPorUsuario,
          avaliadoPorGuid,

          ativo: true,
        },
      });

      return {
        message: 'Avaliação do fornecedor cadastrada com sucesso.',
        avaliacao,
      };
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new ConflictException(
          `Este fornecedor já possui uma avaliação para ${dados.anoReferencia}.`,
        );
      }

      throw error;
    }
  }

  async update(id: string, body: Partial<AvaliacaoPayload>, user: any) {
    if (!body || typeof body !== 'object') {
      throw new BadRequestException('Informe os dados para atualização.');
    }

    const avaliacaoAtual = await this.prisma.avaliacaoFornecedores.findUnique({
      where: { id },
    });

    if (!avaliacaoAtual) {
      throw new NotFoundException('Avaliação do fornecedor não encontrada.');
    }

    if (
      body.cnpj !== undefined &&
      this.limparCnpj(body.cnpj) !== avaliacaoAtual.cnpj
    ) {
      throw new BadRequestException(
        'Não é permitido alterar o CNPJ de uma avaliação existente.',
      );
    }

    if (
      body.anoReferencia !== undefined &&
      this.validarAno(body.anoReferencia) !== avaliacaoAtual.anoReferencia
    ) {
      throw new BadRequestException(
        'Não é permitido alterar o ano de referência da avaliação.',
      );
    }

    const dados = this.normalizarPayload({
      razaoSocial: body.razaoSocial ?? avaliacaoAtual.razaoSocial,

      cnpj: avaliacaoAtual.cnpj,

      categoria: body.categoria ?? avaliacaoAtual.categoria,

      setorResponsavel:
        body.setorResponsavel ?? avaliacaoAtual.setorResponsavel,

      anoReferencia: avaliacaoAtual.anoReferencia,

      qualidade: body.qualidade ?? avaliacaoAtual.qualidade,

      prazoOtd: body.prazoOtd ?? avaliacaoAtual.prazoOtd,

      preco: body.preco ?? avaliacaoAtual.preco,

      atendimento: body.atendimento ?? avaliacaoAtual.atendimento,

      condicoesComerciais:
        body.condicoesComerciais ?? avaliacaoAtual.condicoesComerciais,

      documentacaoFiscal:
        body.documentacaoFiscal ?? avaliacaoAtual.documentacaoFiscal,

      flexibilidade: body.flexibilidade ?? avaliacaoAtual.flexibilidade,

      posVenda: body.posVenda ?? avaliacaoAtual.posVenda,

      planoAcao:
        body.planoAcao !== undefined
          ? body.planoAcao
          : avaliacaoAtual.planoAcao,

      observacoes:
        body.observacoes !== undefined
          ? body.observacoes
          : avaliacaoAtual.observacoes,
    });

    const classificacao = this.calcularClassificacao(dados.notaFinal);

    const avaliacao = await this.prisma.avaliacaoFornecedores.update({
      where: { id },
      data: {
        ...dados,

        // Responsável pela avaliação
        avaliadoPorNome: user.name,
        avaliadoPorUsuario: user.sam,
        avaliadoPorGuid: user.adObjectGuid,

        // Classificação calculada
        classificacao,

        // Concluir a avaliação
        status: 'CONCLUIDA',
      },
    });

    return {
      message: 'Avaliação do fornecedor concluída com sucesso.',
      avaliacao,
    };
  }

  async delete(id: string, user: any) {
    const avaliacao = await this.prisma.avaliacaoFornecedores.findUnique({
      where: { id },
    });

    if (!avaliacao) {
      throw new NotFoundException('Avaliação do fornecedor não encontrada.');
    }

    if (!avaliacao.ativo) {
      throw new BadRequestException('Esta avaliação já está inativa.');
    }

    await this.prisma.avaliacaoFornecedores.update({
      where: { id },
      data: {
        ativo: false,
      },
    });

    return {
      message: 'Avaliação do fornecedor inativada com sucesso.',
    };
  }
}
