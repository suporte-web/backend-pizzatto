import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Inventario } from './inventario.model';
import { CreateInventarioDto } from './dtos/createInventario.dto';
import moment from 'moment';
import puppeteer from 'puppeteer';
import * as fs from 'fs';
import * as path from 'path';

@Injectable()
export class InventarioService {
  constructor(
    @InjectModel('Inventario')
    private readonly inventarioModel: Model<Inventario>,
  ) {}

  async create(body: any) {
    const get = await this.inventarioModel.findOne({ tag: body.tag });

    if (get) {
      throw new BadRequestException('Item ja existe no Inventário');
    }
    return await this.inventarioModel.create(body);
  }

  async createBySpreadsheet(body: CreateInventarioDto[] | CreateInventarioDto) {
    if (Array.isArray(body)) {
      // Processar múltiplos registros
      return await Promise.all(
        body.map((item) => this.createOrUpdateRecord(item)),
      );
    } else {
      // Processar único registro
      return await this.createOrUpdateRecord(body);
    }
  }

  private async createOrUpdateRecord(data: CreateInventarioDto) {
    if (!data) {
      throw new BadRequestException('Dados inválidos');
    }

    const {
      EQUIPAMENTO,
      PATRIMÔNIO,
      TAG,
      'NOME DO COMPUTADOR': nomeComputador,
      'NOME FUNCIONÁRIO': nomeColaborador,
      LOCAL: localizacao,
    } = data;

    // Verificar se existe algum registro com o mesmo nomeComputador OU nomeColaborador
    const existingRecord = await this.inventarioModel.findOne({
      $or: [
        { nomeComputador: nomeComputador },
        { nomeColaborador: nomeColaborador },
      ],
    });

    if (existingRecord) {
      // Atualizar registro existente
      return await this.inventarioModel.findByIdAndUpdate(
        existingRecord._id,
        {
          equipamento: EQUIPAMENTO,
          patrimonio: PATRIMÔNIO,
          tag: TAG,
          nomeComputador: nomeComputador,
          nomeColaborador: nomeColaborador,
          localizacao: localizacao,
        },
        { new: true }, // Retorna o documento atualizado
      );
    } else {
      // Criar novo registro
      return await this.inventarioModel.create({
        equipamento: EQUIPAMENTO,
        patrimonio: PATRIMÔNIO,
        tag: TAG,
        nomeComputador: nomeComputador,
        nomeColaborador: nomeColaborador,
        localizacao: localizacao,
      });
    }
  }

  async findByFilter(body: any) {
    let { pesquisa, equipamento, setor, status, page, limit } = body;

    const skip = (page - 1) * limit;

    let query = {};

    if (pesquisa) {
      query['$or'] = [
        { nomeColaborador: { $regex: pesquisa, $options: 'i' } },
        { nomeComputador: { $regex: pesquisa, $options: 'i' } },
        { patrimonio: { $regex: pesquisa, $options: 'i' } },
        { tag: { $regex: pesquisa, $options: 'i' } },
        { localizacao: { $regex: pesquisa, $options: 'i' } },
      ];
    }
    if (equipamento)
      query['equipamento'] = { $regex: equipamento, $options: 'i' };
    if (setor) query['setor'] = { $regex: setor, $options: 'i' };
    if (status) query['status'] = status;

    const result = await this.inventarioModel
      .find(query)
      .skip(skip)
      .limit(limit)
      .sort({ nomeComputador: 1 })
      .exec();
    const total = await this.inventarioModel.countDocuments(query);
    return { result, total };
  }

  async update(body: any) {
    return await this.inventarioModel.findByIdAndUpdate(body._id, body);
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

  async createPdfTermo(id: string) {
    try {
      const inventario: any = await this.inventarioModel.findById(id);

      if (!inventario) {
        throw new BadRequestException('Contrato não encontrado');
      }

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

            <div class="equipment-box">
              <div class="equipment-title">Dados do Equipamento</div>
              <div class="equipment-row">
                <span class="equipment-label">Equipamento:</span>
                <span> ${inventario?.equipamento || ''}</span>
              </div>
              <div class="equipment-row">
                <span class="equipment-label">Nome do computador:</span>
                <span> ${inventario?.nomeComputador || ''}</span>
              </div>
              <div class="equipment-row">
                <span class="equipment-label">TAG / Patrimônio:</span>
                <span> ${inventario?.tag || ''}</span>
              </div>
            </div>

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
}
