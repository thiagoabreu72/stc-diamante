import { Component, Input } from '@angular/core';

// Banner "Solicitação devolvida pela Contabilidade Orçamentária" — só existia
// em ModalidadeComponent (pedido do usuário em 2026-08-31: mostrar o motivo
// da devolução em TODAS as fases do wizard, não só na primeira tela, já que
// agora o wizard inteiro fica desbloqueado numa devolução e o usuário pode
// pular direto pra qualquer passo sem ver o motivo antes). Extraído pra
// componente reutilizável, mesmo texto/estilo (`.devolucao-card*`,
// styles.scss) usado nas telas de Consulta do Lote/Origem/Destino/Resumo/
// Origem-Destino Manual, além da própria Modalidade.
@Component({
  selector: 'app-devolucao-banner',
  templateUrl: './devolucao-banner.component.html',
})
export class DevolucaoBannerComponent {
  @Input() motivo: string | undefined;
}
