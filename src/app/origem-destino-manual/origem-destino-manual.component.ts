import { Component, EventEmitter, OnInit, Output } from '@angular/core';
import { AbstractControl, FormArray, FormBuilder, FormGroup, Validators } from '@angular/forms';
import { forkJoin } from 'rxjs';
import { Mensagem } from '../interfaces/gerais.interface';
import {
  CentroCusto,
  ContaContabil,
  FaseProjeto,
  Formulario,
  Projeto,
} from '../interfaces/stc.interface';
import { ServiceBpmService } from '../services/service-bpm.service';
import { extrairLista } from '../functions/extrair-lista';
import { gestoresDistintos } from '../functions/loop-gestor';

// `p-calendar` (Data/Competência) trabalha com objeto `Date`, mas o resto do
// app representa data como string "dd/mm/yyyy" (mesmo formato real do Por
// Lote, confirmado contra payload de `getLancamentos` em 2026-08-24/26 —
// ex: "01/11/2024"). Sem converter, `datLct` saía com a serialização padrão
// do `Date` (ex: "Mon Sep 01 2026 00:00:00 GMT-0300...") em vez de
// "01/11/2024" — pedido do usuário em 2026-08-31: "formato da data
// lançamento manual tá errada... tem que ser igual do lote DD/MM/yyyy".
function paraDataDDMMYYYY(data: Date | string | null | undefined): string {
  if (!data) {
    return '';
  }
  const d = data instanceof Date ? data : new Date(data);
  if (isNaN(d.getTime())) {
    return typeof data === 'string' ? data : '';
  }
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`;
}

// Caminho inverso — STC devolvida: `datLct` salvo é string "dd/mm/yyyy",
// mas o `p-calendar` precisa de um objeto `Date` pra exibir a data
// selecionada corretamente.
function paraDataObjeto(valor: string | null | undefined): Date | null {
  if (!valor) {
    return null;
  }
  const partes = valor.split('/');
  if (partes.length !== 3) {
    return null;
  }
  const [dia, mes, ano] = partes.map(Number);
  if (!dia || !mes || !ano) {
    return null;
  }
  return new Date(ano, mes - 1, dia);
}

// Modalidade Manual (seção 18-20 do requisitos): origem e destino digitados
// na mesma tela, sem consulta de lote. Reaproveita as mesmas listas de Conta/
// CC/Projeto/Fase da modalidade Por Lote (mesma empresa já escolhida na Tela 1).
// Natureza do Destino é sempre a MESMA da Origem (corrigido em 2026-08-31,
// não é campo editável, mesma regra do Por Lote, ver `naturezaDestino` abaixo).
@Component({
  selector: 'app-origem-destino-manual',
  templateUrl: './origem-destino-manual.component.html',
  styleUrls: ['./origem-destino-manual.component.scss'],
})
export class OrigemDestinoManualComponent implements OnInit {
  @Output() enviaMensagem = new EventEmitter<Mensagem>();
  @Output() voltar = new EventEmitter<void>();
  @Output() proximaEtapa = new EventEmitter<void>();

  carregando = false;

  contas: ContaContabil[] = [];
  // Origem continua com listas completas (Centro de Custo/Projeto), sem
  // filtro em cascata — pedido do usuário em 2026-08-31: "manual só tem
  // Destino não tem origem" (o filtro em cascata do Destino, pedido no mesmo
  // dia, NÃO se aplica à Origem — só o Destino precisa dele, igual ao Por
  // Lote onde só DestinoComponent tem cascata).
  centrosCusto: CentroCusto[] = [];
  projetos: Projeto[] = [];
  private fasesPorProjeto: Record<string, FaseProjeto[]> = {};
  private carregandoFasesDe = new Set<string>();

  // Filtro em cascata do segmento contábil de DESTINO (mesmo padrão de
  // DestinoComponent, ver ENDPOINTS.txt getProjetosPorContas/getCCPorContas/
  // getFasesPorContas) — pedido do usuário em 2026-08-31: "no manual...
  // Destino tem que ter o filtro do que pode selecionar igual temos no
  // destino em lotes". Conta -> Projeto -> (Centro de Custo + Fase, juntos).
  private projetosPorContaDestino: Record<string, Projeto[]> = {};
  private carregandoProjetosDestinoDe = new Set<string>();
  private segmentosPorProjetoDestino: Record<
    string,
    { cc: CentroCusto[]; fases: FaseProjeto[] }
  > = {};
  private carregandoSegmentoDestinoDe = new Set<string>();
  // STC devolvida: mesmo padrão de DestinoComponent.reaplicarSegmentoDestinoRestaurado()
  // — reforça o valor restaurado depois que cada nível da cascata carrega.
  private segmentoDestinoRestaurado = false;

  form: FormGroup;

  constructor(private fb: FormBuilder, private servico: ServiceBpmService) {
    this.form = this.fb.group({
      dataCompetencia: [null, Validators.required],
      // Origem
      ctaRedOrigem: [null, Validators.required],
      codCcuOrigem: [null, Validators.required],
      numPrjOrigem: [null],
      codFpjOrigem: [{ value: null, disabled: true }],
      naturezaOrigem: [null, Validators.required],
      valor: [null, [Validators.required, Validators.min(0.01)]],
      historicoOrigem: ['', Validators.required],
      // Destino — 1 origem pode virar N destinos (pedido do usuário em
      // 2026-09-02: "tenho uma origem que coloquei 10.000 eu posso fazer 10
      // destinos de 1.000") — FormArray em vez de campos únicos, cada linha
      // com sua própria cascata Conta->Projeto->CC+Fase (ver
      // criarDestinoGrupo()/observarCascataDestino() abaixo). Sempre começa
      // com 1 linha (comportamento idêntico ao antigo "1 destino só" quando
      // o usuário não adiciona mais nenhuma).
      destinos: this.fb.array([this.criarDestinoGrupo()]),
    });
  }

  get destinosArray(): FormArray {
    return this.form.get('destinos') as FormArray;
  }

  private criarDestinoGrupo(): FormGroup {
    const grupo = this.fb.group({
      ctaRed: [null, Validators.required],
      numPrj: [null, Validators.required],
      codCcu: [null, Validators.required],
      codFpj: [null, Validators.required],
      valor: [null, [Validators.required, Validators.min(0.01)]],
      historico: ['', Validators.required],
    });
    this.observarCascataDestino(grupo);
    return grupo;
  }

  // Mesma cascata Conta -> Projeto -> CC+Fase de DestinoComponent, só que por
  // LINHA do FormArray em vez de um form único — chamado tanto pra linha
  // inicial (constructor) quanto pras adicionadas via adicionarDestino().
  private observarCascataDestino(grupo: FormGroup): void {
    grupo.get('ctaRed')?.valueChanges.subscribe((ctaRed) => {
      grupo.get('numPrj')?.reset(null, { emitEvent: false });
      grupo.get('codCcu')?.reset(null, { emitEvent: false });
      grupo.get('codFpj')?.reset(null, { emitEvent: false });
      if (ctaRed) {
        this.garantirProjetosDestinoCarregados(ctaRed);
      }
    });
    grupo.get('numPrj')?.valueChanges.subscribe((numPrj) => {
      grupo.get('codCcu')?.reset(null, { emitEvent: false });
      grupo.get('codFpj')?.reset(null, { emitEvent: false });
      const ctaRed = grupo.get('ctaRed')?.value;
      if (numPrj && ctaRed) {
        this.garantirSegmentoDestinoCarregado(ctaRed, numPrj);
      }
    });
  }

  adicionarDestino(): void {
    this.destinosArray.push(this.criarDestinoGrupo());
  }

  // Mantém sempre pelo menos 1 destino — não faz sentido um lançamento sem
  // nenhum destino.
  removerDestino(index: number): void {
    if (this.destinosArray.length > 1) {
      this.destinosArray.removeAt(index);
    }
  }

  get dadosFormulario(): Formulario {
    return this.servico.dadosFormulario;
  }

  // Só mostra Centros de Custo com gestor (`usuRes`) cadastrado, na Origem —
  // sem isso, `usuarioGestorOrigem` fica `undefined` e o loop de aprovação
  // do gestor correspondente nunca roda, travando o BPM num erro de gateway
  // (mesmo problema encontrado e confirmado no Por Lote em 2026-08-27, ver
  // DestinoComponent/OrigemComponent). O Destino filtra isso dentro de
  // `centrosCustoDestinoDoSegmento()` (mesmo padrão de DestinoComponent).
  get centrosCustoComGestor(): CentroCusto[] {
    return this.centrosCusto.filter((c) => !!c.usuRes);
  }

  // MESMA natureza da Origem (não inverte mais) — corrigido em 2026-08-31,
  // mesma regra do Por Lote (ver DestinoComponent.inicializarLinhasDestino):
  // alinhado com o Rateio Destino do postLancamentos, que mantém a mesma
  // natureza do rateio real de origem. Não é campo do form porque o usuário
  // não escolhe, só reflete o que foi digitado em Origem.
  get naturezaDestino(): 'Debito' | 'Credito' | undefined {
    return this.form.get('naturezaOrigem')?.value;
  }

  // Mostra o gestor ao vivo assim que o Centro de Custo é escolhido (mesmo
  // padrão de DestinoComponent.gestorSelecionado) — pedido do usuário em
  // 2026-08-31 ("está faltando aparecer os gestores"): a tela já resolvia o
  // gestor por baixo (usuarioGestorOrigem/usuarioGestorDestino, em
  // avancarEtapa()) mas nunca mostrava isso na tela, só no Por Lote.
  get gestorOrigemSelecionado(): string | undefined {
    const codCcu = this.form.get('codCcuOrigem')?.value;
    return this.centrosCusto.find((c) => c.codCcu === codCcu)?.usuRes;
  }

  gestorDestinoDaLinha(grupo: AbstractControl): string | undefined {
    const ctaRed = grupo.get('ctaRed')?.value;
    const numPrj = grupo.get('numPrj')?.value;
    const codCcu = grupo.get('codCcu')?.value;
    return this.centrosCustoDestinoDoSegmento(ctaRed, numPrj).find((c) => c.codCcu === codCcu)
      ?.usuRes;
  }

  // === Totais/validação do split 1 origem -> N destinos (pedido do usuário
  // em 2026-09-02) — a soma dos destinos precisa bater exatamente com o
  // valor da origem antes de avançar. ===
  get valorOrigem(): number {
    return this.form.get('valor')?.value ?? 0;
  }

  get totalDestinos(): number {
    return this.destinosArray.controls.reduce(
      (total, c) => total + (c.get('valor')?.value ?? 0),
      0
    );
  }

  get saldoDestino(): number {
    return this.valorOrigem - this.totalDestinos;
  }

  // Tolerância de ponto flutuante (mesmo padrão usado pra comparar valores
  // monetários no resto do app).
  get destinosBalanceados(): boolean {
    return this.valorOrigem > 0 && Math.abs(this.saldoDestino) < 0.005;
  }


  ngOnInit(): void {
    this.carregarListas();
    this.restaurarForm();

    this.form.get('numPrjOrigem')?.valueChanges.subscribe((numPrj) => {
      this.aoTrocarProjeto(numPrj, 'codFpjOrigem');
    });

    // Cascata de cada linha de Destino (Conta -> Projeto -> CC+Fase) já foi
    // ligada em criarDestinoGrupo()/observarCascataDestino() no momento em
    // que cada FormGroup do FormArray é criado (linha inicial e as
    // adicionadas via adicionarDestino()) — não precisa repetir aqui.
  }

  private aoTrocarProjeto(numPrj: string | null, campoFase: string): void {
    this.form.get(campoFase)?.reset(null, { emitEvent: false });
    this.form.get(campoFase)?.[numPrj ? 'enable' : 'disable']({ emitEvent: false });
    if (numPrj) {
      this.garantirFasesCarregadas(numPrj);
    }
  }

  carregarListas(): void {
    const codEmp = this.dadosFormulario.codEmp;
    if (!codEmp) {
      return;
    }
    this.carregando = true;
    forkJoin({
      contas: this.servico.getContasContabeis(codEmp),
      centros: this.servico.getCentrosCusto(codEmp),
      projetos: this.servico.getProjetos(codEmp),
    }).subscribe({
      next: ({ contas, centros, projetos }) => {
        this.contas = extrairLista<ContaContabil>(contas).map((c) => ({
          ...c,
          ctaRed: String(c.ctaRed),
        }));
        this.centrosCusto = extrairLista<CentroCusto>(centros);
        this.projetos = extrairLista<Projeto>(projetos);
        this.carregando = false;
        this.reaplicarSegmentoDestinoRestaurado();
      },
      error: () => {
        this.carregando = false;
        this.enviaMensagem.emit({
          tipo: 4,
          mensagem: 'Não foi possível carregar Conta Contábil, Centro de Custo ou Projeto.',
        });
      },
    });
  }

  // Fase da ORIGEM continua sob demanda por Projeto via getFaseProjeto (não
  // mudou) — só o Destino passou a usar a cascata getCCPorContas/
  // getFasesPorContas.
  fasesDoProjeto(numPrj: string | null | undefined): FaseProjeto[] {
    return numPrj ? this.fasesPorProjeto[numPrj] ?? [] : [];
  }

  carregandoFase(numPrj: string | null | undefined): boolean {
    return !!numPrj && this.carregandoFasesDe.has(numPrj);
  }

  placeholderFase(numPrj: string | null | undefined): string {
    if (!numPrj) {
      return 'Selecione o projeto primeiro';
    }
    return this.carregandoFase(numPrj) ? 'Carregando fases...' : 'Selecione a fase';
  }

  private garantirFasesCarregadas(numPrj: string): void {
    const codEmp = this.dadosFormulario.codEmp;
    if (!codEmp || this.fasesPorProjeto[numPrj] || this.carregandoFasesDe.has(numPrj)) {
      return;
    }
    this.carregandoFasesDe.add(numPrj);
    this.servico.getFasesProjeto(codEmp, numPrj).subscribe({
      next: (retorno) => {
        this.fasesPorProjeto[numPrj] = extrairLista<FaseProjeto>(retorno);
        this.carregandoFasesDe.delete(numPrj);
      },
      error: () => {
        this.carregandoFasesDe.delete(numPrj);
        this.enviaMensagem.emit({
          tipo: 4,
          mensagem: 'Não foi possível carregar as fases do projeto selecionado.',
        });
      },
    });
  }

  // === Cascata de Destino (Conta -> Projeto -> CC+Fase) — espelha
  // DestinoComponent, mesmos nomes de método (sufixo "Destino" pra não
  // colidir com os métodos de Fase da Origem acima). ===

  private chaveSegmentoDestino(ctaRed: string, numPrj: string): string {
    return `${ctaRed}::${numPrj}`;
  }

  projetosDestinoDaConta(ctaRed: string | null | undefined): Projeto[] {
    return ctaRed ? this.projetosPorContaDestino[ctaRed] ?? [] : [];
  }

  projetosDestinoCarregados(ctaRed: string | null | undefined): boolean {
    return !!ctaRed && !!this.projetosPorContaDestino[ctaRed];
  }

  carregandoProjetosDestino(ctaRed: string | null | undefined): boolean {
    return !!ctaRed && this.carregandoProjetosDestinoDe.has(ctaRed);
  }

  placeholderProjetoDestino(ctaRed: string | null | undefined): string {
    if (!ctaRed) {
      return 'Selecione a conta primeiro';
    }
    return this.carregandoProjetosDestino(ctaRed)
      ? 'Carregando projetos...'
      : 'Selecione o projeto';
  }

  garantirProjetosDestinoCarregados(ctaRed: string | null | undefined): void {
    const codEmp = this.dadosFormulario.codEmp;
    if (
      !ctaRed ||
      !codEmp ||
      this.projetosPorContaDestino[ctaRed] ||
      this.carregandoProjetosDestinoDe.has(ctaRed)
    ) {
      return;
    }
    this.carregandoProjetosDestinoDe.add(ctaRed);
    this.servico.getProjetosPorContas(codEmp, ctaRed).subscribe({
      next: (retorno) => {
        this.projetosPorContaDestino[ctaRed] = extrairLista<Projeto>(retorno).map((p) => ({
          ...p,
          numPrj: String(p.numPrj),
        }));
        this.carregandoProjetosDestinoDe.delete(ctaRed);
        this.reaplicarSegmentoDestinoRestaurado();
      },
      error: () => {
        this.carregandoProjetosDestinoDe.delete(ctaRed);
        this.enviaMensagem.emit({
          tipo: 4,
          mensagem: 'Não foi possível carregar os projetos da conta de destino selecionada.',
        });
      },
    });
  }

  centrosCustoDestinoDoSegmento(
    ctaRed: string | null | undefined,
    numPrj: string | null | undefined
  ): CentroCusto[] {
    if (!ctaRed || !numPrj) {
      return [];
    }
    // Só CC com gestor (`usuRes`) cadastrado — mesma regra de sempre (RN de
    // 2026-08-27, ver DestinoComponent).
    return (
      this.segmentosPorProjetoDestino[this.chaveSegmentoDestino(ctaRed, numPrj)]?.cc ?? []
    ).filter((c) => !!c.usuRes);
  }

  fasesDestinoDoSegmento(
    ctaRed: string | null | undefined,
    numPrj: string | null | undefined
  ): FaseProjeto[] {
    if (!ctaRed || !numPrj) {
      return [];
    }
    return (
      this.segmentosPorProjetoDestino[this.chaveSegmentoDestino(ctaRed, numPrj)]?.fases ?? []
    );
  }

  segmentoDestinoCarregado(
    ctaRed: string | null | undefined,
    numPrj: string | null | undefined
  ): boolean {
    return (
      !!ctaRed &&
      !!numPrj &&
      !!this.segmentosPorProjetoDestino[this.chaveSegmentoDestino(ctaRed, numPrj)]
    );
  }

  carregandoSegmentoDestino(
    ctaRed: string | null | undefined,
    numPrj: string | null | undefined
  ): boolean {
    return (
      !!ctaRed &&
      !!numPrj &&
      this.carregandoSegmentoDestinoDe.has(this.chaveSegmentoDestino(ctaRed, numPrj))
    );
  }

  placeholderCCDestino(
    ctaRed: string | null | undefined,
    numPrj: string | null | undefined
  ): string {
    if (!ctaRed || !numPrj) {
      return 'Selecione o projeto primeiro';
    }
    return this.carregandoSegmentoDestino(ctaRed, numPrj)
      ? 'Carregando centros de custo...'
      : 'Selecione o centro de custo';
  }

  placeholderFaseDestino(
    ctaRed: string | null | undefined,
    numPrj: string | null | undefined
  ): string {
    if (!ctaRed || !numPrj) {
      return 'Selecione o projeto primeiro';
    }
    return this.carregandoSegmentoDestino(ctaRed, numPrj) ? 'Carregando fases...' : 'Selecione a fase';
  }

  garantirSegmentoDestinoCarregado(
    ctaRed: string | null | undefined,
    numPrj: string | null | undefined
  ): void {
    const codEmp = this.dadosFormulario.codEmp;
    if (!ctaRed || !numPrj || !codEmp) {
      return;
    }
    const chave = this.chaveSegmentoDestino(ctaRed, numPrj);
    if (this.segmentosPorProjetoDestino[chave] || this.carregandoSegmentoDestinoDe.has(chave)) {
      return;
    }
    this.carregandoSegmentoDestinoDe.add(chave);
    forkJoin({
      cc: this.servico.getCCPorContas(codEmp, ctaRed, numPrj),
      fases: this.servico.getFasesPorContas(codEmp, ctaRed, numPrj),
    }).subscribe({
      next: ({ cc, fases }) => {
        this.segmentosPorProjetoDestino[chave] = {
          cc: extrairLista<CentroCusto>(cc).map((c) => ({ ...c, codCcu: String(c.codCcu) })),
          fases: extrairLista<FaseProjeto>(fases).map((f) => ({
            ...f,
            codFpj: String(f.codFpj),
          })),
        };
        this.carregandoSegmentoDestinoDe.delete(chave);
        this.reaplicarSegmentoDestinoRestaurado();
      },
      error: () => {
        this.carregandoSegmentoDestinoDe.delete(chave);
        this.enviaMensagem.emit({
          tipo: 4,
          mensagem: 'Não foi possível carregar Centro de Custo/Fase do projeto de destino selecionado.',
        });
      },
    });
  }

  // Validações "ao vivo" client-side (seção 19 dos requisitos, painel
  // "Validações" do mockup) — não é a validação real contra o ERP Senior
  // (RN checa a combinação no ERP no momento do processamento), só confere se
  // os campos obrigatórios estão preenchidos.
  get competenciaValida(): boolean {
    return !!this.form.get('dataCompetencia')?.value;
  }

  get segmentoOrigemValido(): boolean {
    const v = this.form.getRawValue();
    return !!(v.ctaRedOrigem && v.codCcuOrigem);
  }

  get segmentoDestinoValido(): boolean {
    return this.destinosArray.controls.every((c) => {
      const v = c.value;
      return !!(v.ctaRed && v.numPrj && v.codCcu && v.codFpj);
    });
  }

  get valorPositivo(): boolean {
    return this.valorOrigem > 0;
  }

  get equilibrioContabil(): boolean {
    // RNM007: valores de origem e destino devem permanecer equilibrados —
    // agora é a SOMA dos N destinos que precisa bater com o valor de origem,
    // não mais 1 valor espelhado (split 1->N pedido pelo usuário em
    // 2026-09-02, ver destinosBalanceados).
    return this.destinosBalanceados;
  }

  // STC devolvida: `dadosFormulario.dados[0]`/`linhasDestino[0]` já guardam o
  // que o solicitante preencheu antes (ver avancarEtapa) — sem isso, reabrir
  // pra corrigir sempre vinha com a tela em branco. Os dois lados guardam os
  // códigos crus (mesmo padrão de `LinhaDestino`, ver stc.interface.ts), sem
  // precisar separar código de descrição.
  private restaurarForm(): void {
    const origens = Array.isArray(this.dadosFormulario.dados) ? this.dadosFormulario.dados : [];
    const destinos = Array.isArray(this.dadosFormulario.linhasDestino)
      ? this.dadosFormulario.linhasDestino
      : [];
    const origem = origens[0];
    if (!origem && !destinos.length) {
      return;
    }

    // O valor TOTAL da origem nunca fica salvo separado — cada dados[i].valor
    // é só a fatia daquele destino (ver avancarEtapa()) — reconstrói somando
    // os destinos salvos.
    const valorOrigem = destinos.length
      ? destinos.reduce((total, d) => total + (d.valor ?? 0), 0)
      : origem?.valor;

    this.form.patchValue(
      {
        dataCompetencia: paraDataObjeto(origem?.datLct),
        ctaRedOrigem: origem?.ctaRed ?? null,
        codCcuOrigem: origem?.codCcu ?? null,
        numPrjOrigem: origem?.numPrj ?? null,
        naturezaOrigem: origem?.natureza ?? null,
        valor: valorOrigem ?? null,
        historicoOrigem: origem?.historico ?? '',
      },
      { emitEvent: false }
    );

    if (origem?.numPrj) {
      this.form.get('codFpjOrigem')?.enable({ emitEvent: false });
      this.form.get('codFpjOrigem')?.setValue(origem?.codFpj ?? null, { emitEvent: false });
      this.garantirFasesCarregadas(origem.numPrj);
    }

    // Segmento de cada Destino restaurado via cascata (mesmo padrão de
    // DestinoComponent.restaurarModoEFormUnico()) — dispara a busca de
    // Projeto/CC/Fase pros valores salvos; reaplicarSegmentoDestinoRestaurado()
    // reforça o valor assim que cada nível da cascata carregar. Garante 1
    // FormGroup por destino salvo (a 1ª linha já existe por padrão, ver
    // criarDestinoGrupo() no constructor).
    if (destinos.length) {
      this.segmentoDestinoRestaurado = true;
      while (this.destinosArray.length < destinos.length) {
        this.destinosArray.push(this.criarDestinoGrupo());
      }
      destinos.forEach((destino, i) => {
        this.destinosArray.at(i).patchValue(
          {
            ctaRed: destino.ctaRed ?? null,
            codCcu: destino.codCcu ?? null,
            numPrj: destino.numPrj ?? null,
            codFpj: destino.codFpj ?? null,
            valor: destino.valor ?? null,
            historico: destino.historico ?? '',
          },
          { emitEvent: false }
        );
        if (destino.ctaRed) {
          this.garantirProjetosDestinoCarregados(destino.ctaRed);
          if (destino.numPrj) {
            this.garantirSegmentoDestinoCarregado(destino.ctaRed, destino.numPrj);
          }
        }
      });
    }
  }

  private reaplicarSegmentoDestinoRestaurado(): void {
    if (!this.segmentoDestinoRestaurado) {
      return;
    }
    const destinos = Array.isArray(this.dadosFormulario.linhasDestino)
      ? this.dadosFormulario.linhasDestino
      : [];
    destinos.forEach((destino, i) => {
      const grupo = this.destinosArray.at(i);
      if (!grupo || !destino?.ctaRed) {
        return;
      }
      grupo.patchValue(
        {
          ctaRed: destino.ctaRed,
          codCcu: destino.codCcu ?? null,
          numPrj: destino.numPrj ?? null,
          codFpj: destino.codFpj ?? null,
        },
        { emitEvent: false }
      );
    });
  }

  avancarEtapa(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      this.enviaMensagem.emit({
        tipo: 3,
        mensagem: 'Preencha todos os campos obrigatórios de origem e destino.',
      });
      return;
    }

    // Split 1 origem -> N destinos (pedido do usuário em 2026-09-02): a soma
    // dos destinos precisa bater exatamente com o valor de origem antes de
    // avançar — "o saldo tem que ser igual".
    if (!this.destinosBalanceados) {
      this.enviaMensagem.emit({
        tipo: 3,
        mensagem: `A soma dos destinos (R$ ${this.totalDestinos.toFixed(
          2
        )}) precisa ser igual ao valor de origem (R$ ${this.valorOrigem.toFixed(2)}).`,
      });
      return;
    }

    const v = this.form.getRawValue();
    const conta = (lista: { ctaRed: string; desCta: string }[], ctaRed: string) =>
      lista.find((c) => c.ctaRed === ctaRed);
    const centroOrigem = this.centrosCusto.find((c) => c.codCcu === v.codCcuOrigem);
    const projetoOrigem = this.projetos.find((p) => p.numPrj === v.numPrjOrigem);
    const faseOrigem = this.fasesDoProjeto(v.numPrjOrigem).find(
      (f) => f.codFpj === v.codFpjOrigem
    );
    const contaOrigem = conta(this.contas, v.ctaRedOrigem);
    const dataFormatada = paraDataDDMMYYYY(v.dataCompetencia);

    // Cada destino vira seu próprio par origem/destino, ligados por
    // `lancamento` (mesma chave que montarComparativo/functions/comparativo.ts
    // já usa pra combinar Origem×Destino em todo o resto do app) — os N
    // "origem" gerados são cópias da MESMA classificação de origem, só com a
    // fatia de valor daquele destino (a soma sempre bate com o valor total
    // digitado, validado acima). Reaproveita 100% do que Aprovação/Resumo/
    // Impressão/postLancamentos já sabem fazer com múltiplas linhas, sem
    // precisar mudar nenhuma dessas telas/funções.
    const dadosOrigem: typeof this.servico.dadosFormulario.dados = [];
    const linhasDestino: typeof this.servico.dadosFormulario.linhasDestino = [];
    (v.destinos as any[]).forEach((d, i) => {
      const lancamento = `MANUAL-1-${i + 1}`;
      const contaDestino = conta(this.contas, d.ctaRed);
      const centroDestino = this.centrosCustoDestinoDoSegmento(d.ctaRed, d.numPrj).find(
        (c) => c.codCcu === d.codCcu
      );
      const projetoDestino = this.projetosDestinoDaConta(d.ctaRed).find(
        (p) => p.numPrj === d.numPrj
      );
      const faseDestino = this.fasesDestinoDoSegmento(d.ctaRed, d.numPrj).find(
        (f) => f.codFpj === d.codFpj
      );

      dadosOrigem!.push({
        lancamento,
        numLct: lancamento,
        datLct: dataFormatada,
        ctaRed: v.ctaRedOrigem,
        desCta: contaOrigem?.desCta,
        codCcu: v.codCcuOrigem,
        desCcu: centroOrigem?.desCcu,
        numPrj: v.numPrjOrigem,
        nomPrj: projetoOrigem?.nomPrj,
        codFpj: v.codFpjOrigem,
        desFpj: faseOrigem?.desFpj,
        natureza: v.naturezaOrigem,
        valor: d.valor,
        historico: v.historicoOrigem,
        gestor: centroOrigem?.usuRes,
      });

      linhasDestino!.push({
        lancamento,
        ctaRed: d.ctaRed,
        desCta: contaDestino?.desCta,
        codCcu: d.codCcu,
        desCcu: centroDestino?.desCcu,
        numPrj: d.numPrj,
        nomPrj: projetoDestino?.nomPrj,
        codFpj: d.codFpj,
        desFpj: faseDestino?.desFpj,
        natureza: this.naturezaDestino,
        valor: d.valor,
        historico: d.historico,
        gestor: centroDestino?.usuRes,
      });
    });

    this.servico.dadosFormulario.dados = dadosOrigem;
    this.servico.dadosFormulario.linhasDestino = linhasDestino;

    // Origem continua com 1 gestor só (mesma linha de origem, replicada em
    // cada par) — Destino agora pode ter até N gestores distintos (1 por
    // destino), mesmo mecanismo de fila do Por Lote
    // (DestinoComponent.avancarEtapa()), reaproveitado aqui pela 1ª vez no
    // Manual.
    this.servico.dadosFormulario.usuarioGestorOrigem = centroOrigem?.usuRes;
    const gestoresDestino = gestoresDistintos(linhasDestino);
    this.servico.dadosFormulario.usuarioGestorDestino = gestoresDestino[0];

    // Fila dos loops de gestor de origem/destino (ver Origem/DestinoComponent
    // .avancarEtapa()) — reseta o histórico/flags do mesmo jeito, pra ficar
    // consistente com o Por Lote.
    this.servico.dadosFormulario.pareceresGestorOrigem = [];
    this.servico.dadosFormulario.aprovadoGestorOrigem = undefined;
    this.servico.dadosFormulario.temProximoGestorOrigem = undefined;
    this.servico.dadosFormulario.pareceresGestorDestino = [];
    this.servico.dadosFormulario.aprovadoGestorDestino = undefined;
    this.servico.dadosFormulario.temProximoGestorDestino = undefined;

    this.servico.dadosFormulario.tipoAcao = 'Seguir Processo';
    this.proximaEtapa.emit();
  }

  voltarEtapa(): void {
    this.voltar.emit();
  }
}
