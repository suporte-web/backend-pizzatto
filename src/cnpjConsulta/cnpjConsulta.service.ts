import { PrismaService } from '@/prisma/prisma.service';
import {
  BadRequestException,
  HttpException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { unlink } from 'fs/promises';

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
  };
  consultadoEm: string;
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

  private preencherTemplateUrl(template: string, cnpj: string): string {
    return template.replace(/\{cnpj\}/gi, encodeURIComponent(cnpj));
  }

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

  async consultar(cnpj: string): Promise<ConsultaCnpjAgregada> {
    const cnpjLimpo = this.limparCnpj(cnpj);

    if (!cnpjLimpo) {
      throw new BadRequestException('O CNPJ é obrigatório.');
    }

    if (!this.validarCnpj(cnpjLimpo)) {
      throw new BadRequestException('O CNPJ informado é inválido.');
    }

    // 1. Consulta primeiro a Receita
    const receita = await this.consultarReceita(cnpjLimpo);

    // 2. Garante que temos os dados cadastrais
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

    const [reclameAqui, datajud] = await Promise.all([
      this.consultarReclameAqui(cnpjLimpo),
      this.consultarDatajud(cnpjLimpo),
    ]);

    return {
      cnpj: cnpjLimpo,

      data: receita.dados,

      consultas: {
        receita,
        simples,
        reclameAqui,
        datajud,
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

      const {
        cnpj,
        pontuacao = 0,
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

                tipo: metadados.tipo ?? 'FEDERAL',

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
}
