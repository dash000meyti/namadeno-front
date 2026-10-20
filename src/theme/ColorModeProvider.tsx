'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { ThemeProvider } from '@mui/material/styles';
import CssBaseline from '@mui/material/CssBaseline';
import { createNamadnoTheme } from './theme';

type Mode = 'light' | 'dark';
const STORAGE_KEY = 'nm-theme-dark';

interface ColorModeCtx { mode: Mode; toggle: () => void; setMode: (m: Mode) => void }
const Ctx = createContext<ColorModeCtx>({ mode: 'light', toggle: () => {}, setMode: () => {} });

/** Reads/stores the theme choice and mirrors it on <html class="th-light|th-dark">. */
export function ColorModeProvider({ children }: { children: React.ReactNode }) {
  const [mode, setModeState] = useState<Mode>('light');

  useEffect(() => {
    try { if (localStorage.getItem(STORAGE_KEY) === '1') setModeState('dark'); } catch { /* storage unavailable */ }
  }, []);

  useEffect(() => {
    const el = document.documentElement;
    el.classList.toggle('th-dark', mode === 'dark');
    el.classList.toggle('th-light', mode !== 'dark');
    try { localStorage.setItem(STORAGE_KEY, mode === 'dark' ? '1' : '0'); } catch { /* ignore */ }
  }, [mode]);

  const setMode = useCallback((m: Mode) => setModeState(m), []);
  const toggle = useCallback(() => setModeState((m) => (m === 'dark' ? 'light' : 'dark')), []);
  const theme = useMemo(() => createNamadnoTheme(mode), [mode]);
  const value = useMemo(() => ({ mode, toggle, setMode }), [mode, toggle, setMode]);

  return (
    <Ctx.Provider value={value}>
      <ThemeProvider theme={theme}>
        <CssBaseline enableColorScheme />
        {children}
      </ThemeProvider>
    </Ctx.Provider>
  );
}

export const useColorMode = () => useContext(Ctx);

/** Inline script for <head>: applies the stored theme before first paint (no flash). */
export const colorModeScript = `(function(){try{var d=localStorage.getItem('${STORAGE_KEY}')==='1';var c=document.documentElement.classList;c.add(d?'th-dark':'th-light');c.remove(d?'th-light':'th-dark');}catch(e){document.documentElement.classList.add('th-light');}})();`;
