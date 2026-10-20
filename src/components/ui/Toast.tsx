'use client';
/** Lightweight toast in the design system's style. useToast()('پیام') */
import { createContext, useCallback, useContext, useRef, useState } from 'react';
import { Icon } from './Icon';

type Tone = 'success' | 'error' | 'info';
const Ctx = createContext<(msg: string, tone?: Tone) => void>(() => {});

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toast, setToast] = useState<{ msg: string; tone: Tone; id: number } | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const show = useCallback((msg: string, tone: Tone = 'success') => {
    if (timer.current) clearTimeout(timer.current);
    setToast({ msg, tone, id: Date.now() });
    timer.current = setTimeout(() => setToast(null), 3200);
  }, []);
  const color = toast?.tone === 'error' ? 'var(--error-main)' : toast?.tone === 'info' ? 'var(--info-main)' : 'var(--success-main)';
  return (
    <Ctx.Provider value={show}>
      {children}
      {toast && (
        <div
          key={toast.id}
          role="status"
          aria-live="polite"
          className="glass"
          style={{
            position: 'fixed', left: '50%', bottom: 104, transform: 'translateX(-50%)', zIndex: 2000, maxWidth: 'min(420px, calc(100vw - 32px))',
            borderRadius: 12, padding: '10px 14px', display: 'flex', alignItems: 'center', gap: 10, fontSize: 13, fontWeight: 500,
            color: 'var(--text-primary)', animation: 'nmUp .25s ease-out', boxShadow: 'var(--shadow-dropdown)',
          }}
        >
          <span style={{ width: 24, height: 24, borderRadius: '50%', background: color, color: '#FFFFFF', display: 'grid', placeItems: 'center', flex: 'none' }}>
            <Icon name={toast.tone === 'error' ? 'close' : toast.tone === 'info' ? 'info' : 'check'} size={14} strokeWidth={2.2} />
          </span>
          <span style={{ lineHeight: 1.6 }}>{toast.msg}</span>
        </div>
      )}
    </Ctx.Provider>
  );
}

export const useToast = () => useContext(Ctx);
