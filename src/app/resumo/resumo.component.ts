import { Component, EventEmitter, Output } from '@angular/core';
import { Mensagem } from '../interfaces/gerais.interface';
import { Formulario } from '../interfaces/stc.interface';
import { ServiceBpmService } from '../services/service-bpm.service';
import { LinhaComparativo, montarComparativo, totalPorNatureza } from '../functions/comparativo';

// Última tela do wizard do solicitante (passo "Resumo" no Por Lote,
// "Confirmação" no Manual) — revisão final antes do envio. O
// envio de verdade pro BPM é feito
// pelo botão do próprio Cockpit (fora do nosso controle, ver ServiceBpmService);
// aqui só preparamos `tipoAcao` e mostramos um resumo pra conferência.
@Component({
  selector: 'app-resumo',
  templateUrl: './resumo.component.html',
  styleUrls: ['./resumo.component.scss'],
})
export class ResumoComponent {
  @Output() enviaMensagem = new EventEmitter<Mensagem>();
  @Output() voltar = new EventEmitter<void>();

  enviado = false;

  constructor(private servico: ServiceBpmService) {}

  get dadosFormulario(): Formulario {
    return this.servico.dadosFormulario;
  }

  get linhasComparativo(): LinhaComparativo[] {
    return montarComparativo(this.dadosFormulario.dados, this.dadosFormulario.linhasDestino);
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

  enviarSolicitacao(): void {
    this.servico.dadosFormulario.tipoAcao = 'Seguir Processo';
    this.enviado = true;
    this.enviaMensagem.emit({
      tipo: 2,
      mensagem:
        'Solicitação pronta para envio. Use o botão de enviar/prosseguir do BPM para confirmar.',
    });
  }

  voltarEtapa(): void {
    this.voltar.emit();
  }
}
