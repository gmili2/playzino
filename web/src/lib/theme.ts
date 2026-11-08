/** Choix du design : « classique » (bleu nuit, par défaut) ou « violet » (soirée violette). Mémorisé sur l'appareil. */
import { useEffect, useState } from 'react';

export type Theme = 'classic' | 'violet';
const KEY = 'pz-theme';

export function storedTheme(): Theme {
  try { return localStorage.getItem(KEY) === 'violet' ? 'violet' : 'classic'; } catch { return 'classic'; }
}

export function applyTheme(t: Theme) {
  if (t === 'violet') document.documentElement.dataset.theme = 'violet';
  else delete document.documentElement.dataset.theme;
}

export function useTheme() {
  const [theme, setTheme] = useState<Theme>(storedTheme);
  useEffect(() => {
    applyTheme(theme);
    try { localStorage.setItem(KEY, theme); } catch { /* navigation privée : le choix vaut pour la session */ }
  }, [theme]);
  return { theme, toggle: () => setTheme((t) => (t === 'violet' ? 'classic' : 'violet')) };
}
