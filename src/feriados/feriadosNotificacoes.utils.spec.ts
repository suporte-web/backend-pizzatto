import {
  dataSaoPaulo,
  filialChave,
  montarMensagem,
  ocorrencia,
  tresDiasUteisAntes,
} from './feriadosNotificacoes.utils';
import type { FeriadoNotificavel } from './feriadosNotificacoes.utils';

const feriado = (
  data: string,
  tipoFeriado = 'NACIONAL',
  filiais = ['Costeira'],
  recorrente = false,
): FeriadoNotificavel => ({
  id: 'f',
  nome: 'Dia de Finados',
  dataFeriado: new Date(`${data}T00:00:00Z`),
  tipoFeriado,
  filiais,
  recorrente,
});
const dia = (data: Date) => data.toISOString().slice(0, 10);

describe('Calendário dos comunicados', () => {
  it('antecipa Finados em três dias úteis, descontando o fim de semana', () => {
    expect(
      dia(
        tresDiasUteisAntes(new Date('2026-11-02T00:00:00Z'), ['Costeira'], []),
      ),
    ).toBe('2026-10-28');
  });
  it('exclui feriados nacionais e das filiais envolvidas, sem excluir outras filiais', () => {
    const calendario = [
      feriado('2026-10-29', 'MUNICIPAL'),
      feriado('2026-10-28', 'MUNICIPAL', ['Matriz']),
    ];
    const data = new Date('2026-11-02T00:00:00Z');
    expect(dia(tresDiasUteisAntes(data, ['Costeira'], calendario))).toBe(
      '2026-10-27',
    );
    calendario.push(feriado('2026-10-27', 'NACIONAL', ['Matriz']));
    expect(dia(tresDiasUteisAntes(data, ['Costeira'], calendario))).toBe(
      '2026-10-26',
    );
  });
  it('trata a virada do ano e recorrências anuais', () => {
    const calendario = [feriado('2024-01-01', 'NACIONAL', [], true)];
    expect(
      dia(
        tresDiasUteisAntes(
          new Date('2027-01-04T00:00:00Z'),
          ['Costeira'],
          calendario,
        ),
      ),
    ).toBe('2026-12-29');
    expect(
      ocorrencia(feriado('2024-02-29', 'NACIONAL', [], true), 2027),
    ).toBeNull();
    expect(
      dia(ocorrencia(feriado('2024-02-29', 'NACIONAL', [], true), 2028)!),
    ).toBe('2028-02-29');
  });
  it('usa São Paulo para a data e mantém ponto facultativo como dia útil', () => {
    expect(dia(dataSaoPaulo(new Date('2026-11-02T01:00:00Z')))).toBe(
      '2026-11-01',
    );
    expect(
      dia(
        tresDiasUteisAntes(
          new Date('2026-11-02T00:00:00Z'),
          ['Costeira'],
          [feriado('2026-10-29', 'PONTO_FACULTATIVO')],
        ),
      ),
    ).toBe('2026-10-28');
  });
  it.each([
    ['CEP_Port_o', 'CEP Portão'],
    ['Cama_ari', 'Camaçari'],
    ['S_o_Gon_alo_dos_Campos', 'São Gonçalo dos Campos'],
    ['COP___Boticario', 'COP - Boticario'],
  ])('reconhece a filial %s', (codigo, nome) => {
    expect(filialChave(codigo)).toBe(filialChave(nome));
  });
});

describe('Mensagem padrão', () => {
  it('preenche a data, o tipo e o nome; mantém destaques e orientação Costeira', () => {
    const f = feriado('2026-11-02');
    const mensagem = montarMensagem(f, f.dataFeriado, 'grh@example.com');
    expect(mensagem.html).toContain('<strong>02 de novembro de 2026</strong>');
    expect(mensagem.html).toContain('feriado nacional');
    expect(mensagem.html).toContain('<strong>Dia de Finados</strong>');
    expect(mensagem.html).toContain('não haverá fornecimento de refeições');
    expect(mensagem.texto).toContain('grh@example.com');
    expect(mensagem.texto).toContain('Alelo');
  });
  it('não inclui a orientação Costeira em feriado de outra filial', () => {
    const f = feriado('2026-11-02', 'MUNICIPAL', ['Matriz']);
    const mensagem = montarMensagem(f, f.dataFeriado);
    expect(mensagem.html).toContain('feriado municipal');
    expect(mensagem.html).not.toContain('Alelo');
  });
  it('escapa dados do cadastro e exige endereço completo do GRH para Costeira', () => {
    const f = { ...feriado('2026-11-02'), nome: '<img src=x>' };
    expect(
      montarMensagem(f, f.dataFeriado, 'grh@example.com').html,
    ).not.toContain('<img');
    expect(() => montarMensagem(f, f.dataFeriado, '@grh')).toThrow(
      'FERIADOS_EMAIL_GRH',
    );
  });
});
