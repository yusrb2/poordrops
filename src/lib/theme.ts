import { signal } from '@preact/signals';

export type ThemeMode = 'light' | 'dark';

const THEME_KEY = 'poordrops_theme';

function loadInitialTheme(): ThemeMode {
  try {
    const saved = localStorage.getItem(THEME_KEY);
    if (saved === 'dark' || saved === 'light') return saved;
  } catch {
    // ignore
  }
  return 'light';
}

export const theme = signal<ThemeMode>(loadInitialTheme());

export function applyTheme(next: ThemeMode) {
  theme.value = next;
  if (typeof document !== 'undefined') {
    document.documentElement.classList.toggle('dark', next === 'dark');
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) {
      meta.setAttribute('content', next === 'dark' ? '#171513' : '#F5EFE6');
    }
  }
  try {
    localStorage.setItem(THEME_KEY, next);
  } catch {
    // ignore
  }
}

export function toggleTheme() {
  applyTheme(theme.value === 'light' ? 'dark' : 'light');
}
