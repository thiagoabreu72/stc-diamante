// Mock temporário/fallback offline — `getLotes` e `getLancamentos` já são
// reais desde 2026-08-24/26 (`MOCK_LOTES_ATIVO`/`MOCK_LINHAS_LOTE_ATIVO=false`
// em service-bpm.service.ts). `MOCK_LINHAS_LOTE` usa o casing REAL confirmado
// contra payload em 2026-08-26 (lowerCamelCase, ver stc.interface.ts) — cada
// lançamento tem 2 rateios (Débito/Crédito) simulando uma reclassificação
// simples.
import { FiltrosLote, Lancamento, Lote } from '../interfaces/stc.interface';

export const MOCK_LOTES: Lote[] = [
  {
    codEmp: '1',
    codFil: '1',
    numLot: '000123',
    datLot: '2026-07-15',
    desLot: 'Lote de Compras - Julho/26',
    totDeb: 15230.5,
    totCre: 15230.5,
    totInf: 15230.5,
  },
  {
    codEmp: '1',
    codFil: '1',
    numLot: '000124',
    datLot: '2026-07-22',
    desLot: 'Lote de Estoque - Julho/26',
    totDeb: 8900.0,
    totCre: 8900.0,
    totInf: 8900.0,
  },
  {
    codEmp: '1',
    codFil: '1',
    numLot: '000125',
    datLot: '2026-08-01',
    desLot: 'Lote Manual - Ajuste Agosto/26',
    totDeb: 3200.75,
    totCre: 3200.75,
    totInf: 3200.75,
  },
  {
    codEmp: '1',
    codFil: '1',
    numLot: '000126',
    datLot: '2026-08-05',
    desLot: 'Lote de Pagamentos - Agosto/26',
    totDeb: 42150.0,
    totCre: 42150.0,
    totInf: 42150.0,
  },
  {
    codEmp: '1',
    codFil: '1',
    numLot: '000098',
    datLot: '2025-12-10',
    desLot: 'Lote de Compras - Dezembro/25',
    totDeb: 5400.0,
    totCre: 5400.0,
    totInf: 5400.0,
  },
];

export const MOCK_LINHAS_LOTE: Record<string, Lancamento[]> = {
  '000123': [
    {
      numLot: '000123',
      numLct: '000123-1',
      oriLct: 'CPR',
      codFil: '1',
      datLct: '15/07/2026',
      ctaDeb: '110205',
      ctaCre: '210310',
      vlrLct: '15230.50',
      codHpd: '001',
      cplLct: 'CP FORNECEDOR PARAFUSOS E CIA LTDA NF 4521',
      rateios: [
        { ctaRed: '110205', codCcu: '00101', datLct: '15/07/2026', debCre: 'D', numPrj: undefined, codFpj: undefined, vlrRat: '15230.50' },
        { ctaRed: '210310', codCcu: '00101', datLct: '15/07/2026', debCre: 'C', numPrj: undefined, codFpj: undefined, vlrRat: '15230.50' },
      ],
    },
  ],
  '000124': [
    {
      numLot: '000124',
      numLct: '000124-1',
      oriLct: 'EST',
      codFil: '1',
      datLct: '22/07/2026',
      ctaDeb: '113301',
      ctaCre: '311020',
      vlrLct: '4500.00',
      codHpd: '002',
      cplLct: 'BAIXA DE ESTOQUE - REQUISIÇÃO 8842',
      rateios: [
        { ctaRed: '113301', codCcu: '00202', datLct: '22/07/2026', debCre: 'D', vlrRat: '4500.00' },
        { ctaRed: '311020', codCcu: '00202', datLct: '22/07/2026', debCre: 'C', vlrRat: '4500.00' },
      ],
    },
    {
      numLot: '000124',
      numLct: '000124-2',
      oriLct: 'EST',
      codFil: '1',
      datLct: '23/07/2026',
      ctaDeb: '113301',
      ctaCre: '311020',
      vlrLct: '4400.00',
      codHpd: '002',
      cplLct: 'BAIXA DE ESTOQUE - REQUISIÇÃO 8850',
      rateios: [
        { ctaRed: '113301', codCcu: '00202', datLct: '23/07/2026', debCre: 'D', vlrRat: '4400.00' },
        { ctaRed: '311020', codCcu: '00202', datLct: '23/07/2026', debCre: 'C', vlrRat: '4400.00' },
      ],
    },
  ],
  '000125': [
    {
      numLot: '000125',
      numLct: '000125-1',
      oriLct: 'MAN',
      codFil: '1',
      datLct: '01/08/2026',
      ctaDeb: '410102',
      ctaCre: '410205',
      vlrLct: '3200.75',
      codHpd: '003',
      cplLct: 'AJUSTE MANUAL DE CLASSIFICAÇÃO',
      rateios: [
        { ctaRed: '410102', codCcu: '00305', datLct: '01/08/2026', debCre: 'D', vlrRat: '3200.75' },
        { ctaRed: '410205', codCcu: '00305', datLct: '01/08/2026', debCre: 'C', vlrRat: '3200.75' },
      ],
    },
  ],
  '000126': [
    {
      numLot: '000126',
      numLct: '000126-1',
      oriLct: 'PAG',
      codFil: '1',
      datLct: '05/08/2026',
      ctaDeb: '210310',
      ctaCre: '110101',
      vlrLct: '18000.00',
      codHpd: '004',
      cplLct: 'PAGAMENTO FORNECEDOR ENERGIA SUL SA',
      rateios: [
        { ctaRed: '210310', codCcu: '00101', datLct: '05/08/2026', debCre: 'D', vlrRat: '18000.00' },
        { ctaRed: '110101', codCcu: '00101', datLct: '05/08/2026', debCre: 'C', vlrRat: '18000.00' },
      ],
    },
    {
      numLot: '000126',
      numLct: '000126-2',
      oriLct: 'PAG',
      codFil: '1',
      datLct: '06/08/2026',
      ctaDeb: '210310',
      ctaCre: '110101',
      vlrLct: '12650.00',
      codHpd: '004',
      cplLct: 'PAGAMENTO FORNECEDOR MANUTENÇÃO INDUSTRIAL LTDA',
      rateios: [
        { ctaRed: '210310', codCcu: '00404', datLct: '06/08/2026', debCre: 'D', vlrRat: '12650.00' },
        { ctaRed: '110101', codCcu: '00404', datLct: '06/08/2026', debCre: 'C', vlrRat: '12650.00' },
      ],
    },
    {
      numLot: '000126',
      numLct: '000126-3',
      oriLct: 'PAG',
      codFil: '1',
      datLct: '07/08/2026',
      ctaDeb: '210310',
      ctaCre: '110101',
      vlrLct: '11500.00',
      codHpd: '004',
      cplLct: 'PAGAMENTO FORNECEDOR TRANSPORTES RÁPIDO LTDA',
      rateios: [
        { ctaRed: '210310', codCcu: '00101', datLct: '07/08/2026', debCre: 'D', vlrRat: '11500.00' },
        { ctaRed: '110101', codCcu: '00101', datLct: '07/08/2026', debCre: 'C', vlrRat: '11500.00' },
      ],
    },
  ],
  '000098': [
    {
      numLot: '000098',
      numLct: '000098-1',
      oriLct: 'CPR',
      codFil: '1',
      datLct: '10/12/2025',
      ctaDeb: '110205',
      ctaCre: '210310',
      vlrLct: '5400.00',
      codHpd: '001',
      cplLct: 'CP FORNECEDOR EQUIPAMENTOS DIAMANTE LTDA NF 998',
      rateios: [
        { ctaRed: '110205', codCcu: '00202', datLct: '10/12/2025', debCre: 'D', vlrRat: '5400.00' },
        { ctaRed: '210310', codCcu: '00202', datLct: '10/12/2025', debCre: 'C', vlrRat: '5400.00' },
      ],
    },
  ],
  '000200': [
    {
      numLot: '000200',
      numLct: '000200-1',
      oriLct: 'EST',
      codFil: '1',
      datLct: '10/08/2026',
      ctaDeb: '113301',
      ctaCre: '311020',
      vlrLct: '1200.00',
      codHpd: '002',
      cplLct: 'BAIXA DE ESTOQUE - REQUISIÇÃO 9010',
      rateios: [
        { ctaRed: '113301', codCcu: '00305', datLct: '10/08/2026', debCre: 'D', vlrRat: '1200.00' },
        { ctaRed: '311020', codCcu: '00305', datLct: '10/08/2026', debCre: 'C', vlrRat: '1200.00' },
      ],
    },
  ],
};

// Filtra em memória do mesmo jeito que o port `getLotes` real filtra no
// servidor — só por codEmp/codFil (contrato confirmado em ENDPOINTS.txt,
// 2026-08-24). Filtro por Ano/Lote da tela é aplicado depois, em memória, por
// ConsultaLoteComponent — não faz parte do contrato do port, então não entra
// aqui.
export function filtrarLotesMock(filtros: FiltrosLote): Lote[] {
  return MOCK_LOTES.filter((lote) => {
    if (filtros.codEmp && lote.codEmp !== filtros.codEmp) {
      return false;
    }
    if (filtros.codFil && lote.codFil !== filtros.codFil) {
      return false;
    }
    return true;
  });
}
