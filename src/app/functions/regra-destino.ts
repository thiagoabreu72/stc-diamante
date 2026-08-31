// `inverterNatureza` (Débito↔Crédito): NÃO é mais usada pra calcular a
// natureza do Destino exibida na tela (DestinoComponent/
// OrigemDestinoManualComponent) — desde 2026-08-31, a natureza do Destino é
// sempre a MESMA da Origem (essa regra já flip-flopou várias vezes: inverte
// → mesma natureza → inverte de novo, tudo em 2026-08-26; virou "mesma
// natureza" de vez em 2026-08-31 depois de mapear o modelo real de postagem
// no ERP — o Rateio Destino do `postLancamentos` mantém a mesma natureza do
// rateio real de origem). A função continua existindo e em uso: é o que
// calcula a natureza do rateio de ESTORNO de origem em
// `construirLancamentosIntegracao()` (functions/integracao-erp.ts) — esse
// sim inverte, pra descontar/zerar o valor de onde estava antes.
// `historico` do destino continua igual nos dois fluxos: texto fixo +
// número da STC + histórico original, não editável pelo usuário.
export function inverterNatureza(
  natureza?: 'Debito' | 'Credito'
): 'Debito' | 'Credito' | undefined {
  if (natureza === 'Debito') return 'Credito';
  if (natureza === 'Credito') return 'Debito';
  return undefined;
}

export function montarHistoricoDestino(
  numeroStc: string | undefined,
  historicoOriginal: string | undefined
): string {
  return `RECLASSIFICAÇÃO ${numeroStc ?? ''} ${historicoOriginal ?? ''}`
    .replace(/\s+/g, ' ')
    .trim();
}
