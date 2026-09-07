// Native dialog supplies modality. Explicit edge wrapping keeps Tab inside the
// dialog (including Lit shadow roots), rather than moving to browser chrome.
export function trapDialogFocus(event: KeyboardEvent) {
  if (event.key !== 'Tab') return;
  const dialog = event.currentTarget as HTMLDialogElement;
  const controls: HTMLElement[] = [];
  function visit(root: Element | ShadowRoot) {
    for (const child of root.children) {
      if (
        child instanceof HTMLElement &&
        child.matches(
          'button,input,select,textarea,a[href],summary,[tabindex]',
        ) &&
        child.tabIndex >= 0 &&
        !child.matches(':disabled') &&
        child.getClientRects().length
      )
        controls.push(child);
      if (child.shadowRoot) visit(child.shadowRoot);
      else visit(child);
    }
  }
  visit(dialog);
  const active = event.composedPath()[0];
  const first = controls[0];
  const last = controls.at(-1);
  if (event.shiftKey && active === first) {
    event.preventDefault();
    last?.focus();
  } else if (!event.shiftKey && active === last) {
    event.preventDefault();
    first?.focus();
  }
}
