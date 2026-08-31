import { Component, Input } from '@angular/core';

// Cabeçalho de página (título + subtítulo) reaproveitado em todas as telas do
// wizard e das aprovações, pra bater com o padrão visual do mockup (Drive) —
// cada passo do wizard e cada etapa de aprovação tem seu próprio título,
// mesmo estando todos dentro da mesma etapa do BPM (mesmo iframe), então
// esse cabeçalho precisa ser renderizado por nós, não pelo Cockpit.
@Component({
  selector: 'app-page-header',
  templateUrl: './page-header.component.html',
  styleUrls: ['./page-header.component.scss'],
})
export class PageHeaderComponent {
  @Input() titulo = '';
  @Input() subtitulo = '';
}
