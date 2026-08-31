// Nomes de campo == nomes de variável do processo BPM (camelCase), registradas
// de verdade via saveProcessContextVariables em 2026-08-17 (processId 29) —
// ver seção "Variáveis do processo BPM" em PROGRESSO.md.
export interface Formulario {
  numeroStc?: string;
  solicitante?: string;
  usuarioSolicitante?: string;
  areaSolicitante?: string;
  dataAbertura?: string;
  codEmp?: string;
  nomEmp?: string; // descrição resolvida ao selecionar a empresa (não só o código)
  codFil?: string;
  nomFil?: string; // descrição resolvida ao selecionar a filial (não só o código)
  tipoTransferencia?: 'Por Lote' | 'Manual';
  justificativa?: string;
  tipoAcao?: string;
  usuarioOrcamentaria?: string;
  // "Gestor da vez" do loop de aprovação por gestor de origem (RN046/049/050
  // espelhado pro lado Origem em 2026-08-26, ver comentário mais abaixo) —
  // reatribuído a cada passada, mesmo padrão de usuarioGestorDestino.
  usuarioGestorOrigem?: string;
  usuarioGestorDestino?: string;
  usuarioContabil?: string;
  numLote?: string;
  dados?: LinhaOrigem[] | any;
  linhasDestino?: LinhaDestino[] | any;
  modoDestino?: 'Unico' | 'Multiplo';

  // Espelho "achatado" do segmento contábil de destino no modo Único (mesmos
  // valores já vão dentro de cada linha de `linhasDestino`, mas os gestores de
  // aprovação/contábil precisam enxergar o segmento sem ter que parsear o JSON
  // — pedido do usuário em 2026-08-17: "todas as variáveis que vão navegar
  // entre os fluxos precisam ser mandadas"). No modo Múltiplo, cada linha pode
  // ter um segmento diferente, então esses campos ficam vazios — só `linhasDestino` vale.
  ctaRed?: string;
  desCta?: string;
  codCcu?: string;
  desCcu?: string;
  numPrj?: string;
  nomPrj?: string;
  codFpj?: string;
  desFpj?: string;

  // Fluxo de aprovações (confirmado com o cliente em 2026-08-17, ver "fluxo
  // diamante.png"): Solicitante → STCMO (orçamentária) → Gestor Origem → Gestor
  // Destino → Área Contábil → Fim. Só o STCMO devolve pro solicitante (com
  // parecer obrigatório); Gestor Origem/Destino e Área Contábil não devolvem —
  // se não aprovar, a STC é cancelada/encerrada direto, sem loop de correção.
  status?: string;
  parecerOrcamentaria?: string;
  parecerGestorOrigem?: string;
  parecerGestorDestino?: string;
  parecerAreaContabil?: string;

  // Loop de aprovação por gestor (RN046/049/050) — adicionado pro Destino em
  // 2026-08-22, espelhado pra Origem em 2026-08-26 depois de confirmado que
  // rateios de um mesmo lançamento podem ter Centros de Custo (logo,
  // gestores) diferentes já na ORIGEM, não só no destino. Em ambos os casos
  // pode haver mais de um gestor (um por CC/rateio distinto), e cada um
  // precisa de uma tarefa própria, não uma só pra etapa inteira.
  // `usuarioGestorOrigem`/`usuarioGestorDestino` passam a ser "o gestor da
  // vez" (reatribuído a cada volta do loop, ver OrigemComponent/
  // DestinoComponent.avancarEtapa() e AprovacaoComponent);
  // `parecerGestorOrigem`/`parecerGestorDestino`/`tipoAcao` continuam sendo a
  // decisão da passada atual.
  //
  // Controlam o gateway/loop no BPM Designer (mesmo padrão nos dois lados):
  // - aprovadoGestor{Origem,Destino}: decisão do gestor da vez ('Sim'/'Não').
  //   Se 'Não', a STC é cancelada na hora — os demais gestores pendentes nem
  //   chegam a ver a tarefa.
  // - temProximoGestor{Origem,Destino}: só avaliada se aprovado='Sim'. Se
  //   'Sim', o BPM volta o loop pra mesma tarefa (já reatribuída ao próximo
  //   usuarioGestor{Origem,Destino}); se 'Não', segue pra próxima etapa do
  //   fluxo (Gestor Destino → Área Contábil; Gestor Origem → Gestor Destino).
  aprovadoGestorOrigem?: string;
  temProximoGestorOrigem?: string;
  aprovadoGestorDestino?: string;
  temProximoGestorDestino?: string;
  // Histórico de decisão por gestor (auditoria) — cresce a cada passada do
  // loop. Serializado como JSON string em ServiceBpmService._saveData, mesmo
  // padrão de `dados`/`linhasDestino`.
  pareceresGestorOrigem?: ParecerGestor[] | any;
  pareceresGestorDestino?: ParecerGestor[] | any;
}

// Genérico — usado pelo histórico dos dois loops (pareceresGestorOrigem e
// pareceresGestorDestino), mesma estrutura nos dois.
export interface ParecerGestor {
  gestor: string;
  parecer?: string;
  decisao: 'Aprovado' | 'Negado';
  data: string;
}

// Contrato confirmado em ENDPOINTS.txt (2026-08-17): sem filtro de entrada,
// retorna todas as empresas/filiais — a Tela 1 filtra filiais por codEmp no
// cliente, já que o endpoint getFilial não aceita empresa como parâmetro.
export interface Empresa {
  codEmp: string;
  nomEmp: string;
}

export interface Filial {
  codEmp: string;
  codFil: string;
  nomFil: string;
  numCgc?: string;
}

// Contrato confirmado em ENDPOINTS.txt (2026-08-17) — usado na tela de Destino
// (segmento contábil = Conta + CC + Projeto + Fase, seção 6.1 dos requisitos).
export interface Projeto {
  codEmp: string;
  numPrj: string;
  nomPrj: string;
}

export interface FaseProjeto {
  codEmp: string;
  numPrj: string;
  codFpj: string;
  desFpj: string;
}

export interface ContaContabil {
  codEmp: string;
  ctaRed: string;
  desCta: string;
}

// `usuRes` (usuário responsável) é candidato a resolver a "regra de
// responsabilidade" (RN018/RN033, gestor de origem/destino por segmento) —
// pendência nº 3 da seção 8 do requisitos. Confirmar com o cliente antes de
// usar isso como identificação de gestor.
// `abrCcu` opcional: o port getCCPorContas (filtro em cascata por Conta+Projeto
// na tela de Destino, ver DestinoComponent/ENDPOINTS.txt) não devolve esse
// campo, diferente do getCentroCusto (lista completa, usado no Manual).
export interface CentroCusto {
  codEmp: string;
  codCcu: string;
  desCcu: string;
  abrCcu?: string;
  usuRes: string;
}

// Filtros da tela "Consulta do Lote" (seção 6.1 do requisitos). Entradas reais
// do port `getLotes` (ENDPOINTS.txt, confirmado 2026-08-24) — só codEmp/codFil,
// sem filtro de ano/número/origem/situação no servidor (esses campos nem
// existem mais no retorno, ver `Lote`). Filtro por Ano/Lote na tela vira
// client-side, aplicado sobre a lista completa (ConsultaLoteComponent).
export interface FiltrosLote {
  codEmp?: string;
  codFil?: string;
}

// Resultado da consulta de lotes elegíveis (port `getLotes`, resolve o
// bloqueador nº 1 do projeto — seção 9.2 dos requisitos — confirmado real em
// 2026-08-24, ver ENDPOINTS.txt). Nomes de campo iguais ao contrato do port,
// não ao padrão camelCase do resto do app (numLot/datLot/desLot, não
// numLote/dataLote/descricao) — mantido assim de propósito pra não mascarar
// qual campo vem de onde.
export interface Lote {
  codEmp: string;
  codFil: string;
  numLot: string;
  datLot: string;
  desLot: string;
  totDeb: number;
  totCre: number;
  totInf: number;
}

// Contrato real do port `getLancamentos` — CONFIRMADO contra payload real em
// 2026-08-26 (ver ENDPOINTS.txt, substitui o placeholder `consultarLinhasLote`).
// Casing é TODO lowerCamelCase (primeira letra minúscula) — diferente do que o
// cliente tinha informado por texto originalmente (que misturava PascalCase,
// ex: "NumLct"/"DebCre"); `ctaCre` também corrigido (era "ctaCra" no texto).
// Cada LANÇAMENTO retornado tem dentro um array de RATEIOS — é o rateio, não o
// lançamento, que carrega a classificação contábil (Conta Reduzida/CC/Projeto/
// Fase) e o valor.
export interface Rateio {
  ctaRed?: string;
  codCcu?: string;
  datLct?: string;
  ctaFin?: string;
  perRat?: string;
  // Indica se o rateio é lado Débito ou Crédito — confirmado contra payload
  // real em 2026-08-26: "D"/"C". Ver `normalizarNaturezaRateio` em
  // functions/lancamentos.ts.
  debCre?: string;
  numPrj?: string;
  codFpj?: string;
  vlrRat?: string;
}

export interface Lancamento {
  numLot?: string;
  numLct?: string;
  oriLct?: string;
  codFil?: string;
  datLct?: string;
  ctaDeb?: string;
  ctaCre?: string;
  vlrLct?: string;
  codHpd?: string;
  cplLct?: string;
  rateios?: Rateio[];
}

// Linha de origem = um RATEIO selecionado (achatado a partir de um
// `Lancamento`, ver functions/lancamentos.ts), não mais "um lançamento = uma
// linha" como a suposição antiga assumia (mudança de modelo em 2026-08-26,
// confirmada pelo cliente: um lançamento pode ter vários rateios, e o usuário
// escolhe quais rateios entram, não o lançamento inteiro).
//
// `lancamento` continua sendo a chave ÚNICA por linha (1 rateio = 1 linha de
// origem = 1 linha de destino em `montarComparativo`), sintetizada como
// `${numLct}-${índice do rateio}` — não confundir com `numLct`, que é a chave
// de AGRUPAMENTO (vários rateios com o mesmo `numLct` pertencem ao mesmo
// lançamento e vão pro mesmo destino, ver DestinoComponent). No modo Manual,
// `lancamento` continua sendo o fixo `'MANUAL-1'` (uma linha só, sem rateio).
export interface LinhaOrigem {
  lancamento?: string;
  numLot?: string;
  numLct?: string;
  oriLct?: string;
  datLct?: string;
  ctaRed?: string;
  desCta?: string;
  codCcu?: string;
  desCcu?: string;
  numPrj?: string;
  nomPrj?: string;
  codFpj?: string;
  desFpj?: string;
  // Vem do `Rateio.ctaFin` original (getLancamentos) — visto como "0" nos
  // testes de 2026-08-26 (ver ENDPOINTS.txt). Só usado (a partir de
  // 2026-08-31) pro campo `ctaFin` do rateio em `postLancamentos` — não
  // aparece em nenhuma tela.
  ctaFin?: string;
  natureza?: 'Debito' | 'Credito';
  valor?: number;
  historico?: string;
  gestor?: string;
}

// Segmento contábil de destino (seção 6.3) — guarda código E descrição de cada
// componente (não só o código), porque tudo que a tela monta precisa ir junto
// no `dados` enviado pro BPM (pedido do usuário em 2026-08-17), não só o que o
// usuário digitou.
export interface LinhaDestino {
  lancamento?: string; // vincula com LinhaOrigem.lancamento (chave única por rateio)
  // Chave de agrupamento (= LinhaOrigem.numLct) — copiada só pra permitir a
  // tela de Destino Múltiplo agrupar os rateios do mesmo lançamento num único
  // conjunto de campos editáveis (todos os rateios de um lançamento vão pro
  // mesmo destino, confirmado pelo cliente em 2026-08-26). Não é usada pelo
  // BPM, só pela UI (DestinoComponent.gruposMultiplo).
  numLct?: string;
  ctaRed?: string;
  desCta?: string;
  codCcu?: string;
  desCcu?: string;
  numPrj?: string;
  nomPrj?: string;
  codFpj?: string;
  desFpj?: string;
  natureza?: 'Debito' | 'Credito'; // sempre o inverso da natureza de origem
  valor?: number; // = valor da linha de origem vinculada
  historico?: string; // "RECLASSIFICAÇÃO" + número da STC + histórico original
  // TODO: identificação do gestor por segmento ainda não confirmada (usuRes do
  // Centro de Custo é candidato — ver comentário em CentroCusto).
  gestor?: string;
}

// Port `postLancamentos` (informado pelo usuário em 2026-08-31, NÃO testado
// contra payload real — ver ENDPOINTS.txt pra ressalvas completas: objeto
// raiz não confirmado, tipos de campo não confirmados, formato de retorno
// não confirmado). Resolve a geração do arquivo/lote no ERP (layout modelo
// 99098, registros E640LCT/E640RAT da seção 6.6 do STC_Diamante_Requisitos.md)
// — substitui a ideia antiga de gerar um arquivo por chamar essa API direto.
export interface RateioIntegracao {
  ctaRed: string;
  codCcu: string;
  ctaFin: string;
  perRat: number;
  debCre: 'D' | 'C';
  numPrj: string;
  codFpj: string;
  vlrRat: number;
}

export interface LancamentoIntegracao {
  codEmp: string;
  // Omitidos quando `tipo` (do body) é "M" (Manual) — STC Manual não tem
  // lote/lançamento de origem real no ERP.
  numLot?: string;
  numLct: string;
  oriLct?: string;
  codFil: string;
  datLct: string;
  ctaDeb: string;
  ctaCre: string;
  vlrLct: number;
  cplLct: string;
  rateios: RateioIntegracao[];
}
