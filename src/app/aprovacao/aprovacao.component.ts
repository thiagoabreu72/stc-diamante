import { Component, EventEmitter, Input, OnInit, Output } from '@angular/core';
import { Mensagem } from '../interfaces/gerais.interface';
import { Formulario, ParecerGestor } from '../interfaces/stc.interface';
import { ServiceBpmService } from '../services/service-bpm.service';
import { LinhaComparativo, montarComparativo, totalPorNatureza } from '../functions/comparativo';
import { gestoresDistintos, proximoGestorPendente } from '../functions/loop-gestor';
import { construirLancamentosIntegracao } from '../functions/integracao-erp';

type CampoParecer =
  | 'parecerOrcamentaria'
  | 'parecerGestorOrigem'
  | 'parecerGestorDestino'
  | 'parecerAreaContabil';

// Componente reutilizado nas 4 etapas de aprovação (orçamentária/STCMO, gestor
// de origem, gestor de destino, área contábil) — o mockup/telas são quase
// idênticas entre elas, só muda o rótulo, o campo de parecer e o que acontece
// quando não aprova (ver ServiceBpmService e stc.interface.ts).
@Component({
  selector: 'app-aprovacao',
  templateUrl: './aprovacao.component.html',
  styleUrls: ['./aprovacao.component.scss'],
})
export class AprovacaoComponent implements OnInit {
  @Input() titulo = 'Aprovação';
  @Input() subtitulo = 'Analise as linhas sob sua responsabilidade e registre sua decisão.';
  @Input() labelAprovar = 'Aprovar';
  @Input() labelNegativo = 'Cancelar';
  // Texto do card de confirmação depois de clicar em labelAprovar — só na
  // etapa Área Contábil o botão vira "Liberar Integração ERP" (pedido do
  // usuário em 2026-08-31: não existe um "Aprovar" separado de "Integrar"
  // nessa etapa, é o mesmo clique/ação; só a mensagem batia errado dizendo
  // "Aprovado" quando na verdade é a integração sendo liberada). Nenhuma
  // chamada real ao ERP acontece aqui ainda (a API de integração/geração do
  // arquivo não existe no ambiente, ver STC_Diamante_Requisitos.md seção 9)
  // — só registra a decisão localmente, igual às outras etapas; quem
  // finaliza a task de fato é o botão nativo do Cockpit, fora do nosso controle.
  @Input() mensagemAprovado = 'Aprovado — decisão registrada. Use o envio do BPM para confirmar.';
  // true só na etapa orçamentária (STCMO) — confirmado com o cliente em
  // 2026-08-17: gestores e área contábil não devolvem, só orçamentária. O
  // mockup ("Aprovação do gestor.png") mostra 3 botões (Devolver/Rejeitar/
  // Aprovar) mesmo na etapa de gestor — mantemos só 2 aqui de propósito,
  // porque essa regra de negócio confirmada com o cliente é posterior ao
  // mockup e diverge dele (ver PROGRESSO.md).
  @Input() voltaParaSolicitante = false;
  @Input() campoParecer: CampoParecer = 'parecerOrcamentaria';
  // Painel "Checklist de Liberação" do mockup — só faz sentido na etapa final
  // (Área Contábil), que é quem decide se libera a geração do arquivo.
  @Input() mostrarChecklist = false;
  // true só na etapa Área Contábil — pedido do usuário em 2026-08-31: essa
  // etapa não é mais uma aprovação de verdade, é só "Integrar" (ver
  // mensagemAprovado acima). Some com o botão Cancelar/Reprovar e com o
  // campo de Parecer inteiro (não faz sentido reprovar nem justificar nada
  // aqui — só libera a integração). Item "Valores equilibrados (Débito =
  // Crédito)" do Checklist de Liberação também foi removido (mesmo pedido):
  // não é mais um pré-requisito de liberação.
  @Input() somenteIntegrar = false;
  // true só na etapa gestor-destino — ativa o loop de aprovação por gestor
  // de destino (RN046/049/050, implementado em 2026-08-22): filtra as linhas
  // pro gestor da vez (usuarioGestorDestino) e, ao decidir, calcula se há
  // próximo gestor pendente pra reatribuir a tarefa (loop no BPM) ou liberar
  // pra Área Contábil.
  @Input() loopPorGestorDestino = false;
  // Mesma ideia, espelhada pro lado Origem em 2026-08-26 (true só na etapa
  // gestor-origem) — confirmado pelo cliente que rateios de um mesmo
  // lançamento podem ter gestores de origem diferentes entre si (via seu
  // próprio Centro de Custo), então a origem também precisa do loop.
  @Input() loopPorGestorOrigem = false;

  @Output() enviaMensagem = new EventEmitter<Mensagem>();

  parecer = '';
  // true só depois de um negar() sem parecer preenchido — mostra borda/texto
  // de erro na textarea (visual, além da mensagem em toast) até o usuário
  // digitar algo. Pedido do usuário em 2026-08-20: garantir de forma visível
  // que não dá pra reprovar sem observação.
  parecerInvalido = false;
  // Fica fixo na tela depois de Aprovar/Reprovar (não é um toast que some) —
  // pedido do usuário em 2026-08-20: precisa ficar claro que a decisão foi
  // registrada, já que o envio de verdade só acontece depois, pelo botão do
  // próprio Cockpit (fora do nosso controle). Clicar no outro botão troca a
  // decisão livremente antes desse envio.
  decisaoRegistrada: 'aprovado' | 'negado' | null = null;
  // Estado do popup de erro de integração (só usado quando somenteIntegrar)
  // — pedido do usuário em 2026-08-31: "se tiver erro, retorna um popup
  // dizendo houve um erro ao tentar integrar e a mensagem de retorno que vem
  // do msgRet". `carregandoIntegracao` também controla o spinner/desabilita
  // o botão enquanto o `postLancamentos` está em voo.
  carregandoIntegracao = false;
  mostrarErroIntegracao = false;
  mensagemErroIntegracao = '';
  // Propriedade calculada uma vez (não getter): p-table com [(selection)] +
  // dataKey se confunde quando o array/objetos que alimentam [value] mudam de
  // identidade a cada ciclo de detecção de mudanças — a seleção por clique
  // parava de funcionar (ficava sempre null) porque um getter aqui recriava
  // tudo via montarComparativo() a cada render. Calcula uma vez quando os
  // dados chegam (dados$), fica estável depois disso.
  linhasComparativo: LinhaComparativo[] = [];
  // Linha selecionada na tabela "Linhas sob sua Responsabilidade" — alimenta o
  // painel "Comparativo Origem x Destino" ao lado (formato lista + detalhe do
  // mockup, não a tabela larga de 10 colunas que tínhamos antes).
  linhaSelecionada: LinhaComparativo | null = null;

  constructor(private servico: ServiceBpmService) {}

  ngOnInit(): void {
    // dadosFormulario ainda pode estar vazio no instante em que este
    // componente é criado (a etapa vem do hash da URL, resolvida antes do
    // _loadData assíncrono terminar) — espera dados$ emitir pra montar
    // linhasComparativo e selecionar a primeira linha só quando `dados`/
    // `linhasDestino` já estiverem carregados.
    this.servico.dados$.subscribe((dados) => {
      if (!dados) {
        return;
      }
      const comparativo = montarComparativo(dados.dados, dados.linhasDestino);
      // Loop por gestor (Origem ou Destino, mutuamente exclusivos — cada
      // etapa liga só um dos dois @Input via app.component.html): cada
      // gestor só vê/aprova as linhas/rateios sob sua responsabilidade (o
      // gestor da vez é usuarioGestorOrigem/usuarioGestorDestino, reatribuído
      // a cada passada do loop — ver OrigemComponent/DestinoComponent.avancarEtapa()).
      this.linhasComparativo = this.loopPorGestorDestino
        ? comparativo.filter((linha) => linha.destino?.gestor === dados.usuarioGestorDestino)
        : this.loopPorGestorOrigem
        ? comparativo.filter((linha) => linha.origem?.gestor === dados.usuarioGestorOrigem)
        : comparativo;
      if (!this.linhaSelecionada && this.linhasComparativo.length) {
        this.linhaSelecionada = this.linhasComparativo[0];
      }
    });
  }

  get dadosFormulario(): Formulario {
    return this.servico.dadosFormulario;
  }

  get debitoTotal(): number {
    return totalPorNatureza(this.linhasComparativo, 'Debito');
  }

  get creditoTotal(): number {
    return totalPorNatureza(this.linhasComparativo, 'Credito');
  }

  get saldo(): number {
    return this.debitoTotal - this.creditoTotal;
  }

  get mensagemDecisao(): string {
    if (this.decisaoRegistrada === 'aprovado') {
      return this.mensagemAprovado;
    }
    if (this.decisaoRegistrada === 'negado') {
      return this.voltaParaSolicitante
        ? 'Devolvido para o solicitante corrigir — decisão registrada. Use o envio do BPM para confirmar.'
        : `${this.labelNegativo} — decisão registrada. A STC será encerrada. Use o envio do BPM para confirmar.`;
    }
    return '';
  }

  get severidadeDecisao(): 'success' | 'warn' | 'error' {
    if (this.decisaoRegistrada === 'aprovado') {
      return 'success';
    }
    return this.voltaParaSolicitante ? 'warn' : 'error';
  }

  // Sinaliza visualmente qual botão foi clicado (pedido do usuário em
  // 2026-08-22: "deixar sinalizado a situação que ele escolher entre aprovar
  // ou reprovar") — classe extra (`decisao-btn-selecionada-*`, estilo em
  // styles.scss) dá um contorno/sombra no botão escolhido. Trocar de decisão
  // já funcionava antes (aprovar()/negar() só sobrescrevem decisaoRegistrada,
  // sem guarda nenhuma) — clicar no outro botão continua trocando livremente,
  // isso só deixa visível qual está selecionado agora.
  get styleClassNegar(): string {
    const base = 'p-button-outlined p-button-danger';
    return this.decisaoRegistrada === 'negado'
      ? `${base} decisao-btn-selecionada decisao-btn-selecionada-negativa`
      : base;
  }

  get styleClassAprovar(): string {
    return this.decisaoRegistrada === 'aprovado' ? 'decisao-btn-selecionada' : '';
  }

  aprovar(): void {
    this.parecerInvalido = false;
    // Etapa Área Contábil (somenteIntegrar): antes de registrar a decisão,
    // chama o ERP de verdade (postLancamentos) — só segue com o fluxo normal
    // de registro se a integração der certo. Ver integrarERP() abaixo.
    if (this.somenteIntegrar) {
      this.integrarERP();
      return;
    }
    this.registrarParecer();
    if (this.loopPorGestorDestino) {
      this.avancarLoopGestor('Destino', 'Aprovado');
    } else if (this.loopPorGestorOrigem) {
      this.avancarLoopGestor('Origem', 'Aprovado');
    }
    this.servico.dadosFormulario.tipoAcao = 'Aprovar';
    this.decisaoRegistrada = 'aprovado';
    this.logDebugGateway('Aprovar');
    this.enviaMensagem.emit({
      tipo: 2,
      mensagem: 'Decisão registrada. Use o envio do BPM para confirmar.',
    });
  }

  // Chama o port `postLancamentos` de verdade com o comparativo Origem×
  // Destino da STC inteira (ver construirLancamentosIntegracao —
  // functions/integracao-erp.ts). Contrato informado pelo usuário em
  // 2026-08-31, NÃO testado contra a API real ponta a ponta ainda (ver
  // ENDPOINTS.txt). Dois formatos de erro confirmados ao vivo/pelo usuário:
  // (1) falha de TRANSPORTE — a chamada SOAP pro G5 nem chega a ser
  // processada (ex: XML rejeitado), corpo vem com `responseCode` (número,
  // ex: 400) + `message` (texto genérico tipo "Request failed with status
  // code 400" + `logExecution` com o XML enviado); (2) falha de NEGÓCIO —
  // G5 processa e devolve um `codRet`/`msgRet` de erro (formato exato ainda
  // não visto ao vivo, só o nome dos campos foi confirmado pelo usuário:
  // "o codRet é uma coisa e o msgRet é outra"). `extrairErroIntegracao()`
  // (abaixo) cobre os dois. Tudo dentro de try/catch — pedido do usuário
  // depois de ver a tela travar em cinza (spinner infinito) numa tentativa
  // real: se ALGO inesperado no formato da resposta explodir uma exceção
  // aqui, `carregandoIntegracao` tem que voltar a `false` de qualquer jeito
  // e mostrar ALGUM erro, nunca travar a tela sem explicação. `postLancamentos()`
  // (ServiceBpmService) também ganhou um timeout de 45s de segurança pro
  // mesmo cenário (chamada que nunca resolve).
  integrarERP(): void {
    const f = this.servico.dadosFormulario;
    const tipo: 'M' | 'L' = f.tipoTransferencia === 'Manual' ? 'M' : 'L';
    const dados = construirLancamentosIntegracao(this.linhasComparativo, tipo, f.codEmp, f.codFil);

    this.carregandoIntegracao = true;
    this.servico.postLancamentos(tipo, f.numeroStc, dados).subscribe({
      next: (retorno) => {
        this.carregandoIntegracao = false;
        try {
          const erro = this.extrairErroIntegracao(retorno);
          console.log('[STC][Integracao] postLancamentos resposta', { retorno, erro });
          if (erro) {
            this.abrirErroIntegracao(erro);
            return;
          }
          this.registrarParecer();
          this.servico.dadosFormulario.tipoAcao = 'Aprovar';
          this.decisaoRegistrada = 'aprovado';
          this.logDebugGateway('Aprovar');
          this.enviaMensagem.emit({
            tipo: 2,
            mensagem: 'Integração realizada com sucesso. Use o envio do BPM para confirmar.',
          });
        } catch (e) {
          console.error('[STC][Integracao] erro inesperado processando resposta', e, retorno);
          this.abrirErroIntegracao('Resposta inesperada do ERP — confira o console.');
        }
      },
      error: (erro) => {
        this.carregandoIntegracao = false;
        try {
          const mensagem = this.extrairErroIntegracao(erro?.error) ?? `Falha na comunicação com o ERP (HTTP ${erro?.status ?? '?'}).`;
          console.log('[STC][Integracao] postLancamentos erro HTTP', { erro, mensagem });
          this.abrirErroIntegracao(mensagem);
        } catch (e) {
          console.error('[STC][Integracao] erro inesperado processando erro HTTP', e, erro);
          this.abrirErroIntegracao('Falha na comunicação com o ERP — confira o console.');
        }
      },
    });
  }

  // Cobre os dois formatos de erro conhecidos (ver comentário de
  // integrarERP() acima) — devolve a mensagem pra mostrar, ou `undefined`
  // se não achar sinal de erro nenhum (tratado como sucesso).
  private extrairErroIntegracao(retorno: any): string | undefined {
    const corpo = retorno?.outputData ?? retorno;
    if (!corpo) {
      return undefined;
    }
    const responseCode = corpo.responseCode;
    const falhaTransporte = responseCode != null && Number(responseCode) !== 200;
    const codRet = corpo.codRet;
    const falhaNegocio = codRet != null && String(codRet) !== '0' && Number(codRet) !== 200;
    const mensagem: string | undefined = corpo.message || corpo.msgRet || corpo.msgErro;

    if (!falhaTransporte && !falhaNegocio && !mensagem) {
      return undefined;
    }
    if (mensagem) {
      return mensagem;
    }
    const codigo = falhaTransporte ? responseCode : codRet;
    return `Erro não especificado pelo ERP (código ${codigo}).`;
  }

  private abrirErroIntegracao(mensagem: string): void {
    this.mensagemErroIntegracao = mensagem;
    this.mostrarErroIntegracao = true;
    // O toast redundante (item 30, "Erro ao integrar: ...") foi removido em
    // 2026-08-31 — pedido do usuário: apareciam 2 mensagens juntas (o card
    // fixo no topo da página + o toast no canto), queria só o card fixo. O
    // card (.erro-integracao-card, ver aprovacao.component.html) já é a
    // forma definitiva de mostrar esse erro.
  }

  negar(): void {
    if (!this.parecer.trim()) {
      this.parecerInvalido = true;
      this.enviaMensagem.emit({
        tipo: 3,
        mensagem: 'Informe um parecer antes de registrar a decisão.',
      });
      return;
    }

    this.parecerInvalido = false;
    this.registrarParecer();
    if (this.loopPorGestorDestino) {
      // Reprovação de qualquer gestor (origem ou destino) cancela a STC na
      // hora — os demais gestores pendentes nem chegam a ver a tarefa
      // (confirmado com o cliente em 2026-08-22/2026-08-26).
      this.avancarLoopGestor('Destino', 'Negado');
    } else if (this.loopPorGestorOrigem) {
      this.avancarLoopGestor('Origem', 'Negado');
    }
    this.servico.dadosFormulario.tipoAcao = this.voltaParaSolicitante
      ? 'Retornar'
      : 'Cancelar';
    this.decisaoRegistrada = 'negado';
    this.logDebugGateway('Negar');
    this.enviaMensagem.emit({
      tipo: 2,
      mensagem: 'Decisão registrada. Use o envio do BPM para confirmar.',
    });
  }

  // Log de depuração pedido pelo usuário em 2026-08-27 pra testar os gateways
  // de expressão no BPM Designer — mostra exatamente os valores que este app
  // está mandando (tipoAcao + todas as variáveis dos loops de gestor) no
  // instante do clique, pra comparar com a expressão configurada em cada
  // gateway (ver conversa sobre "nomeDaVariavel = "valor""). Mantido no
  // código (não é um log temporário só desta sessão) — útil sempre que o
  // fluxo do BPM Designer for revisado/testado de novo.
  private logDebugGateway(acao: 'Aprovar' | 'Negar'): void {
    const f = this.dadosFormulario;
    console.log(`[STC][Gateway] ${this.titulo} — cliquei em "${acao}"`, {
      etapa: this.titulo,
      campoParecer: this.campoParecer,
      parecerRegistrado: (f as any)[this.campoParecer],
      tipoAcao: f.tipoAcao,
      voltaParaSolicitante: this.voltaParaSolicitante,
      loopPorGestorOrigem: this.loopPorGestorOrigem,
      loopPorGestorDestino: this.loopPorGestorDestino,
      usuarioGestorOrigem: f.usuarioGestorOrigem,
      aprovadoGestorOrigem: f.aprovadoGestorOrigem,
      temProximoGestorOrigem: f.temProximoGestorOrigem,
      pareceresGestorOrigem: f.pareceresGestorOrigem,
      usuarioGestorDestino: f.usuarioGestorDestino,
      aprovadoGestorDestino: f.aprovadoGestorDestino,
      temProximoGestorDestino: f.temProximoGestorDestino,
      pareceresGestorDestino: f.pareceresGestorDestino,
      status: f.status,
    });
  }

  // Registra a decisão do gestor da vez no histórico (pareceresGestorOrigem/
  // pareceresGestorDestino) e calcula se ainda falta algum gestor decidir —
  // o BPM lê aprovadoGestor{Origem,Destino}/temProximoGestor{Origem,Destino}
  // pra decidir se cancela, volta o loop (já reatribuído ao próximo gestor)
  // ou segue pra próxima etapa. Em reprovação, cancela na hora sem avaliar
  // nem reatribuir o próximo gestor pendente (confirmado com o cliente).
  // Generalizado em 2026-08-26 (antes só existia pro lado Destino) — os
  // nomes de campo do Formulario mudam conforme `tipo`, mesma lógica nos
  // dois. `linhasOrigemOuDestino` é de onde a fila de gestores distintos é
  // calculada: `dados` (LinhaOrigem[], por rateio) pra Origem,
  // `linhasDestino` pra Destino.
  private avancarLoopGestor(tipo: 'Origem' | 'Destino', decisao: 'Aprovado' | 'Negado'): void {
    const campoUsuarioGestor = tipo === 'Origem' ? 'usuarioGestorOrigem' : 'usuarioGestorDestino';
    const campoPareceres = tipo === 'Origem' ? 'pareceresGestorOrigem' : 'pareceresGestorDestino';
    const campoAprovado = tipo === 'Origem' ? 'aprovadoGestorOrigem' : 'aprovadoGestorDestino';
    const campoTemProximo =
      tipo === 'Origem' ? 'temProximoGestorOrigem' : 'temProximoGestorDestino';
    const linhasOrigemOuDestino = tipo === 'Origem' ? this.dadosFormulario.dados : this.dadosFormulario.linhasDestino;

    const formulario = this.dadosFormulario as any;
    const gestorAtual: string | undefined = formulario[campoUsuarioGestor];
    if (!gestorAtual) {
      return;
    }
    const historico: ParecerGestor[] = Array.isArray(formulario[campoPareceres])
      ? formulario[campoPareceres]
      : [];
    const historicoAtualizado = [
      ...historico,
      { gestor: gestorAtual, parecer: this.parecer, decisao, data: new Date().toISOString() },
    ];
    const formularioServico = this.servico.dadosFormulario as any;
    formularioServico[campoPareceres] = historicoAtualizado;

    if (decisao === 'Negado') {
      // Cancela na hora — não avalia nem reatribui o próximo gestor pendente.
      formularioServico[campoAprovado] = 'Não';
      formularioServico[campoTemProximo] = 'Não';
      return;
    }

    const gestores = gestoresDistintos(linhasOrigemOuDestino);
    const proximo = proximoGestorPendente(gestores, historicoAtualizado);
    formularioServico[campoAprovado] = 'Sim';
    formularioServico[campoTemProximo] = proximo ? 'Sim' : 'Não';
    if (proximo) {
      formularioServico[campoUsuarioGestor] = proximo;
    }
  }

  // Some o estado de erro assim que o usuário começa a corrigir — não precisa
  // esperar outro clique em "Reprovar" pra limpar a borda vermelha.
  onParecerAlterado(): void {
    if (this.parecerInvalido && this.parecer.trim()) {
      this.parecerInvalido = false;
    }
  }

  private registrarParecer(): void {
    (this.servico.dadosFormulario as any)[this.campoParecer] = this.parecer;
  }
}
