export type ClassificacaoNicho =
  | 'MESMO_NICHO'
  | 'NICHO_PARECIDO'
  | 'NICHO_CORRELATO'
  | 'NICHO_DIFERENTE';

export interface CnaeEntrada {
  codigo?: string | number | null;
  descricao?: string | null;
}

export interface ResultadoClassificacaoNicho {
  classificacao: ClassificacaoNicho;
  pontuacao: number;
  descricao: string;

  cnaeEmpresaReferencia?: {
    codigo: string;
    descricao?: string | null;
    origem: 'PRINCIPAL' | 'SECUNDARIO';
  };

  cnaeEmpresaConsultada?: {
    codigo: string;
    descricao?: string | null;
    origem: 'PRINCIPAL' | 'SECUNDARIO';
  };
}

type CnaeComOrigem = CnaeEntrada & {
  origem: 'PRINCIPAL' | 'SECUNDARIO';
};

export class CnpjNichoValidator {
  private static normalizarCnae(valor: unknown): string {
    return String(valor ?? '').replace(/\D/g, '');
  }

  private static montarListaCnaes(params: {
    cnaePrincipal?: CnaeEntrada | null;
    cnaesSecundarios?: CnaeEntrada[] | null;
  }): CnaeComOrigem[] {
    const resultado: CnaeComOrigem[] = [];

    if (params.cnaePrincipal?.codigo) {
      resultado.push({
        ...params.cnaePrincipal,
        origem: 'PRINCIPAL',
      });
    }

    for (const cnae of params.cnaesSecundarios ?? []) {
      if (!cnae?.codigo) {
        continue;
      }

      resultado.push({
        ...cnae,
        origem: 'SECUNDARIO',
      });
    }

    return resultado;
  }

  private static compararCodigos(
    codigoReferencia: string,
    codigoConsultado: string,
  ): {
    classificacao: ClassificacaoNicho;
    pontuacao: number;
  } {
    const referencia = this.normalizarCnae(codigoReferencia);
    const consultado = this.normalizarCnae(codigoConsultado);

    if (!referencia || !consultado) {
      return {
        classificacao: 'NICHO_DIFERENTE',
        pontuacao: 0,
      };
    }

    /*
     * Mesmo CNAE completo.
     */
    if (referencia === consultado) {
      return {
        classificacao: 'MESMO_NICHO',
        pontuacao: 100,
      };
    }

    /*
     * Mesma classe CNAE.
     *
     * Exemplo:
     * 4930201
     * 4930202
     *
     * Ambos começam com 49302.
     */
    if (referencia.slice(0, 5) === consultado.slice(0, 5)) {
      return {
        classificacao: 'MESMO_NICHO',
        pontuacao: 95,
      };
    }

    /*
     * Mesmo grupo CNAE.
     */
    if (referencia.slice(0, 3) === consultado.slice(0, 3)) {
      return {
        classificacao: 'NICHO_PARECIDO',
        pontuacao: 75,
      };
    }

    /*
     * Mesma divisão CNAE.
     */
    if (referencia.slice(0, 2) === consultado.slice(0, 2)) {
      return {
        classificacao: 'NICHO_CORRELATO',
        pontuacao: 50,
      };
    }

    return {
      classificacao: 'NICHO_DIFERENTE',
      pontuacao: 0,
    };
  }

  static validar(params: {
    empresaReferencia: {
      cnaePrincipal?: CnaeEntrada | null;
      cnaesSecundarios?: CnaeEntrada[] | null;
    };

    empresaConsultada: {
      cnaePrincipal?: CnaeEntrada | null;
      cnaesSecundarios?: CnaeEntrada[] | null;
    };
  }): ResultadoClassificacaoNicho {
    const cnaesReferencia = this.montarListaCnaes(
      params.empresaReferencia,
    );

    const cnaesConsultada = this.montarListaCnaes(
      params.empresaConsultada,
    );

    if (
      cnaesReferencia.length === 0 ||
      cnaesConsultada.length === 0
    ) {
      return {
        classificacao: 'NICHO_DIFERENTE',
        pontuacao: 0,
        descricao:
          'Não foi possível comparar os CNAEs das empresas.',
      };
    }

    let melhorResultado:
      | ResultadoClassificacaoNicho
      | null = null;

    /*
     * Compara todos os CNAEs da empresa de referência
     * contra todos os CNAEs da empresa consultada.
     */
    for (const cnaeReferencia of cnaesReferencia) {
      for (const cnaeConsultado of cnaesConsultada) {
        const comparacao = this.compararCodigos(
          String(cnaeReferencia.codigo),
          String(cnaeConsultado.codigo),
        );

        /*
         * Dá um pequeno peso adicional quando os CNAEs
         * envolvidos são principais.
         */
        let pontuacao = comparacao.pontuacao;

        if (
          cnaeReferencia.origem === 'PRINCIPAL' &&
          cnaeConsultado.origem === 'PRINCIPAL'
        ) {
          pontuacao = Math.min(100, pontuacao + 5);
        }

        const resultadoAtual: ResultadoClassificacaoNicho = {
          classificacao: comparacao.classificacao,
          pontuacao,

          descricao: this.gerarDescricao(
            comparacao.classificacao,
            cnaeReferencia,
            cnaeConsultado,
          ),

          cnaeEmpresaReferencia: {
            codigo: this.normalizarCnae(
              cnaeReferencia.codigo,
            ),
            descricao:
              cnaeReferencia.descricao ?? null,
            origem: cnaeReferencia.origem,
          },

          cnaeEmpresaConsultada: {
            codigo: this.normalizarCnae(
              cnaeConsultado.codigo,
            ),
            descricao:
              cnaeConsultado.descricao ?? null,
            origem: cnaeConsultado.origem,
          },
        };

        if (
          !melhorResultado ||
          resultadoAtual.pontuacao >
            melhorResultado.pontuacao
        ) {
          melhorResultado = resultadoAtual;
        }
      }
    }

    return (
      melhorResultado ?? {
        classificacao: 'NICHO_DIFERENTE',
        pontuacao: 0,
        descricao:
          'Nenhuma relação foi encontrada entre os CNAEs das empresas.',
      }
    );
  }

  private static gerarDescricao(
    classificacao: ClassificacaoNicho,
    referencia: CnaeComOrigem,
    consultado: CnaeComOrigem,
  ): string {
    switch (classificacao) {
      case 'MESMO_NICHO':
        return 'A empresa atua no mesmo nicho ou em uma atividade CNAE praticamente idêntica à empresa de referência.';

      case 'NICHO_PARECIDO':
        return 'A empresa possui atividade pertencente ao mesmo grupo CNAE da empresa de referência.';

      case 'NICHO_CORRELATO':
        return 'A empresa possui atividade pertencente à mesma divisão CNAE da empresa de referência.';

      default:
        return 'Não foi identificada proximidade relevante entre os CNAEs das empresas.';
    }
  }
}