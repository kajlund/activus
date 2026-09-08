const approvedNavigations = new WeakSet<Event>();
export const wasApprovedNavigation = (event: Event) =>
  approvedNavigations.has(event);
export function navigationPosition(): number {
  const state = window.history.state as Record<string, unknown> | null;
  return typeof state?.['activusPosition'] === 'number'
    ? state['activusPosition']
    : 0;
}
export function initializeNavigation() {
  window.history.replaceState(
    { ...window.history.state, activusPosition: navigationPosition() },
    '',
    window.location.href,
  );
}
export function navigate(path: string) {
  if (path === window.location.pathname + window.location.search) return;
  if (
    !window.dispatchEvent(
      new Event('before-route-change', { cancelable: true }),
    )
  )
    return;
  window.history.pushState(
    { activusPosition: navigationPosition() + 1 },
    '',
    path,
  );
  const event = new PopStateEvent('popstate', { state: window.history.state });
  approvedNavigations.add(event);
  window.dispatchEvent(event);
}
export function interceptNavigation(event: MouseEvent) {
  if (
    event.defaultPrevented ||
    event.button !== 0 ||
    event.ctrlKey ||
    event.metaKey ||
    event.shiftKey ||
    event.altKey
  )
    return;
  const anchor = event
    .composedPath()
    .find(
      (node): node is HTMLAnchorElement => node instanceof HTMLAnchorElement,
    );
  if (
    !anchor ||
    anchor.target ||
    anchor.hasAttribute('download') ||
    anchor.getAttribute('href')?.startsWith('#')
  )
    return;
  const url = new URL(anchor.href);
  if (url.origin !== window.location.origin) return;
  event.preventDefault();
  navigate(url.pathname + url.search);
}
