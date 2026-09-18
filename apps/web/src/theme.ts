export type ThemeMode = 'light' | 'dark';
export function themeMode(): ThemeMode {
  try {
    const value = localStorage.getItem('activus-theme');
    if (value === 'light' || value === 'dark') return value;
  } catch {
    // Storage can be unavailable in private browsing.
  }
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches
    ? 'dark'
    : 'light';
}
export function applyTheme(mode: ThemeMode) {
  const dark = mode === 'dark';
  document.documentElement.dataset.theme = dark ? 'dark' : 'light';
  document.documentElement.style.colorScheme = dark ? 'dark' : 'light';
}
export function selectTheme(mode: ThemeMode) {
  try {
    localStorage.setItem('activus-theme', mode);
  } catch {
    /* Session choice still applies. */
  }
  applyTheme(mode);
}
