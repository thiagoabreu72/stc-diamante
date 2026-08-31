import { Component } from '@angular/core';
import { Mensagem } from './interfaces/gerais.interface';
import { ServiceBpmService } from './services/service-bpm.service';

@Component({
  selector: 'app-root',
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.scss'],
})
export class AppComponent {
  dadosMensagem: Mensagem = { tipo: 0 };

  // A etapa é decidida pelo BPM via hash da URL (#!/etapa/...), não por rota do
  // Angular — ver ServiceBpmService.getEtapa(). Lida uma única vez ao carregar a
  // página: cada etapa é uma tarefa/URL separada no Workflow Cockpit, não algo
  // que muda durante a sessão do formulário.
  etapa: string | null;

  constructor(private service: ServiceBpmService) {
    this.etapa = service.getEtapa();

    service.mensagem$.subscribe({
      next: (retorno) => {
        this.getDadosMensagem(retorno);
      },
    });
  }

  getDadosMensagem(dados: Mensagem) {
    this.dadosMensagem = dados;
  }
}
