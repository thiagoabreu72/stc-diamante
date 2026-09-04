// Rola o conteúdo DESTE app (a janela/documento do nosso próprio iframe, sem
// tentar alcançar nenhum nível de fora do nosso controle — form-frame/
// Cockpit não são nosso código) de volta pro topo depois de trocar de passo
// do wizard ou registrar uma decisão (Aprovar/Negar/Integrar). Tentativas
// anteriores mexendo em frames externos (parentIFrame.moveToAnchor,
// window.parent.scrollTo, subir a cadeia de iframes via frameElement) não
// funcionaram e dependiam de infraestrutura que não é nossa — abandonadas.
//
// `setTimeout(..., 0)` — importante: `scrollParaTopo()` é chamado de dentro
// do mesmo handler síncrono que muda o estado (`this.passoAtivo = passo`,
// `decisaoRegistrada = 'aprovado'`, etc.), mas o Angular só atualiza o DOM
// (`[hidden]`/`*ngIf`) depois que a zona termina a tarefa atual — chamar
// scrollIntoView ANTES disso mira num layout que ainda não reflete a tela
// nova. Adiar pro próximo tick garante que o DOM já foi atualizado.
export function scrollParaTopo(): void {
  setTimeout(() => {
    document.getElementById('topo-app')?.scrollIntoView({ block: 'start' });
  }, 0);
}
