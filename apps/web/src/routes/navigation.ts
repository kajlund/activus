export function navigate(path: string) {
  if (path === window.location.pathname + window.location.search) return;
  window.history.pushState(null, '', path);
  window.dispatchEvent(new PopStateEvent('popstate'));
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
