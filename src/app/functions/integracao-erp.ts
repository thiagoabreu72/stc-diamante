import { LinhaComparativo } from './comparativo';
import { LancamentoIntegracao, RateioIntegracao } from '../interfaces/stc.interface';
import { inverterNatureza } from './regra-destino';

function paraDebCre(natureza: 'Debito' | 'Credito' | undefined): 'D' | 'C' {
  return natureza === 'Debito' ? 'D' : 'C';
}

// Par de rateios (Destino + Origem/estorno) de UMA linha do comparativo —
// mesmo cálculo pro Por Lote (1 par = 1 lançamento) e pro Manual (N pares
// consolidados em 1 lançamento só, ver construirLancamentoManual abaixo).
//
// Modelo confirmado pelo usuário em 2026-08-31 (2 rodadas — a 1ª explicação
// tinha uma inversão errada, corrigida na 2ª):
//   1. Rateio "Destino": classificação (Conta/CC/Projeto/Fase) escolhida
//      pelo solicitante — natureza IGUAL à do rateio real de origem (NÃO
//      inverte: "o rateio será o crédito e no destino ele continuará sendo
//      crédito").
//   2. Rateio "Origem" (estorno): classificação ORIGINAL do rateio real
//      (a mesma Conta/CC/Projeto/Fase que já veio de getLancamentos, ou —
//      no Manual — a mesma digitada em Origem) — natureza INVERTIDA ("só
//      vira débito o de origem, pra descontarmos") — é o que zera/desconta
//      o valor de onde ele estava antes.
function montarParDeRateios(l: LinhaComparativo): {
  rateioDestino: RateioIntegracao;
  rateioOrigemEstorno: RateioIntegracao;
  debCreDestino: 'D' | 'C';
  debCreOrigem: 'D' | 'C';
  valor: number;
} {
  const origem = l.origem;
  const destino = l.destino!;
  const valor = destino.valor ?? origem.valor ?? 0;
  const debCreDestino = paraDebCre(origem.natureza);
  const debCreOrigem = paraDebCre(inverterNatureza(origem.natureza));

  const rateioDestino: RateioIntegracao = {
    ctaRed: destino.ctaRed ?? '',
    codCcu: destino.codCcu ?? '',
    ctaFin: origem.ctaFin ?? '',
    perRat: 100,
    debCre: debCreDestino,
    numPrj: destino.numPrj ?? '',
    codFpj: destino.codFpj ?? '',
    vlrRat: valor,
  };

  const rateioOrigemEstorno: RateioIntegracao = {
    ctaRed: origem.ctaRed ?? '',
    codCcu: origem.codCcu ?? '',
    ctaFin: origem.ctaFin ?? '',
    perRat: 100,
    debCre: debCreOrigem,
    numPrj: origem.numPrj ?? '',
    codFpj: origem.codFpj ?? '',
    vlrRat: valor,
  };

  return { rateioDestino, rateioOrigemEstorno, debCreDestino, debCreOrigem, valor };
}

// Por Lote (tipo "L"): 1 lançamento por LINHA do comparativo (1:1 com
// LinhaComparativo) — cabeçalho `ctaDeb`/`ctaCre` (E640LCT) decorre direto
// do par: é a conta cujo rateio ficou "D"/"C" respectivamente, não é uma
// regra separada.
//
// DECISÃO NÃO CONFIRMADA (assumida por falta de informação — sinalizar pro
// usuário antes de considerar definitivo): mesmo no modo Único onde várias
// linhas de origem compartilham o mesmo destino, NÃO consolida múltiplas
// origens num único lançamento, porque `ctaDeb`/`ctaCre` são por PAR
// origem/destino (contas de origem podem divergir entre linhas mesmo com
// destino igual) e não há informação suficiente pra saber se o usuário quer
// consolidar por conta-de-origem distinta ou manter 1:1 com a linha.
function construirLancamentosPorLote(
  linhas: LinhaComparativo[],
  codEmp: string | undefined,
  codFil: string | undefined
): LancamentoIntegracao[] {
  return linhas.map((l) => {
    const origem = l.origem;
    const destino = l.destino!;
    const { rateioDestino, rateioOrigemEstorno, debCreDestino, valor } = montarParDeRateios(l);
    const ctaDeb = (debCreDestino === 'D' ? destino.ctaRed : origem.ctaRed) ?? '';
    const ctaCre = (debCreDestino === 'C' ? destino.ctaRed : origem.ctaRed) ?? '';

    return {
      codEmp: codEmp ?? '',
      numLot: origem.numLot,
      numLct: origem.numLct ?? origem.lancamento ?? '',
      oriLct: origem.oriLct,
      codFil: codFil ?? '',
      datLct: origem.datLct ?? '',
      ctaDeb,
      ctaCre,
      vlrLct: valor,
      cplLct: destino.historico ?? origem.historico ?? '',
      rateios: [rateioDestino, rateioOrigemEstorno],
    };
  });
}

// Manual (tipo "M"): diferente do Por Lote, NÃO existe um lançamento real do
// ERP sendo reclassificado — é 1 movimento novo só, criado do zero pelo
// solicitante (que pode ter N destinos, ver OrigemDestinoManualComponent —
// split 1 origem -> N destinos, pedido do usuário em 2026-09-02). Confirmado
// pelo usuário no mesmo dia ("mesma estrutura só que daí é um lançamento com
// vários rateios"): todas as N fatias viram RATEIOS de 1 ÚNICO lançamento
// (2N rateios: N pares Destino+Origem-estorno), não N lançamentos separados
// como o Por Lote.
//
// ATENÇÃO — `ctaDeb`/`ctaCre` do CABEÇALHO NÃO CONFIRMADO com N destinos de
// contas diferentes: o header só tem 1 valor de cada, mas o lado Origem
// (estorno) é sempre a MESMA conta em toda fatia (só existe 1 origem no
// Manual) — usada com segurança abaixo — enquanto o lado Destino pode ter
// até N contas diferentes (1 por destino). Usa a conta do PRIMEIRO destino
// como valor mais plausível pro campo do cabeçalho — os N rateios de
// verdade (cada um com sua própria conta) continuam corretos dentro de
// `rateios[]` independente disso. CONFIRMAR com o usuário/ERP antes de
// considerar definitivo, principalmente se os destinos tiverem contas
// diferentes entre si.
function construirLancamentoManual(
  linhas: LinhaComparativo[],
  codEmp: string | undefined,
  codFil: string | undefined
): LancamentoIntegracao[] {
  if (!linhas.length) {
    return [];
  }
  const origem = linhas[0].origem;
  const rateios: RateioIntegracao[] = [];
  let vlrLct = 0;

  linhas.forEach((l) => {
    const { rateioDestino, rateioOrigemEstorno, valor } = montarParDeRateios(l);
    rateios.push(rateioDestino, rateioOrigemEstorno);
    vlrLct += valor;
  });

  // Cabeçalho baseado no 1º destino (ver ressalva no comentário da função).
  const primeiroDestino = montarParDeRateios(linhas[0]);
  const ctaDeb =
    (primeiroDestino.debCreDestino === 'D'
      ? primeiroDestino.rateioDestino.ctaRed
      : origem.ctaRed) ?? '';
  const ctaCre =
    (primeiroDestino.debCreDestino === 'C'
      ? primeiroDestino.rateioDestino.ctaRed
      : origem.ctaRed) ?? '';

  return [
    {
      codEmp: codEmp ?? '',
      // Sem numLot/oriLct — STC Manual não tem lote/lançamento de origem
      // real no ERP (pedido do usuário em 2026-08-31).
      numLct: 'MANUAL-1',
      codFil: codFil ?? '',
      datLct: origem.datLct ?? '',
      ctaDeb,
      ctaCre,
      vlrLct,
      cplLct: origem.historico ?? '',
      rateios,
    },
  ];
}

// Monta o array `dados` do port `postLancamentos` (ver ENDPOINTS.txt) a
// partir do comparativo Origem×Destino da STC — Por Lote gera 1 lançamento
// por linha, Manual consolida tudo em 1 lançamento só (ver funções acima).
export function construirLancamentosIntegracao(
  linhas: LinhaComparativo[],
  tipo: 'M' | 'L',
  codEmp: string | undefined,
  codFil: string | undefined
): LancamentoIntegracao[] {
  const linhasValidas = linhas
    .filter((l) => !!l.destino)
    // Rateio com Centro de Custo "99999999" não conta pra integração
    // (pedido do usuário em 2026-08-31) — continua aparecendo/selecionável
    // normalmente na tela de Origem, só é ignorado aqui na montagem do
    // postLancamentos.
    .filter((l) => l.origem.codCcu !== '99999999');

  return tipo === 'M'
    ? construirLancamentoManual(linhasValidas, codEmp, codFil)
    : construirLancamentosPorLote(linhasValidas, codEmp, codFil);
}
