import { Component, OnInit } from '@angular/core';
import { Formulario } from '../interfaces/stc.interface';
import { ServiceBpmService } from '../services/service-bpm.service';
import { LinhaComparativo, montarComparativo, totalPorNatureza } from '../functions/comparativo';
import { gestoresDistintos, StatusGestor, statusPorGestor } from '../functions/loop-gestor';

// Etapa "Impressão/Consulta" — fallback do BPM (ServiceBpmService.getEtapa()
// devolve 'impressao' quando o hash da URL não bate com nenhuma das 5 etapas
// conhecidas, ver ENDPOINTS.txt/PROGRESSO.md pendência nº 7). Visualização
// somente-leitura da STC inteira: dados de abertura, todas as linhas
// Origem x Destino (sem filtro por gestor, diferente de AprovacaoComponent) e
// o histórico de decisão de cada etapa de aprovação já percorrida. Não há
// nenhuma ação aqui — nada é enviado de volta pro BPM nesta tela.
@Component({
  selector: 'app-impressao',
  templateUrl: './impressao.component.html',
  styleUrls: ['./impressao.component.scss'],
})
export class ImpressaoComponent implements OnInit {
  linhasComparativo: LinhaComparativo[] = [];

  constructor(private servico: ServiceBpmService) {}

  ngOnInit(): void {
    // Mesmo cuidado do AprovacaoComponent: dadosFormulario ainda pode estar
    // vazio no instante em que este componente é criado (a etapa vem do hash
    // da URL, resolvida antes do _loadData assíncrono terminar).
    this.servico.dados$.subscribe((dados) => {
      if (!dados) {
        return;
      }
      this.linhasComparativo = montarComparativo(dados.dados, dados.linhasDestino);
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

  // Painel "controle geral" pedido pelo usuário em 2026-08-26: pra cada
  // gestor distinto (origem ou destino), mostra se já decidiu (Aprovado/
  // Negado, com o parecer dele), se é a vez dele agora, ou se ainda está na
  // fila — cruzando a lista de gestores distintos das linhas com o histórico
  // de pareceres e quem é "a vez" no momento (usuarioGestorOrigem/Destino).
  // Mesmo mecanismo de loop usado em AprovacaoComponent (RN046/049/050),
  // só que aqui é somente leitura, sem decisão nenhuma.
  get statusGestoresOrigem(): StatusGestor[] {
    const gestores = gestoresDistintos(this.linhasComparativo.map((l) => l.origem));
    return statusPorGestor(
      gestores,
      this.dadosFormulario.pareceresGestorOrigem,
      this.dadosFormulario.usuarioGestorOrigem
    );
  }

  get statusGestoresDestino(): StatusGestor[] {
    const gestores = gestoresDistintos(this.linhasComparativo.map((l) => l.destino));
    return statusPorGestor(
      gestores,
      this.dadosFormulario.pareceresGestorDestino,
      this.dadosFormulario.usuarioGestorDestino
    );
  }

  // Quantidade de rateios/linhas sob responsabilidade de um gestor —
  // exibido ao lado do status ("gestor X, 3 rateios, Aprovado").
  rateiosDoGestorOrigem(gestor: string): number {
    return this.linhasComparativo.filter((l) => l.origem?.gestor === gestor).length;
  }

  linhasDoGestorDestino(gestor: string): number {
    return this.linhasComparativo.filter((l) => l.destino?.gestor === gestor).length;
  }

  // Rótulo amigável pro status — usado no template em vez do valor cru.
  rotuloStatusGestor(status: StatusGestor['status']): string {
    switch (status) {
      case 'Aprovado':
        return 'Aprovado';
      case 'Negado':
        return 'Negado';
      case 'Sua vez':
        return 'Aguardando decisão (é a vez dele)';
      default:
        return 'Na fila, ainda não chegou a vez';
    }
  }

  severidadeStatusGestor(status: StatusGestor['status']): 'success' | 'info' | 'warning' | 'danger' {
    switch (status) {
      case 'Aprovado':
        return 'success';
      case 'Negado':
        return 'danger';
      case 'Sua vez':
        return 'warning';
      default:
        return 'info';
    }
  }

  // Status é uma variável de processo lida do BPM (nunca escrita por este
  // app, ver ServiceBpmService._loadData) — texto livre definido no BPM
  // Designer, não confirmado com o cliente ainda. Classifica por palavra-
  // chave em vez de comparar valores exatos, pra não quebrar se o texto
  // exato do BPM mudar.
  get severidadeStatus(): 'success' | 'info' | 'warning' | 'danger' {
    const status = (this.dadosFormulario.status || '').toLowerCase();
    if (status.includes('cancel') || status.includes('reprov') || status.includes('encerr')) {
      return 'danger';
    }
    if (status.includes('aprov') || status.includes('conclu') || status.includes('final')) {
      return 'success';
    }
    if (status.includes('devol') || status.includes('correç') || status.includes('correc')) {
      return 'warning';
    }
    return 'info';
  }
}
