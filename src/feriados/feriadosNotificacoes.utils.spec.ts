import {
  dataSaoPaulo,
  filialChave,
  montarMensagem,
  ocorrencia,
  tresDiasUteisAntes,
  estaNaJanelaDeNotificacao,
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

describe('Janela de três a um dia útil antes', () => {
  const data = new Date('2026-11-20T00:00:00Z');
  it.each(['2026-11-17', '2026-11-18', '2026-11-19'])(
    'inclui o dia útil %s',
    (dia) => {
      expect(
        estaNaJanelaDeNotificacao(
          data,
          new Date(`${dia}T00:00:00Z`),
          ['Costeira'],
          [],
        ),
      ).toBe(true);
    },
  );
  it.each(['2026-11-16', '2026-11-20', '2026-11-21'])(
    'exclui dia fora da janela: %s',
    (dia) => {
      expect(
        estaNaJanelaDeNotificacao(
          data,
          new Date(`${dia}T00:00:00Z`),
          ['Costeira'],
          [],
        ),
      ).toBe(false);
    },
  );
  it('considera feriado cadastrado no intervalo e não tenta nele', () => {
    const calendario = [feriado('2026-11-18')];
    for (const dia of ['2026-11-16', '2026-11-17', '2026-11-19']) {
      expect(
        estaNaJanelaDeNotificacao(
          data,
          new Date(`${dia}T00:00:00Z`),
          ['Costeira'],
          calendario,
        ),
      ).toBe(true);
    }
    expect(
      estaNaJanelaDeNotificacao(
        data,
        new Date('2026-11-18T00:00:00Z'),
        ['Costeira'],
        calendario,
      ),
    ).toBe(false);
  });
  it('não exclui feriado municipal de uma filial diferente', () => {
    const calendario = [feriado('2026-11-18', 'MUNICIPAL', ['Matriz'])];
    expect(
      estaNaJanelaDeNotificacao(
        data,
        new Date('2026-11-18T00:00:00Z'),
        ['Costeira'],
        calendario,
      ),
    ).toBe(true);
  });
  it('exclui sábado e domingo mesmo entre a primeira e a última data de envio', () => {
    const segunda = new Date('2026-11-23T00:00:00Z');
    for (const dia of ['2026-11-21', '2026-11-22']) {
      expect(
        estaNaJanelaDeNotificacao(
          segunda,
          new Date(`${dia}T00:00:00Z`),
          ['Costeira'],
          [],
        ),
      ).toBe(false);
    }
  });
  it('considera a janela no ano anterior para feriado recorrente em janeiro', () => {
    const janeiro = new Date('2027-01-04T00:00:00Z');
    const calendario = [feriado('2024-01-01', 'NACIONAL', [], true)];
    for (const dia of ['2026-12-29', '2026-12-30', '2026-12-31']) {
      expect(
        estaNaJanelaDeNotificacao(
          janeiro,
          new Date(`${dia}T00:00:00Z`),
          ['Costeira'],
          calendario,
        ),
      ).toBe(true);
    }
    expect(
      estaNaJanelaDeNotificacao(
        janeiro,
        new Date('2027-01-01T00:00:00Z'),
        ['Costeira'],
        calendario,
      ),
    ).toBe(false);
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
