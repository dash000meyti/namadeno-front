'use client';
/**
 * Panel toast in the design's style (`.glass.toast`, bottom-left of the panel).
 * `flashToast()` stores a message that the next screen shows on mount (used after navigation).
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { Icon } from '@/components/ui/Icon';

type Tone = 'success' | 'error' | 'info';
const KEY = 'nm-org-flash';

export function flashToast(msg: string, t: Tone = 'success') {
  try { sessionStorage.setItem(KEY, JSON.stringify({ msg, t })); } catch { /* storage unavailable */ }
}

export function usePanelToast() {
  const [toast, setToast] = useState<{ msg: string; t: Tone; id: number } | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const show = useCallback((msg: string, t: Tone = 'success') => {
    if (timer.current) clearTimeout(timer.current);
    setToast({ msg, t, id: Date.now() });
    timer.current = setTimeout(() => setToast(null), t === 'error' ? 6000 : 4500);
  }, []);
  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(KEY);
      if (raw) { sessionStorage.removeItem(KEY); const v = JSON.parse(raw) as { msg: string; t: Tone }; show(v.msg, v.t); }
    } catch { /* ignore */ }
    return () => { if (timer.current) clearTimeout(timer.current); };
  }, [show]);
  const close = () => setToast(null);
  const bg = toast?.t === 'error' ? 'var(--soft-error)' : toast?.t === 'info' ? 'var(--soft-info)' : 'var(--soft-success)';
  const fg = toast?.t === 'error' ? 'var(--error-text)' : toast?.t === 'info' ? 'var(--info-text)' : 'var(--success-text)';
  const d = toast?.t === 'error' ? 'M12 3l10 18H2zM12 10v5M12 18h.01' : toast?.t === 'info' ? 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18M12 11v5M12 8h.01' : 'M5 12.5l4.5 4.5L19 7';
  const node = toast ? (
    <div key={toast.id} className="glass toast" role={toast.t === 'error' ? 'alert' : 'status'} style={{ position: 'fixed', background: 'var(--bg-paper)', boxShadow: 'var(--shadow-dropdown)', animation: 'nmUp .25s ease-out', maxWidth: 'calc(100vw - 48px)' }}>
      <span style={{ width: 32, height: 32, borderRadius: 8, background: bg, color: fg, display: 'grid', placeItems: 'center', flex: 'none' }}><Icon d={d} size={18} /></span>
      <span style={{ flex: 1, fontWeight: 500, lineHeight: 1.5 }}>{toast.msg}</span>
      <button className="ibtn" aria-label="بستن پیام" onClick={close} style={{ width: 28, height: 28 }}><Icon d="M6 6l12 12M18 6L6 18" size={16} /></button>
    </div>
  ) : null;
  return { show, node };
}
