import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
} from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
import puppeteer from 'puppeteer';
import * as fs from 'fs';
import * as path from 'path';
import moment from 'moment';

@Injectable()
export class GlpiService {
  constructor(private readonly http: HttpService) {
    this.baseUrl = process.env.GLPI_BASE_URL || '';
    if (!this.baseUrl) throw new Error('GLPI_BASE_URL não configurado');
  }

  private baseUrl: string;

  private cachedSessionToken: string | null = null;
  private sessionTokenCreatedAt: number | null = null;

  private headers(extra?: Record<string, string>) {
    return {
      'App-Token': process.env.APP_TOKEN_GLPI ?? '',
      ...(extra ?? {}),
    };
  }

  async initSession(): Promise<string> {
    const apiToken = process.env.API_TOKEN_GLPI;
    if (!apiToken) {
      throw new InternalServerErrorException('API_TOKEN_GLPI não configurado');
    }

    try {
      const res$ = this.http.get(`${this.baseUrl}/initSession`, {
        headers: this.headers(),
        params: { user_token: apiToken },
        maxRedirects: 0,
        validateStatus: (s) => s >= 200 && s < 400,
      });

      const res = await firstValueFrom(res$);

      const contentType = res.headers?.['content-type'] || '';
      if (contentType.includes('text/html')) {
        throw new InternalServerErrorException(
          `GLPI retornou HTML (login) em vez de JSON. Verifique GLPI_BASE_URL/tokens. Content-Type=${contentType}`,
        );
      }

      const sessionToken = res.data?.session_token;
      if (!sessionToken) {
        throw new InternalServerErrorException(
          `GLPI não retornou session_token. Resposta: ${JSON.stringify(res.data)}`,
        );
      }

      return sessionToken;
    } catch (e: any) {
      throw new InternalServerErrorException({
        message: 'Falha ao abrir sessão no GLPI',
        detail: e?.response?.data || e?.message,
      });
    }
  }

  private isSessionValid() {
    if (!this.cachedSessionToken || !this.sessionTokenCreatedAt) return false;
    const ageMs = Date.now() - this.sessionTokenCreatedAt;
    return ageMs < 25 * 60 * 1000; // 25 min
  }

  private async getValidSessionToken(): Promise<string> {
    if (this.isSessionValid()) return this.cachedSessionToken!;
    const token = await this.initSession();
    this.cachedSessionToken = token;
    this.sessionTokenCreatedAt = Date.now();
    return token;
  }

  async getAllComputers(options: {
    page: number;
    limit: number;
    filter?: string;
  }) {
    const sessionToken = await this.getValidSessionToken();

    const page = Math.max(options.page ?? 1, 1);
    if (!options.limit || options.limit <= 0) {
      throw new BadRequestException(
        'Parâmetro limit é obrigatório e deve ser > 0',
      );
    }

    const limit = Math.min(options.limit, 200);

    const startWanted = (page - 1) * limit;

    // vamos tentar preencher exatamente "limit" itens
    const collected: any[] = [];
    let cursor = startWanted;

    try {
      while (collected.length < limit) {
        const remaining = limit - collected.length;
        const end = cursor + remaining - 1;

        const res$ = this.http.get(`${this.baseUrl}/search/Computer`, {
          headers: this.headers({
            'Session-Token': sessionToken,
          }),
          params: {
            ...(options.filter
              ? {
                  'criteria[0][field]': 1,
                  'criteria[0][searchtype]': 'contains',
                  'criteria[0][value]': options.filter,
                }
              : {}),
            range: `${cursor}-${end}`, // ✅ paginação correta no /search
          },
        });

        const res = await firstValueFrom(res$);

        const raw = res.data?.data ?? [];
        const chunk = Array.isArray(raw) ? raw : Object.values(raw);
        if (!Array.isArray(chunk) || chunk.length === 0) break;

        collected.push(...chunk);

        // Se o GLPI devolveu menos do que pedimos nessa “tentativa”,
        // não tem mais o que buscar para completar
        if (chunk.length < remaining) break;

        cursor += chunk.length;
      }

      // total real (se o header vier)
      const contentRange = (
        await firstValueFrom(
          this.http.get(`${this.baseUrl}/search/Computer`, {
            headers: this.headers({
              'Session-Token': sessionToken,
              Range: `items=0-0`,
            }),
            params: options.filter
              ? {
                  'criteria[0][field]': 1,
                  'criteria[0][searchtype]': 'contains',
                  'criteria[0][value]': options.filter,
                }
              : undefined,
            maxRedirects: 0,
            validateStatus: (s) => s >= 200 && s < 400,
          }),
        )
      ).headers?.['content-range'];

      let total = collected.length;
      if (contentRange) {
        const match = String(contentRange).match(/\/(\d+)$/);
        if (match) total = Number(match[1]);
      }

      return {
        page,
        limit,
        total,
        data: collected.slice(0, limit),
      };
    } catch (e: any) {
      throw new InternalServerErrorException({
        message: 'Falha ao buscar computadores no GLPI',
        detail: e?.response?.data || e?.message,
      });
    }
  }

  private async getLogoBase64() {
    try {
      // Verifique a estrutura do seu projeto
      // Se sua pasta 'imgs' está no mesmo nível da pasta 'src'
      const logoPath = path.join(__dirname, '..', '..', 'imgs', 'logo.jpg');

      // console.log('Procurando logo em:', logoPath); // Debug

      // Verificar se o arquivo existe
      if (!fs.existsSync(logoPath)) {
        // console.warn('Logo não encontrada em:', logoPath);

        // Tentar caminhos alternativos
        const alternativePaths = [
          path.join(__dirname, '..', 'imgs', 'logo.jpg'),
          path.join(process.cwd(), 'imgs', 'logo.jpg'),
          path.join(process.cwd(), 'src', 'imgs', 'logo.jpg'),
        ];

        for (const altPath of alternativePaths) {
          // console.log('Tentando caminho alternativo:', altPath);
          if (fs.existsSync(altPath)) {
            // console.log('Logo encontrada em:', altPath);
            const imageBuffer = fs.readFileSync(altPath);
            const base64Image = imageBuffer.toString('base64');
            return `data:image/jpeg;base64,${base64Image}`;
          }
        }

        return ''; // Retorna string vazia se não encontrar
      }

      // Ler o arquivo e converter para base64
      const imageBuffer = fs.readFileSync(logoPath);
      const base64Image = imageBuffer.toString('base64');

      return `data:image/jpeg;base64,${base64Image}`;
    } catch (error) {
      console.error('Erro ao carregar logo:', error);
      return '';
    }
  }

  async createPdfTermo(body: any) {
    try {
      console.log(body);

      const computer = await this.getComputerByIdFull(Number(body.id));

      const inventario = {
        equipamento: computer.computermodels_id ?? '', // ou derive de algum campo
        nomeComputador: computer?.name ?? '',
        tag: computer?.otherserial ?? computer?.serial ?? '',
        nomeColaborador: body.colaborador ?? '',
        produzidoPor: computer.manufacturers_id ?? '',
      };

      const logoBase64 = await this.getLogoBase64();

      const logoHtml = logoBase64
        ? `<img src="${logoBase64}" alt="Logo" class="logo">`
        : '';

      const html = `
      <html>
        <head>
          <meta charset="UTF-8">
          <title>Termo de Responsabilidade de Equipamento</title>
          <style>
            @page {
              margin: 20mm;
            }

            body { 
              font-family: Arial, Helvetica, sans-serif; 
              margin: 0;
              padding: 0;
              line-height: 1.6;
              color: #333;
              font-size: 12px;
            }

            .container {
              max-width: 800px;
              margin: 0 auto;
              padding: 20px 25px;
            }

            .header {
              display: flex;
              align-items: center;
              gap: 16px;
              border-bottom: 2px solid #444;
              padding-bottom: 10px;
              margin-bottom: 20px;
            }

            .logo {
              max-width: 140px;
              height: auto;
            }

            .company-info {
              font-size: 11px;
              line-height: 1.4;
            }

            .company-name {
              font-weight: bold;
              font-size: 13px;
              text-transform: uppercase;
            }

            .title {
              text-align: center;
              font-weight: bold;
              font-size: 16px;
              margin: 20px 0 10px 0;
              text-transform: uppercase;
            }

            .subtitle {
              text-align: center;
              font-size: 12px;
              margin-bottom: 20px;
            }

            .meta {
              margin-bottom: 18px;
              display: flex;
              justify-content: space-between;
              font-size: 12px;
            }

            .meta span {
              display: block;
            }

            .block {
              margin-bottom: 12px;
              text-align: justify;
            }

            .equipment-box {
              border: 1px solid #ccc;
              border-radius: 4px;
              padding: 10px 12px;
              margin: 16px 0 20px 0;
              background: #f9f9f9;
              font-size: 12px;
            }

            .equipment-title {
              font-weight: bold;
              margin-bottom: 6px;
              text-transform: uppercase;
              font-size: 12px;
            }

            .equipment-row {
              margin-bottom: 3px;
            }

            .equipment-label {
              font-weight: bold;
            }

            .signature-section {
              margin-top: 40px;
            }

            .signature-wrapper {
              display: flex;
              justify-content: space-between;
              gap: 40px;
              margin-top: 30px;
            }

            .signature-block {
              width: 45%;
              text-align: center;
              font-size: 12px;
            }

            .signature-line {
              border-top: 1px solid #000;
              margin-bottom: 4px;
              padding-top: 4px;
            }

            .signature-name {
              font-weight: bold;
            }

            .signature-role {
              font-size: 11px;
            }

            .footer-date {
              text-align: right;
              margin-top: 10px;
              margin-bottom: 10px;
              font-size: 12px;
            }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              ${logoHtml ? `<div class="logo-wrapper">${logoHtml}</div>` : ''}
              <div class="company-info">
                <div class="company-name">TRANS PIZZATTO TRANSPORTADORA DE CARGAS RODOV. LTDA</div>
                <div>CNPJ: 77.058.881/0001-26</div>
                <div>Curitiba - PR</div>
              </div>
            </div>

            <div class="title">Termo de Responsabilidade de Equipamento</div>
            <div class="subtitle">Uso exclusivo para atividades profissionais</div>

            <div class="meta">
              <div class="footer-date">
                Curitiba/PR, ${moment().format('DD/MM/YYYY')}
              </div>
            </div>

            ${
              body.notebookActive
                ? `
              <div class="equipment-box">
              <div class="equipment-title">Dados do Notebook</div>
              <div class="equipment-row">
              <span class="equipment-label">Equipamento:</span>
              <span> ${inventario?.equipamento || ''}</span>
              </div>
              <div class="equipment-row">
                <span class="equipment-label">Nome do computador:</span>
                <span> ${inventario?.nomeComputador || ''}</span>
                </div>
              <div class="equipment-row">
                <span class="equipment-label">Produzido por:</span>
                <span> ${inventario?.produzidoPor || ''}</span>
                </div>
              <div class="equipment-row">
                <span class="equipment-label">TAG / Patrimônio:</span>
                <span> ${inventario?.tag || ''}</span>
                </div>
                </div>
                `
                : ``
            }

            ${
              body.monitorActive ||
              body.mouseActive ||
              body.tecladoActive ||
              body.headsetActive ||
              body.suporteNotebookActive
                ? `
              <div class="equipment-box">
              <div class="equipment-title">Dados dos Perifericos</div>
              ${
                body.monitorActive
                  ? `
                <div class="equipment-row">
                <span class="equipment-label">Monitor:</span>
                <span>${body?.monitor || ''}</span>
                </div>
                `
                  : ``
              }
              ${
                body.mouseActive
                  ? `
                <div class="equipment-row">
                <span class="equipment-label">Mouse:</span>
                <span>Mouse Dell Pro - KM5221W</span>
                </div>
                `
                  : ``
              }
              ${
                body.tecladoActive
                  ? `
                <div class="equipment-row">
                <span class="equipment-label">Teclado:</span>
                <span>Teclado Dell Pro - KM5221W</span>
                </div>
                `
                  : ``
              }
              ${
                body.headsetActive
                  ? `
                <div class="equipment-row">
                <span class="equipment-label">Headset:</span>
                <span>${body.headset}</span>
                </div>
                `
                  : ``
              }
              ${
                body.suporteNotebookActive
                  ? `
                <div class="equipment-row">
                <span class="equipment-label">Acompanha Suporte de Notebook:</span>
                <span>SIM</span>
                </div>
                `
                  : `
                  s="equipment-row">
                <span class="equipment-label">Acompanha Suporte de Notebook:</span>
                <span>NÃO</span>
                </div>`
              }
               </div> 
              `
                : ``
            }
            ${
              body.celularActive ||
              body.carregadorCelularActive ||
              body.chipCelularActive
                ? `
              <div class="equipment-box">
              <div class="equipment-title">Dados do Celular</div>
              ${
                body.celularActive
                  ? `
                <div class="equipment-row">
                <span class="equipment-label">Modelo Celular:</span>
                <span>${body?.modeloCelular || ''}</span>
                </div>
                <div class="equipment-row">
                <span class="equipment-label">IMEI 1:</span>
                <span>${body?.imeiCelular1 || ''}</span>
                </div>
                <div class="equipment-row">
                <span class="equipment-label">IMEI 2:</span>
                <span>${body?.imeiCelular2 || ''}</span>
                </div>
                `
                  : ``
              }
              ${
                body.chipCelularActive
                  ? `
                <div class="equipment-row">
                <span class="equipment-label">Chip:</span>
                <span>${body.chipCelular}</span>
                </div>
                `
                  : ``
              }
              ${
                body.carregadorCelularActive
                  ? `
                <div class="equipment-row">
                <span class="equipment-label">Acompanha Carregador de Celular:</span>
                <span>SIM</span>
                </div>
                `
                  : `
                  <div class="equipment-row">
                <span class="equipment-label">Acompanha Carregador de Celular:</span>
                <span>NÃO</span>
                </div>`
              }
               </div> 
              `
                : ``
            }
                
                <p class="block">
                Eu, <strong>${inventario?.nomeColaborador || '________________________________'}</strong>, 
                CPF <strong>_______________________________</strong>, declaro para os devidos fins que recebi da
              empresa <strong>TRANS PIZZATTO TRANSPORTADORA DE CARGAS RODOV. LTDA</strong> o equipamento acima descrito,
              de uso exclusivo para assuntos relacionados ao meu contrato de trabalho.
            </p>

            <p class="block">
              Declaro estar ciente de que o equipamento deverá ser utilizado preferencialmente durante o horário de
              trabalho (salvo atividades previamente autorizadas), ficando consignado que o simples porte do equipamento
              não caracteriza tempo à disposição da empresa, tampouco regime de sobreaviso.
            </p>

            <p class="block">
              Comprometo-me a zelar pela guarda e conservação do equipamento, não sendo permitido o empréstimo
              a outros colaboradores ou terceiros. Em caso de extravio, dano ou mau uso, autorizo desde já o desconto
              em folha de pagamento dos valores necessários à reparação ou reposição, exceto nos casos de furto ou roubo
              devidamente comprovados por Boletim de Ocorrência.
            </p>

            <p class="block">
              Declaro ainda que a utilização do equipamento para fins estranhos às atividades profissionais poderá
              caracterizar violação de obrigação contratual, passível de aplicação de medidas disciplinares, incluindo
              despedida por justa causa, nos termos da legislação vigente.
            </p>

            <p class="block">
              Comprometo-me a devolver o equipamento e todos os acessórios fornecidos, em perfeitas condições de uso,
              imediatamente quando solicitado pela empresa ou na data do desligamento, seja a que título for.
            </p>

            <div class="signature-section">
              <div class="signature-wrapper">
                <div class="signature-block">
                  <div class="signature-line"></div>
                  <div class="signature-name">${inventario?.nomeColaborador || 'Colaborador(a)'}</div>
                  <div class="signature-role">Colaborador(a)</div>
                </div>

                <div class="signature-block">
                  <div class="signature-line"></div>
                  <div class="signature-name">TRANS PIZZATTO TRANSPORTADORA DE CARGAS RODOV. LTDA</div>
                  <div class="signature-role">Representante da Empresa</div>
                </div>
              </div>
            </div>
          </div>
        </body>
      </html>
    `;

      const browser = await puppeteer.launch({
        headless: true,
        executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || undefined,
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--disable-accelerated-2d-canvas',
          '--no-first-run',
          '--no-zygote',
          '--disable-gpu',
        ],
      });

      try {
        const page = await browser.newPage();

        await page.setContent(html, {
          waitUntil: ['load', 'domcontentloaded', 'networkidle0'],
          timeout: 60000,
        });

        await new Promise((resolve) => setTimeout(resolve, 1000));

        const pdfBuffer = await page.pdf({
          format: 'A4',
          printBackground: true,
          margin: {
            top: '20px',
            right: '20px',
            bottom: '20px',
            left: '20px',
          },
        });

        if (!pdfBuffer || pdfBuffer.length === 0) {
          throw new Error('PDF gerado está vazio');
        }

        const finalBuffer =
          pdfBuffer instanceof Buffer ? pdfBuffer : Buffer.from(pdfBuffer);

        console.log(`PDF gerado com ${finalBuffer.length} bytes`);

        return {
          pdfBase64: finalBuffer.toString('base64'),
          colaborador: inventario?.nomeColaborador,
        };
      } finally {
        await browser.close();
      }
    } catch (error: any) {
      console.error('Erro detalhado ao gerar PDF:', error);
      throw new BadRequestException(
        `Erro ao gerar PDF do contrato: ${error.message}`,
      );
    }
  }

  async getComputerByIdFull(id: number) {
    if (!id || Number.isNaN(id) || id <= 0) {
      throw new BadRequestException('ID inválido');
    }

    const sessionToken = await this.getValidSessionToken();

    const res = await firstValueFrom(
      this.http.get(`${this.baseUrl}/Computer/${id}`, {
        headers: this.headers({ 'Session-Token': sessionToken }),
        params: {
          expand_dropdowns: 'true',
          // with_devices: 'true',
          // with_networkports: 'true',
          // with_disks: 'true',
          // with_softwares: 'true',
          // with_connections: 'true',
          // with_infocoms: 'true',
        },
        maxRedirects: 0,
        validateStatus: (s) => s >= 200 && s < 400,
      }),
    );

    return res.data;
  }
}
