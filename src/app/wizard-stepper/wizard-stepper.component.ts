import { Component, EventEmitter, Input, OnChanges, Output } from '@angular/core';
import { MenuItem } from 'primeng/api';

@Component({
  selector: 'app-wizard-stepper',
  templateUrl: './wizard-stepper.component.html',
  styleUrls: ['./wizard-stepper.component.scss'],
})
export class WizardStepperComponent implements OnChanges {
  @Input() passos: string[] = [];
  @Input() passoAtivo: number = 0;
  // Passo mais avançado já validado — clicar num passo além disso é bloqueado
  // (só dá pra pular pra frente clicando em "Avançar", nunca direto no stepper).
  @Input() maiorPassoAlcancado: number = 0;
  @Output() passoClicado = new EventEmitter<number>();

  itens: MenuItem[] = [];

  ngOnChanges(): void {
    this.itens = this.passos.map((label, index) => ({
      label,
      disabled: index > this.maiorPassoAlcancado,
      command: () => this.passoClicado.emit(index),
    }));
  }
}
