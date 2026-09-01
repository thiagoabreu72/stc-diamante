import { Component, Input, OnChanges, SimpleChanges } from '@angular/core';
import { MessageService } from 'primeng/api';
import { Mensagem } from '../interfaces/gerais.interface';

@Component({
  selector: 'app-mensagem',
  templateUrl: './mensagem.component.html',
  styleUrls: ['./mensagem.component.scss'],
})
export class MensagemComponent implements OnChanges {
  @Input() dadosMensagem: Mensagem = { tipo: 0, mensagem: '' };

  constructor(private messageService: MessageService) {}

  ngOnChanges(alteracao: SimpleChanges) {
    this.determinaTipo();
  }

  determinaTipo() {
    switch (this.dadosMensagem.tipo) {
      case 1:
        this.showSuccess();
        break;
      case 2:
        this.showInfo();
        break;

      case 3:
        this.showWarn();
        break;
      case 4:
        this.showError();
        break;
    }
  }

  showSuccess() {
    this.messageService.add({
      severity: 'success',
      summary: 'Sucesso',
      detail: this.dadosMensagem.mensagem,
    });
  }

  showInfo() {
    this.messageService.add({
      severity: 'info',
      summary: 'Info',
      detail: this.dadosMensagem.mensagem,
    });
  }

  showWarn() {
    this.messageService.add({
      severity: 'warn',
      summary: 'Atenção',
      detail: this.dadosMensagem.mensagem,
    });
  }

  showError() {
    // `sticky: true` — pedido do usuário em 2026-08-31: o toast de erro
    // sumia rápido demais (padrão do PrimeNG, ~3s) sem dar tempo de ler uma
    // mensagem mais longa (ex: erro de negócio do Sapiens no postLancamentos,
    // várias linhas). Erro fica na tela até o usuário fechar manualmente.
    this.messageService.add({
      severity: 'error',
      summary: 'Erro',
      detail: this.dadosMensagem.mensagem,
      sticky: true,
    });
  }
}
