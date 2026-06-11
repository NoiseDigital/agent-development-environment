'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';

// Theme state lives here — provided once at the root layout so a user's choice
// (and the resolved light/dark) survives every page navigation.
//
// Model: the *preference* is what the user picked — 'light', 'dark', or
// 'system' (follow the OS). The *resolved* theme is the concrete 'light' |
// 'dark' actually applied to <html>. On first visit there is no saved
// preference, so we follow the OS; once the user toggles, we persist their
// explicit choice and stop following the OS until they clear it.
//
// The class on <html> is set BEFORE React hydrates by the inline script in
// layout.tsx (no flash of the wrong theme). This provider keeps that class in
// sync afterwards and re-resolves when the OS theme changes while on 'system'.

export type ThemePreference = 'light' | 'dark' | 'system';
export type ResolvedTheme = 'light' | 'dark';

const STORAGE_KEY = 'theme';

interface ThemeState {
  /** What the user picked ('system' until they toggle). */
  preference: ThemePreference;
  /** The concrete theme on <html> right now. */
  theme: ResolvedTheme;
  /** Set an explicit preference (persists; 'system' clears the override). */
  setPreference: (preference: ThemePreference) => void;
  /** Flip light↔dark as an explicit choice — what the toggle button calls. */
  toggle: () => void;
}

const ThemeContext = createContext<ThemeState | null>(null);

function systemTheme(): ResolvedTheme {
  if (typeof window === 'undefined') return 'dark';
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

function readPreference(): ThemePreference {
  if (typeof window === 'undefined') return 'system';
  const saved = window.localStorage.getItem(STORAGE_KEY);
  return saved === 'light' || saved === 'dark' ? saved : 'system';
}

function applyClass(theme: ResolvedTheme) {
  const root = document.documentElement;
  root.classList.toggle('dark', theme === 'dark');
  root.classList.toggle('light', theme === 'light');
  root.style.colorScheme = theme;
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  // Start from a deterministic value for SSR; the real value is read from
  // storage/OS in the effect below before paint settles. The inline script has
  // already set the correct class, so there's no visible flash regardless.
  const [preference, setPreferenceState] = useState<ThemePreference>('system');
  const [systemResolved, setSystemResolved] = useState<ResolvedTheme>('dark');

  // Hydrate from storage + OS once mounted.
  useEffect(() => {
    setPreferenceState(readPreference());
    setSystemResolved(systemTheme());
  }, []);

  // Track OS changes — only matters while following 'system'.
  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = (e: MediaQueryListEvent) => setSystemResolved(e.matches ? 'dark' : 'light');
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);

  const theme: ResolvedTheme = preference === 'system' ? systemResolved : preference;

  // Keep <html> in sync whenever the resolved theme changes.
  useEffect(() => {
    applyClass(theme);
  }, [theme]);

  const setPreference = useCallback((next: ThemePreference) => {
    setPreferenceState(next);
    if (next === 'system') window.localStorage.removeItem(STORAGE_KEY);
    else window.localStorage.setItem(STORAGE_KEY, next);
  }, []);

  const toggle = useCallback(() => {
    setPreference(theme === 'dark' ? 'light' : 'dark');
  }, [theme, setPreference]);

  const value = useMemo<ThemeState>(
    () => ({ preference, theme, setPreference, toggle }),
    [preference, theme, setPreference, toggle],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

/** Read + control the active theme. Must be used under a ThemeProvider. */
export function useTheme(): ThemeState {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used within a ThemeProvider');
  return ctx;
}
