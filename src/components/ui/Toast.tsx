'use client';
/**
 * The one toast for the whole product: useToast()('پیام', 'success' | 'error' | 'info').
 * App: bottom center above the tab bar. Panels: bottom-left (src/styles/panel.css moves it).
 * Panel helpers (usePanelToast, useFlash) are thin wrappers around this.
 */
import { createContext, useCallback, useContext, useRef, useState } from 'react';
import { Icon } from './Icon';

type Tone = 'success' | 'error' | 'info';
const Ctx = createContext<(msg: string, tone?: Tone) => void>(() => {});

const D = {
  success: 'M5 12.5l4.5 4.5L19 7',
  error: 'M12 3l10 18H2zM12 10v5M12 18h.01',
  info: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18M12 11v5M12 8h.01',
};

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toast, setToast] = useState<{ msg: string; tone: Tone; id: number } | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const show = useCallback((msg: string, tone: Tone = 'success') => {
    if (timer.current) clearTimeout(timer.current);
    setToast({ msg, tone, id: Date.now() });
    timer.current = setTimeout(() => setToast(null), tone === 'error' ? 6000 : 4000);
  }, []);
  const close = () => { if (timer.current) clearTimeout(timer.current); setToast(null); };
  const t = toast?.tone ?? 'success';
  return (
    <Ctx.Provider value={show}>
      {children}
      {toast && (
        <div
          key={toast.id}
          role={t === 'error' ? 'alert' : 'status'}
          aria-live={t === 'error' ? 'assertive' : 'polite'}
          className="nm-toast"
          style={{
            position: 'fixed', left: '50%', bottom: 104, transform: 'translateX(-50%)', zIndex: 2000, width: 'max-content', maxWidth: 'min(440px, calc(100vw - 32px))',
            boxSizing: 'border-box', borderRadius: 16, padding: '8px 8px 8px 14px', display: 'flex', alignItems: 'center', gap: 10, fontSize: 13, fontWeight: 500,
            color: 'var(--text-primary)', background: 'var(--glass-bg)', WebkitBackdropFilter: 'blur(24px) saturate(180%)', backdropFilter: 'blur(24px) saturate(180%)',
            boxShadow: '0 0 0 .5px rgb(0 0 0 / .1), 0 18px 48px -14px rgb(0 0 0 / .35)', animation: 'nmUp .25s ease-out',
          }}
        >
          <span style={{ width: 30, height: 30, borderRadius: 9, background: `var(--soft-${t})`, color: `var(--${t}-text)`, display: 'grid', placeItems: 'center', flex: 'none' }}>
            <Icon d={D[t]} size={17} strokeWidth={1.9} />
          </span>
          <span style={{ flex: 1, lineHeight: 1.6 }}>{toast.msg}</span>
          <button type="button" onClick={close} aria-label="بستن پیام" style={{ width: 28, height: 28, border: 0, borderRadius: '50%', background: 'transparent', color: 'var(--text-secondary)', display: 'grid', placeItems: 'center', cursor: 'pointer', flex: 'none', padding: 0 }}>
            <Icon name="close" size={15} />
          </button>
        </div>
      )}
    </Ctx.Provider>
  );
}

export const useToast = () => useContext(Ctx);
