import { Component, EventEmitter, Input, OnChanges, OnInit, Output, SimpleChanges } from '@angular/core';
import { forkJoin } from 'rxjs';
import { Mensagem } from '../interfaces/gerais.interface';
import {
  CentroCusto,
  ContaContabil,
  FaseProjeto,
  Formulario,
  LinhaOrigem,
  Lote,
  Projeto,
} from '../interfaces/stc.interface';
import { ServiceBpmService } from '../services/service-bpm.service';
import { extrairLista } from '../functions/extrair-lista';
import {
  achatarRateiosSelecionados,
  LancamentoLinha,
  normalizarNaturezaRateio,
  paraLancamentoLinha,
  RateioLinha,
} from '../functions/lancamentos';
import { gestoresDistintos } from '../functions/loop-gestor';

@Component({
  selector: 'app-origem',
  templateUrl: './origem.component.html',
  styleUrls: ['./origem.component.scss'],
})
export class OrigemComponent implements OnInit, OnChanges {
  // Componente fica vivo entre passos do wizard ([hidden], não *ngIf — ver
  // SolicitacaoComponent) — sem isso, voltar pra Consulta do Lote e trocar o
  // lote selecionado não disparava nova consulta de lançamentos (a de
  // ngOnInit já tinha rodado uma vez, pro lote antigo). `numLote` (bind do
  // parent) muda de valor quando o lote selecionado muda; `ngOnChanges`
  // detecta e reconsulta (ignora a primeira mudança, que coincide com a
  // criação do componente — ngOnInit já cuida dessa).
  @Input() numLote: string | undefined;

  @Output() enviaMensagem = new EventEmitter<Mensagem>();
  @Output() voltar = new EventEmitter<void>();
  @Output() proximaEtapa = new EventEmitter<void>();

  carregandoLancamentos: boolean = false;
  // Separada de carregandoLancamentos: o gestor de cada rateio só é conhecido
  // depois que os Centros de Custo chegam (carregarListasApoio, forkJoin
  // separado). Sem isso, se os lançamentos chegam antes das listas de apoio, a
  // tabela aparece de cara mostrando "Sem gestor cadastrado" em todo rateio
  // (resolverGestor não acha nada ainda) até a resposta das listas chegar —
  // falso alarme visual. O spinner (getter `carregando` abaixo) só libera
  // quando os dois terminam, mesmo padrão já usado em ModalidadeComponent
  // pra Empresa/Filial (ver PROGRESSO.md, 2026-08-22).
  carregandoListasApoio: boolean = false;
  lancamentos: LancamentoLinha[] = [];
  // Controla quais linhas de lançamento estão expandidas na tabela (setinha
  // pra abrir/fechar os rateios, ver origem.component.html) — chave é
  // `numLct` (mesmo `dataKey` da p-table).
  expandedRows: { [chave: string]: boolean } = {};

  private contas: ContaContabil[] = [];
  private centrosCusto: CentroCusto[] = [];
  private projetos: Projeto[] = [];
  private fasesPorProjeto: Record<string, FaseProjeto[]> = {};

  constructor(private servico: ServiceBpmService) {}

  get dadosFormulario(): Formulario {
    return this.servico.dadosFormulario;
  }

  get carregando(): boolean {
    return this.carregandoLancamentos || this.carregandoListasApoio;
  }

  // Card "Resumo do Lote Selecionado" do mockup ("Origem.png") — ver
  // ServiceBpmService.loteSelecionado (transitório, só desta sessão).
  get loteSelecionado(): Lote | null {
    return this.servico.loteSelecionado;
  }

  get totalLancamentos(): number {
    return this.lancamentos.length;
  }

  // Contagem exibida no card de baixo — mostra lançamentos, não rateios,
  // já que a seleção agora é por lançamento (ver todosRateiosSelecionados()).
  get totalLancamentosSelecionados(): number {
    return this.lancamentos.filter((lct) => this.todosRateiosSelecionados(lct)).length;
  }

  get totalRateiosSelecionados(): number {
    return this.rateiosSelecionados().length;
  }

  get valorTotalSelecionado(): number {
    return this.rateiosSelecionados().reduce((total, r) => total + (Number(r.vlrRat) || 0), 0);
  }

  ngOnInit(): void {
    this.carregarListasApoio();
    this.carregarLinhas();
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['numLote'] && !changes['numLote'].firstChange) {
      this.carregarLinhas();
    }
  }

  natureza(rateio: RateioLinha): string {
    return normalizarNaturezaRateio(rateio.debCre) || rateio.debCre || '-';
  }

  fasesDoProjeto(numPrj: string | null | undefined): FaseProjeto[] {
    return numPrj ? this.fasesPorProjeto[numPrj] ?? [] : [];
  }

  // A SELEÇÃO é por LANÇAMENTO, não por rateio individual (pedido do usuário
  // em 2026-08-31: "o usuário não seleciona o rateios e sim o lançamento,
  // que contém 2 rateios" — antes disso, um checkbox por rateio dentro do
  // detalhe expandido era a única forma de selecionar; agora o checkbox
  // fica na linha do lançamento, ver origem.component.html). Os rateios
  // continuam visíveis no detalhe expandido (inclusive o de Centro de Custo
  // "99999999", que "não conta" — usuário confirmou que ele deve continuar
  // aparecendo ali, só é ignorado depois na montagem do `postLancamentos`,
  // ver functions/integracao-erp.ts), mas sem checkbox próprio — é só
  // informativo. Internamente ainda marca `.selecionado` em CADA rateio
  // (mesmo campo/modelo de antes — `achatarRateiosSelecionados()` continua
  // funcionando sem mudança), só a UI que expõe isso mudou de nível. Só
  // considera rateios COM gestor (ver rateioSemGestor) — na prática, o
  // rateio "99999999" normalmente não tem gestor cadastrado, então já fica
  // de fora automaticamente ao marcar o lançamento inteiro.
  todosRateiosSelecionados(lct: LancamentoLinha): boolean {
    const selecionaveis = lct.rateios.filter((r) => !this.rateioSemGestor(r));
    return selecionaveis.length > 0 && selecionaveis.every((r) => r.selecionado);
  }

  selecionarTodosRateios(lct: LancamentoLinha, valor: boolean): void {
    lct.rateios.forEach((r) => {
      if (!this.rateioSemGestor(r)) {
        r.selecionado = valor;
      }
    });
  }

  // Desabilita o checkbox do lançamento inteiro quando NENHUM rateio dele
  // tem gestor cadastrado (nem o rateio "real" que conta) — mesmo motivo de
  // rateioSemGestor() logo abaixo.
  lancamentoTemRateioSelecionavel(lct: LancamentoLinha): boolean {
    return lct.rateios.some((r) => !this.rateioSemGestor(r));
  }

  // Bloqueia a seleção do rateio: sem gestor identificado (Centro de Custo
  // sem `usuRes` cadastrado), a fila do loop de aprovação do Gestor de
  // Origem fica sem ninguém pra decidir sobre essa linha — o BPM trava num
  // erro de gateway (aprovadoGestorOrigem/temProximoGestorOrigem nunca são
  // setados, ver AprovacaoComponent.avancarLoopGestor). Confirmado pelo
  // usuário em 2026-08-27 depois de reproduzir esse erro ao vivo.
  rateioSemGestor(rateio: RateioLinha): boolean {
    return !this.resolverGestor(rateio.codCcu);
  }

  rateiosSelecionadosDoLancamento(lct: LancamentoLinha): number {
    return lct.rateios.filter((r) => r.selecionado).length;
  }

  carregarLinhas(): void {
    this.carregandoLancamentos = true;
    this.servico
      .consultarLinhasLote(this.dadosFormulario.codEmp, this.dadosFormulario.numLote)
      .subscribe({
        next: (retorno) => {
          this.lancamentos = paraLancamentoLinha(extrairLista(retorno));
          this.carregandoLancamentos = false;
          this.restaurarSelecao();
          this.garantirFasesDosRateios();
        },
        error: () => {
          this.lancamentos = [];
          this.carregandoLancamentos = false;
          this.enviaMensagem.emit({
            tipo: 4,
            mensagem: 'Não foi possível consultar as linhas do lote.',
          });
        },
      });
  }

  // Conta/CC/Projeto carregados em bloco (mesmo padrão de DestinoComponent) —
  // usados pra resolver descrição (código + nome) das linhas selecionadas ao
  // avançar, e também pra exibir a natureza/gestor de cada rateio na tela.
  private carregarListasApoio(): void {
    const codEmp = this.dadosFormulario.codEmp;
    if (!codEmp) {
      return;
    }
    this.carregandoListasApoio = true;
    forkJoin({
      contas: this.servico.getContasContabeis(codEmp),
      centros: this.servico.getCentrosCusto(codEmp),
      projetos: this.servico.getProjetos(codEmp),
    }).subscribe({
      next: ({ contas, centros, projetos }) => {
        this.contas = extrairLista<ContaContabil>(contas);
        this.centrosCusto = extrairLista<CentroCusto>(centros);
        this.projetos = extrairLista<Projeto>(projetos);
        this.carregandoListasApoio = false;
      },
      error: () => {
        this.carregandoListasApoio = false;
        this.enviaMensagem.emit({
          tipo: 4,
          mensagem: 'Não foi possível carregar Conta Contábil, Centro de Custo ou Projeto.',
        });
      },
    });
  }

  // Carrega de uma vez as fases de todos os projetos distintos que aparecem
  // nos rateios do lote — diferente do carregamento sob demanda usado em
  // Destino/Manual (lá é o usuário escolhendo o projeto; aqui os projetos já
  // vêm prontos do ERP, então não faz sentido esperar clique).
  private garantirFasesDosRateios(): void {
    const codEmp = this.dadosFormulario.codEmp;
    if (!codEmp) {
      return;
    }
    const numPrjDistintos = new Set<string>();
    this.lancamentos.forEach((lct) =>
      lct.rateios.forEach((r) => {
        if (r.numPrj) {
          numPrjDistintos.add(r.numPrj);
        }
      })
    );
    numPrjDistintos.forEach((numPrj) => {
      if (this.fasesPorProjeto[numPrj]) {
        return;
      }
      this.servico.getFasesProjeto(codEmp, numPrj).subscribe({
        next: (retorno) => {
          this.fasesPorProjeto[numPrj] = extrairLista<FaseProjeto>(retorno);
        },
      });
    });
  }

  private rateiosSelecionados(): RateioLinha[] {
    const selecionados: RateioLinha[] = [];
    this.lancamentos.forEach((lct) => selecionados.push(...lct.rateios.filter((r) => r.selecionado)));
    return selecionados;
  }

  // Regra confirmada em 2026-08-17: gestor = usuRes do Centro de Custo.
  // Público (não `private`) — usado também pela tabela de rateios
  // (origem.component.html), pra mostrar o gestor ao vivo por rateio antes
  // de avançar, já que rateios do mesmo lançamento podem ter CC (logo
  // gestor) diferentes entre si (loop de Gestor de Origem, 2026-08-26).
  resolverGestor(codCcu?: string): string | undefined {
    return this.centrosCusto.find((c) => c.codCcu === codCcu)?.usuRes;
  }

  private resolverDescricoes(linha: LinhaOrigem): LinhaOrigem {
    const conta = this.contas.find((c) => c.ctaRed === linha.ctaRed);
    const centro = this.centrosCusto.find((c) => c.codCcu === linha.codCcu);
    const projeto = this.projetos.find((p) => p.numPrj === linha.numPrj);
    const fase = this.fasesDoProjeto(linha.numPrj).find((f) => f.codFpj === linha.codFpj);
    return {
      ...linha,
      desCta: conta?.desCta,
      desCcu: centro?.desCcu,
      nomPrj: projeto?.nomPrj,
      desFpj: fase?.desFpj,
      gestor: this.resolverGestor(linha.codCcu),
    };
  }

  // STC devolvida: `dadosFormulario.dados` já guarda os rateios que o
  // solicitante tinha selecionado antes. Como `lancamento` é sintetizado por
  // índice (pode mudar entre consultas), casa por chave de negócio (lançamento
  // + classificação + valor) em vez do índice sintético.
  private restaurarSelecao(): void {
    const salvas = Array.isArray(this.dadosFormulario.dados) ? this.dadosFormulario.dados : [];
    if (!salvas.length) {
      return;
    }
    const chave = (l: {
      numLct?: string;
      ctaRed?: string;
      codCcu?: string;
      numPrj?: string;
      codFpj?: string;
      valor?: number;
    }) => `${l.numLct}|${l.ctaRed}|${l.codCcu}|${l.numPrj}|${l.codFpj}|${l.valor}`;
    const chavesSalvas = new Set(salvas.map((l: LinhaOrigem) => chave(l)));

    this.lancamentos.forEach((lct) => {
      lct.rateios.forEach((rateio) => {
        const chaveRateio = chave({
          numLct: lct.numLct,
          ctaRed: rateio.ctaRed,
          codCcu: rateio.codCcu,
          numPrj: rateio.numPrj,
          codFpj: rateio.codFpj,
          valor: Number(rateio.vlrRat) || 0,
        });
        rateio.selecionado = chavesSalvas.has(chaveRateio);
      });
      // Abre de cara os lançamentos que já têm rateio selecionado — senão a
      // seleção restaurada fica escondida atrás de uma seta fechada.
      if (lct.numLct && this.rateiosSelecionadosDoLancamento(lct) > 0) {
        this.expandedRows[lct.numLct] = true;
      }
    });
  }

  avancarEtapa(): void {
    const linhas = achatarRateiosSelecionados(this.lancamentos);
    if (linhas.length === 0) {
      this.enviaMensagem.emit({
        tipo: 3,
        mensagem: 'Selecione ao menos um rateio de origem antes de avançar.',
      });
      return;
    }

    const linhasComDescricao = linhas.map((linha) => this.resolverDescricoes(linha));

    this.servico.dadosFormulario.dados = linhasComDescricao;

    // Fila de aprovação por gestor de origem (RN046/049/050 espelhado pro
    // lado Origem em 2026-08-26): rateios de um mesmo lançamento podem ter
    // Centro de Custo — logo gestor — diferentes entre si, então cada gestor
    // distinto ganha uma tarefa própria, em loop na etapa gestor-origem do
    // BPM, até todos decidirem. Mesmo padrão já validado no Gestor Destino
    // (ver DestinoComponent.avancarEtapa()/AprovacaoComponent). Reseta o
    // histórico e as flags de loop toda vez que se sai desta tela — se o
    // solicitante voltou e mudou a seleção de rateios, o loop de gestor de
    // origem (que roda logo depois do STCMO) começa do zero.
    const gestores = gestoresDistintos(linhasComDescricao);
    this.servico.dadosFormulario.usuarioGestorOrigem = gestores[0];
    this.servico.dadosFormulario.pareceresGestorOrigem = [];
    this.servico.dadosFormulario.aprovadoGestorOrigem = undefined;
    this.servico.dadosFormulario.temProximoGestorOrigem = undefined;

    this.servico.dadosFormulario.tipoAcao = 'Seguir Processo';
    this.proximaEtapa.emit();
  }

  voltarEtapa(): void {
    this.voltar.emit();
  }
}
