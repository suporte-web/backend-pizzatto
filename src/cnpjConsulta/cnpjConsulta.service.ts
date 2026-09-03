import { PrismaService } from '@/prisma/prisma.service';
import {
  BadRequestException,
  HttpException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { unlink } from 'fs/promises';

import { Response } from 'express';
import * as fs from 'fs';
import * as path from 'path';

import { CnpjNichoValidator } from './validators/cnpj-nicho.validator';
import { RegimeTributarioCnpj } from '../../generated/prisma/enums';

export type FonteStatus =
  | 'SUCESSO'
  | 'INDISPONIVEL'
  | 'NAO_CONFIGURADA'
  | 'ERRO';

export interface ResultadoFonte<T = unknown> {
  status: FonteStatus;
  fonte: string;
  consultadoEm: string;
  dados: T | null;
  erro?: string;
}

export interface ConsultaCnpjAgregada {
  cnpj: string;
  data: Record<string, any>;
  consultas: {
    receita: ResultadoFonte<Record<string, any>>;
    simples: ResultadoFonte<Record<string, any>>;
    reclameAqui: ResultadoFonte<Record<string, any>>;
    datajud: ResultadoFonte<Record<string, any>>;
    certidaoFederal: ResultadoFonte<Record<string, any>>;
    certidaoEstadual: ResultadoFonte<Record<string, any>>;
  };
  consultadoEm: string;
}

interface PortalCertidaoEstadual {
  uf: string;
  nome: string;
  portalOficial: string;
  consultaAutomatica: boolean;
  requerCaptcha?: boolean;
  observacao?: string;
}

@Injectable()
export class CnpjConsultaService {
  constructor(private readonly prisma: PrismaService) {}

  private limparCnpj(cnpj: unknown): string {
    return String(cnpj ?? '').replace(/\D/g, '');
  }

  private validarCnpj(cnpj: string): boolean {
    const numero = this.limparCnpj(cnpj);

    if (numero.length !== 14 || /^(\d)\1{13}$/.test(numero)) {
      return false;
    }

    const calcularDigito = (base: string, pesos: number[]) => {
      const soma = base
        .split('')
        .reduce(
          (total, numeroAtual, index) =>
            total + Number(numeroAtual) * pesos[index],
          0,
        );

      const resto = soma % 11;

      return resto < 2 ? 0 : 11 - resto;
    };

    const primeiroDigito = calcularDigito(
      numero.slice(0, 12),
      [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2],
    );

    const segundoDigito = calcularDigito(
      `${numero.slice(0, 12)}${primeiroDigito}`,
      [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2],
    );

    return numero.endsWith(`${primeiroDigito}${segundoDigito}`);
  }

  private converterData(
    valor: string | Date | null | undefined,
    nomeCampo: string,
  ): Date | null | undefined {
    if (valor === undefined) {
      return undefined;
    }

    if (valor === null || valor === '') {
      return null;
    }

    if (valor instanceof Date) {
      if (Number.isNaN(valor.getTime())) {
        throw new BadRequestException(`${nomeCampo} é inválida.`);
      }

      return valor;
    }

    const texto = String(valor).trim();

    let data: Date;

    // Aceita datas no formato brasileiro: DD/MM/AAAA
    const dataBrasileira = texto.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);

    if (dataBrasileira) {
      const [, dia, mes, ano] = dataBrasileira;

      data = new Date(Date.UTC(Number(ano), Number(mes) - 1, Number(dia)));
    } else {
      data = new Date(texto);
    }

    if (Number.isNaN(data.getTime())) {
      throw new BadRequestException(`${nomeCampo} é inválida.`);
    }

    return data;
  }

  private validarPontuacao(pontuacao: unknown): number {
    const numero = Number(pontuacao ?? 0);

    if (!Number.isInteger(numero) || numero < 0 || numero > 100) {
      throw new BadRequestException(
        'A pontuação deve ser um número inteiro entre 0 e 100.',
      );
    }

    return numero;
  }

  private validarClassificacaoNicho(
    classificacao: unknown,
  ):
    | 'MESMO_NICHO'
    | 'NICHO_PARECIDO'
    | 'NICHO_CORRELATO'
    | 'NICHO_DIFERENTE'
    | null {
    if (
      classificacao === null ||
      classificacao === undefined ||
      classificacao === ''
    ) {
      return null;
    }

    const valor = String(classificacao).trim().toUpperCase();

    const permitidos = [
      'MESMO_NICHO',
      'NICHO_PARECIDO',
      'NICHO_CORRELATO',
      'NICHO_DIFERENTE',
    ] as const;

    if (!permitidos.includes(valor as any)) {
      throw new BadRequestException(
        'A classificação de nicho informada é inválida.',
      );
    }

    return valor as (typeof permitidos)[number];
  }

  private validarTipoCertidao(
    tipo: unknown,
  ): 'FEDERAL' | 'ESTADUAL' | 'MUNICIPAL' {
    const valor = String(tipo ?? '')
      .trim()
      .toUpperCase();

    const permitidos = ['FEDERAL', 'ESTADUAL', 'MUNICIPAL'] as const;

    if (!permitidos.includes(valor as any)) {
      throw new BadRequestException('O tipo da certidão informado é inválido.');
    }

    return valor as (typeof permitidos)[number];
  }

  private textoNullable(valor: unknown): string | null {
    if (valor === null || valor === undefined) {
      return null;
    }

    const texto = String(valor).trim();

    return texto || null;
  }

  private booleanNullable(valor: unknown): boolean | null {
    if (valor === null || valor === undefined || valor === '') {
      return null;
    }

    if (typeof valor === 'boolean') {
      return valor;
    }

    const texto = String(valor).trim().toUpperCase();

    if (['TRUE', '1', 'SIM', 'S'].includes(texto)) {
      return true;
    }

    if (['FALSE', '0', 'NÃO', 'NAO', 'N'].includes(texto)) {
      return false;
    }

    return null;
  }

  private decimalNullable(valor: unknown): string | null {
    if (valor === null || valor === undefined || valor === '') {
      return null;
    }

    if (typeof valor === 'number') {
      return Number.isFinite(valor) ? String(valor) : null;
    }

    const texto = String(valor)
      .trim()
      .replace(/^R\$\s*/i, '')
      .replace(/\s/g, '');

    if (!texto) {
      return null;
    }

    let normalizado = texto;

    if (texto.includes(',') && texto.includes('.')) {
      normalizado = texto.replace(/\./g, '').replace(',', '.');
    } else if (texto.includes(',')) {
      normalizado = texto.replace(',', '.');
    }

    const numero = Number(normalizado);

    return Number.isFinite(numero) ? String(numero) : null;
  }

  private normalizarConsulta(registro: any) {
    if (!registro) {
      return registro;
    }

    const { CnpjDadosConsultados, CnpjCertidao, ...consulta } = registro;

    if (!CnpjDadosConsultados) {
      return {
        ...consulta,
        dados: null,
        certidoes: CnpjCertidao ?? [],
      };
    }

    const { CnpjCnaeSecundario, CnpjSocio, ...dados } = CnpjDadosConsultados;

    return {
      ...consulta,

      dados: {
        ...dados,
        cnaesSecundarios: CnpjCnaeSecundario ?? [],
        socios: CnpjSocio ?? [],
      },

      certidoes: CnpjCertidao ?? [],
    };
  }

  private getIncludeCompleto() {
    return {
      CnpjDadosConsultados: {
        include: {
          CnpjCnaeSecundario: true,
          CnpjSocio: true,
        },
      },
      CnpjCertidao: true,
    } as const;
  }

  private async removerArquivos(
    arquivos: Express.Multer.File[],
  ): Promise<void> {
    await Promise.allSettled(
      arquivos
        .filter((arquivo) => Boolean(arquivo?.path))
        .map((arquivo) => unlink(arquivo.path)),
    );
  }

  private resultadoFonte<T>(
    fonte: string,
    status: FonteStatus,
    dados: T | null,
    erro?: string,
  ): ResultadoFonte<T> {
    return {
      status,
      fonte,
      consultadoEm: new Date().toISOString(),
      dados,
      ...(erro ? { erro } : {}),
    };
  }

  // private preencherTemplateUrl(template: string, cnpj: string): string {
  //   return template.replace(/\{cnpj\}/gi, encodeURIComponent(cnpj));
  // }

  private async fetchJson(
    url: string,
    options: RequestInit = {},
    timeoutMs = 20000,
  ): Promise<any> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(url, {
        ...options,
        headers: {
          Accept: 'application/json',
          'User-Agent': 'Pizzatto-CNPJ-Consulta/2.0',
          ...(options.headers ?? {}),
        },
        signal: controller.signal,
      });

      const responseText = await response.text();
      let responseBody: any = null;

      try {
        responseBody = responseText ? JSON.parse(responseText) : null;
      } catch {
        responseBody = responseText ? { raw: responseText } : null;
      }

      if (!response.ok) {
        const mensagem =
          responseBody?.message ??
          responseBody?.error_description ??
          responseBody?.error ??
          `A fonte externa respondeu com HTTP ${response.status}.`;

        const error: any = new Error(mensagem);
        error.status = response.status;
        error.responseBody = responseBody;
        throw error;
      }

      return responseBody;
    } catch (error: any) {
      if (error?.name === 'AbortError' || error?.code === 'ABORT_ERR') {
        const timeoutError: any = new Error(
          `A consulta excedeu o tempo limite de ${Math.round(timeoutMs / 1000)} segundos.`,
        );
        timeoutError.code = 'EXTERNAL_TIMEOUT';
        throw timeoutError;
      }

      throw error;
    } finally {
      clearTimeout(timeout);
    }
  }

  private async consultarReceita(
    cnpj: string,
  ): Promise<ResultadoFonte<Record<string, any>>> {
    try {
      const url = `https://brasilapi.com.br/api/cnpj/v1/${cnpj}`;
      const dados = await this.fetchJson(url);

      if (!dados?.razao_social) {
        return this.resultadoFonte<Record<string, any>>(
          'BrasilAPI / Receita Federal',
          'ERRO',
          null,
          'A fonte respondeu sem a razão social.',
        );
      }

      const simplesStatus =
        dados.opcao_pelo_simples === true
          ? 'SIM'
          : dados.opcao_pelo_simples === false
            ? 'NÃO'
            : 'NÃO INFORMADO';

      return this.resultadoFonte('BrasilAPI / Receita Federal', 'SUCESSO', {
        ...dados,
        simplesStatus,
        ie: dados.ie ?? null,
      });
    } catch (error: any) {
      const status = Number(error?.status);

      if (status === 404) {
        throw new NotFoundException('CNPJ não encontrado na base consultada.');
      }

      if (status === 400) {
        throw new BadRequestException(
          error?.message || 'O CNPJ informado é inválido.',
        );
      }

      return this.resultadoFonte<Record<string, any>>(
        'BrasilAPI / Receita Federal',
        status === 429 || status >= 500 ? 'INDISPONIVEL' : 'ERRO',
        null,
        error?.message || 'Não foi possível consultar os dados cadastrais.',
      );
    }
  }

  private consultarSimples(
    receita: ResultadoFonte<Record<string, any>>,
  ): ResultadoFonte<Record<string, any>> {
    if (receita.status !== 'SUCESSO' || !receita.dados) {
      return this.resultadoFonte<Record<string, any>>(
        'BrasilAPI / dados do Simples Nacional',
        'INDISPONIVEL',
        null,
        'Os dados dependem do retorno da consulta cadastral.',
      );
    }

    return this.resultadoFonte(
      'BrasilAPI / dados do Simples Nacional',
      'SUCESSO',
      {
        optanteSimples: receita.dados.opcao_pelo_simples ?? null,
        optanteMei: receita.dados.opcao_pelo_mei ?? null,
        dataOpcaoSimples: receita.dados.data_opcao_pelo_simples ?? null,
        dataExclusaoSimples: receita.dados.data_exclusao_do_simples ?? null,
        dataOpcaoMei: receita.dados.data_opcao_pelo_mei ?? null,
        dataExclusaoMei: receita.dados.data_exclusao_do_mei ?? null,
        observacao:
          'Consulta derivada da fonte cadastral. Não substitui o comprovante oficial do portal do Simples Nacional.',
      },
    );
  }

  private obterListaDataHub(resposta: any): any[] {
    if (Array.isArray(resposta)) {
      return resposta;
    }

    if (Array.isArray(resposta?.data)) {
      return resposta.data;
    }

    if (Array.isArray(resposta?.result)) {
      return resposta.result;
    }

    if (Array.isArray(resposta?.results)) {
      return resposta.results;
    }

    if (Array.isArray(resposta?.items)) {
      return resposta.items;
    }

    return [];
  }

  private obterCompanyIdDataHub(empresa: any): string | null {
    const valor =
      empresa?.company_id ?? empresa?.companyId ?? empresa?.id ?? null;

    if (valor === null || valor === undefined) {
      return null;
    }

    const companyId = String(valor).trim();

    return companyId || null;
  }

  private async consultarReclameAqui(
    cnpj: string,
  ): Promise<ResultadoFonte<Record<string, any>>> {
    const fonte = 'Reclame AQUI Data Hub';

    const apiKey = String(
      process.env.RECLAME_AQUI_DATAHUB_API_KEY ?? '',
    ).trim();

    const baseUrl = String(
      process.env.RECLAME_AQUI_DATAHUB_URL ??
        'https://api-reputacao.obviobrasil.com.br',
    )
      .trim()
      .replace(/\/$/, '');

    if (!apiKey) {
      return this.resultadoFonte<Record<string, any>>(
        fonte,
        'NAO_CONFIGURADA',
        null,
        'Configure RECLAME_AQUI_DATAHUB_API_KEY.',
      );
    }

    const cnpjLimpo = this.limparCnpj(cnpj);

    try {
      /*
       * 1. Localiza a(s) página(s) da empresa pelo CNPJ.
       *
       * Documentação:
       * GET /api/v1/company/{FILTRO}
       */
      const respostaEmpresas = await this.fetchJson(
        `${baseUrl}/api/v1/company/${encodeURIComponent(
          cnpjLimpo,
        )}?page=1&pageSize=100`,
        {
          headers: {
            Authentication: apiKey,
          },
        },
      );

      const empresas = this.obterListaDataHub(respostaEmpresas);

      if (empresas.length === 0) {
        return this.resultadoFonte<Record<string, any>>(fonte, 'SUCESSO', {
          encontrado: false,
          cnpj: cnpjLimpo,
          paginasEncontradas: 0,
          reputacoes: [],
        });
      }

      /*
       * Um mesmo CNPJ pode possuir mais de uma página
       * no Reclame AQUI.
       */
      const paginas = empresas
        .map((empresa: any) => ({
          companyId: this.obterCompanyIdDataHub(empresa),

          cnpj: empresa?.cnpj ?? empresa?.document ?? null,

          nome:
            empresa?.nome_empresa ??
            empresa?.name ??
            empresa?.company_name ??
            null,

          nomeFantasia: empresa?.nome_fantasia ?? empresa?.trade_name ?? null,

          shortName: empresa?.short_name ?? empresa?.shortName ?? null,

          respostaOriginal: empresa,
        }))
        .filter((empresa: any) => Boolean(empresa.companyId));

      const companyIds = [
        ...new Set(
          paginas
            .map((pagina: any) => String(pagina.companyId))
            .filter(Boolean),
        ),
      ];

      if (companyIds.length === 0) {
        return this.resultadoFonte<Record<string, any>>(
          fonte,
          'ERRO',
          {
            encontrado: true,
            cnpj: cnpjLimpo,
            paginasEncontradas: empresas.length,
            paginas,
          },
          'O Reclame AQUI encontrou a empresa, mas não retornou nenhum company_id.',
        );
      }

      /*
       * 2. Consulta a reputação.
       *
       * "365" = últimos 365 dias.
       *
       * Outros intervalos documentados:
       * 180
       * 365
       * last_year
       * current_year
       * YYYY-MM
       */
      const respostaReputacao = await this.fetchJson(
        `${baseUrl}/api/v1/reputation?page=1&pageSize=100`,
        {
          method: 'POST',

          headers: {
            Authentication: apiKey,
            'Content-Type': 'application/json',
          },

          body: JSON.stringify({
            interval: process.env.RECLAME_AQUI_DATAHUB_INTERVAL ?? '365',

            companyId: companyIds,
          }),
        },
        30000,
      );

      const reputacoes = this.obterListaDataHub(respostaReputacao);

      const reputacoesNormalizadas = reputacoes.map((item: any) => ({
        companyId: item?.company_id ?? item?.companyId ?? null,

        cnpj: item?.cnpj ?? cnpjLimpo,

        nome: item?.nome_empresa ?? null,

        nomeFantasia: item?.nome_fantasia ?? null,

        indiceReputacao: item?.indice_reputacao ?? null,

        notaMediaConsumidores: item?.nota_media_consumidores ?? null,

        percentualResolvidas: item?.percent_reclamacao_resolvida ?? null,

        percentualRespondidas: item?.percent_reclamacao_respondida ?? null,

        percentualVoltariaFazerNegocio:
          item?.percent_voltaria_fazer_negocio ?? null,

        reclamacoesRecebidas: item?.volume_reclamacao_recebida ?? null,

        reclamacoesAvaliadas: item?.volume_reclamacao_avaliadas ?? null,

        aguardandoResposta:
          item?.volume_reclamacoes_aguardando_resposta ?? null,

        tempoMedioRespostaDias: item?.tempo_medio_respostas_dias ?? null,

        tempoMedioResolucaoDias: item?.tempo_medio_resolucao_dias ?? null,

        segmento: item?.segmento ?? null,

        subsegmento: item?.subsegmento ?? null,

        porte: item?.porte ?? null,

        seloRav: item?.selo_verificacao_rav ?? null,

        ra1000SeisMeses: item?.ra1000_seis_meses ?? null,

        ra1000DozeMeses: item?.ra1000_doze_meses ?? null,

        periodoExtracao: item?.periodo_extracao ?? null,

        dataExtracao: item?.data_extracao ?? null,

        topProblemas: item?.top_3_diderot_problema ?? null,
      }));

      return this.resultadoFonte<Record<string, any>>(fonte, 'SUCESSO', {
        encontrado: true,

        cnpj: cnpjLimpo,

        paginasEncontradas: paginas.length,

        paginas,

        intervalo: process.env.RECLAME_AQUI_DATAHUB_INTERVAL ?? '365',

        reputacoes: reputacoesNormalizadas,

        /*
         * Facilita o frontend quando existe apenas
         * uma página associada ao CNPJ.
         */
        reputacao:
          reputacoesNormalizadas.length === 1
            ? reputacoesNormalizadas[0]
            : null,
      });
    } catch (error: any) {
      const status = Number(error?.status);

      console.error('[Reclame AQUI Data Hub] Erro', {
        cnpj: cnpjLimpo,
        status,
        message: error?.message,
        responseBody: error?.responseBody ?? null,
      });

      if (status === 401 || status === 403) {
        return this.resultadoFonte<Record<string, any>>(
          fonte,
          'ERRO',
          null,
          'A APIKey do Reclame AQUI Data Hub foi recusada ou não possui permissão para esta operação.',
        );
      }

      if (status === 404) {
        return this.resultadoFonte<Record<string, any>>(fonte, 'SUCESSO', {
          encontrado: false,
          cnpj: cnpjLimpo,
          paginasEncontradas: 0,
          reputacoes: [],
        });
      }

      if (
        status === 429 ||
        status >= 500 ||
        error?.code === 'EXTERNAL_TIMEOUT'
      ) {
        return this.resultadoFonte<Record<string, any>>(
          fonte,
          'INDISPONIVEL',
          null,
          error?.message ||
            'O Reclame AQUI Data Hub está temporariamente indisponível.',
        );
      }

      return this.resultadoFonte<Record<string, any>>(
        fonte,
        'ERRO',
        null,
        error?.message || 'Não foi possível consultar o Reclame AQUI Data Hub.',
      );
    }
  }

  private obterProcessosDatajudConfigurados(
    cnpj: string,
  ): Array<{ numero: string; alias: string }> {
    const configuracao = process.env.DATAJUD_PROCESSOS_POR_CNPJ;

    if (!configuracao) {
      return [];
    }

    try {
      const mapa = JSON.parse(configuracao) as Record<
        string,
        Array<string | { numero?: string; alias?: string }>
      >;

      const itens = mapa[cnpj] ?? [];

      return itens
        .map((item) => {
          if (typeof item === 'string') {
            return { numero: item.replace(/\D/g, ''), alias: '' };
          }

          return {
            numero: String(item?.numero ?? '').replace(/\D/g, ''),
            alias: String(item?.alias ?? '').trim(),
          };
        })
        .filter((item) => item.numero.length === 20 && item.alias);
    } catch {
      return [];
    }
  }

  private classificarSituacaoDatajud(processo: any) {
    const movimentos = Array.isArray(processo?.movimentos)
      ? [...processo.movimentos]
      : [];

    movimentos.sort(
      (a: any, b: any) =>
        new Date(b?.dataHora ?? 0).getTime() -
        new Date(a?.dataHora ?? 0).getTime(),
    );

    const ultimoMovimento = movimentos[0] ?? null;
    const nome = String(ultimoMovimento?.nome ?? '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toUpperCase();

    const encerrado = [
      'BAIXA DEFINITIVA',
      'ARQUIVAMENTO DEFINITIVO',
      'PROCESSO BAIXADO',
    ].some((termo) => nome.includes(termo));

    return {
      situacaoInferida: encerrado
        ? 'BAIXADO'
        : movimentos.length
          ? 'PROVAVELMENTE_ATIVO'
          : 'INDETERMINADO',
      ultimoMovimento: ultimoMovimento
        ? {
            codigo: ultimoMovimento.codigo ?? null,
            nome: ultimoMovimento.nome ?? null,
            dataHora: ultimoMovimento.dataHora ?? null,
          }
        : null,
    };
  }

  private identificarRegimeTributario(
    receita: ResultadoFonte<Record<string, any>>,
  ): RegimeTributarioCnpj {
    if (receita.status !== 'SUCESSO' || !receita.dados) {
      return RegimeTributarioCnpj.NAO_IDENTIFICADO;
    }

    const dados = receita.dados;

    // 1. MEI
    if (dados.opcao_pelo_mei === true) {
      return RegimeTributarioCnpj.MEI;
    }

    // 2. Simples Nacional
    if (dados.opcao_pelo_simples === true) {
      return RegimeTributarioCnpj.SIMPLES_NACIONAL;
    }

    // 3. Lucro Real / Presumido / Arbitrado
    if (
      Array.isArray(dados.regime_tributario) &&
      dados.regime_tributario.length > 0
    ) {
      const regimesValidos = dados.regime_tributario
        .filter((item: any) => item && item.ano && item.forma_de_tributacao)
        .sort((a: any, b: any) => Number(b.ano) - Number(a.ano));

      const regimeMaisRecente = regimesValidos[0];

      if (regimeMaisRecente) {
        const formaTributacao = String(regimeMaisRecente.forma_de_tributacao)
          .trim()
          .toUpperCase();

        switch (formaTributacao) {
          case 'LUCRO REAL':
            return RegimeTributarioCnpj.LUCRO_REAL;

          case 'LUCRO PRESUMIDO':
            return RegimeTributarioCnpj.LUCRO_PRESUMIDO;

          case 'LUCRO ARBITRADO':
            return RegimeTributarioCnpj.LUCRO_ARBITRADO;
        }
      }
    }

    return RegimeTributarioCnpj.NAO_IDENTIFICADO;
  }

  private validarRegimeTributario(valor: unknown): RegimeTributarioCnpj {
    if (!valor) {
      return RegimeTributarioCnpj.NAO_IDENTIFICADO;
    }

    const regime = String(valor).trim().toUpperCase();

    const permitidos = Object.values(RegimeTributarioCnpj);

    if (!permitidos.includes(regime as RegimeTributarioCnpj)) {
      throw new BadRequestException(
        'O regime tributário informado é inválido.',
      );
    }

    return regime as RegimeTributarioCnpj;
  }

  private async consultarProcessoDatajud(numero: string, alias: string) {
    const apiKey = process.env.DATAJUD_API_KEY;

    if (!apiKey) {
      throw new Error(
        'Configure DATAJUD_API_KEY com a chave pública vigente do CNJ.',
      );
    }

    const baseUrl =
      process.env.DATAJUD_BASE_URL ?? 'https://api-publica.datajud.cnj.jus.br';

    const url = `${baseUrl.replace(/\/$/, '')}/${alias}/_search`;

    const resposta = await this.fetchJson(
      url,
      {
        method: 'POST',
        headers: {
          Authorization: `APIKey ${process.env.DATAJUD_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          size: 1,
          query: {
            term: {
              numeroProcesso: numero,
            },
          },
        }),
      },
      30000,
    );

    return resposta?.hits?.hits?.[0]?._source ?? null;
  }

  private async consultarDatajud(
    cnpj: string,
  ): Promise<ResultadoFonte<Record<string, any>>> {
    const processosConfigurados = this.obterProcessosDatajudConfigurados(cnpj);

    if (!process.env.DATAJUD_API_KEY) {
      return this.resultadoFonte<Record<string, any>>(
        'CNJ DataJud API Pública',
        'NAO_CONFIGURADA',
        null,
        'Configure DATAJUD_API_KEY com a chave pública vigente do CNJ.',
      );
    }

    if (processosConfigurados.length === 0) {
      return this.resultadoFonte<Record<string, any>>(
        'CNJ DataJud API Pública',
        'NAO_CONFIGURADA',
        null,
        'A API pública não pesquisa por CNPJ. Configure DATAJUD_PROCESSOS_POR_CNPJ com números processuais e aliases para o teste.',
      );
    }

    try {
      const resultados = await Promise.allSettled(
        processosConfigurados.map(async ({ numero, alias }) => {
          const processo = await this.consultarProcessoDatajud(numero, alias);

          if (!processo) {
            return {
              numeroProcesso: numero,
              alias,
              encontrado: false,
              situacaoInferida: 'INDETERMINADO',
            };
          }

          const situacao = this.classificarSituacaoDatajud(processo);

          return {
            encontrado: true,
            alias,
            numeroProcesso: processo.numeroProcesso ?? numero,
            tribunal: processo.tribunal ?? null,
            grau: processo.grau ?? null,
            dataAjuizamento: processo.dataAjuizamento ?? null,
            classe: processo.classe ?? null,
            assuntos: processo.assuntos ?? [],
            orgaoJulgador: processo.orgaoJulgador ?? null,
            dataHoraUltimaAtualizacao:
              processo.dataHoraUltimaAtualizacao ?? null,
            ...situacao,
          };
        }),
      );

      const processos = resultados.map((resultado, index) => {
        if (resultado.status === 'fulfilled') {
          return resultado.value;
        }

        return {
          numeroProcesso: processosConfigurados[index]?.numero ?? null,
          alias: processosConfigurados[index]?.alias ?? null,
          encontrado: false,
          situacaoInferida: 'INDETERMINADO',
          erro: resultado.reason?.message ?? 'Falha na consulta do processo.',
        };
      });

      const encontrados = processos.filter((processo) => processo.encontrado);
      const provavelmenteAtivos = encontrados.filter(
        (processo) => processo.situacaoInferida === 'PROVAVELMENTE_ATIVO',
      );
      const baixados = encontrados.filter(
        (processo) => processo.situacaoInferida === 'BAIXADO',
      );
      const indeterminados = processos.filter(
        (processo) => processo.situacaoInferida === 'INDETERMINADO',
      );

      return this.resultadoFonte<Record<string, any>>(
        'CNJ DataJud API Pública',
        'SUCESSO',
        {
          totalConfigurados: processosConfigurados.length,
          totalEncontrados: encontrados.length,
          processosProvavelmenteAtivos: provavelmenteAtivos.length,
          processosBaixados: baixados.length,
          processosIndeterminados: indeterminados.length,
          processos,
          observacao:
            'A situação é inferida pela movimentação mais recente. A API pública não fornece um campo padronizado de processo aberto nem permite pesquisa direta por CNPJ.',
        },
      );
    } catch (error: any) {
      return this.resultadoFonte<Record<string, any>>(
        'CNJ DataJud API Pública',
        Number(error?.status) >= 500 ? 'INDISPONIVEL' : 'ERRO',
        null,
        error?.message || 'Não foi possível consultar o DataJud.',
      );
    }
  }

  private consultarCertidaoFederal(
    cnpj: string,
  ): ResultadoFonte<Record<string, any>> {
    const cnpjLimpo = this.limparCnpj(cnpj);

    return this.consultarCertidaoFederalManual(cnpjLimpo);
  }

  private consultarCertidaoFederalManual(
    cnpj: string,
  ): ResultadoFonte<Record<string, any>> {
    return this.resultadoFonte('Receita Federal / PGFN', 'SUCESSO', {
      cnpj,

      provedor: 'MANUAL',

      consultaAutomatica: false,

      documentoDisponivel: false,

      requerInteracaoUsuario: true,

      situacao: 'CONSULTA_MANUAL',

      observacao:
        'Não há provedor automático de Certidão Federal configurado. A emissão deve ser realizada manualmente no portal oficial.',

      portalOficial:
        'https://www.gov.br/pt-br/servicos/emitir-certidao-de-regularidade-fiscal',
    });
  }

  private obterPortalCertidaoEstadual(
    uf: string,
  ): PortalCertidaoEstadual | null {
    const ufNormalizada = String(uf ?? '')
      .trim()
      .toUpperCase();

    const portais: Record<string, PortalCertidaoEstadual> = {
      AC: {
        uf: 'AC',
        nome: 'SEFAZ Acre',
        portalOficial:
          'https://www.ac.gov.br/servico/certidao-negativa-de-debito-sefaz',
        consultaAutomatica: false,
        observacao:
          'Serviço oficial de Certidão Negativa de Débitos da SEFAZ do Acre.',
      },

      AL: {
        uf: 'AL',
        nome: 'SEFAZ Alagoas',
        portalOficial: 'https://contribuinte.sefaz.al.gov.br/certidao/#/',
        consultaAutomatica: false,
      },

      AP: {
        uf: 'AP',
        nome: 'SEFAZ Amapá',
        portalOficial: 'https://virtual.sefaz.ap.gov.br/sefazvirtual/',
        consultaAutomatica: false,
        observacao:
          'A emissão é realizada pelos serviços virtuais da SEFAZ do Amapá.',
      },

      AM: {
        uf: 'AM',
        nome: 'SEFAZ Amazonas',
        portalOficial:
          'https://www.sefaz.am.gov.br/portfolio-servicos/todos?query=Certid%C3%A3o+de+D%C3%A9bitos+Estaduais',
        consultaAutomatica: false,
        observacao:
          'Selecione no portal a modalidade de Certidão de Débitos Estaduais correspondente ao contribuinte.',
      },

      BA: {
        uf: 'BA',
        nome: 'SEFAZ Bahia',
        portalOficial: 'https://www.sefaz.ba.gov.br/',
        consultaAutomatica: false,
        observacao:
          'A emissão deve ser realizada pelos serviços de certidões da SEFAZ Bahia.',
      },

      CE: {
        uf: 'CE',
        nome: 'SEFAZ Ceará',
        portalOficial:
          'https://consultapublica.sefaz.ce.gov.br/certidaonegativa/preparar-consultar',
        consultaAutomatica: false,
      },

      DF: {
        uf: 'DF',
        nome: 'Receita do Distrito Federal',
        portalOficial: 'https://www.receita.fazenda.df.gov.br/',
        consultaAutomatica: false,
        observacao:
          'A emissão deve ser realizada pelos serviços de certidão da Receita do Distrito Federal.',
      },

      ES: {
        uf: 'ES',
        nome: 'SEFAZ Espírito Santo',
        portalOficial: 'https://sefaz.es.gov.br/emissao-de-certidoes',
        consultaAutomatica: false,
      },

      GO: {
        uf: 'GO',
        nome: 'Secretaria da Economia de Goiás',
        portalOficial: 'https://goias.gov.br/economia/',
        consultaAutomatica: false,
        observacao:
          'A emissão deve ser realizada nos serviços de certidões da Secretaria da Economia de Goiás.',
      },

      MA: {
        uf: 'MA',
        nome: 'SEFAZ Maranhão',
        portalOficial:
          'https://www.ma.gov.br/servicos/emissao-de-certidoes-negativas-de-debitos-e-certidoes-negativas-de-divida-ativa',
        consultaAutomatica: false,
      },

      MT: {
        uf: 'MT',
        nome: 'SEFAZ Mato Grosso',
        portalOficial: 'https://www.sefaz.mt.gov.br/',
        consultaAutomatica: false,
        observacao:
          'A emissão deve ser realizada pelos serviços eletrônicos da SEFAZ Mato Grosso.',
      },

      MS: {
        uf: 'MS',
        nome: 'SEFAZ Mato Grosso do Sul',
        portalOficial:
          'https://www.sefaz.ms.gov.br/servicos-em-destaque/certidao-tributaria-estadual-emissao-certidao-negativa-de-debitos-estaduais-2/',
        consultaAutomatica: false,
      },

      MG: {
        uf: 'MG',
        nome: 'SEF Minas Gerais',
        portalOficial:
          'https://www.mg.gov.br/servico/emitir-certidao-de-debitos-tributarios-cdt',
        consultaAutomatica: false,
        observacao:
          'Emissão da Certidão de Débitos Tributários - CDT de Minas Gerais.',
      },

      PA: {
        uf: 'PA',
        nome: 'SEFA Pará',
        portalOficial:
          'https://app.sefa.pa.gov.br/emissao-certidao/emitirCertidao.action',
        consultaAutomatica: false,
      },

      PB: {
        uf: 'PB',
        nome: 'SEFAZ Paraíba',
        portalOficial:
          'https://www.sefaz.pb.gov.br/servirtual/certidoes/emissao-de-certidao-de-debitos-cidadao',
        consultaAutomatica: false,
      },

      PR: {
        uf: 'PR',
        nome: 'Receita Estadual do Paraná',
        portalOficial:
          'https://www.fazenda.pr.gov.br/servicos/Empresa/Certidoes/Emitir-Certidao-Negativa-Receita-Estadual-kZrX5gol',
        consultaAutomatica: false,
      },

      PE: {
        uf: 'PE',
        nome: 'SEFAZ Pernambuco',
        portalOficial:
          'https://www.sefaz.pe.gov.br/Servicos/Paginas/Telesefaz-resumo.aspx',
        consultaAutomatica: false,
        observacao:
          'Utilize os serviços de certidão disponíveis na SEFAZ Pernambuco.',
      },

      PI: {
        uf: 'PI',
        nome: 'SEFAZ Piauí',
        portalOficial: 'https://www.sefaz.pi.gov.br/',
        consultaAutomatica: false,
        observacao:
          'A emissão deve ser realizada pelos serviços eletrônicos da SEFAZ Piauí.',
      },

      RJ: {
        uf: 'RJ',
        nome: 'SEFAZ Rio de Janeiro',
        portalOficial:
          'https://portal.fazenda.rj.gov.br/certidoes-de-regularidade-fiscal/',
        consultaAutomatica: false,
        observacao:
          'O Rio de Janeiro possui fluxos diferentes de certidão conforme a situação do contribuinte.',
      },

      RN: {
        uf: 'RN',
        nome: 'SET Rio Grande do Norte',
        portalOficial: 'https://www.set.rn.gov.br/',
        consultaAutomatica: false,
        observacao:
          'A emissão deve ser realizada pelos serviços eletrônicos da Secretaria de Tributação do RN.',
      },

      RS: {
        uf: 'RS',
        nome: 'Receita Estadual do Rio Grande do Sul',
        portalOficial: 'https://receita.fazenda.rs.gov.br/inicial',
        consultaAutomatica: false,
        observacao:
          'Utilize o serviço de Certidão de Situação Fiscal da Receita Estadual do Rio Grande do Sul.',
      },

      RO: {
        uf: 'RO',
        nome: 'SEFIN Rondônia',
        portalOficial:
          'https://portalcontribuinte.sefin.ro.gov.br/Publico/certidaoNegativa.jsp',
        consultaAutomatica: false,
        requerCaptcha: true,
        observacao:
          'O formulário de emissão da Certidão Negativa utiliza CAPTCHA.',
      },

      RR: {
        uf: 'RR',
        nome: 'SEFAZ Roraima',
        portalOficial: 'https://sefaz.rr.gov.br/central/central-de-atendimento',
        consultaAutomatica: false,
        observacao:
          'Consulte os serviços de certidão disponibilizados pela SEFAZ Roraima.',
      },

      SC: {
        uf: 'SC',
        nome: 'SEF Santa Catarina',
        portalOficial:
          'https://www.sef.sc.gov.br/servicos/emitir-certidao-negativa-de-debitos-fiscais-cnd',
        consultaAutomatica: false,
      },

      SP: {
        uf: 'SP',
        nome: 'SEFAZ São Paulo',
        portalOficial:
          'https://www10.fazenda.sp.gov.br/CertidaoNegativaDeb/Pages/EmissaoCertidaoNegativa.aspx',
        consultaAutomatica: false,
      },

      SE: {
        uf: 'SE',
        nome: 'SEFAZ Sergipe',
        portalOficial: 'https://www.sefaz.se.gov.br/',
        consultaAutomatica: false,
        observacao:
          'A emissão deve ser realizada pelos serviços eletrônicos da SEFAZ Sergipe.',
      },

      TO: {
        uf: 'TO',
        nome: 'SEFAZ Tocantins',
        portalOficial: 'https://portal.sefaz.to.gov.br/debitos-fiscais',
        consultaAutomatica: false,
      },
    };

    return portais[ufNormalizada] ?? null;
  }

  private async consultarCertidaoEstadual(
    cnpj: string,
    uf: string | null | undefined,
  ): Promise<ResultadoFonte<Record<string, any>>> {
    const cnpjLimpo = this.limparCnpj(cnpj);

    const ufNormalizada = String(uf ?? '')
      .trim()
      .toUpperCase();

    if (!ufNormalizada) {
      return this.resultadoFonte<Record<string, any>>(
        'SEFAZ Estadual',
        'ERRO',
        null,
        'Não foi possível identificar a UF da empresa.',
      );
    }

    if (!/^[A-Z]{2}$/.test(ufNormalizada)) {
      return this.resultadoFonte<Record<string, any>>(
        'SEFAZ Estadual',
        'ERRO',
        null,
        `A UF "${ufNormalizada}" é inválida.`,
      );
    }

    return this.consultarCertidaoEstadualManual(cnpjLimpo, ufNormalizada);
  }

  private consultarCertidaoEstadualManual(
    cnpj: string,
    uf: string,
  ): ResultadoFonte<Record<string, any>> {
    const portal = this.obterPortalCertidaoEstadual(uf);

    if (!portal) {
      return this.resultadoFonte<Record<string, any>>(
        `SEFAZ ${uf}`,
        'NAO_CONFIGURADA',
        {
          cnpj,
          uf,

          provedor: 'MANUAL',

          consultaAutomatica: false,

          documentoDisponivel: false,

          requerInteracaoUsuario: true,

          requerCaptcha: false,

          situacao: 'CONSULTA_MANUAL',
        },
        `O portal de Certidão Estadual para ${uf} ainda não foi configurado.`,
      );
    }

    return this.resultadoFonte<Record<string, any>>(portal.nome, 'SUCESSO', {
      cnpj,

      uf: portal.uf,

      orgao: portal.nome,

      provedor: 'MANUAL',

      consultaAutomatica: portal.consultaAutomatica,

      documentoDisponivel: false,

      requerInteracaoUsuario: true,

      requerCaptcha: portal.requerCaptcha ?? false,

      situacao: 'CONSULTA_MANUAL',

      observacao:
        portal.observacao ??
        `A Certidão Estadual deve ser emitida manualmente no portal oficial de ${portal.nome}.`,

      portalOficial: portal.portalOficial,
    });
  }

  async consultar(cnpj: string): Promise<ConsultaCnpjAgregada> {
    const cnpjLimpo = this.limparCnpj(cnpj);

    if (!cnpjLimpo) {
      throw new BadRequestException('O CNPJ é obrigatório.');
    }

    if (!this.validarCnpj(cnpjLimpo)) {
      throw new BadRequestException('O CNPJ informado é inválido.');
    }

    /*
     * Empresa que está sendo consultada.
     */
    const receita = await this.consultarReceita(cnpjLimpo);

    if (receita.status !== 'SUCESSO' || !receita.dados) {
      throw new ServiceUnavailableException({
        message: 'Não foi possível obter os dados cadastrais do CNPJ.',
        cnpj: cnpjLimpo,
        consultas: {
          receita,
        },
      });
    }

    const simples = this.consultarSimples(receita);

    const regimeTributario = this.identificarRegimeTributario(receita);

    const uf = receita.dados?.uf;

    /*
     * CNPJ da empresa usada como referência
     * para comparação de nicho.
     */
    const cnpjReferencia = String(
      process.env.CNPJ_EMPRESA_REFERENCIA ?? '',
    ).replace(/\D/g, '');

    if (!cnpjReferencia) {
      throw new ServiceUnavailableException(
        'Configure CNPJ_EMPRESA_REFERENCIA no .env.',
      );
    }

    if (!this.validarCnpj(cnpjReferencia)) {
      throw new ServiceUnavailableException(
        'O CNPJ configurado em CNPJ_EMPRESA_REFERENCIA é inválido.',
      );
    }

    /*
     * Busca os dados cadastrais da empresa de referência.
     */
    const empresaReferencia = await this.consultarReceita(cnpjReferencia);

    if (empresaReferencia.status !== 'SUCESSO' || !empresaReferencia.dados) {
      throw new ServiceUnavailableException(
        'Não foi possível consultar os dados da empresa de referência.',
      );
    }

    /*
     * Classificação do nicho.
     */
    const classificacaoNicho = CnpjNichoValidator.validar({
      empresaReferencia: {
        cnaePrincipal: {
          codigo: empresaReferencia.dados.cnae_fiscal,

          descricao: empresaReferencia.dados.cnae_fiscal_descricao,
        },

        cnaesSecundarios: Array.isArray(
          empresaReferencia.dados.cnaes_secundarios,
        )
          ? empresaReferencia.dados.cnaes_secundarios
          : [],
      },

      empresaConsultada: {
        cnaePrincipal: {
          codigo: receita.dados.cnae_fiscal,

          descricao: receita.dados.cnae_fiscal_descricao,
        },

        cnaesSecundarios: Array.isArray(receita.dados.cnaes_secundarios)
          ? receita.dados.cnaes_secundarios
          : [],
      },
    });

    /*
     * Demais consultas.
     */
    const [reclameAqui, datajud, certidaoFederal, certidaoEstadual] =
      await Promise.all([
        this.consultarReclameAqui(cnpjLimpo),
        this.consultarDatajud(cnpjLimpo),
        this.consultarCertidaoFederal(cnpjLimpo),
        this.consultarCertidaoEstadual(cnpjLimpo, uf),
      ]);

    console.log(receita.dados);

    return {
      cnpj: cnpjLimpo,

      data: {
        ...receita.dados,

        classificacaoNicho,
        regimeTributario,
      },

      consultas: {
        receita,
        simples,
        reclameAqui,
        datajud,
        certidaoFederal,
        certidaoEstadual,
      },

      consultadoEm: new Date().toISOString(),
    };
  }

  async create(body: any, arquivos: Express.Multer.File[] = []) {
    try {
      let payload: any;

      try {
        payload =
          typeof body.payload === 'string' ? JSON.parse(body.payload) : body;
      } catch {
        throw new BadRequestException(
          'Os dados enviados para criação são inválidos.',
        );
      }

      let certidoes: any[] = [];

      try {
        certidoes =
          typeof body.certidoes === 'string'
            ? JSON.parse(body.certidoes)
            : Array.isArray(body.certidoes)
              ? body.certidoes
              : [];
      } catch {
        throw new BadRequestException('Os dados das certidões são inválidos.');
      }

      if (!payload || typeof payload !== 'object') {
        throw new BadRequestException('Os dados da consulta são obrigatórios.');
      }

      if (!Array.isArray(certidoes)) {
        throw new BadRequestException(
          'As certidões devem ser enviadas em uma lista.',
        );
      }

      if (arquivos.length > 0 && certidoes.length !== arquivos.length) {
        throw new BadRequestException(
          'A quantidade de certidões não corresponde à quantidade de arquivos enviados.',
        );
      }

      const {
        cnpj,
        pontuacao,
        classificacao,
        resultado = 'ANALISE_MANUAL',
        observacao,
        dados,
      } = payload;

      const cnpjLimpo = this.limparCnpj(cnpj);

      if (!cnpjLimpo) {
        throw new BadRequestException('O CNPJ é obrigatório.');
      }

      if (!this.validarCnpj(cnpjLimpo)) {
        throw new BadRequestException('O CNPJ informado é inválido.');
      }

      if (!dados) {
        throw new BadRequestException(
          'Os dados consultados do CNPJ são obrigatórios.',
        );
      }

      if (!String(dados.razaoSocial ?? '').trim()) {
        throw new BadRequestException('A razão social é obrigatória.');
      }

      if (!String(dados.consultadoPorNome ?? '').trim()) {
        throw new BadRequestException(
          'O nome do responsável pela consulta é obrigatório.',
        );
      }

      const pontuacaoValidada = this.validarPontuacao(pontuacao);

      const classificacaoValidada =
        this.validarClassificacaoNicho(classificacao);

      const respostaOriginal =
        dados.respostaOriginal && typeof dados.respostaOriginal === 'object'
          ? dados.respostaOriginal
          : {};

      const cnaesSecundarios = Array.isArray(dados.cnaesSecundarios)
        ? dados.cnaesSecundarios
        : Array.isArray(respostaOriginal.cnaes_secundarios)
          ? respostaOriginal.cnaes_secundarios
          : [];

      const socios = Array.isArray(dados.socios)
        ? dados.socios
        : Array.isArray(respostaOriginal.qsa)
          ? respostaOriginal.qsa
          : [];

      return await this.prisma.$transaction(async (transaction) => {
        const consulta = await transaction.cnpjConsulta.create({
          data: {
            cnpj: cnpjLimpo,
            pontuacao: pontuacaoValidada,
            classificacao: classificacaoValidada,
            resultado,
            observacao: this.textoNullable(observacao),
          },
        });

        const dadosCriados = await transaction.cnpjDadosConsultados.create({
          data: {
            consultaId: consulta.id,

            consultadoPorObjectGuid: this.textoNullable(
              dados.consultadoPorObjectGuid,
            ),

            consultadoPorNome: String(dados.consultadoPorNome).trim(),

            consultadoPorUsuario: this.textoNullable(
              dados.consultadoPorUsuario,
            ),

            razaoSocial: String(dados.razaoSocial).trim(),

            nomeFantasia: this.textoNullable(
              dados.nomeFantasia ?? respostaOriginal.nome_fantasia,
            ),

            situacaoCadastral: this.textoNullable(
              dados.situacaoCadastral ??
                respostaOriginal.descricao_situacao_cadastral,
            ),

            dataAbertura: this.converterData(
              dados.dataAbertura ?? respostaOriginal.data_inicio_atividade,
              'A data de abertura',
            ),

            cnaePrincipalCodigo: this.textoNullable(
              dados.cnaePrincipalCodigo ?? respostaOriginal.cnae_fiscal,
            ),

            cnaePrincipalDescricao: this.textoNullable(
              dados.cnaePrincipalDescricao ??
                respostaOriginal.cnae_fiscal_descricao,
            ),

            naturezaJuridica: this.textoNullable(
              dados.naturezaJuridica ?? respostaOriginal.natureza_juridica,
            ),

            codigoNaturezaJuridica: this.textoNullable(
              dados.codigoNaturezaJuridica ??
                respostaOriginal.codigo_natureza_juridica,
            ),

            porte: this.textoNullable(dados.porte ?? respostaOriginal.porte),

            descricaoPorte: this.textoNullable(
              dados.descricaoPorte ?? respostaOriginal.descricao_porte,
            ),

            capitalSocial: this.decimalNullable(
              dados.capitalSocial ?? respostaOriginal.capital_social,
            ),

            matrizFilial: this.textoNullable(
              dados.matrizFilial ??
                respostaOriginal.descricao_identificador_matriz_filial ??
                respostaOriginal.identificador_matriz_filial,
            ),

            pais: this.textoNullable(dados.pais ?? respostaOriginal.pais),

            email: this.textoNullable(dados.email ?? respostaOriginal.email),

            telefone1: this.textoNullable(
              dados.telefone1 ?? respostaOriginal.ddd_telefone_1,
            ),

            telefone2: this.textoNullable(
              dados.telefone2 ?? respostaOriginal.ddd_telefone_2,
            ),

            fax: this.textoNullable(dados.fax ?? respostaOriginal.ddd_fax),

            situacaoEspecial: this.textoNullable(
              dados.situacaoEspecial ?? respostaOriginal.situacao_especial,
            ),

            dataSituacaoCadastral: this.converterData(
              dados.dataSituacaoCadastral ??
                respostaOriginal.data_situacao_cadastral,
              'A data da situação cadastral',
            ),

            motivoSituacaoCadastral: this.textoNullable(
              dados.motivoSituacaoCadastral ??
                respostaOriginal.descricao_motivo_situacao_cadastral ??
                respostaOriginal.motivo_situacao_cadastral,
            ),

            simplesNacional: this.textoNullable(
              dados.simplesNacional ?? respostaOriginal.simplesStatus,
            ),

            opcaoPeloSimples: this.booleanNullable(
              dados.opcaoPeloSimples ?? respostaOriginal.opcao_pelo_simples,
            ),

            opcaoPeloMei: this.booleanNullable(
              dados.opcaoPeloMei ?? respostaOriginal.opcao_pelo_mei,
            ),

            regimeTributario: this.validarRegimeTributario(
              dados.regimeTributario ??
                respostaOriginal.regimeTributario ??
                RegimeTributarioCnpj.NAO_IDENTIFICADO,
            ),

            inscricaoEstadual: this.textoNullable(
              dados.inscricaoEstadual ?? respostaOriginal.ie,
            ),

            logradouro: this.textoNullable(
              dados.logradouro ?? respostaOriginal.logradouro,
            ),

            numero: this.textoNullable(dados.numero ?? respostaOriginal.numero),

            complemento: this.textoNullable(
              dados.complemento ?? respostaOriginal.complemento,
            ),

            bairro: this.textoNullable(dados.bairro ?? respostaOriginal.bairro),

            municipio: this.textoNullable(
              dados.municipio ?? respostaOriginal.municipio,
            ),

            uf: this.textoNullable(
              dados.uf ?? respostaOriginal.uf,
            )?.toUpperCase(),

            cep:
              (dados.cep ?? respostaOriginal.cep)
                ? String(dados.cep ?? respostaOriginal.cep).replace(/\D/g, '')
                : null,

            respostaOriginal: dados.respostaOriginal ?? undefined,
          },
        });

        const cnaesParaCriar = cnaesSecundarios
          .map((item: any) => ({
            dadosConsultadosId: dadosCriados.id,

            codigo: String(
              item?.codigo ?? item?.cnae ?? item?.code ?? '',
            ).trim(),

            descricao: String(
              item?.descricao ?? item?.description ?? '',
            ).trim(),
          }))
          .filter((item: any) => item.codigo && item.descricao);

        if (cnaesParaCriar.length > 0) {
          await transaction.cnpjCnaeSecundario.createMany({
            data: cnaesParaCriar,
            skipDuplicates: true,
          });
        }

        const sociosParaCriar = socios
          .map((socio: any) => ({
            dadosConsultadosId: dadosCriados.id,

            nome: String(socio?.nome ?? socio?.nome_socio ?? '').trim(),

            documento: this.textoNullable(
              socio?.documento ?? socio?.cnpj_cpf_do_socio,
            ),

            qualificacao: this.textoNullable(
              socio?.qualificacao ?? socio?.qualificacao_socio,
            ),

            codigoQualificacao: this.textoNullable(
              socio?.codigoQualificacao ?? socio?.codigo_qualificacao_socio,
            ),

            identificadorSocio: this.textoNullable(
              socio?.identificadorSocio ?? socio?.identificador_de_socio,
            ),

            faixaEtaria: this.textoNullable(
              socio?.faixaEtaria ?? socio?.faixa_etaria,
            ),

            dataEntradaSociedade: this.converterData(
              socio?.dataEntradaSociedade ?? socio?.data_entrada_sociedade,
              'A data de entrada do sócio',
            ),

            nomeRepresentante: this.textoNullable(
              socio?.nomeRepresentante ?? socio?.nome_representante_legal,
            ),

            documentoRepresentante: this.textoNullable(
              socio?.documentoRepresentante ?? socio?.cpf_representante_legal,
            ),

            qualificacaoRepresentante: this.textoNullable(
              socio?.qualificacaoRepresentante ??
                socio?.qualificacao_representante_legal,
            ),

            pais: this.textoNullable(socio?.pais),
          }))
          .filter((socio: any) => socio.nome);

        if (sociosParaCriar.length > 0) {
          await transaction.cnpjSocio.createMany({
            data: sociosParaCriar,
          });
        }

        if (arquivos.length > 0) {
          for (let index = 0; index < arquivos.length; index += 1) {
            const arquivo = arquivos[index];
            const metadados = certidoes[index] ?? {};

            await transaction.cnpjCertidao.create({
              data: {
                consultaId: consulta.id,

                tipo: this.validarTipoCertidao(metadados.tipo),

                situacao: metadados.situacao ?? 'PENDENTE',

                nomeOriginal: arquivo.originalname,
                nomeSalvo: arquivo.filename,

                caminho: arquivo.path.replace(/\\/g, '/'),

                mimeType: arquivo.mimetype,
                tamanho: arquivo.size,

                emitidaEm: this.converterData(
                  metadados.emitidaEm,
                  'A data de emissão da certidão',
                ),

                validaAte: this.converterData(
                  metadados.validaAte,
                  'A data de validade da certidão',
                ),

                numeroControle: this.textoNullable(metadados.numeroControle),

                observacao: this.textoNullable(metadados.observacao),

                adicionadoPorObjectGuid: this.textoNullable(
                  metadados.adicionadoPorObjectGuid ??
                    dados.consultadoPorObjectGuid,
                ),

                adicionadoPorNome: this.textoNullable(
                  metadados.adicionadoPorNome ?? dados.consultadoPorNome,
                ),

                adicionadoPorUsuario: this.textoNullable(
                  metadados.adicionadoPorUsuario ?? dados.consultadoPorUsuario,
                ),
              },
            });
          }
        }

        const registroCompleto = await transaction.cnpjConsulta.findUnique({
          where: {
            id: consulta.id,
          },
          include: this.getIncludeCompleto(),
        });

        return this.normalizarConsulta(registroCompleto);
      });
    } catch (error: any) {
      /*
       * O interceptor salva os arquivos antes de o service
       * ser executado. Se qualquer validação ou operação no
       * banco falhar, removemos os arquivos órfãos.
       */
      await this.removerArquivos(arquivos);

      if (error instanceof HttpException) {
        throw error;
      }

      console.error('[CNPJ] Erro ao salvar consulta', {
        message: error?.message,
        code: error?.code,
      });

      throw new BadRequestException(
        error?.message || 'Não foi possível salvar a consulta do CNPJ.',
      );
    }
  }

  async findByFilter(body: any) {
    const {
      pesquisa,
      cnpj,
      resultado,
      situacaoCadastral,
      consultadoPorObjectGuid,
      consultadoPorUsuario,
      uf,
      cnae,
      dataInicio,
      dataFim,
      page = 1,
      limit = 10,
    } = body;

    const pageNumber = Math.max(Number(page) || 1, 1);

    const limitNumber = Math.min(Math.max(Number(limit) || 10, 1), 100);

    const skip = (pageNumber - 1) * limitNumber;
    const where: any = {};

    if (cnpj) {
      where.cnpj = {
        contains: this.limparCnpj(cnpj),
      };
    }

    if (resultado) {
      where.resultado = resultado;
    }

    const filtroDados: any = {};

    if (situacaoCadastral) {
      filtroDados.situacaoCadastral = {
        equals: String(situacaoCadastral).trim(),
        mode: 'insensitive',
      };
    }

    if (consultadoPorObjectGuid) {
      filtroDados.consultadoPorObjectGuid = String(
        consultadoPorObjectGuid,
      ).trim();
    }

    if (consultadoPorUsuario) {
      filtroDados.consultadoPorUsuario = {
        equals: String(consultadoPorUsuario).trim(),
        mode: 'insensitive',
      };
    }

    if (uf) {
      filtroDados.uf = {
        equals: String(uf).trim(),
        mode: 'insensitive',
      };
    }

    if (cnae) {
      const cnaeTexto = String(cnae).replace(/\D/g, '').trim();

      filtroDados.OR = [
        {
          cnaePrincipalCodigo: {
            contains: cnaeTexto,
          },
        },
        {
          CnpjCnaeSecundario: {
            some: {
              codigo: {
                contains: cnaeTexto,
              },
            },
          },
        },
      ];
    }

    if (Object.keys(filtroDados).length > 0) {
      where.CnpjDadosConsultados = {
        is: filtroDados,
      };
    }

    if (pesquisa && String(pesquisa).trim()) {
      const termo = String(pesquisa).trim();
      const cnpjPesquisa = this.limparCnpj(termo);

      where.OR = [
        ...(cnpjPesquisa
          ? [
              {
                cnpj: {
                  contains: cnpjPesquisa,
                },
              },
            ]
          : []),

        {
          CnpjDadosConsultados: {
            is: {
              razaoSocial: {
                contains: termo,
                mode: 'insensitive',
              },
            },
          },
        },

        {
          CnpjDadosConsultados: {
            is: {
              nomeFantasia: {
                contains: termo,
                mode: 'insensitive',
              },
            },
          },
        },

        {
          CnpjDadosConsultados: {
            is: {
              consultadoPorNome: {
                contains: termo,
                mode: 'insensitive',
              },
            },
          },
        },

        {
          CnpjDadosConsultados: {
            is: {
              email: {
                contains: termo,
                mode: 'insensitive',
              },
            },
          },
        },
      ];
    }

    if (dataInicio || dataFim) {
      where.consultadoEm = {};

      if (dataInicio) {
        where.consultadoEm.gte = this.converterData(
          dataInicio,
          'A data inicial',
        );
      }

      if (dataFim) {
        const fim = this.converterData(dataFim, 'A data final');

        if (fim) {
          const finalDoDia = new Date(fim);
          finalDoDia.setUTCHours(23, 59, 59, 999);

          where.consultadoEm.lte = finalDoDia;
        }
      }
    }

    try {
      const [registros, total] = await this.prisma.$transaction([
        this.prisma.cnpjConsulta.findMany({
          where,
          include: this.getIncludeCompleto(),
          orderBy: {
            consultadoEm: 'desc',
          },
          skip,
          take: limitNumber,
        }),

        this.prisma.cnpjConsulta.count({
          where,
        }),
      ]);

      const result = registros.map((registro) =>
        this.normalizarConsulta(registro),
      );

      return {
        // Mantém compatibilidade com o frontend antigo.
        result,
        total,

        // Novo formato estruturado.
        data: result,
        pagination: {
          page: pageNumber,
          limit: limitNumber,
          total,
          totalPages: Math.ceil(total / limitNumber),
        },
      };
    } catch (error: any) {
      throw new BadRequestException(
        error?.message || 'Não foi possível consultar os CNPJs.',
      );
    }
  }

  async findById(id: string) {
    if (!id) {
      throw new BadRequestException('O ID da consulta é obrigatório.');
    }

    const consulta = await this.prisma.cnpjConsulta.findUnique({
      where: {
        id,
      },
      include: this.getIncludeCompleto(),
    });

    if (!consulta) {
      throw new NotFoundException('Consulta de CNPJ não encontrada.');
    }

    return this.normalizarConsulta(consulta);
  }

  async findByCnpj(cnpj: string) {
    const cnpjLimpo = this.limparCnpj(cnpj);

    if (!this.validarCnpj(cnpjLimpo)) {
      throw new BadRequestException('O CNPJ informado é inválido.');
    }

    const consultas = await this.prisma.cnpjConsulta.findMany({
      where: {
        cnpj: cnpjLimpo,
      },
      include: this.getIncludeCompleto(),
      orderBy: {
        consultadoEm: 'desc',
      },
    });

    return consultas.map((consulta) => this.normalizarConsulta(consulta));
  }

  async update(id: string, body: any) {
    const consultaAtual = await this.findById(id);

    const { pontuacao, resultado, observacao, dados } = body;

    if (
      pontuacao === undefined &&
      resultado === undefined &&
      observacao === undefined &&
      dados === undefined
    ) {
      throw new BadRequestException(
        'Nenhuma informação foi enviada para atualização.',
      );
    }

    try {
      return await this.prisma.$transaction(async (transaction) => {
        await transaction.cnpjConsulta.update({
          where: {
            id,
          },
          data: {
            ...(pontuacao !== undefined && {
              pontuacao: this.validarPontuacao(pontuacao),
            }),

            ...(resultado !== undefined && {
              resultado,
            }),

            ...(observacao !== undefined && {
              observacao: this.textoNullable(observacao),
            }),
          },
        });

        if (dados !== undefined) {
          const dadosAtuais = consultaAtual.dados;

          if (!dadosAtuais?.id) {
            throw new BadRequestException(
              'Os dados da consulta não foram encontrados.',
            );
          }

          const atualizacao: any = {};

          const camposTexto = [
            'consultadoPorObjectGuid',
            'consultadoPorNome',
            'consultadoPorUsuario',
            'razaoSocial',
            'nomeFantasia',
            'situacaoCadastral',
            'cnaePrincipalCodigo',
            'cnaePrincipalDescricao',
            'simplesNacional',
            'inscricaoEstadual',
            'naturezaJuridica',
            'codigoNaturezaJuridica',
            'porte',
            'descricaoPorte',
            'matrizFilial',
            'pais',
            'email',
            'telefone1',
            'telefone2',
            'fax',
            'situacaoEspecial',
            'motivoSituacaoCadastral',
            'logradouro',
            'numero',
            'complemento',
            'bairro',
            'municipio',
            'uf',
          ];

          for (const campo of camposTexto) {
            if (dados[campo] !== undefined) {
              atualizacao[campo] = this.textoNullable(dados[campo]);
            }
          }

          if (atualizacao.uf) {
            atualizacao.uf = String(atualizacao.uf).toUpperCase();
          }

          if (dados.cep !== undefined) {
            atualizacao.cep = dados.cep
              ? String(dados.cep).replace(/\D/g, '')
              : null;
          }

          if (dados.dataAbertura !== undefined) {
            atualizacao.dataAbertura = this.converterData(
              dados.dataAbertura,
              'A data de abertura',
            );
          }

          if (dados.dataSituacaoCadastral !== undefined) {
            atualizacao.dataSituacaoCadastral = this.converterData(
              dados.dataSituacaoCadastral,
              'A data da situação cadastral',
            );
          }

          if (dados.capitalSocial !== undefined) {
            atualizacao.capitalSocial = this.decimalNullable(
              dados.capitalSocial,
            );
          }

          if (dados.opcaoPeloSimples !== undefined) {
            atualizacao.opcaoPeloSimples = this.booleanNullable(
              dados.opcaoPeloSimples,
            );
          }

          if (dados.opcaoPeloMei !== undefined) {
            atualizacao.opcaoPeloMei = this.booleanNullable(dados.opcaoPeloMei);
          }

          if (dados.regimeTributario !== undefined) {
            atualizacao.regimeTributario = this.validarRegimeTributario(
              dados.regimeTributario,
            );
          }

          if (dados.respostaOriginal !== undefined) {
            atualizacao.respostaOriginal = dados.respostaOriginal ?? undefined;
          }

          await transaction.cnpjDadosConsultados.update({
            where: {
              consultaId: id,
            },
            data: atualizacao,
          });

          if (Array.isArray(dados.cnaesSecundarios)) {
            await transaction.cnpjCnaeSecundario.deleteMany({
              where: {
                dadosConsultadosId: dadosAtuais.id,
              },
            });

            const cnaes = dados.cnaesSecundarios
              .map((item: any) => ({
                dadosConsultadosId: dadosAtuais.id,
                codigo: String(item?.codigo ?? '').trim(),
                descricao: String(item?.descricao ?? '').trim(),
              }))
              .filter((item: any) => item.codigo && item.descricao);

            if (cnaes.length > 0) {
              await transaction.cnpjCnaeSecundario.createMany({
                data: cnaes,
                skipDuplicates: true,
              });
            }
          }

          if (Array.isArray(dados.socios)) {
            await transaction.cnpjSocio.deleteMany({
              where: {
                dadosConsultadosId: dadosAtuais.id,
              },
            });

            const socios = dados.socios
              .map((socio: any) => ({
                dadosConsultadosId: dadosAtuais.id,

                nome: String(socio?.nome ?? socio?.nome_socio ?? '').trim(),

                documento: this.textoNullable(
                  socio?.documento ?? socio?.cnpj_cpf_do_socio,
                ),

                qualificacao: this.textoNullable(
                  socio?.qualificacao ?? socio?.qualificacao_socio,
                ),

                codigoQualificacao: this.textoNullable(
                  socio?.codigoQualificacao ?? socio?.codigo_qualificacao_socio,
                ),

                identificadorSocio: this.textoNullable(
                  socio?.identificadorSocio ?? socio?.identificador_de_socio,
                ),

                faixaEtaria: this.textoNullable(
                  socio?.faixaEtaria ?? socio?.faixa_etaria,
                ),

                dataEntradaSociedade: this.converterData(
                  socio?.dataEntradaSociedade ?? socio?.data_entrada_sociedade,
                  'A data de entrada do sócio',
                ),

                nomeRepresentante: this.textoNullable(
                  socio?.nomeRepresentante ?? socio?.nome_representante_legal,
                ),

                documentoRepresentante: this.textoNullable(
                  socio?.documentoRepresentante ??
                    socio?.cpf_representante_legal,
                ),

                qualificacaoRepresentante: this.textoNullable(
                  socio?.qualificacaoRepresentante ??
                    socio?.qualificacao_representante_legal,
                ),

                pais: this.textoNullable(socio?.pais),
              }))
              .filter((socio: any) => socio.nome);

            if (socios.length > 0) {
              await transaction.cnpjSocio.createMany({
                data: socios,
              });
            }
          }
        }

        const atualizado = await transaction.cnpjConsulta.findUnique({
          where: {
            id,
          },
          include: this.getIncludeCompleto(),
        });

        return this.normalizarConsulta(atualizado);
      });
    } catch (error: any) {
      if (error instanceof HttpException) {
        throw error;
      }

      throw new BadRequestException(
        error?.message || 'Não foi possível atualizar a consulta do CNPJ.',
      );
    }
  }

  async delete(id: string) {
    if (!id) {
      throw new BadRequestException('O ID da consulta é obrigatório.');
    }

    const consulta = await this.prisma.cnpjConsulta.findUnique({
      where: {
        id,
      },
      select: {
        id: true,
      },
    });

    if (!consulta) {
      throw new NotFoundException('Consulta de CNPJ não encontrada.');
    }

    try {
      await this.prisma.cnpjConsulta.delete({
        where: {
          id,
        },
      });

      return {
        message: 'Consulta de CNPJ excluída com sucesso.',
        id,
      };
    } catch (error: any) {
      throw new BadRequestException(
        error?.message || 'Não foi possível excluir a consulta do CNPJ.',
      );
    }
  }

  async visualizarCertidao(id: string, res: Response) {
    const certidao = await this.prisma.cnpjCertidao.findUnique({
      where: { id },
    });

    if (!certidao) {
      throw new NotFoundException('Certidão não encontrada.');
    }

    if (!certidao.caminho) {
      throw new NotFoundException('Arquivo da certidão não encontrado.');
    }

    if (!fs.existsSync(certidao.caminho)) {
      throw new NotFoundException('Arquivo físico da certidão não encontrado.');
    }

    res.setHeader('Content-Type', certidao.mimeType || 'application/pdf');

    res.setHeader(
      'Content-Disposition',
      `inline; filename="${encodeURIComponent(
        certidao.nomeOriginal || 'certidao.pdf',
      )}"`,
    );

    return res.sendFile(path.resolve(certidao.caminho));
  }
}
