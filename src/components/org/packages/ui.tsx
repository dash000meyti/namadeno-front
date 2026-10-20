'use client';
/** Small building blocks shared by the org «packages / reports / contract» screens (markup copied from the designs). */
import { useCallback, useEffect, useRef, useState } from 'react';
import { Icon } from '@/components/ui/Icon';
import { useOrgMe } from '@/api/org';
import { routes } from '@/lib/routes';
import { faDigits } from '@/lib/format';
import type { LockPolicy } from '@/types/domain';
import { I, lockChip, soft, type Tone } from './meta';

/** First breadcrumb («هلدینگ آرمان») from the signed-in organization. */
export function useOrgCrumb() {
  const { data } = useOrgMe();
  return { label: data?.organization.name ?? 'هلدینگ آرمان', href: routes.org.dashboard };
}

export function LockChip({ type, long, style }: { type: LockPolicy['type']; long?: boolean; style?: React.CSSProperties }) {
  const c = lockChip(type, long);
  return (
    <span className="lktype" style={{ background: c.bg, color: c.fg, ...style }}>
      <Icon d={c.d} size={12} />{c.label}
    </span>
  );
}

export function Lbl({ tone, children, style }: { tone: Tone; children: React.ReactNode; style?: React.CSSProperties }) {
  const t = soft(tone);
  return <span className="lbl" style={{ height: 22, padding: '0 7px', fontSize: 11, background: t.bg, color: t.fg, ...style }}>{children}</span>;
}

/** Design `.toast` (bottom-left glass toast inside the panel). */
export function useFlash() {
  const [msg, setMsg] = useState<{ text: string; tone: 'success' | 'error' } | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const flash = useCallback((text: string, tone: 'success' | 'error' = 'success') => {
    if (timer.current) clearTimeout(timer.current);
    setMsg({ text, tone });
    timer.current = setTimeout(() => setMsg(null), 4000);
  }, []);
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);
  const node = msg ? (
    <div className="glass toast" role="status" aria-live="polite">
      <span style={{ width: 32, height: 32, borderRadius: 8, background: msg.tone === 'error' ? 'var(--soft-error)' : 'var(--soft-success)', color: msg.tone === 'error' ? 'var(--error-text)' : 'var(--success-text)', display: 'grid', placeItems: 'center', flex: 'none' }}>
        <Icon d={msg.tone === 'error' ? I.warn : I.check} size={18} />
      </span>
      <span style={{ flex: 1, fontWeight: 500, lineHeight: 1.6 }}>{msg.text}</span>
      <button className="ibtn" aria-label="بستن" onClick={() => setMsg(null)} style={{ width: 28, height: 28 }}><Icon d={I.x} size={16} /></button>
    </div>
  ) : null;
  return { flash, toast: node };
}

/** Status tabs with count badges (design: table card header). */
export function CountTabs<K extends string>({ items, value, onChange }: { items: { key: K; label: string; tone: Tone; count: number }[]; value: K; onChange: (k: K) => void }) {
  return (
    <>
      {items.map((tb) => {
        const on = value === tb.key;
        return (
          <button key={tb.key} onClick={() => onChange(tb.key)} aria-pressed={on} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, height: 34, padding: '0 10px', borderRadius: 8, border: 0, background: on ? 'var(--action-selected)' : 'transparent', color: on ? 'var(--text-primary)' : 'var(--text-secondary)', fontFamily: 'inherit', fontSize: 13, fontWeight: on ? 700 : 500, cursor: 'pointer', whiteSpace: 'nowrap' }}>
            {tb.label}
            <span className="lbl" style={{ height: 20, padding: '0 6px', fontSize: 11, background: on ? 'var(--contained-default)' : `var(--soft-${tb.tone})`, color: on ? 'var(--contained-default-text)' : `var(--${tb.tone}-text)` }}>{faDigits(tb.count)}</span>
          </button>
        );
      })}
    </>
  );
}

export function SearchBox({ value, onChange, placeholder, label, width = 150, height = 36, iconSize = 16 }: { value: string; onChange: (v: string) => void; placeholder: string; label: string; width?: number; height?: number; iconSize?: number }) {
  return (
    <label style={{ marginRight: 'auto', display: 'flex', alignItems: 'center', gap: 8, height, width, flex: 'none', boxSizing: 'border-box', padding: '0 10px', borderRadius: 8, border: '1px solid var(--outline-border)', background: 'var(--card-bg)', color: 'var(--text-secondary)' }}>
      <Icon d={I.search} size={iconSize} />
      <input type="search" value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} aria-label={label} style={{ flex: 1, minWidth: 0, border: 0, outline: 0, background: 'transparent', fontFamily: 'inherit', fontSize: 13, color: 'var(--text-primary)' }} />
    </label>
  );
}

/** Footer «۱–۸ از ۳۸۴» with prev/next. */
export function Pager({ page, pageSize, total, onPage }: { page: number; pageSize: number; total: number; onPage: (p: number) => void }) {
  const from = total ? page * pageSize + 1 : 0;
  const to = Math.min(total, (page + 1) * pageSize);
  const last = Math.max(0, Math.ceil(total / pageSize) - 1);
  return (
    <div style={{ height: 44, flex: 'none', boxSizing: 'border-box', padding: '0 12px', display: 'flex', alignItems: 'center', gap: 8, borderTop: '1px solid var(--divider)', fontSize: 12, color: 'var(--text-secondary)' }}>
      <span className="num" style={{ fontWeight: 400, whiteSpace: 'nowrap' }}>{faDigits(from)}–{faDigits(to)} از {faDigits(total)}</span>
      <button className="ibtn" aria-label="صفحه قبل" disabled={page <= 0} onClick={() => onPage(page - 1)} style={{ marginRight: 'auto', width: 32, height: 32, opacity: page <= 0 ? 0.4 : 1, cursor: page <= 0 ? 'default' : 'pointer' }}><Icon d={I.chevR} size={18} /></button>
      <button className="ibtn" aria-label="صفحه بعد" disabled={page >= last} onClick={() => onPage(page + 1)} style={{ width: 32, height: 32, color: page >= last ? undefined : 'var(--text-primary)', opacity: page >= last ? 0.4 : 1, cursor: page >= last ? 'default' : 'pointer' }}><Icon d={I.chevL} size={18} /></button>
    </div>
  );
}

/** Design `.sw` switch. */
export function Switch({ on, onToggle, label, locked, disabled }: { on: boolean; onToggle: () => void; label: string; locked?: boolean; disabled?: boolean }) {
  return (
    <button className="sw" dir="ltr" role="switch" aria-checked={on} aria-label={label} onClick={onToggle} disabled={disabled}
      style={{ background: on ? (locked ? 'var(--primary-light)' : 'var(--primary-main)') : 'var(--grey-400)', opacity: disabled ? 0.5 : 1, cursor: disabled ? 'not-allowed' : 'pointer' }}>
      <span style={{ left: on ? 19 : 3 }} />
    </button>
  );
}

/** Checkbox glyph (design `.chk`), optionally indeterminate. */
export function Chk({ on, some }: { on: boolean; some?: boolean }) {
  return (
    <span className={'chk' + (on ? ' on' : '')}>
      {on && <Icon d={I.check} size={12} strokeWidth={3} />}
      {!on && some && <span style={{ width: 8, height: 2, background: 'var(--primary-main)' }} />}
    </span>
  );
}

/** KPI card (design `kpi()`); `compact` = detail page variant with the delta under the value. */
export function Kpi({ title, value, unit, d, tone, delta, dtone, compact }: { title: string; value: string; unit: string; d: string; tone: Tone; delta: string; dtone: Tone; compact?: boolean }) {
  const t = soft(tone);
  const dt = soft(dtone);
  if (compact) {
    return (
      <div className="card" style={{ boxSizing: 'border-box', padding: '10px 14px', display: 'flex', alignItems: 'center', gap: 10, minWidth: 0, minHeight: 92 }}>
        <span style={{ width: 40, height: 40, borderRadius: 10, background: t.bg, color: t.fg, display: 'grid', placeItems: 'center', flex: 'none' }}><Icon d={d} size={20} /></span>
        <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 3 }}>
          <span className="cell" style={{ fontSize: 12, lineHeight: 1.3, color: 'var(--text-secondary)', fontWeight: 600 }}>{title}</span>
          <span style={{ display: 'flex', alignItems: 'baseline', gap: 5, whiteSpace: 'nowrap' }}><span className="num" style={{ fontSize: 22, lineHeight: 1.1 }}>{value}</span><span className="cell" style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{unit}</span></span>
          <span className="lbl" style={{ height: 18, padding: '0 6px', fontSize: 11, background: dt.bg, color: dt.fg, alignSelf: 'flex-start' }}>{delta}</span>
        </div>
      </div>
    );
  }
  return (
    <div className="card" style={{ boxSizing: 'border-box', padding: '12px 18px', display: 'flex', alignItems: 'center', gap: 12, minWidth: 0, minHeight: 84 }}>
      <span style={{ width: 40, height: 40, borderRadius: 10, background: t.bg, color: t.fg, display: 'grid', placeItems: 'center', flex: 'none' }}><Icon d={d} size={20} /></span>
      <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 4 }}>
        <span style={{ fontSize: 12, lineHeight: 1.3, color: 'var(--text-secondary)', fontWeight: 600, whiteSpace: 'nowrap' }}>{title}</span>
        <span style={{ display: 'flex', alignItems: 'baseline', gap: 5, whiteSpace: 'nowrap', minWidth: 0 }}><span className="num" style={{ fontSize: 22, lineHeight: 1.1 }}>{value}</span><span className="cell" style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{unit}</span></span>
      </div>
      <span className="lbl" style={{ height: 20, padding: '0 6px', background: dt.bg, color: dt.fg, alignSelf: 'flex-start' }}>{delta}</span>
    </div>
  );
}

/** Dimmed modal using the design's `.dim` + `.dlg` classes. */
export function Dialog({ title, onClose, children, width }: { title: string; onClose: () => void; children: React.ReactNode; width?: number }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div className="dim" onClick={onClose}>
      <div className="glass dlg" role="dialog" aria-modal="true" aria-label={title} onClick={(e) => e.stopPropagation()} style={{ background: 'var(--bg-paper)', width: width ?? 480, maxWidth: 'calc(100vw - 32px)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <h6 style={{ margin: 0, fontSize: 18, fontWeight: 700, lineHeight: 1.4 }}>{title}</h6>
          <button className="ibtn" aria-label="بستن" onClick={onClose} style={{ marginRight: 'auto', width: 32, height: 32 }}><Icon d={I.x} size={18} /></button>
        </div>
        {children}
      </div>
    </div>
  );
}

/** Inline error/notice box (soft tone). */
export function Notice({ tone, d, children, style }: { tone: Tone; d?: string; children: React.ReactNode; style?: React.CSSProperties }) {
  const t = soft(tone);
  return (
    <div role={tone === 'error' ? 'alert' : undefined} style={{ display: 'flex', alignItems: 'flex-start', gap: 10, boxSizing: 'border-box', padding: '10px 12px', borderRadius: 10, background: t.bg, color: t.fg, fontSize: 12, lineHeight: 1.6, ...style }}>
      <Icon d={d ?? I.info} size={18} style={{ marginTop: 1, flex: 'none' }} />
      <span style={{ flex: 1, minWidth: 0 }}>{children}</span>
    </div>
  );
}

/** Loading placeholder for panel cards. */
export function CardSkeleton({ h = 120, style }: { h?: number; style?: React.CSSProperties }) {
  return <div aria-hidden="true" className="card" style={{ height: h, opacity: 0.55, ...style }} />;
}

/** Error card with retry. */
export function CardError({ message, onRetry }: { message?: string; onRetry?: () => void }) {
  return (
    <div role="alert" className="card" style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 12, alignItems: 'center', textAlign: 'center' }}>
      <span style={{ fontSize: 14, color: 'var(--text-secondary)' }}>{message ?? 'خطا در دریافت اطلاعات'}</span>
      {onRetry && <button className="btn" onClick={onRetry} style={{ background: 'var(--soft-primary)', color: 'var(--primary-text)' }}>تلاش دوباره</button>}
    </div>
  );
}

/** Message of an API error (ApiRequestError or generic). */
export const errMsg = (e: unknown, fallback = 'خطا در ارتباط با سرور') => (e && typeof e === 'object' && 'message' in e && typeof (e as { message: unknown }).message === 'string' ? (e as { message: string }).message : fallback);
