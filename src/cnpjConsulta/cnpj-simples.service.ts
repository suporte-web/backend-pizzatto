import { Injectable, Logger } from '@nestjs/common';

export type StatusVerificacaoSimples =
  | 'INDICADO_POR_API'
  | 'DIVERGENCIA_ENTRE_FONTES'
  | 'NAO_IDENTIFICADO'
  | 'CONFIRMADO_PORTAL_OFICIAL';

export interface ResultadoSimples {
  optanteSimples: boolean | null;
  optanteMei: boolean | null;
  dataOpcaoSimples: string | null;
  dataExclusaoSimples: string | null;
  fonte: string | null;
  verificacao: StatusVerificacaoSimples;
  consultadoEm: string;
  fontesConsultadas: Array<{
    fonte: string;
    optanteSimples: boolean | null;
    optanteMei: boolean | null;
    erro?: string;
    atualizadoEm?: string | null;
  }>;
  requerConfirmacaoOficial: boolean;
  portalOficial: string;
}

interface FonteSimples {
  fonte: string;
  optanteSimples: boolean | null;
  optanteMei: boolean | null;
  dataOpcaoSimples: string | null;
  dataExclusaoSimples: string | null;
  atualizadoEm?: string | null;
}

@Injectable()
export class CnpjSimplesService {
  private readonly logger = new Logger(CnpjSimplesService.name);

  private readonly portalOficial =
    'https://www8.receita.fazenda.gov.br/SimplesNacional/';

  private readonly timeoutMs = 12000;

  private booleano(valor: unknown): boolean | null {
    if (typeof valor === 'boolean') return valor;
    if (valor === 1 || valor === '1') return true;
    if (valor === 0 || valor === '0') return false;

    if (typeof valor === 'string') {
      const texto = valor.trim().toUpperCase();

      if (['SIM', 'TRUE', 'S'].includes(texto)) return true;
      if (['NAO', 'NÃO', 'FALSE', 'N'].includes(texto)) {
        return false;
      }
    }

    return null;
  }

  private data(valor: unknown): string | null {
    if (typeof valor !== 'string') return null;

    const texto = valor.trim();

    return texto || null;
  }

  private extrair(fonte: string, dados: Record<string, any>): FonteSimples {
    return {
      fonte,
      optanteSimples: this.booleano(dados.opcao_pelo_simples),
      optanteMei: this.booleano(dados.opcao_pelo_mei),
      dataOpcaoSimples: this.data(dados.data_opcao_pelo_simples),
      dataExclusaoSimples: this.data(dados.data_exclusao_do_simples),
    };
  }

  private async buscarJson(url: string): Promise<any> {
    const resposta = await fetch(url, {
      headers: {
        Accept: 'application/json',
      },
      signal: AbortSignal.timeout(this.timeoutMs),
    });

    if (!resposta.ok) {
      if (resposta.status === 429) {
        throw new Error('Limite de consultas atingido (HTTP 429).');
      }

      throw new Error(`HTTP ${resposta.status}`);
    }

    return resposta.json();
  }

  private validarCnpjRetornado(recebido: unknown, esperado: string): void {
    const normalizado = String(recebido ?? '').replace(/\D/g, '');

    if (normalizado !== esperado) {
      throw new Error('CNPJ divergente na resposta da API.');
    }
  }

  private async consultarCnpjWs(cnpj: string): Promise<FonteSimples> {
    const dados = await this.buscarJson(`https://publica.cnpj.ws/cnpj/${cnpj}`);

    this.validarCnpjRetornado(dados?.estabelecimento?.cnpj, cnpj);

    const simples = dados?.empresa?.simples ?? {};

    return this.extrair('CNPJ.ws', {
      opcao_pelo_simples: simples.simples ?? dados.opcao_pelo_simples,
      opcao_pelo_mei: simples.mei ?? dados.opcao_pelo_mei,
      data_opcao_pelo_simples:
        simples.data_opcao_simples ?? dados.data_opcao_pelo_simples,
      data_exclusao_do_simples:
        simples.data_exclusao_simples ?? dados.data_exclusao_do_simples,
    });
  }

  private async consultarCnpja(cnpj: string): Promise<FonteSimples> {
    const dados = await this.buscarJson(
      `https://open.cnpja.com/office/${cnpj}`,
    );

    this.validarCnpjRetornado(dados?.taxId, cnpj);

    const simples = dados?.company?.simples;
    const simei = dados?.company?.simei;

    return {
      fonte: 'CNPJá',
      optanteSimples: this.booleano(simples?.optant),
      optanteMei: this.booleano(simei?.optant),
      dataOpcaoSimples: this.data(simples?.since),
      dataExclusaoSimples: null,
      atualizadoEm: this.data(dados?.updated),
    };
  }

  async consultar(
    cnpj: string,
    dadosCadastrais: Record<string, any>,
    fonteCadastral: string,
    dadosMinhaReceita?: Record<string, any> | null,
  ): Promise<ResultadoSimples> {
    const cnpjLimpo = String(cnpj ?? '').replace(/\D/g, '');

    if (!/^\d{14}$/.test(cnpjLimpo)) {
      throw new Error('CNPJ deve conter 14 dígitos.');
    }

    const resultados: FonteSimples[] = [];
    const fontesConsultadas: ResultadoSimples['fontesConsultadas'] = [];

    const adicionarResultado = (resultado: FonteSimples) => {
      resultados.push(resultado);

      fontesConsultadas.push({
        fonte: resultado.fonte,
        optanteSimples: resultado.optanteSimples,
        optanteMei: resultado.optanteMei,
        atualizadoEm: resultado.atualizadoEm ?? null,
      });
    };

    const adicionarErro = (fonte: string, error: unknown) => {
      const mensagem =
        error instanceof Error ? error.message : 'Consulta indisponível';

      this.logger.warn(`${fonte}: ${mensagem}`);

      fontesConsultadas.push({
        fonte,
        optanteSimples: null,
        optanteMei: null,
        erro: mensagem,
      });
    };

    const fonteNormalizada = (fonteCadastral ?? '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase();

    const principal = this.extrair(fonteCadastral, dadosCadastrais ?? {});

    adicionarResultado(principal);

    // Adiciona Minha Receita como fonte independente,
    // evitando duplicidade quando ela já é a fonte principal.
    const fontePrincipalMinhaReceita =
      fonteNormalizada.includes('minha receita') ||
      fonteNormalizada.includes('minhareceita');

    if (
      !fontePrincipalMinhaReceita &&
      dadosMinhaReceita &&
      typeof dadosMinhaReceita === 'object'
    ) {
      const resultadoMinhaReceita = this.extrair(
        'Minha Receita',
        dadosMinhaReceita,
      );

      adicionarResultado(resultadoMinhaReceita);
    }

    const consultas: Array<{
      fonte: string;
      executar: () => Promise<FonteSimples>;
    }> = [];

    if (!fonteNormalizada.includes('cnpj.ws')) {
      consultas.push({
        fonte: 'CNPJ.ws',
        executar: () => this.consultarCnpjWs(cnpjLimpo),
      });
    }

    if (!fonteNormalizada.includes('cnpja')) {
      consultas.push({
        fonte: 'CNPJá',
        executar: () => this.consultarCnpja(cnpjLimpo),
      });
    }

    // Executa as fontes complementares independentemente.
    // Uma falha não impede o aproveitamento das demais.
    const respostas = await Promise.allSettled(
      consultas.map((consulta) => consulta.executar()),
    );

    respostas.forEach((resposta, indice) => {
      if (resposta.status === 'fulfilled') {
        adicionarResultado(resposta.value);
      } else {
        adicionarErro(consultas[indice].fonte, resposta.reason);
      }
    });

    const valores = (campo: 'optanteSimples' | 'optanteMei'): boolean[] =>
      resultados
        .map((resultado) => resultado[campo])
        .filter((valor): valor is boolean => valor !== null);

    const existeDivergencia = (
      campo: 'optanteSimples' | 'optanteMei',
    ): boolean => new Set(valores(campo)).size > 1;

    const obterValor = (
      campo: 'optanteSimples' | 'optanteMei',
    ): boolean | null => {
      const encontrados = valores(campo);

      return encontrados.length > 0 ? encontrados[0] : null;
    };

    const simplesInformado = obterValor('optanteSimples');
    const meiInformado = obterValor('optanteMei');

    const divergenciaEntreFontes =
      existeDivergencia('optanteSimples') || existeDivergencia('optanteMei');

    const inconsistenciaTributaria =
      meiInformado === true && simplesInformado === false;

    const divergencia = divergenciaEntreFontes || inconsistenciaTributaria;

    const optanteSimples = divergencia ? null : simplesInformado;

    const optanteMei = divergencia ? null : meiInformado;

    const fontesComDados = resultados.filter(
      (resultado) =>
        resultado.optanteSimples !== null || resultado.optanteMei !== null,
    );

    const obterData = (
      campo: 'dataOpcaoSimples' | 'dataExclusaoSimples',
    ): string | null => {
      if (divergencia) return null;

      // Não mistura datas de fontes que discordam sobre
      // a situação atual do Simples.
      const candidatas = resultados.filter(
        (resultado) =>
          resultado[campo] !== null &&
          (resultado.optanteSimples === optanteSimples ||
            resultado.optanteSimples === null),
      );

      const datas = [
        ...new Set(
          candidatas
            .map((resultado) => resultado[campo])
            .filter((data): data is string => data !== null),
        ),
      ];

      // Datas conflitantes exigem verificação.
      return datas.length === 1 ? datas[0] : null;
    };

    const verificacao: StatusVerificacaoSimples = divergencia
      ? 'DIVERGENCIA_ENTRE_FONTES'
      : fontesComDados.length > 0
        ? 'INDICADO_POR_API'
        : 'NAO_IDENTIFICADO';

    return {
      optanteSimples,
      optanteMei,
      dataOpcaoSimples: obterData('dataOpcaoSimples'),
      dataExclusaoSimples: obterData('dataExclusaoSimples'),
      fonte: divergencia
        ? null
        : fontesComDados.length > 0
          ? [
              ...new Set(fontesComDados.map((resultado) => resultado.fonte)),
            ].join(', ')
          : null,
      verificacao,
      consultadoEm: new Date().toISOString(),
      fontesConsultadas,
      requerConfirmacaoOficial: true,
      portalOficial: this.portalOficial,
    };
  }
}
