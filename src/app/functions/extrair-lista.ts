// O formato exato de retorno do connector-invoke do Senior varia — na prática,
// mesmo pedindo rootObject: 'dados' no request, o array volta em
// outputData.contents (confirmado em 2026-08-17 testando getEmpresa real).
// Mantém os outros formatos como fallback caso outro port responda diferente.
//
// Confirmado pelo cliente em 2026-08-26: quando o resultado tem só 1 item, o
// connector manda um OBJETO solto em vez de um array de 1 posição (mesma
// origem provável de bridge SOAP/XML→JSON — array de 1 elemento "colapsa").
// Sem tratar isso, um Empresa/Lote/Lançamento único era descartado
// silenciosamente (`return []`) mesmo com dado real vindo na resposta.
function comoArray<T>(valor: any): T[] | null {
  if (Array.isArray(valor)) return valor;
  if (valor && typeof valor === 'object') return [valor];
  return null;
}

export function extrairLista<T>(retorno: any): T[] {
  if (Array.isArray(retorno)) return retorno;
  const candidatos = [
    retorno?.outputData?.contents,
    retorno?.outputData?.dados,
    retorno?.outputData?.lotes,
    retorno?.outputData?.lancamentos,
    retorno?.contents,
    retorno?.dados,
    retorno?.lotes,
    retorno?.lancamentos,
  ];
  for (const candidato of candidatos) {
    const lista = comoArray<T>(candidato);
    if (lista) return lista;
  }
  // `retorno` inteiro NÃO entra no fallback de objeto único — é o envelope da
  // resposta (contém `outputData`/`id` etc.), não um registro de dado;
  // embrulhar isso como "1 item" produziria lixo.
  if (Array.isArray(retorno?.outputData)) return retorno.outputData;

  // Confirmado 2026-08-31 (getProjetosPorContas, resultado único — projeto
  // "NÃO APLICÁVEL"/"9.999.999"): às vezes o connector nem embrulha o
  // registro único numa chave (`dados`/`contents`/...) dentro de
  // `outputData` — manda os campos direto: `{ outputData: { nomPrj, numPrj,
  // responseCode } }`. Se `outputData` não tiver nenhuma das chaves de
  // envelope conhecidas, trata o próprio `outputData` como o registro único
  // (ignora `responseCode`, que é metadado do connector, não campo de dado).
  const outputData = retorno?.outputData;
  if (outputData && typeof outputData === 'object' && !Array.isArray(outputData)) {
    const chavesEnvelope = ['contents', 'dados', 'lotes', 'lancamentos'];
    const temChaveEnvelope = chavesEnvelope.some((chave) => chave in outputData);
    const { responseCode, ...registro } = outputData;
    if (!temChaveEnvelope && Object.keys(registro).length > 0) {
      return [registro as T];
    }
  }
  return [];
}
