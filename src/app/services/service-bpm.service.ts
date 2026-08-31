import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable, Subject, of } from 'rxjs';
import { delay } from 'rxjs/operators';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Mensagem } from '../interfaces/gerais.interface';
import { Data, Info, ProcessVariables } from '../interfaces/workflow.interface';
import { Token } from '../interfaces/token.interface';
import { DadosUsuario } from '../interfaces/dados-usuario.interface';
import {
  CentroCusto,
  ContaContabil,
  Empresa,
  FaseProjeto,
  Filial,
  FiltrosLote,
  Formulario,
  Lancamento,
  LancamentoIntegracao,
  Lote,
  Projeto,
} from '../interfaces/stc.interface';
import { filtrarLotesMock, MOCK_LINHAS_LOTE } from '../mocks/lotes.mock';

declare var workflowCockpit: any;

const SERVICE_RUBI = 'com.tech.bpm';

@Injectable({
  providedIn: 'root',
})
export class ServiceBpmService {
  private urlSenior: string = '';
  usuario: string = '';
  dadosFormulario: Formulario = { dados: [] };
  // Transitório, não é variável de processo (não persiste entre etapas do
  // BPM, só entre passos do wizard na mesma sessão do solicitante) — o
  // Formulario só guarda `numLote` (string). Guarda o Lote inteiro (data,
  // descrição, situação etc.) só pra exibir o card "Resumo do Lote
  // Selecionado" em Origem/Destino, igual ao mockup ("Origem.png"/"Destino
  // unido.png") — setado em ConsultaLoteComponent.avancarEtapa().
  loteSelecionado: Lote | null = null;

  // BehaviorSubject (não Subject): qualquer componente criado depois do primeiro
  // carregamento também precisa receber os dados já carregados, não só quem já
  // estava inscrito na hora do _loadData original. Semente é `null` (não
  // `dadosFormulario`) de propósito: `null` sinaliza "ainda não carregou" —
  // se a semente fosse o Formulario vazio, um componente que se inscreve antes
  // do _loadData terminar receberia esse valor "vazio" como se já tivesse
  // carregado, disparando chamadas autenticadas sem token ainda (já causou 401).
  private getDados = new BehaviorSubject<Formulario | null>(null);
  dados$ = this.getDados.asObservable();

  private obterMensagem = new Subject<Mensagem>();
  mensagem$ = this.obterMensagem.asObservable();

  private token!: Token;
  dadosMensagem: Mensagem = {};

  private idPlugin: string;
  private urlInvoke: string =
    'https://platform.senior.com.br/t/senior.com.br/bridge/1.0/rest/platform/conector/actions/invoke';

  private variaveisProcesso: ProcessVariables[] = [];
  private dadosUsuario: DadosUsuario = { email: '' };

  constructor(private http: HttpClient) {
    // cria meio de conexão entre a api do bpm e formulário
    new workflowCockpit({
      init: this._loadData,
      onSubmit: this._saveData,
      onError: this._rollback,
    });
    // Obter parâmetros da página index.
    const elemento: any = document.querySelector('app-root');
    this.idPlugin = elemento.getAttribute('idPlugin');
    this.urlSenior = elemento.getAttribute('urlG5');
  }

  // Ações reconhecidas pelo BPM ao submeter o formulário:
  // - "Seguir Processo": etapa solicitante (Tela 1/2), avança a STC.
  //   Não existe "Salvar Rascunho" — não é uma regra do .docx (só aparecia nos
  //   mockups) e o BPM não tem suporte real pra isso.
  // - "Aprovar": qualquer etapa de aprovação (orçamentária, gestor-origem,
  //   gestor-destino, área contábil) avançando pro próximo passo do fluxo.
  // - "Retornar": só a etapa orçamentária (STCMO) devolve pro solicitante
  //   corrigir — confirmado com o cliente em 2026-08-17 (ver "fluxo diamante.png").
  // - "Cancelar": gestor-origem, gestor-destino e área contábil não devolvem;
  //   se não aprovarem, a STC é encerrada direto (sem loop de correção).
  private static readonly ACOES_VALIDAS = [
    'Seguir Processo',
    'Aprovar',
    'Retornar',
    'Cancelar',
  ];

  private _saveData = async (_data: Data, _info: Info) => {
    const formElement = document.getElementById('formulario-inicio');
    if (formElement) {
      formElement.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }

    if (
      this.dadosFormulario.tipoAcao &&
      ServiceBpmService.ACOES_VALIDAS.includes(this.dadosFormulario.tipoAcao)
    ) {
      // Tudo que a Tela 1-4 monta (inclusive campos derivados de seleção, como
      // descrições resolvidas a partir de um código) vai serializado aqui —
      // pedido explícito do usuário em 2026-08-17, pra ficar disponível como
      // variável do processo no BPM.
      if (typeof this.dadosFormulario.dados !== 'string') {
        this.dadosFormulario.dados = JSON.stringify(this.dadosFormulario.dados);
      }
      if (typeof this.dadosFormulario.linhasDestino !== 'string') {
        this.dadosFormulario.linhasDestino = JSON.stringify(
          this.dadosFormulario.linhasDestino ?? []
        );
      }
      if (typeof this.dadosFormulario.pareceresGestorOrigem !== 'string') {
        this.dadosFormulario.pareceresGestorOrigem = JSON.stringify(
          this.dadosFormulario.pareceresGestorOrigem ?? []
        );
      }
      if (typeof this.dadosFormulario.pareceresGestorDestino !== 'string') {
        this.dadosFormulario.pareceresGestorDestino = JSON.stringify(
          this.dadosFormulario.pareceresGestorDestino ?? []
        );
      }
      return { formData: this.dadosFormulario };
    }

    this.obterMensagem.next({
      tipo: 4,
      mensagem: 'Não foi selecionado a opção de escolha. Verifique!',
    });
    throw new Error('Não foi selecionado a opção de escolha.');
  };

  // Função _loadData é chamada ao abrir o formulário (é o `init` registrado no
  // workflowCockpit lá embaixo), carregando os dados das variáveis do fluxo.
  private _loadData = async (_data: Data, _info: Info): Promise<void> => {
    // processInstanceId já chega pronto em toda abertura do plugin (não
    // depende de nenhuma promise, nem de isRequestNew() — o BPM já entrega
    // esse id em qualquer etapa, não só na primeira/STC nova), então calcula
    // direto aqui, antes até de buscar as variáveis do processo. Usa `||` pra
    // não sobrescrever se a variável `numeroStc` (lida mais abaixo) já tiver
    // prevalecido numa chamada anterior.
    if (_data.processInstanceId != null) {
      this.dadosFormulario.numeroStc =
        this.dadosFormulario.numeroStc || String(_data.processInstanceId);
    }

    // dataAbertura só faz sentido "chutar" como hoje numa STC genuinamente
    // nova — nas demais etapas ela tem que vir da variável de processo (lida
    // mais abaixo), nunca ser sobrescrita pela data de agora.
    if (_info.isRequestNew()) {
      this.dadosFormulario.dataAbertura =
        this.dadosFormulario.dataAbertura || this.formatarDataAbertura(new Date());
    }

    await _info.getInfoFromProcessVariables().then((dados) => {
      this.variaveisProcesso = dados;
      let variavel = new Map();

      for (let i = 0; i < this.variaveisProcesso.length; i++) {
        variavel.set(
          this.variaveisProcesso[i].key,
          this.variaveisProcesso[i].value
        );
      }

      // Nomes de variáveis confirmados e registrados no processo (id 29) via
      // saveProcessContextVariables em 2026-08-17 — camelCase, igual ao nome
      // do campo aqui no Formulario (não é mais placeholder snake_case).
      this.dadosFormulario.numeroStc = variavel.get('numeroStc') || this.dadosFormulario.numeroStc;
      // Solicitante/usuário vêm da variável do processo quando já existem (STC
      // devolvida reabrindo pra correção — mantém quem abriu originalmente);
      // numa STC nova ainda não existe variável nenhuma, então usa
      // _info.getUserData() (usuário logado agora) como fonte — ver mais
      // abaixo, depois que os dois Promises resolverem.
      this.dadosFormulario.solicitante = variavel.get('solicitante');
      this.dadosFormulario.usuarioSolicitante = variavel.get('usuarioSolicitante');
      this.dadosFormulario.areaSolicitante = variavel.get('areaSolicitante');
      this.dadosFormulario.dataAbertura =
        variavel.get('dataAbertura') || this.dadosFormulario.dataAbertura;
      this.dadosFormulario.codEmp = variavel.get('codEmp');
      this.dadosFormulario.nomEmp = variavel.get('nomEmp');
      this.dadosFormulario.codFil = variavel.get('codFil');
      this.dadosFormulario.nomFil = variavel.get('nomFil');
      this.dadosFormulario.tipoTransferencia = variavel.get('tipoTransferencia');
      this.dadosFormulario.justificativa = variavel.get('justificativa');
      this.dadosFormulario.tipoAcao = variavel.get('tipoAcao');
      this.dadosFormulario.numLote = variavel.get('numLote');
      this.dadosFormulario.usuarioOrcamentaria = variavel.get('usuarioOrcamentaria');
      this.dadosFormulario.usuarioGestorOrigem = variavel.get('usuarioGestorOrigem');
      this.dadosFormulario.usuarioGestorDestino = variavel.get('usuarioGestorDestino');
      this.dadosFormulario.usuarioContabil = variavel.get('usuarioContabil');
      this.dadosFormulario.status = variavel.get('status');
      this.dadosFormulario.parecerOrcamentaria = variavel.get('parecerOrcamentaria');
      this.dadosFormulario.parecerGestorOrigem = variavel.get('parecerGestorOrigem');
      this.dadosFormulario.parecerGestorDestino = variavel.get('parecerGestorDestino');
      this.dadosFormulario.parecerAreaContabil = variavel.get('parecerAreaContabil');
      this.dadosFormulario.aprovadoGestorOrigem = variavel.get('aprovadoGestorOrigem');
      this.dadosFormulario.temProximoGestorOrigem = variavel.get('temProximoGestorOrigem');
      this.dadosFormulario.aprovadoGestorDestino = variavel.get('aprovadoGestorDestino');
      this.dadosFormulario.temProximoGestorDestino = variavel.get('temProximoGestorDestino');
      this.dadosFormulario.ctaRed = variavel.get('ctaRed');
      this.dadosFormulario.desCta = variavel.get('desCta');
      this.dadosFormulario.codCcu = variavel.get('codCcu');
      this.dadosFormulario.desCcu = variavel.get('desCcu');
      this.dadosFormulario.numPrj = variavel.get('numPrj');
      this.dadosFormulario.nomPrj = variavel.get('nomPrj');
      this.dadosFormulario.codFpj = variavel.get('codFpj');
      this.dadosFormulario.desFpj = variavel.get('desFpj');

      const dadosLinhas = variavel.get('dados');
      this.dadosFormulario.dados = dadosLinhas
        ? typeof dadosLinhas === 'string'
          ? JSON.parse(dadosLinhas)
          : dadosLinhas
        : [];

      const linhasDestino = variavel.get('linhasDestino');
      this.dadosFormulario.linhasDestino = linhasDestino
        ? typeof linhasDestino === 'string'
          ? JSON.parse(linhasDestino)
          : linhasDestino
        : [];

      const pareceresGestorOrigem = variavel.get('pareceresGestorOrigem');
      this.dadosFormulario.pareceresGestorOrigem = pareceresGestorOrigem
        ? typeof pareceresGestorOrigem === 'string'
          ? JSON.parse(pareceresGestorOrigem)
          : pareceresGestorOrigem
        : [];

      const pareceresGestorDestino = variavel.get('pareceresGestorDestino');
      this.dadosFormulario.pareceresGestorDestino = pareceresGestorDestino
        ? typeof pareceresGestorDestino === 'string'
          ? JSON.parse(pareceresGestorDestino)
          : pareceresGestorDestino
        : [];

      this.dadosFormulario.modoDestino = variavel.get('modoDestino') as
        | 'Unico'
        | 'Multiplo'
        | undefined;

      _info.getPlatformData().then((plataforma) => {
        this.dadosUsuario.access_token = plataforma.token.access_token;

        _info.getUserData().then((usuario) => {
          this.dadosFormulario.solicitante =
            this.dadosFormulario.solicitante || usuario.fullname;
          this.dadosFormulario.usuarioSolicitante =
            this.dadosFormulario.usuarioSolicitante || usuario.username;
          this.getDados.next(this.dadosFormulario);
        });
      });
    });
  };

  private _rollback = (_data: Data, _info: Info): any => {
    _data.error = 'erro ao carregar dados.';
  };

  // Os nomes de etapa (solicitante, orcamentaria, gestor-origem, gestor-destino,
  // contabil) são definidos por nós na configuração do processo no BPM Designer
  // (nome da tarefa vira o segmento da URL, #!/<etapa>/...) — não é algo a
  // confirmar com o cliente, é decisão nossa de implementação.
  getEtapa(): string | null {
    const match = window.location.href.match(/#!\/(.*?)\//);
    return match ? match[1] : 'impressao';
  }

  getEmpresas(): Observable<Empresa[] | any> {
    const headers = this.headers();
    const body = this.montarBody('getEmpresa', { rootObject: 'dados' });
    return this.http.post<Empresa[] | any>(this.urlInvoke, body, { headers });
  }

  // Sem filtro de entrada (ver ENDPOINTS.txt) — retorna todas as filiais de
  // todas as empresas; o componente filtra por codEmp no cliente.
  getFiliais(): Observable<Filial[] | any> {
    const headers = this.headers();
    const body = this.montarBody('getFilial', { rootObject: 'dados' });
    return this.http.post<Filial[] | any>(this.urlInvoke, body, { headers });
  }

  // Entrada codEmp é Integer no contrato real (ENDPOINTS.txt) — nosso modelo
  // interno guarda codEmp como string (mesmo padrão de Empresa/Filial), então
  // converte na borda aqui.
  getProjetos(codEmp: string): Observable<Projeto[] | any> {
    const headers = this.headers();
    const body = this.montarBody('getProjetos', {
      rootObject: 'dados',
      codEmp: Number(codEmp),
    });
    return this.http.post<Projeto[] | any>(this.urlInvoke, body, { headers });
  }

  getFasesProjeto(codEmp: string, numPrj: string): Observable<FaseProjeto[] | any> {
    const headers = this.headers();
    const body = this.montarBody('getFaseProjeto', {
      rootObject: 'dados',
      codEmp: Number(codEmp),
      numPrj,
    });
    return this.http.post<FaseProjeto[] | any>(this.urlInvoke, body, { headers });
  }

  getContasContabeis(codEmp: string): Observable<ContaContabil[] | any> {
    const headers = this.headers();
    const body = this.montarBody('getContaContabil', {
      rootObject: 'dados',
      codEmp: Number(codEmp),
    });
    return this.http.post<ContaContabil[] | any>(this.urlInvoke, body, { headers });
  }

  getCentrosCusto(codEmp: string): Observable<CentroCusto[] | any> {
    const headers = this.headers();
    const body = this.montarBody('getCentroCusto', {
      rootObject: 'dados',
      codEmp: Number(codEmp),
    });
    return this.http.post<CentroCusto[] | any>(this.urlInvoke, body, { headers });
  }

  // Filtro em cascata do segmento contábil na tela de Destino (pedido do
  // usuário em 2026-08-29, ver ENDPOINTS.txt): Conta -> Projeto -> (Centro de
  // Custo + Fase). Contrato informado por texto, ainda não confirmado contra
  // payload real (mesma cautela de outros ports nessa situação — ver nota em
  // getLancamentos/ENDPOINTS.txt).
  //
  // `ctaRed` chega aqui como string formatada com pontos (ex: "1.1.01.001",
  // mesmo texto exibido no dropdown de Conta Contábil) — confirmado ao vivo
  // em 2026-08-31 que os 3 ports abaixo exigem ctaRed NUMÉRICO, sem pontos.
  // `numeroSemPontos()` normaliza antes de montar o body. `numPrj` continua
  // string COM pontos (ex: "9.999.999") — confirmado ao vivo em 2026-08-31
  // que, diferente de ctaRed, não deve ser convertido.
  getProjetosPorContas(codEmp: string, ctaRed: string): Observable<Projeto[] | any> {
    const headers = this.headers();
    const body = this.montarBody('getProjetosPorContas', {
      rootObject: 'dados',
      codEmp: Number(codEmp),
      ctaRed: this.numeroSemPontos(ctaRed),
    });
    return this.http.post<Projeto[] | any>(this.urlInvoke, body, { headers });
  }

  getCCPorContas(
    codEmp: string,
    ctaRed: string,
    numPrj: string
  ): Observable<CentroCusto[] | any> {
    const headers = this.headers();
    const body = this.montarBody('getCCPorContas', {
      rootObject: 'dados',
      codEmp: Number(codEmp),
      ctaRed: this.numeroSemPontos(ctaRed),
      numPrj,
    });
    return this.http.post<CentroCusto[] | any>(this.urlInvoke, body, { headers });
  }

  getFasesPorContas(
    codEmp: string,
    ctaRed: string,
    numPrj: string
  ): Observable<FaseProjeto[] | any> {
    const headers = this.headers();
    const body = this.montarBody('getFasesPorContas', {
      rootObject: 'dados',
      codEmp: Number(codEmp),
      ctaRed: this.numeroSemPontos(ctaRed),
      numPrj,
    });
    return this.http.post<FaseProjeto[] | any>(this.urlInvoke, body, { headers });
  }

  private numeroSemPontos(valor: string): number {
    return Number(String(valor).replace(/\./g, ''));
  }

  // Port `getLotes` confirmado real em 2026-08-24 (resolve o bloqueador nº 1
  // do projeto, seção 9.2/9.5 do requisitos, pro lado de listagem de lotes
  // elegíveis) — ver ENDPOINTS.txt. Mock (`src/app/mocks/lotes.mock.ts`)
  // continua disponível só como fallback de teste offline.
  private readonly MOCK_LOTES_ATIVO = false;

  // `consultarLinhasLote` (linhas dentro do lote selecionado, tela de Origem)
  // usa o port real `getLancamentos` desde 2026-08-26 — confirmado pelo
  // cliente como já publicado no ambiente, e casing dos campos validado
  // contra payload real no mesmo dia (tudo lowerCamelCase, ver
  // stc.interface.ts). Mock (`MOCK_LINHAS_LOTE` em mocks/lotes.mock.ts)
  // continua disponível só como fallback de teste offline.
  private readonly MOCK_LINHAS_LOTE_ATIVO = false;

  consultarLotes(filtros: FiltrosLote): Observable<Lote[] | any> {
    if (this.MOCK_LOTES_ATIVO) {
      return of(filtrarLotesMock(filtros)).pipe(delay(400));
    }
    const headers = this.headers();
    const body = this.montarBody('getLotes', {
      rootObject: 'lotes',
      codEmp: filtros.codEmp,
      codFil: filtros.codFil,
    });
    return this.http.post<Lote[] | any>(this.urlInvoke, body, { headers });
  }

  consultarLinhasLote(
    codEmp: string | undefined,
    numLote: string | undefined
  ): Observable<Lancamento[] | any> {
    if (this.MOCK_LINHAS_LOTE_ATIVO) {
      return of(numLote ? MOCK_LINHAS_LOTE[numLote] ?? [] : []).pipe(delay(400));
    }
    const headers = this.headers();
    const body = this.montarBody('getLancamentos', {
      rootObject: 'lancamentos',
      codEmp: Number(codEmp),
      numLot: numLote,
    });
    return this.http.post<Lancamento[] | any>(this.urlInvoke, body, { headers });
  }

  // Port `postLancamentos` (informado pelo usuário em 2026-08-31, ver
  // ENDPOINTS.txt) — gera o(s) lançamento(s) de reclassificação no ERP,
  // resolve o bloqueador "Geração do arquivo/lote" da seção 9 do
  // STC_Diamante_Requisitos.md. Chamado por `AprovacaoComponent.integrarERP()`
  // no botão "Liberar Integração ERP" (etapa Área Contábil). NÃO testado
  // contra a API real ainda: objeto raiz assumido 'dados' (mesmo padrão dos
  // outros ports), tipos de campo (string/number) não confirmados, formato
  // do retorno (sucesso/nº de lote/erro, RN 6.6/6.7) não confirmado —
  // CONFERIR tudo isso assim que houver acesso ao ambiente.
  // `numSol` (novo em 2026-08-31): mesmo nível de `tipo` (não dentro de
  // `dados`) — é o número da STC (`Formulario.numeroStc`, "o id da
  // requisição que já temos", nas palavras do usuário).
  postLancamentos(
    tipo: 'M' | 'L',
    numSol: string | undefined,
    dados: LancamentoIntegracao[]
  ): Observable<any> {
    const headers = this.headers();
    const body = this.montarBody('postLancamentos', {
      rootObject: 'dados',
      tipo,
      numSol,
      dados,
    });
    return this.http.post<any>(this.urlInvoke, body, { headers });
  }

  // dd/mm/yyyy HH:mm — mesmo padrão dos p-calendar do resto do app
  // (dateFormat="dd/mm/yy"), só que aqui é texto fixo (não editável).
  private formatarDataAbertura(data: Date): string {
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${pad(data.getDate())}/${pad(data.getMonth() + 1)}/${data.getFullYear()} ${pad(
      data.getHours()
    )}:${pad(data.getMinutes())}`;
  }

  private headers(): HttpHeaders {
    return new HttpHeaders({
      'Content-Type': 'application/json',
      Authorization: `bearer ${this.dadosUsuario.access_token}`,
    });
  }

  montarBody(port: string, inputData: any): any {
    return {
      inputData: {
        module: 'sapiens',
        encryption: '0',
        server: this.urlSenior,
        service: SERVICE_RUBI,
        rootObject: '',
        user: '',
        password: '',
        port,
        ...inputData,
      },
      id: this.idPlugin,
    };
  }
}
