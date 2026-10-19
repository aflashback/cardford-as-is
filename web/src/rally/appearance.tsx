import { createContext, useCallback, useContext, useEffect, useLayoutEffect, useState, type ReactNode } from 'react';
import { Moon, Sun, Sunset } from 'lucide-react';

export type RallyTheme = 'light' | 'dark' | 'warm';
const storageKey = 'cardford-rally-appearance';
const validTheme = (value: unknown): value is RallyTheme => value === 'light' || value === 'dark' || value === 'warm';

function initialTheme(): RallyTheme {
  try {
    const value = window.localStorage.getItem(storageKey);
    return validTheme(value) ? value : 'light';
  } catch { return 'light'; }
}

type Appearance = { theme: RallyTheme; setTheme: (theme: RallyTheme) => void };
const AppearanceContext = createContext<Appearance | null>(null);

/** Appearance is device-local. It is not part of the server preferences contract. */
export function AppearanceProvider({ children }: { children: ReactNode }) {
  const [theme, updateTheme] = useState<RallyTheme>(initialTheme);
  const setTheme = useCallback((next: RallyTheme) => {
    if (!validTheme(next)) return;
    updateTheme(next);
    try { window.localStorage.setItem(storageKey, next); } catch { /* Apply for this visit when storage is unavailable. */ }
  }, []);
  useLayoutEffect(() => { document.documentElement.dataset.theme = theme; }, [theme]);
  useEffect(() => {
    const changed = (event: StorageEvent) => {
      if (event.key !== storageKey && event.key !== null) return;
      try { if (event.storageArea && event.storageArea !== window.localStorage) return; } catch { return; }
      updateTheme(validTheme(event.newValue) ? event.newValue : 'light');
    };
    window.addEventListener('storage', changed);
    return () => window.removeEventListener('storage', changed);
  }, []);
  return <AppearanceContext.Provider value={{ theme, setTheme }}>{children}</AppearanceContext.Provider>;
}

export function useAppearance(): Appearance {
  const value = useContext(AppearanceContext);
  if (!value) throw new Error('useAppearance requires AppearanceProvider');
  return value;
}

export function ThemePicker({ className = '', label = 'Appearance' }: { className?: string; label?: string }) {
  const { theme, setTheme } = useAppearance();
  return <div className={`rally-theme-picker ${className}`} role="group" aria-label={label}>
    {([
      { value: 'light', label: 'Light', Icon: Sun },
      { value: 'dark', label: 'Dark', Icon: Moon },
      { value: 'warm', label: 'Warm', Icon: Sunset },
    ] as const).map(({ value, label: text, Icon }) => <button key={value} type="button"
      aria-pressed={theme === value} onClick={() => setTheme(value)}>
      <Icon size={18} aria-hidden="true" /><span>{text}</span>
    </button>)}
  </div>;
}
