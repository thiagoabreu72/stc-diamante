import { Component, EventEmitter, OnInit, Output } from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { distinctUntilChanged } from 'rxjs/operators';
import { Mensagem } from '../interfaces/gerais.interface';
import { Empresa, Filial, Formulario } from '../interfaces/stc.interface';
import { ServiceBpmService } from '../services/service-bpm.service';
import { extrairLista } from '../functions/extrair-lista';

@Component({
  selector: 'app-modalidade',
  templateUrl: './modalidade.component.html',
  styleUrls: ['./modalidade.component.scss'],
})
export class ModalidadeComponent implements OnInit {
  @Output() enviaMensagem = new EventEmitter<Mensagem>();
  @Output() proximaEtapa = new EventEmitter<void>();
  // Avisa o SolicitacaoComponent (dono do `maiorPassoAlcancado`) que
  // Lote/Origem/Destino foram invalidados — ver invalidarDadosDependentes().
  @Output() dadosDependentesInvalidados = new EventEmitter<void>();

  private plugsCarregados: boolean = false;
  private formRestaurado: boolean = false;
  // Achado ao vivo em 2026-08-31: mesmo com `emitEvent:false` em toda
  // chamada de restauração, ainda chegou a disparar um onChange "de
  // verdade" em codEmp/codFil durante o carregamento inicial (o campo
  // começa em branco e só recebe o valor restaurado depois que as listas
  // chegam) — `invalidarDadosDependentes()` interpretava isso como o
  // usuário trocando Empresa/Filial de propósito e limpava Lote/Origem/
  // Destino à toa. Em vez de tentar garantir 100% que nenhum evento
  // espúrio escape (frágil, depende de comportamento interno do PrimeNG —
  // ver comentário grande em carregarFiliais()), a defesa agora é no
  // CONSUMIDOR do evento: `invalidarDadosDependentes()` só age depois que a
  // restauração inicial está com certeza concluída (`prontoParaInvalidar`,
  // getter logo abaixo) — qualquer valueChanges antes disso é ignorado,
  // por mais real que pareça.
  private empresasProntas: boolean = false;
  private filiaisProntas: boolean = false;

  // STC nova (nada pra restaurar) já fica pronta de cara; STC devolvida só
  // fica pronta depois que Empresas E Filiais carregaram pelo menos uma vez
  // (dando tempo de `reaplicarRestauracao()` assentar o valor certo antes de
  // começar a confiar em mudanças de verdade).
  private get prontoParaInvalidar(): boolean {
    return !this.formRestaurado || (this.empresasProntas && this.filiaisProntas);
  }
  // Flags separadas (não um `carregando` só) — bug real encontrado em
  // 2026-08-22: carregarEmpresas()/carregarFiliais() rodam em paralelo, cada
  // uma independente; com uma flag só compartilhada, se Empresas terminasse
  // antes de Filiais, o spinner de tela cheia (`app-spinner`, que bloqueia
  // clique na tela inteira) sumia achando que "carregando" tinha acabado,
  // mesmo com Filiais ainda em voo — dava pra clicar no dropdown de Filial e
  // ver vazio. `carregando` (usado pelo spinner) agora é a soma dos dois, só
  // fica false quando ambos terminaram. Os dois dropdowns também usam
  // `carregandoEmpresas`/`carregandoFiliais` pra trocar o placeholder por
  // "Carregando..." enquanto isso (ver modalidade.component.html).
  carregandoEmpresas = false;
  carregandoFiliais = false;

  get carregando(): boolean {
    return this.carregandoEmpresas || this.carregandoFiliais;
  }

  dadosFormulario: Formulario = {};
  empresas: Empresa[] = [];
  // Todas as filiais (o endpoint getFilial não filtra por empresa) — a Tela 1
  // filtra por codEmp no cliente via `filiaisDaEmpresa`.
  todasFiliais: Filial[] = [];

  form: FormGroup;

  constructor(private fb: FormBuilder, private servico: ServiceBpmService) {
    this.form = this.fb.group({
      codEmp: [null, Validators.required],
      codFil: [{ value: null, disabled: true }, Validators.required],
      tipoTransferencia: ['Por Lote', Validators.required],
      justificativa: [''],
    });
  }

  ngOnInit(): void {
    // O token de acesso (usado pelo ServiceBpmService.headers()) só existe depois
    // que o _loadData/_info.getPlatformData() do workflowCockpit resolver — por
    // isso as chamadas de Empresa/Filial esperam `dados$` emitir um valor
    // não-nulo (ver ServiceBpmService), em vez de disparar direto no ngOnInit
    // ou na primeira emissão de qualquer valor (senão vai token undefined e dá 401).
    this.servico.dados$.subscribe({
      next: (dados: Formulario | null) => {
        if (!dados) {
          return;
        }
        this.dadosFormulario = dados;
        if (!this.plugsCarregados) {
          this.plugsCarregados = true;
          this.carregarEmpresas();
          this.carregarFiliais();
        }
        this.restaurarForm(dados);
      },
    });

    // valueChanges só dispara em mudança REAL do usuário — a restauração
    // automática (restaurarForm()/reaplicarRestauracao()) sempre usa
    // `emitEvent:false` de propósito, exatamente pra não cair aqui.
    // `distinctUntilChanged` evita invalidar à toa se o usuário reabrir o
    // dropdown e escolher a mesma empresa/filial que já estava selecionada.
    this.form
      .get('codEmp')
      ?.valueChanges.pipe(distinctUntilChanged())
      .subscribe((codEmp) => {
        this.form.get('codFil')?.reset(null, { emitEvent: false });
        this.form
          .get('codFil')
          ?.[codEmp ? 'enable' : 'disable']({ emitEvent: false });
        this.invalidarDadosDependentes();
      });

    this.form
      .get('codFil')
      ?.valueChanges.pipe(distinctUntilChanged())
      .subscribe(() => {
        this.invalidarDadosDependentes();
      });
  }

  // Pedido do usuário em 2026-08-31: manter tudo selecionado numa STC
  // devolvida é só metade da regra — se o solicitante REALMENTE trocar
  // Empresa ou Filial (não a restauração automática), tudo que dependia
  // disso (Lote, Origem, Destino — um lote pertence a uma Empresa/Filial
  // específica) fica inválido e precisa ser refeito. Só age se já havia algo
  // pra invalidar (evita disparar mensagem/reset à toa numa STC nova, onde
  // nunca houve seleção nenhuma ainda). Não mexe em Empresa/Filial/
  // Tipo/Justificativa — só no que vem DEPOIS de Modalidade no wizard.
  private invalidarDadosDependentes(): void {
    if (!this.prontoParaInvalidar) {
      console.log(
        '[STC][Modalidade] invalidarDadosDependentes ignorado (ainda restaurando)',
        { codEmpForm: this.form.get('codEmp')?.value, codFilForm: this.form.get('codFil')?.value }
      );
      return;
    }
    const f = this.servico.dadosFormulario;
    const haviaDadosDependentes =
      !!f.numLote ||
      (Array.isArray(f.dados) && f.dados.length > 0) ||
      (Array.isArray(f.linhasDestino) && f.linhasDestino.length > 0);
    if (!haviaDadosDependentes) {
      return;
    }

    f.numLote = undefined;
    f.dados = [];
    f.linhasDestino = [];
    f.modoDestino = undefined;
    f.ctaRed = undefined;
    f.desCta = undefined;
    f.codCcu = undefined;
    f.desCcu = undefined;
    f.numPrj = undefined;
    f.nomPrj = undefined;
    f.codFpj = undefined;
    f.desFpj = undefined;
    f.usuarioGestorOrigem = undefined;
    f.pareceresGestorOrigem = [];
    f.aprovadoGestorOrigem = undefined;
    f.temProximoGestorOrigem = undefined;
    f.usuarioGestorDestino = undefined;
    f.pareceresGestorDestino = [];
    f.aprovadoGestorDestino = undefined;
    f.temProximoGestorDestino = undefined;
    this.servico.loteSelecionado = null;

    this.dadosDependentesInvalidados.emit();
    this.enviaMensagem.emit({
      tipo: 3,
      mensagem:
        'Empresa/Filial alterada: Lote, Origem e Destino dependiam da seleção anterior e foram limpos. Selecione novamente.',
    });
  }

  get filiaisDaEmpresa(): Filial[] {
    const codEmp = this.form.get('codEmp')?.value;
    return codEmp
      ? this.todasFiliais.filter((f) => f.codEmp === codEmp)
      : [];
  }

  get placeholderFilial(): string {
    if (!this.form.get('codEmp')?.value) {
      return 'Selecione a empresa primeiro';
    }
    return this.carregandoFiliais ? 'Carregando filiais...' : 'Selecione a filial';
  }

  carregarEmpresas(): void {
    this.carregandoEmpresas = true;
    this.servico.getEmpresas().subscribe({
      next: (retorno) => {
        // Normaliza codEmp pra string (pedido do usuário em 2026-08-31: mesma
        // classe de bug do ctaRed/numPrj achada mais cedo na mesma sessão —
        // connector às vezes devolve campo de código como número puro mesmo a
        // interface dizendo string). `dadosFormulario.codEmp` restaurado de
        // uma STC devolvida vem de variável de processo, sempre string — se
        // a lista vier com número, o dropdown (`optionValue="codEmp"`) não
        // acha o item selecionado e mostra em branco mesmo com o valor certo
        // no form.
        this.empresas = extrairLista<Empresa>(retorno).map((e) => ({
          ...e,
          codEmp: String(e.codEmp),
        }));
        this.carregandoEmpresas = false;
        this.empresasProntas = true;
        this.reaplicarRestauracao();
      },
      error: () => {
        this.carregandoEmpresas = false;
        this.enviaMensagem.emit({
          tipo: 4,
          mensagem: 'Não foi possível carregar a lista de empresas.',
        });
      },
    });
  }

  carregarFiliais(): void {
    this.carregandoFiliais = true;
    this.servico.getFiliais().subscribe({
      next: (retorno) => {
        // Mesma normalização de codEmp/codFil que carregarEmpresas() — ver
        // comentário lá. Achado ao vivo em 2026-08-31: Filial ficava em
        // branco (ou trocava sozinha) ao reabrir uma STC devolvida, mesmo
        // com `codFil` certo no form. CAUSA RAIZ real (achada com o log de
        // `reaplicarRestauracao()` + o erro NG0100 que ela disparava): o
        // `p-dropdown` do PrimeNG tem `autoDisplayFirst` ligado por padrão —
        // quando `[options]` muda (a lista assíncrona termina de carregar)
        // e o valor atual não casa com nenhuma opção NAQUELE INSTANTE
        // (corrida entre `reaplicarRestauracao()` e a própria atualização de
        // `[options]`), o dropdown seleciona sozinho a PRIMEIRA opção da
        // lista e dispara um `onModelChange` de verdade — que ignora
        // completamente o `emitEvent:false` usado em toda a restauração,
        // porque não passa pelas nossas chamadas de `setValue`, é o PrimeNG
        // escrevendo direto no FormControl. Isso trocava o valor restaurado
        // pelo primeiro item da lista E dispava as validações/efeitos de uma
        // mudança real de Empresa/Filial (ver `invalidarDadosDependentes()`
        // logo abaixo), o que por sua vez resetava `maiorPassoAlcancado` no
        // meio de um ciclo de detecção de mudanças — daí o
        // ExpressionChangedAfterItHasBeenCheckedError (NG0100) reportado
        // junto. Corrigido com `[autoDisplayFirst]="false"` nos dois
        // dropdowns (`modalidade.component.html`) — mesma correção aplicada
        // em todos os dropdowns equivalentes de `DestinoComponent`/
        // `OrigemDestinoManualComponent`, que sofrem do mesmo risco.
        this.todasFiliais = extrairLista<Filial>(retorno).map((f) => ({
          ...f,
          codEmp: String(f.codEmp),
          codFil: String(f.codFil),
        }));
        this.carregandoFiliais = false;
        this.filiaisProntas = true;
        this.reaplicarRestauracao();
      },
      error: () => {
        this.carregandoFiliais = false;
        this.enviaMensagem.emit({
          tipo: 4,
          mensagem: 'Não foi possível carregar a lista de filiais.',
        });
      },
    });
  }

  // STC devolvida pela Contabilidade Orçamentária reabre numa task nova do
  // BPM, mas é a MESMA instância de processo — as variáveis (codEmp,
  // justificativa etc.) já voltam preenchidas em `dadosFormulario` (ver
  // ServiceBpmService._loadData), só que o FormGroup daqui nunca lia isso, só
  // ficava com os defaults do FormBuilder. Pedido do usuário em 2026-08-20:
  // reabrir a correção tem que vir com o que o solicitante já preencheu.
  // Roda só uma vez (formRestaurado) e só quando já existe algo salvo
  // (dados.codEmp) — STC nova não tem nada pra restaurar.
  private restaurarForm(dados: Formulario): void {
    if (this.formRestaurado || !dados.codEmp) {
      return;
    }
    this.formRestaurado = true;
    this.form.patchValue(
      {
        codEmp: dados.codEmp,
        tipoTransferencia: dados.tipoTransferencia || 'Por Lote',
        justificativa: dados.justificativa || '',
      },
      { emitEvent: false }
    );
    // codFil normalmente é reabilitado pelo valueChanges de codEmp — como o
    // patch acima roda com emitEvent:false (pra não resetar codFil de novo),
    // habilita e preenche na mão aqui.
    this.form.get('codFil')?.enable({ emitEvent: false });
    this.form.get('codFil')?.setValue(dados.codFil, { emitEvent: false });
    if (dados.tipoTransferencia === 'Manual') {
      this.form.get('justificativa')?.setValidators([Validators.required]);
      this.form.get('justificativa')?.updateValueAndValidity({ emitEvent: false });
    }
  }

  // Achado ao vivo em 2026-08-31: Filial (e possivelmente Empresa) ficava em
  // branco no dropdown ao reabrir uma STC devolvida, mesmo com o FormControl
  // com o valor certo — `restaurarForm()` seta codEmp/codFil ANTES de
  // `carregarEmpresas()`/`carregarFiliais()` (assíncronos) terminarem, então
  // o p-dropdown tenta casar o valor contra uma lista de `[options]` ainda
  // vazia. Reforça o valor de novo (`emitEvent:false`, não reabre o reset em
  // cascata do valueChanges de codEmp) assim que cada lista chega — pedido
  // do usuário: "deve estar deixando em branco quando ele seleciona a
  // empresa... talvez tenha que selecionar a filial após a consulta".
  private reaplicarRestauracao(): void {
    if (!this.formRestaurado) {
      return;
    }
    if (this.dadosFormulario.codEmp) {
      this.form.get('codEmp')?.setValue(this.dadosFormulario.codEmp, { emitEvent: false });
    }
    if (this.dadosFormulario.codFil) {
      this.form.get('codFil')?.enable({ emitEvent: false });
      this.form.get('codFil')?.setValue(this.dadosFormulario.codFil, { emitEvent: false });
    }
    console.log('[STC][Modalidade] reaplicarRestauracao', {
      codEmpForm: this.form.get('codEmp')?.value,
      codFilForm: this.form.get('codFil')?.value,
      empresasCarregadas: this.empresas.length,
      filiaisCarregadas: this.todasFiliais.length,
      filiaisDaEmpresa: this.filiaisDaEmpresa.length,
      prontoParaInvalidar: this.prontoParaInvalidar,
    });
  }

  selecionarTipo(tipo: 'Por Lote' | 'Manual'): void {
    this.form.get('tipoTransferencia')?.setValue(tipo);
    const justificativa = this.form.get('justificativa');
    if (tipo === 'Manual') {
      justificativa?.setValidators([Validators.required]);
    } else {
      justificativa?.clearValidators();
    }
    justificativa?.updateValueAndValidity();
  }

  avancar(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      this.enviaMensagem.emit({
        tipo: 3,
        mensagem: 'Preencha os campos obrigatórios antes de avançar.',
      });
      return;
    }

    this.aplicarFormNoServico();
    this.servico.dadosFormulario.tipoAcao = 'Seguir Processo';
    this.proximaEtapa.emit();
  }

  private aplicarFormNoServico(): void {
    const valores = this.form.getRawValue();
    this.servico.dadosFormulario.codEmp = valores.codEmp;
    this.servico.dadosFormulario.nomEmp = this.empresas.find(
      (e) => e.codEmp === valores.codEmp
    )?.nomEmp;
    this.servico.dadosFormulario.codFil = valores.codFil;
    this.servico.dadosFormulario.nomFil = this.todasFiliais.find(
      (f) => f.codEmp === valores.codEmp && f.codFil === valores.codFil
    )?.nomFil;
    this.servico.dadosFormulario.tipoTransferencia = valores.tipoTransferencia;
    this.servico.dadosFormulario.justificativa = valores.justificativa;
  }
}
