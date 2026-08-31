import { Component, EventEmitter, Input, OnChanges, OnInit, Output, SimpleChanges } from '@angular/core';
import { FormBuilder, FormGroup } from '@angular/forms';
import { Mensagem } from '../interfaces/gerais.interface';
import { FiltrosLote, Formulario, Lote } from '../interfaces/stc.interface';
import { ServiceBpmService } from '../services/service-bpm.service';
import { extrairLista } from '../functions/extrair-lista';

// `datLot` vem da API real como dd/mm/yyyy (ex: "31/12/2023", confirmado
// 2026-08-24) — o mock antigo usava yyyy-mm-dd, por isso o filtro de Ano
// aceita os dois formatos (mock continua funcionando como fallback offline).
function anoDoLote(datLot: string | undefined): string | null {
  if (!datLot) {
    return null;
  }
  if (/^\d{4}-/.test(datLot)) {
    return datLot.slice(0, 4);
  }
  const partes = datLot.split('/');
  return partes.length === 3 ? partes[2] : null;
}

// Normaliza só pra COMPARAR (não pra guardar/mandar pro BPM, que continua
// com o valor original) — tira espaço e zero à esquerda. Pedido do usuário
// em 2026-08-31: mesmo filtrando pelo número do lote (que acha na lista via
// `.includes()`, mais tolerante) ele não aparecia selecionado — suspeita
// além do mismatch de tipo já corrigido (String vs number): o valor salvo na
// variável de processo do BPM pode ter um formato levemente diferente do que
// a API devolve agora (ex: "00063911" vs "63911", ou espaço sobrando).
function normalizarNumLote(valor: string | number | undefined | null): string {
  return String(valor ?? '')
    .trim()
    .replace(/^0+(?=\d)/, '');
}

@Component({
  selector: 'app-consulta-lote',
  templateUrl: './consulta-lote.component.html',
  styleUrls: ['./consulta-lote.component.scss'],
})
export class ConsultaLoteComponent implements OnInit, OnChanges {
  // Componente fica vivo entre passos do wizard ([hidden], não *ngIf — ver
  // SolicitacaoComponent) — sem isso, voltar pra Modalidade e trocar
  // Empresa/Filial não disparava nova consulta (a de ngOnInit já tinha
  // rodado uma vez só). `chaveEmpresaFilial` (bind do parent, ver
  // solicitacao.component.html) muda de valor quando codEmp/codFil mudam;
  // `ngOnChanges` detecta e reconsulta (ignora a primeira mudança, que
  // coincide com a criação do componente — ngOnInit já cuida dessa).
  @Input() chaveEmpresaFilial: string | undefined;

  @Output() enviaMensagem = new EventEmitter<Mensagem>();
  @Output() voltar = new EventEmitter<void>();
  @Output() proximaEtapa = new EventEmitter<void>();

  carregando: boolean = false;
  consultou: boolean = false;

  // Lista completa vinda do `getLotes` (só filtra por Empresa/Filial no
  // servidor — ver ENDPOINTS.txt); `lotes` é a fatia exibida depois de
  // aplicar Ano/Lote em memória (aplicarFiltros()).
  lotesTodos: Lote[] = [];
  lotes: Lote[] = [];
  loteSelecionado: Lote | null = null;

  form: FormGroup;

  constructor(private fb: FormBuilder, private servico: ServiceBpmService) {
    // `anoLote` começa vazio (sem filtro) — a API real devolve lotes de anos
    // anteriores (ex: 2023/2024), não só do ano corrente; defaultar pro ano
    // atual escondia tudo de cara ("Nenhum lote elegível encontrado" mesmo
    // com lotes existindo, bug visto ao testar com a API real em 2026-08-24).
    this.form = this.fb.group({
      anoLote: [null],
      numLote: [''],
    });
  }

  ngOnInit(): void {
    this.consultar();
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['chaveEmpresaFilial'] && !changes['chaveEmpresaFilial'].firstChange) {
      this.consultar();
    }
  }

  get dadosFormulario(): Formulario {
    return this.servico.dadosFormulario;
  }

  // Pedido do usuário em 2026-08-31: com milhares de lotes elegíveis
  // (relatado "3366"), achar o lote já selecionado (STC devolvida) na
  // tabela paginada era inviável sem procurar página por página. Sempre que
  // há um `loteSelecionado`, ele aparece em 1º na lista (página 1, topo) —
  // reordena a cada leitura (getter, não muda `lotes`) então também
  // funciona ao clicar um lote diferente na hora, não só na restauração.
  get lotesOrdenados(): Lote[] {
    if (!this.loteSelecionado) {
      return this.lotes;
    }
    const selecionado = this.loteSelecionado;
    return [selecionado, ...this.lotes.filter((l) => l !== selecionado)];
  }

  consultar(): void {
    const filtros: FiltrosLote = {
      codEmp: this.dadosFormulario.codEmp,
      codFil: this.dadosFormulario.codFil,
    };

    this.carregando = true;
    this.loteSelecionado = null;
    this.servico.consultarLotes(filtros).subscribe({
      next: (retorno) => {
        // Normaliza numLot pra string (pedido do usuário em 2026-08-31, mesma
        // suspeita já confirmada pra Filial: connector devolve campo de
        // código como número puro mesmo a interface dizendo string).
        // `dadosFormulario.numLote`, restaurado de uma STC devolvida, vem de
        // variável de processo do BPM — sempre string. Sem isso, `numLot ===
        // dadosFormulario.numLote` em restaurarSelecao() nunca bate (tipos
        // diferentes) e o lote nunca é restaurado; `aplicarFiltros()`
        // também quebraria (`lote.numLot.toLowerCase is not a function`) se
        // o usuário filtrasse por número de lote.
        this.lotesTodos = extrairLista<Lote>(retorno).map((l) => ({
          ...l,
          numLot: String(l.numLot),
        }));
        this.aplicarFiltros();
        this.consultou = true;
        this.carregando = false;
        this.restaurarSelecao();
      },
      error: () => {
        this.lotesTodos = [];
        this.lotes = [];
        this.consultou = true;
        this.carregando = false;
        this.enviaMensagem.emit({
          tipo: 4,
          mensagem: 'Não foi possível consultar os lotes elegíveis.',
        });
      },
    });
  }

  // Ano/Lote não são entrada do port `getLotes` (só codEmp/codFil) — filtra
  // em memória sobre a lista completa já carregada, sem nova consulta.
  aplicarFiltros(): void {
    const { anoLote, numLote } = this.form.value;
    this.lotes = this.lotesTodos.filter((lote) => {
      if (anoLote && anoDoLote(lote.datLot) !== String(anoLote)) {
        return false;
      }
      if (numLote && !lote.numLot.toLowerCase().includes(String(numLote).toLowerCase())) {
        return false;
      }
      return true;
    });
  }

  // STC devolvida: `dadosFormulario.numLote` já vem preenchido (variável de
  // processo), mas o Lote inteiro (data/descrição etc.) é transitório (ver
  // ServiceBpmService.loteSelecionado) — se achar o mesmo numLot na consulta
  // atual, restaura os dois (seleção aqui + o card "Resumo do Lote
  // Selecionado" em Origem/Destino). Se não achar (filtro mudou), fica sem
  // selecionar — o usuário escolhe de novo, sem quebrar a tela.
  private restaurarSelecao(): void {
    if (this.loteSelecionado || !this.dadosFormulario.numLote) {
      return;
    }
    const numLoteSalvo = normalizarNumLote(this.dadosFormulario.numLote);
    const encontrado = this.lotes.find((l) => normalizarNumLote(l.numLot) === numLoteSalvo);
    // Log de depuração permanente (mesmo padrão de
    // AprovacaoComponent.logDebugGateway()/ModalidadeComponent.reaplicarRestauracao())
    // — se ainda não achar, mostra o valor salvo e a lista inteira de numLot
    // recebida, pra comparar caractere a caractere em vez de adivinhar.
    console.log('[STC][ConsultaLote] restaurarSelecao', {
      numLoteSalvoOriginal: this.dadosFormulario.numLote,
      numLoteSalvoNormalizado: numLoteSalvo,
      totalLotesNaLista: this.lotes.length,
      numLotsDaLista: this.lotes.map((l) => l.numLot),
      encontrado: !!encontrado,
    });
    if (encontrado) {
      this.loteSelecionado = encontrado;
      this.servico.loteSelecionado = encontrado;
    }
  }

  avancarEtapa(): void {
    if (!this.loteSelecionado) {
      this.enviaMensagem.emit({
        tipo: 3,
        mensagem: 'Selecione um lote antes de avançar.',
      });
      return;
    }

    this.servico.dadosFormulario.numLote = this.loteSelecionado.numLot;
    this.servico.dadosFormulario.tipoAcao = 'Seguir Processo';
    // Guarda o lote inteiro (não só numLot) pro card "Resumo do Lote
    // Selecionado" em Origem/Destino — ver comentário em
    // ServiceBpmService.loteSelecionado.
    this.servico.loteSelecionado = this.loteSelecionado;
    this.proximaEtapa.emit();
  }

  voltarEtapa(): void {
    this.voltar.emit();
  }
}
