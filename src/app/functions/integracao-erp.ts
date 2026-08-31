import { LinhaComparativo } from './comparativo';
import { LancamentoIntegracao, RateioIntegracao } from '../interfaces/stc.interface';
import { inverterNatureza } from './regra-destino';

function paraDebCre(natureza: 'Debito' | 'Credito' | undefined): 'D' | 'C' {
  return natureza === 'Debito' ? 'D' : 'C';
}

// Monta o array `dados` do port `postLancamentos` (ver ENDPOINTS.txt) a
// partir do comparativo Origem×Destino da STC.
//
// Modelo confirmado pelo usuário em 2026-08-31 (2 rodadas — a 1ª explicação
// tinha uma inversão errada, corrigida na 2ª):
// - Cada rateio de origem selecionado (exceto o de Centro de Custo
//   "99999999", que não conta — filtrado abaixo, mas continua aparecendo
//   normalmente pra seleção na tela de Origem) vira 1 LANÇAMENTO com 2
//   RATEIOS:
//   1. Rateio "Destino": classificação (Conta/CC/Projeto/Fase) escolhida
//      pelo solicitante — natureza IGUAL à do rateio real de origem (NÃO
//      inverte: "o rateio será o crédito e no destino ele continuará sendo
//      crédito").
//   2. Rateio "Origem" (estorno): classificação ORIGINAL do rateio real
//      (a mesma Conta/CC/Projeto/Fase que já veio de getLancamentos) —
//      natureza INVERTIDA ("só vira débito o de origem, pra descontarmos")
//      — é o que zera/desconta o valor de onde ele estava antes.
// - Cabeçalho `ctaDeb`/`ctaCre` (E640LCT) decorre direto disso: é a conta
//   cujo rateio ficou "D"/"C" respectivamente — não é uma regra separada.
//
// DECISÃO NÃO CONFIRMADA (assumida por falta de informação — sinalizar pro
// usuário antes de considerar definitivo): gera 1 lançamento por LINHA do
// comparativo (1:1 com LinhaComparativo), mesmo no modo Único onde várias
// linhas de origem compartilham o mesmo destino — NÃO consolida múltiplas
// origens num único lançamento, porque `ctaDeb`/`ctaCre` são por PAR
// origem/destino (contas de origem podem divergir entre linhas mesmo com
// destino igual) e não há informação suficiente pra saber se o usuário quer
// consolidar por conta-de-origem distinta ou manter 1:1 com a linha.
export function construirLancamentosIntegracao(
  linhas: LinhaComparativo[],
  tipo: 'M' | 'L',
  codEmp: string | undefined,
  codFil: string | undefined
): LancamentoIntegracao[] {
  return linhas
    .filter((l) => !!l.destino)
    // Rateio com Centro de Custo "99999999" não conta pra integração
    // (pedido do usuário em 2026-08-31) — continua aparecendo/selecionável
    // normalmente na tela de Origem, só é ignorado aqui na montagem do
    // postLancamentos.
    .filter((l) => l.origem.codCcu !== '99999999')
    .map((l) => {
      const origem = l.origem;
      const destino = l.destino!;
      const valor = destino.valor ?? origem.valor ?? 0;

      // Rateio Destino: mesma natureza do rateio real de origem (não
      // inverte). Rateio Origem (estorno): natureza invertida — mesma
      // função `inverterNatureza()` usada em toda a regra de negócio do
      // Destino (ver functions/regra-destino.ts).
      const debCreDestino = paraDebCre(origem.natureza);
      const debCreOrigem = paraDebCre(inverterNatureza(origem.natureza));
      const ctaDeb = (debCreDestino === 'D' ? destino.ctaRed : origem.ctaRed) ?? '';
      const ctaCre = (debCreDestino === 'C' ? destino.ctaRed : origem.ctaRed) ?? '';

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

      const lancamento: LancamentoIntegracao = {
        codEmp: codEmp ?? '',
        numLct: origem.numLct ?? origem.lancamento ?? '',
        codFil: codFil ?? '',
        datLct: origem.datLct ?? '',
        ctaDeb,
        ctaCre,
        vlrLct: valor,
        cplLct: destino.historico ?? origem.historico ?? '',
        rateios: [rateioDestino, rateioOrigemEstorno],
      };

      // Tipo "M" (Manual): STC não tem lote/lançamento de origem real no
      // ERP — não manda numLot nem oriLct (pedido do usuário em 2026-08-31).
      if (tipo === 'L') {
        lancamento.numLot = origem.numLot;
        lancamento.oriLct = origem.oriLct;
      }

      return lancamento;
    });
}
