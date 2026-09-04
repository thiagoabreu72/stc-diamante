import { Component, EventEmitter, Output } from '@angular/core';
import { Mensagem } from '../interfaces/gerais.interface';
import { ServiceBpmService } from '../services/service-bpm.service';
import { scrollParaTopo } from '../functions/scroll';

// Ordem confirmada nos mockups do cliente (seção 10.2/10.3 dos requisitos).
// No modo Manual, Origem e Destino são preenchidos na MESMA tela (1 único
// componente, OrigemDestinoManualComponent) — o stepper reflete isso com 1
// passo só (não 2 rótulos pro mesmo passo, como já foi no passado: bug real
// reportado pelo usuário em 2026-09-02, "no manual temos só 3 etapas e lá tá
// aparecendo 4"). Último passo é só "Confirmação" (revisão do que foi
// escrito antes de enviar pelo BPM) — não existe etapa de aprovação aqui,
// isso só acontece depois, nas tarefas separadas do fluxo BPM
// (AprovacaoComponent). Até 2026-08-24 esse passo estava duplicado
// ("Aprovações" + "Confirmação", 2 nomes pro mesmo `ResumoComponent`) e o
// segundo nunca era alcançável — corrigido pra 1 só.
const PASSOS_POR_LOTE = ['Modalidade', 'Consulta do Lote', 'Origem', 'Destino', 'Resumo'];
const PASSOS_MANUAL = ['Modalidade', 'Origem e Destino Manual', 'Confirmação'];

@Component({
  selector: 'app-solicitacao',
  templateUrl: './solicitacao.component.html',
  styleUrls: ['./solicitacao.component.scss'],
})
export class SolicitacaoComponent {
  @Output() enviaMensagem = new EventEmitter<Mensagem>();

  passoAtivo: number = 0;
  // Passo mais avançado já validado (via "Avançar") — controla até onde o
  // stepper deixa clicar e também quando cada componente do wizard é criado
  // pela primeira vez (depois disso fica vivo, só escondido via [hidden], pra
  // não perder o formulário nem precisar recarregar dados ao ir/voltar).
  maiorPassoAlcancado: number = 0;

  constructor(private servico: ServiceBpmService) {
    // STC devolvida pela Contabilidade Orçamentária (pedido do usuário em
    // 2026-08-31: "tem que deixar todas as coisas que o usuário selecionou
    // selecionado, em todas as fases quando retorna, aí ele só muda o que é
    // necessário") — antes disso, `maiorPassoAlcancado` sempre começava em 0,
    // então nenhuma tela depois de Modalidade era sequer CRIADA (`*ngIf`
    // nos outros passos, ver solicitacao.component.html) até o usuário clicar
    // "Avançar" tela por tela de novo, mesmo com tudo já preenchido de antes
    // (a STC só chega em devolução depois de passar por todo o wizard uma
    // vez). `parecerOrcamentaria` é o mesmo sinal que `ModalidadeComponent` já
    // usa pro banner "Solicitação devolvida" — se existe, desbloqueia o
    // wizard inteiro de uma vez (não muda `passoAtivo`, continua abrindo em
    // Modalidade pra mostrar o motivo da devolução, mas o stepper já deixa
    // pular pra qualquer tela).
    this.servico.dados$.subscribe((dados) => {
      if (!dados?.parecerOrcamentaria || this.maiorPassoAlcancado > 0) {
        return;
      }
      this.maiorPassoAlcancado = this.ehManual ? 2 : 4;
    });
  }

  get ehManual(): boolean {
    return this.servico.dadosFormulario.tipoTransferencia === 'Manual';
  }

  get passos(): string[] {
    return this.ehManual ? PASSOS_MANUAL : PASSOS_POR_LOTE;
  }

  get loteVisitado(): boolean {
    return !this.ehManual && this.maiorPassoAlcancado >= 1;
  }

  get origemVisitada(): boolean {
    return !this.ehManual && this.maiorPassoAlcancado >= 2;
  }

  get destinoVisitado(): boolean {
    return !this.ehManual && this.maiorPassoAlcancado >= 3;
  }

  get origemDestinoManualVisitado(): boolean {
    return this.ehManual && this.maiorPassoAlcancado >= 1;
  }

  get resumoVisitado(): boolean {
    return this.ehManual ? this.maiorPassoAlcancado >= 2 : this.maiorPassoAlcancado >= 4;
  }

  // Chaves passadas como @Input pros passos que ficam vivos entre navegações
  // (ver comentário [hidden] no template) — cada uma muda de valor quando o
  // dado do qual aquele passo depende muda (empresa/filial pra Consulta do
  // Lote, lote selecionado pra Origem, seleção de rateios pra Destino),
  // disparando `ngOnChanges` no filho pra recarregar/reconstruir em vez de
  // ficar preso no que foi carregado da primeira vez.
  get chaveEmpresaFilial(): string {
    const dados = this.servico.dadosFormulario;
    return `${dados.codEmp ?? ''}|${dados.codFil ?? ''}`;
  }

  get numLoteSelecionado(): string | undefined {
    return this.servico.dadosFormulario.numLote;
  }

  get assinaturaOrigem(): string {
    const dados = this.servico.dadosFormulario.dados;
    return Array.isArray(dados) ? dados.map((l: any) => l.lancamento).join(',') : '';
  }

  onModalidadeAvancar(): void {
    this.avancarPara(1);
  }

  // Empresa/Filial trocada de verdade (não a restauração automática de uma
  // devolução) invalida Lote/Origem/Destino — ver
  // ModalidadeComponent.invalidarDadosDependentes(). Re-trava o wizard
  // (volta maiorPassoAlcancado pra 0): essas telas não ficam mais
  // desbloqueadas de graça, o solicitante precisa passar por "Avançar" de
  // novo em cada uma, já que os dados que elas mostravam não existem mais.
  onDadosDependentesInvalidados(): void {
    this.maiorPassoAlcancado = 0;
  }

  onLoteAvancar(): void {
    this.avancarPara(2);
  }

  onOrigemAvancar(): void {
    this.avancarPara(3);
  }

  onDestinoAvancar(): void {
    this.avancarPara(4);
  }

  // Manual não tem passo de Destino separado — avança direto pra "Confirmação".
  onOrigemDestinoManualAvancar(): void {
    this.avancarPara(2);
  }

  voltarPara(passo: number): void {
    this.irPara(passo);
  }

  // Clique direto no stepper: só deixa ir pra um passo já validado antes —
  // pular pra frente exige passar pelo "Avançar" de cada tela.
  onPassoClicado(passo: number): void {
    if (passo > this.maiorPassoAlcancado) {
      this.enviaMensagem.emit({
        tipo: 3,
        mensagem: 'Complete os passos anteriores antes de avançar até aqui.',
      });
      return;
    }
    this.irPara(passo);
  }

  private avancarPara(passo: number): void {
    this.irPara(passo);
    this.maiorPassoAlcancado = Math.max(this.maiorPassoAlcancado, passo);
  }

  // Os passos do wizard trocam de visibilidade via [hidden] (não *ngIf/roteamento,
  // ver solicitacao.component.html) — trocar de passo não reresulta em navegação
  // de página nenhuma, então o scroll fica exatamente onde estava na tela
  // anterior. Se o passo anterior estava rolado pra baixo (ex: tabela longa de
  // Destino) e o próximo é mais curto, ele aparece "em branco" até rolar pra
  // cima manualmente. Corrigido rolando pro topo a cada troca de passo — mas
  // `window.scrollTo` sozinho não bastava (bug real reportado pelo usuário em
  // 2026-09-02: "cliquei em avançar e não subiu de volta"), ver
  // functions/scroll.ts pro motivo (min-height:200000px faz quem realmente
  // rola ser a página do Cockpit, não a janela deste app).
  private irPara(passo: number): void {
    this.passoAtivo = passo;
    scrollParaTopo();
  }
}
