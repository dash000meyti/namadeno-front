'use client';
/** Small UI pieces shared by the operator console system pages (design: op-*.dc.html). */
import { useEffect, useRef, useState } from 'react';

/** Measures an element's content width (for SVG charts that must keep text unscaled). */
export function useWidth<T extends HTMLElement>(fallback: number) {
  const ref = useRef<T | null>(null);
  const [w, setW] = useState(fallback);
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver((entries) => {
      const cw = Math.floor(entries[0]?.contentRect.width ?? 0);
      if (cw > 0) setW(cw);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, w] as const;
}
import { Icon } from '@/components/ui/Icon';
import { enDigits, faDigits, money } from '@/lib/format';

export const TONES = {
  primary: ['var(--soft-primary)', 'var(--primary-text)'],
  info: ['var(--soft-info)', 'var(--info-text)'],
  success: ['var(--soft-success)', 'var(--success-text)'],
  warning: ['var(--soft-warning)', 'var(--warning-text)'],
  error: ['var(--soft-error)', 'var(--error-text)'],
  default: ['var(--soft-default)', 'var(--default-text)'],
  secondary: ['var(--soft-secondary)', 'var(--secondary-text)'],
} as const;
export type ToneKey = keyof typeof TONES;
/** Rotating avatar/tile tones used by tables in the design. */
export const TILE_TONES: ToneKey[] = ['primary', 'info', 'success', 'warning', 'default', 'error'];

export const IC = {
  check: 'M5 12.5l4.5 4.5L19 7',
  x: 'M6 6l12 12M18 6L6 18',
  pen: 'M4 20h4l10-10-4-4L4 16zM13 7l4 4',
  pause: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18M10 9v6M14 9v6',
  play: 'M5 3l14 9-14 9z',
  refresh: 'M20 12a8 8 0 1 1-2.3-5.6M20 4v5h-5',
  plus: 'M12 5v14M5 12h14',
  info: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18M12 11v5M12 8h.01',
  lock: 'M7 11V8a5 5 0 0 1 10 0v3M5 11h14v10H5zM12 15v2',
  chevL: 'M14 6l-6 6 6 6',
  back: 'M10 6l6 6-6 6',
  chev: 'M7 10l5 5 5-5',
  download: 'M12 4v11M7 10l5 5 5-5M4 20h16',
  excel: 'M6 3h8l5 5v13H6zM14 3v5h5M9 12l6 6M15 12l-6 6',
  file: 'M6 3h8l5 5v13H6zM14 3v5h5M9 13h6M9 17h6',
  clock: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18M12 7v5l3 2',
  search: 'M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14M20 20l-4-4',
  inbox: 'M3 13l2.5-7h13L21 13v5a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2zM3 13h5l1.5 2.5h5L16 13h5',
  funds: 'M12 8c4.4 0 8-1.3 8-3s-3.6-3-8-3-8 1.3-8 3 3.6 3 8 3M4 5v14c0 1.7 3.6 3 8 3s8-1.3 8-3V5M4 12c0 1.7 3.6 3 8 3s8-1.3 8-3',
  card: 'M3 7a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2zM3 10h18M7 15h4',
  rules: 'M4 7h9M17 7h3M4 12h3M11 12h9M4 17h11M19 17h1M15 5v4M9 10v4M17 15v4',
  risk: 'M12 3l8 3v6c0 4.5-3.4 8.3-8 9.5C7.4 20.3 4 16.5 4 12V6zM12 9v4M12 16.5h.01',
  reports: 'M4 20h16M7 16V10M12 16V5M17 16v-3',
  settings: 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3M5.3 5.3l2.1 2.1M16.6 16.6l2.1 2.1M5.3 18.7l2.1-2.1M16.6 7.4l2.1-2.1',
  users: 'M16 19v-1.5a3.5 3.5 0 0 0-3.5-3.5h-5A3.5 3.5 0 0 0 4 17.5V19M10 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7M20 19v-1.5a3.5 3.5 0 0 0-2.5-3.35M15 4.2a3.5 3.5 0 0 1 0 6.6',
  user: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8M4 20v-1a5 5 0 0 1 5-5h6a5 5 0 0 1 5 5v1',
  building: 'M5 21V4a1 1 0 0 1 1-1h8a1 1 0 0 1 1 1v17M15 9h3a1 1 0 0 1 1 1v11M3 21h18M9 7h2M9 11h2M9 15h2',
  gold: 'M4 17l2-6h5l1 6zM12 17l1-6h5l2 6zM8 11l2-6h4l2 6',
  bond: 'M4 19l5-6 4 3 7-9M4 5v14h16',
  energy: 'M13 3L5 14h6l-1 7 8-11h-6z',
  percent: 'M19 5L5 19M7.5 9a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3M16.5 18a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3',
  bag: 'M6 8h12l1 13H5zM9 8V6a3 3 0 0 1 6 0v2',
  wallet: 'M3 7a2 2 0 0 1 2-2h13a1 1 0 0 1 1 1v2M3 7v11a2 2 0 0 0 2 2h15a1 1 0 0 0 1-1v-9a1 1 0 0 0-1-1H5a2 2 0 0 1-2-2M16 14h.01',
  id: 'M3 6a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2zM8 13a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5M4.5 18c.6-1.8 2-3 3.5-3s2.9 1.2 3.5 3M14 9h5M14 13h5',
  shield: 'M12 3l8 3v6c0 4.5-3.4 8.3-8 9.5C7.4 20.3 4 16.5 4 12V6zM9 12l2 2 4-4',
  alert: 'M12 3l9 16H3zM12 10v4M12 17.5h.01',
  ban: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18M5.5 5.5l13 13',
  mail: 'M3 6h18v12H3zM3 7l9 6 9-6',
  bell: 'M6 16V11a6 6 0 0 1 12 0v5l1.5 2h-15zM10 21h4',
  code: 'M8 8l-4 4 4 4M16 8l4 4-4 4M14 5l-4 14',
  calendar: 'M4 6h16v14H4zM4 10h16M8 3v4M16 3v4',
  key: 'M14 10a4 4 0 1 0-3.9 3.1L4 19v1h3l1-1v-2h2l1-1 .5-.5a4 4 0 0 0 2.5.5M15.5 8.5h.01',
  flag: 'M5 21V4M5 4h11l-2 4 2 4H5',
  trend: 'M4 17l5-6 4 3 7-9M15 5h5v5',
};

/** `.lbl` chip with a tone. */
export function Lbl({ tone = 'default', children, style, dir }: { tone?: ToneKey; children: React.ReactNode; style?: React.CSSProperties; dir?: string }) {
  const [bg, fg] = TONES[tone];
  return <span className="lbl" dir={dir} style={{ background: bg, color: fg, ...style }}>{children}</span>;
}

/** Design switch (`.sw`): knob at left when on (RTL). */
export function Sw({ on, onClick, label, disabled }: { on: boolean; onClick: () => void; label: string; disabled?: boolean }) {
  return (
    <button type="button" className="sw" aria-pressed={on} aria-label={label} disabled={disabled} onClick={onClick} style={{ background: on ? 'var(--primary-main)' : 'var(--grey-400)', opacity: disabled ? 0.6 : 1, cursor: disabled ? 'not-allowed' : 'pointer' }}>
      <span style={{ left: on ? 3 : 19 }} />
    </button>
  );
}

/** Toggle / choice chip (outline → soft primary when on). */
export function Chip({ on, onClick, children, style, dir, label }: { on: boolean; onClick: () => void; children: React.ReactNode; style?: React.CSSProperties; dir?: string; label?: string }) {
  return (
    <button type="button" dir={dir} aria-pressed={on} aria-label={label} onClick={onClick} style={{ height: 28, minWidth: 36, padding: '0 10px', borderRadius: 8, border: `1px solid ${on ? 'var(--primary-main)' : 'var(--outline-border)'}`, background: on ? 'var(--soft-primary)' : 'transparent', color: on ? 'var(--primary-text)' : 'var(--text-secondary)', fontFamily: 'inherit', fontSize: 12, fontWeight: 700, fontVariantNumeric: 'tabular-nums', cursor: 'pointer', whiteSpace: 'nowrap', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 4, ...style }}>
      {children}
    </button>
  );
}

/** Segmented control (rounded track, raised active item). */
export function Seg<K extends string | number>({ items, value, onChange, track = 'var(--action-hover)', label }: { items: { key: K; label: React.ReactNode }[]; value: K; onChange: (k: K) => void; track?: string; label?: string }) {
  return (
    <div role="tablist" aria-label={label} style={{ display: 'inline-flex', alignItems: 'center', gap: 2, height: 36, padding: 3, boxSizing: 'border-box', borderRadius: 10, background: track, flex: 'none' }}>
      {items.map((it) => {
        const on = it.key === value;
        return (
          <button key={String(it.key)} type="button" role="tab" aria-selected={on} onClick={() => onChange(it.key)} style={{ height: 30, padding: '0 12px', border: 0, borderRadius: 8, background: on ? 'var(--bg-paper)' : 'transparent', boxShadow: on ? 'var(--shadow-z1)' : 'none', color: on ? 'var(--text-primary)' : 'var(--text-secondary)', fontFamily: 'inherit', fontSize: 13, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap', display: 'inline-flex', alignItems: 'center', gap: 6, fontVariantNumeric: 'tabular-nums' }}>
            {it.label}
          </button>
        );
      })}
    </div>
  );
}

/** Numeric input in the design's `.fld` box with a suffix. Shows Persian digits; parses Persian/Latin input. */
export function NumField({ value, onChange, w = 56, h = 32, suffix, label, id, decimals = false, invalid, disabled }: {
  value: number; onChange: (n: number) => void; w?: number; h?: number; suffix?: string; label?: string; id?: string; decimals?: boolean; invalid?: boolean; disabled?: boolean;
}) {
  const [text, setText] = useState<string | null>(null);
  const shown = text ?? (Number.isFinite(value) ? (decimals ? faDigits(String(value), true) : money(value)) : '');
  return (
    <span className="fld" style={{ height: h, flex: 'none', borderColor: invalid ? 'var(--error-main)' : undefined, opacity: disabled ? 0.6 : 1 }}>
      <input id={id} aria-label={label} aria-invalid={invalid || undefined} inputMode="decimal" disabled={disabled} value={shown}
        onFocus={() => setText(shown)}
        onChange={(e: React.ChangeEvent<HTMLInputElement>) => { const t = e.target.value; setText(t); const n = parseFloat(enDigits(t)); onChange(t.trim() === '' ? NaN : Number.isFinite(n) ? n : NaN); }}
        onBlur={() => setText(null)}
        style={{ width: w, height: h - 2 }} />
      {suffix && <span className="sfx">{suffix}</span>}
    </span>
  );
}

/** Full-width 40px numeric field with suffix (design drawers: `.fg` + boxed `.fi`). */
export function BoxNum({ value, onChange, suffix, id, decimals = false, invalid, ltr }: { value: number; onChange: (n: number) => void; suffix?: string; id?: string; decimals?: boolean; invalid?: boolean; ltr?: boolean }) {
  const [text, setText] = useState<string | null>(null);
  const shown = text ?? (Number.isFinite(value) ? (decimals ? faDigits(String(value), true) : money(value)) : '');
  return (
    <span style={{ display: 'flex', alignItems: 'center', height: 40, boxSizing: 'border-box', border: `1px solid ${invalid ? 'var(--error-main)' : 'var(--outline-border)'}`, borderRadius: 8, background: 'var(--bg-paper)', overflow: 'hidden' }}>
      <input id={id} className="fi" inputMode="decimal" dir={ltr ? 'ltr' : undefined} aria-invalid={invalid || undefined} value={shown}
        onFocus={() => setText(shown)}
        onChange={(e: React.ChangeEvent<HTMLInputElement>) => { const t = e.target.value; setText(t); const n = parseFloat(enDigits(t)); onChange(t.trim() === '' ? NaN : Number.isFinite(n) ? n : NaN); }}
        onBlur={() => setText(null)}
        style={{ border: 0, background: 'transparent', flex: 1, height: 38, minWidth: 0 }} />
      {suffix && <span className="sfx" style={{ height: '100%', fontSize: 12 }}>{suffix}</span>}
    </span>
  );
}

function useEsc(open: boolean, onClose: () => void) {
  useEffect(() => {
    if (!open) return;
    const k = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [open, onClose]);
}

/** Centered glass dialog with dimmed backdrop (design: `rgba(20,24,38,.48)`). */
export function Modal({ open, onClose, width = 560, label, children, radius = 16, padding = 20 }: { open: boolean; onClose: () => void; width?: number; label: string; children: React.ReactNode; radius?: number; padding?: number }) {
  useEsc(open, onClose);
  if (!open) return null;
  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 70, display: 'grid', placeItems: 'center', padding: 24 }}>
      <button type="button" aria-label="بستن" onClick={onClose} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', border: 0, margin: 0, padding: 0, background: 'rgba(20,24,38,.48)', cursor: 'pointer' }} />
      <div role="dialog" aria-modal="true" aria-label={label} className="glass" style={{ position: 'relative', width, maxWidth: '100%', maxHeight: 'calc(100dvh - 48px)', overflowY: 'auto', boxSizing: 'border-box', borderRadius: radius, padding, display: 'flex', flexDirection: 'column', gap: 16, boxShadow: 'var(--shadow-z24)', animation: 'nm-note .2s ease-out' }}>
        {children}
      </div>
    </div>
  );
}

/** Side sheet on the left edge (RTL end side). With `overlay` it dims the page. */
export function Drawer({ open, onClose, width = 420, label, children, overlay = true, padding = '20px 24px' }: { open: boolean; onClose: () => void; width?: number; label: string; children: React.ReactNode; overlay?: boolean; padding?: string }) {
  useEsc(open, onClose);
  if (!open) return null;
  const panel = (
    <aside role="dialog" aria-modal={overlay} aria-label={label} className="glass" style={{ position: 'fixed', left: 0, top: 0, bottom: 0, width, maxWidth: '100vw', boxSizing: 'border-box', border: 0, borderRight: '1px solid var(--glass-edge)', boxShadow: 'var(--shadow-dropdown)', padding, display: 'flex', flexDirection: 'column', gap: 14, overflowY: 'auto', zIndex: 61, background: 'var(--glass-bg)', animation: 'nm-back .22s ease-out' }}>
      {children}
    </aside>
  );
  if (!overlay) return panel;
  return (
    <>
      <button type="button" aria-label="بستن" onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 60, width: '100%', height: '100%', border: 0, margin: 0, padding: 0, background: 'rgba(20,24,38,.48)', cursor: 'pointer' }} />
      {panel}
    </>
  );
}

/** Dialog header row: title + close button. */
export function DlgHead({ title, onClose, children }: { title: React.ReactNode; onClose: () => void; children?: React.ReactNode }) {
  return (
    <div style={{ minHeight: 32, display: 'flex', alignItems: 'center', gap: 10, flex: 'none' }}>
      {children}
      <h6 style={{ margin: 0, fontSize: 16, fontWeight: 700, lineHeight: 1.3, flex: children ? 1 : undefined }}>{title}</h6>
      <button type="button" className="ibtn" aria-label="بستن" onClick={onClose} style={{ marginRight: 'auto', width: 32, height: 32 }}><Icon d={IC.x} size={18} /></button>
    </div>
  );
}

/** Confirmation dialog. */
export function Confirm({ open, title, body, confirmLabel, danger, busy, onConfirm, onClose }: { open: boolean; title: string; body: React.ReactNode; confirmLabel: string; danger?: boolean; busy?: boolean; onConfirm: () => void; onClose: () => void }) {
  return (
    <Modal open={open} onClose={onClose} width={460} label={title}>
      <DlgHead title={title} onClose={onClose} />
      <div style={{ fontSize: 13, lineHeight: 1.8, color: 'var(--text-secondary)' }}>{body}</div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <button type="button" className={danger ? 'btnd' : 'btnp'} disabled={busy} onClick={onConfirm} style={{ opacity: busy ? 0.7 : 1 }}>{busy ? 'در حال ثبت…' : confirmLabel}</button>
        <button type="button" className="btno" onClick={onClose}>انصراف</button>
      </div>
    </Modal>
  );
}

/** Card header row (title + optional badge + trailing slot). */
export function CardHead({ title, badge, children, h = 48 }: { title: React.ReactNode; badge?: React.ReactNode; children?: React.ReactNode; h?: number }) {
  return (
    <div style={{ height: h, flex: 'none', boxSizing: 'border-box', padding: '0 20px', display: 'flex', alignItems: 'center', gap: 10 }}>
      <h6 style={{ margin: 0, fontSize: 16, fontWeight: 700, lineHeight: 1.2, whiteSpace: 'nowrap' }}>{title}</h6>
      {badge}
      {children}
    </div>
  );
}

/** KPI card (design: 104px, title / big number / delta chip / note, icon tile or sparkline). */
export function Kpi({ title, value, unit, delta, tone = 'success', note, icon, spark }: {
  title: string; value: React.ReactNode; unit?: string; delta?: React.ReactNode; tone?: ToneKey; note?: string;
  icon?: { d: string; tone: ToneKey }; spark?: { id: string; line: string; area: string; col: string };
}) {
  return (
    <div className="card" style={{ boxSizing: 'border-box', minHeight: 104, padding: '16px 20px', display: 'flex', alignItems: 'center', gap: 12, minWidth: 0 }}>
      <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 6 }}>
        <span style={{ fontSize: 12, lineHeight: 1.3, color: 'var(--text-secondary)', fontWeight: 600, whiteSpace: 'nowrap' }}>{title}</span>
        <span style={{ display: 'flex', alignItems: 'baseline', gap: 5, whiteSpace: 'nowrap' }}><span className="num" style={{ fontSize: 24, lineHeight: 1.1 }}>{value}</span>{unit && <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{unit}</span>}</span>
        {(delta || note) && (
          <span style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
            {delta !== undefined && delta !== '' && <Lbl tone={tone} style={{ height: 20, padding: '0 6px' }}>{delta}</Lbl>}
            {note && <span style={{ fontSize: 11, color: 'var(--text-secondary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{note}</span>}
          </span>
        )}
      </div>
      {icon && <span style={{ width: 44, height: 44, borderRadius: 12, background: TONES[icon.tone][0], color: TONES[icon.tone][1], display: 'grid', placeItems: 'center', flex: 'none' }}><Icon d={icon.d} size={22} /></span>}
      {spark && (
        <div dir="ltr" style={{ width: 72, height: 36, flex: 'none' }}>
          <svg viewBox="0 0 80 40" width="72" height="36" aria-hidden="true" style={{ display: 'block', overflow: 'visible' }}>
            <defs><linearGradient id={'kp-' + spark.id} x1="0" y1="0" x2="0" y2="1"><stop offset="0" style={{ stopColor: `var(${spark.col})`, stopOpacity: 0.22 }} /><stop offset="1" style={{ stopColor: `var(${spark.col})`, stopOpacity: 0 }} /></linearGradient></defs>
            <path d={spark.area} fill={`url(#kp-${spark.id})`} />
            <path d={spark.line} fill="none" style={{ stroke: `var(${spark.col})` }} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </div>
      )}
    </div>
  );
}

/** Empty / loading row inside a card table. */
export function EmptyRow({ children, h = 120 }: { children: React.ReactNode; h?: number }) {
  return <div style={{ height: h, display: 'grid', placeItems: 'center', fontSize: 13, color: 'var(--text-secondary)', textAlign: 'center', padding: '0 20px' }}>{children}</div>;
}

/** Inline form error. */
export function FormError({ children }: { children?: React.ReactNode }) {
  if (!children) return null;
  return (
    <div role="alert" style={{ display: 'flex', alignItems: 'flex-start', gap: 8, padding: '8px 12px', borderRadius: 8, background: 'var(--soft-error)', color: 'var(--error-text)', fontSize: 12, fontWeight: 500, lineHeight: 1.6 }}>
      <Icon d={IC.alert} size={16} style={{ flex: 'none', marginTop: 2 }} />
      <span>{children}</span>
    </div>
  );
}
