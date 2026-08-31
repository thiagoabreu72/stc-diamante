import { ParecerGestor } from '../interfaces/stc.interface';

// Fila de aprovação por gestor (RN046/049/050) — genérico, reaproveitado
// pelos dois loops (Gestor de Origem e Gestor de Destino, ver
// AprovacaoComponent.avancarLoopGestor()). Renomeado/generalizado em
// 2026-08-26: até então só existia pro lado Destino (`gestoresDistintosDestino`,
// antigo functions/gestores-destino.ts) — o cliente confirmou que rateios de
// um mesmo lançamento podem ter gestores de ORIGEM diferentes entre si (via
// seu próprio Centro de Custo), então o mesmo mecanismo de loop passou a
// valer também pra Origem.
export function gestoresDistintos(linhas: { gestor?: string }[] | any): string[] {
  const lista: { gestor?: string }[] = Array.isArray(linhas) ? linhas : [];
  const distintos: string[] = [];
  lista.forEach((linha) => {
    if (linha?.gestor && !distintos.includes(linha.gestor)) {
      distintos.push(linha.gestor);
    }
  });
  return distintos;
}

// Linhas sob responsabilidade de um gestor específico — usado pra filtrar o
// que cada gestor vê/aprova na sua vez do loop (AprovacaoComponent) e pra
// contar quantas linhas/rateios cada gestor tem (painel de status,
// ImpressaoComponent).
export function linhasDoGestor<T extends { gestor?: string }>(
  linhas: T[] | any,
  gestor?: string
): T[] {
  const lista: T[] = Array.isArray(linhas) ? linhas : [];
  return gestor ? lista.filter((linha) => linha?.gestor === gestor) : [];
}

// Primeiro gestor da fila que ainda não decidiu (não aparece no histórico de
// pareceres) — undefined quando todos já decidiram, sinalizando fim do loop.
export function proximoGestorPendente(
  gestoresDistintosLista: string[],
  pareceres: ParecerGestor[] | any
): string | undefined {
  const decididos = new Set(
    (Array.isArray(pareceres) ? pareceres : []).map((p: ParecerGestor) => p.gestor)
  );
  return gestoresDistintosLista.find((gestor) => !decididos.has(gestor));
}

export interface StatusGestor {
  gestor: string;
  status: 'Aprovado' | 'Negado' | 'Sua vez' | 'Na fila';
  parecer?: string;
  data?: string;
}

// Painel de status por gestor (ImpressaoComponent, pedido do usuário em
// 2026-08-26: "preciso saber o status de cada um, se o gestor que tem 3
// rateio aprovar aparecer o status aprovado para ele"). Cruza a fila
// ordenada de gestores com o histórico de pareceres e com quem é "a vez"
// agora (usuarioGestorOrigem/usuarioGestorDestino) pra saber se cada um já
// decidiu, está decidindo agora, ou ainda nem chegou a vez dele.
export function statusPorGestor(
  gestoresDistintosLista: string[],
  pareceres: ParecerGestor[] | any,
  gestorDaVez: string | undefined
): StatusGestor[] {
  const historico: ParecerGestor[] = Array.isArray(pareceres) ? pareceres : [];
  return gestoresDistintosLista.map((gestor) => {
    const decisao = historico.find((p) => p.gestor === gestor);
    if (decisao) {
      return {
        gestor,
        status: decisao.decisao === 'Aprovado' ? 'Aprovado' : 'Negado',
        parecer: decisao.parecer,
        data: decisao.data,
      };
    }
    return { gestor, status: gestor === gestorDaVez ? 'Sua vez' : 'Na fila' };
  });
}
