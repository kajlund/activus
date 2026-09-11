// SPA routes load on entry. A document restored from the browser's back/forward
// cache needs a fresh read too, without disabling that cache or reloading forms.
export function onRestoredPage(refresh: () => void) {
  const listener = (event: PageTransitionEvent) => {
    if (event.persisted) refresh();
  };
  window.addEventListener('pageshow', listener);
  return () => window.removeEventListener('pageshow', listener);
}
