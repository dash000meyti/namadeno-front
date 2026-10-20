'use client';
/** Small presentational helpers shared by the org-people screens (HR panel). */
import { useEffect, useRef, useState } from 'react';
import { Icon } from '@/components/ui/Icon';
import { LOCK_META } from '@/lib/locks';
import { faDigits, money } from '@/lib/format';
import type { Employee, LockType, MilestoneStep, RequestKind } from '@/types/domain';
import { ApiRequestError } from '@/api/client';

export const I = {
  pkg: 'M21 8l-9-5-9 5v8l9 5 9-5zM3 8l9 5 9-5M12 13v8',
  check: 'M5 12.5l4.5 4.5L19 7',
  x: 'M6 6l12 12M18 6L6 18',
  chevL: 'M14 6l-6 6 6 6',
  chevR: 'M10 6l6 6-6 6',
  chevD: 'M7 10l5 5 5-5',
  plus: 'M12 5v14M5 12h14',
  download: 'M12 4v11M7.5 10.5L12 15l4.5-4.5M4 17v2a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-2',
  upload: 'M12 15V4M7.5 8.5L12 4l4.5 4.5M4 17v2a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-2',
  kebab: 'M12 5.5h.01M12 12h.01M12 18.5h.01',
  ban: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18M5.6 5.6l12.8 12.8',
  flag: 'M5 21V4M5 4h11l-2 4 2 4H5',
  lock: 'M7 11V8a5 5 0 0 1 10 0v3M5 11h14v10H5zM12 15v2',
  percent: 'M19 5L5 19M7.5 9a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3M16.5 18a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3',
  calendar: 'M4 6h16v14H4zM4 10h16M8 3v4M16 3v4M8 14h2M14 14h2',
  credit: 'M3 6h18v12H3zM3 10h18M7 15h3',
  info: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18M12 11v5M12 8h.01',
  warn: 'M12 3l10 18H2zM12 10v5M12 18h.01',
  shield: 'M12 3l8 3v6c0 4.5-3.4 7.8-8 9-4.6-1.2-8-4.5-8-9V6zM9 12l2 2 4-4',
  coin: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18M12 7v10M9.5 9.5h3.5a1.5 1.5 0 0 1 0 3h-2a1.5 1.5 0 0 0 0 3H15',
  user: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8M4 21v-1a6 6 0 0 1 6-6h4a6 6 0 0 1 6 6v1',
  inbox: 'M3 13l2.5-7h13L21 13v5a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2zM3 13h5l1.5 2.5h5L16 13h5',
  undo: 'M20 11a8 8 0 0 0-14.6-4.5L4 8M4 4v4h4M4 13a8 8 0 0 0 14.6 4.5L20 16M20 20v-4h-4',
  mail: 'M3 6h18v12H3zM3 6l9 7 9-7',
  file: 'M14 3H7a1 1 0 0 0-1 1v16a1 1 0 0 0 1 1h10a1 1 0 0 0 1-1V8zM14 3v5h5',
  xls: 'M14 3H7a1 1 0 0 0-1 1v16a1 1 0 0 0 1 1h10a1 1 0 0 0 1-1V8zM14 3v5h5M9 12l6 6M15 12l-6 6',
  filters: 'M4 6h16M7 12h10M10 18h4',
  search: 'M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14M20 20l-4-4',
  wallet: 'M3 7h18v12H3zM3 7l2-3h12l2 3M15 12h3',
};

/** Avatar tone cycle used by the design tables. */
export const AV: [string, string][] = [
  ['var(--soft-primary)', 'var(--primary-text)'], ['var(--soft-success)', 'var(--success-text)'],
  ['var(--soft-info)', 'var(--info-text)'], ['var(--soft-warning)', 'var(--warning-text)'],
  ['var(--soft-default)', 'var(--default-text)'], ['var(--soft-primary)', 'var(--primary-text)'],
  ['var(--soft-info)', 'var(--info-text)'], ['var(--soft-success)', 'var(--success-text)'],
];
/** Stable avatar tone for an id (so a person keeps the same color across screens). */
export const avOf = (id: string) => AV[id.split('').reduce((a, c) => a + c.charCodeAt(0), 0) % AV.length];

export type ToneName = 'success' | 'warning' | 'error' | 'info' | 'primary' | 'default' | 'secondary';
export const tone = (t: ToneName): [string, string] => [`var(--soft-${t})`, `var(--${t}-text)`];

/** Employee status → design label/tone. */
export const EMP_STATUS: Record<Employee['status'], { label: string; tone: ToneName }> = {
  active: { label: 'فعال', tone: 'success' },
  invited: { label: 'در انتظار فعال‌سازی', tone: 'warning' },
  inactive: { label: 'تعلیق', tone: 'error' },
};

export const REQ_KIND: Record<RequestKind, { label: string; title: string; tone: ToneName }> = {
  loan: { label: 'وام', title: 'درخواست وام', tone: 'primary' },
  cash_withdrawal: { label: 'برداشت نقدی', title: 'درخواست برداشت نقدی', tone: 'info' },
  credit_increase: { label: 'اعتبار', title: 'درخواست افزایش اعتبار کارت', tone: 'warning' },
  milestone_release: { label: 'تأیید مرحله', title: 'تأیید مرحله قرارداد', tone: 'primary' },
  installment: { label: 'اقساطی', title: 'درخواست خرید اقساطی', tone: 'secondary' },
  profile_change: { label: 'تغییر اطلاعات', title: 'درخواست تغییر اطلاعات', tone: 'default' },
};

/** Fund/wallet colors used by the design charts. */
export const KIND_COLOR: Record<string, string> = {
  rial: 'var(--chart-4)', gold: 'var(--warning-main)', fixed: 'var(--chart-3)', equity: 'var(--primary-main)', mixed: 'var(--success-main)', silver: 'var(--grey-500)',
};

/** Splits a Toman amount into a short number and its unit: 1.86e10 → ['۱۸٫۶', 'میلیارد تومان']. */
export function compactParts(n: number): [string, string] {
  const abs = Math.abs(n);
  const f = (v: number) => (n < 0 ? '−' : '') + faDigits(String(Math.round(v * 10) / 10), true);
  if (abs >= 1e9) return [f(abs / 1e9), 'میلیارد تومان'];
  if (abs >= 1e6) return [f(abs / 1e6), 'میلیون تومان'];
  return [money(n), 'تومان'];
}
/** Jalali {y, m, d} of a date (Tehran time). */
export function jParts(iso: string | Date) {
  const parts = new Intl.DateTimeFormat('en-US-u-ca-persian', { year: 'numeric', month: 'numeric', day: 'numeric', timeZone: 'Asia/Tehran' }).formatToParts(new Date(iso));
  const g = (t: string) => Number(parts.find((x) => x.type === t)?.value ?? 0);
  return { y: g('year'), m: g('month'), d: g('day') };
}

/** Jalali date → ISO (12:00 Tehran). Returns null for an impossible date. */
export function jalaliToIsoAny(jy: number, jm: number, jd: number): string | null {
  if (jm < 1 || jm > 12 || jd < 1 || jd > (jm <= 6 ? 31 : jm < 12 ? 30 : 30)) return null;
  let y = jy + 1595;
  let days = -355668 + 365 * y + Math.floor(y / 33) * 8 + Math.floor(((y % 33) + 3) / 4) + jd + (jm < 7 ? (jm - 1) * 31 : (jm - 7) * 30 + 186);
  let gy = 400 * Math.floor(days / 146097);
  days %= 146097;
  if (days > 36524) {
    days -= 1;
    gy += 100 * Math.floor(days / 36524);
    days %= 36524;
    if (days >= 365) days += 1;
  }
  gy += 4 * Math.floor(days / 1461);
  days %= 1461;
  if (days > 365) {
    gy += Math.floor((days - 1) / 365);
    days = (days - 1) % 365;
  }
  let gd = days + 1;
  const ml = [0, 31, (gy % 4 === 0 && gy % 100 !== 0) || gy % 400 === 0 ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  let gm = 0;
  for (gm = 0; gm < 13 && gd > ml[gm]; gm++) gd -= ml[gm];
  y = gy;
  const iso = new Date(Date.UTC(y, gm - 1, gd, 8, 30)).toISOString();
  const back = jParts(iso);
  return back.y === jy && back.m === jm && back.d === jd ? iso : null;
}

/** Million with one decimal: 30_000_000 → «۳۰» */
export const million = (n: number) => faDigits(String(Math.round(n / 1e5) / 10), true);

export const errMsg = (e: unknown) => (e instanceof ApiRequestError || e instanceof Error ? e.message : 'خطا در ارتباط با سرور');

export function Chip({ t, children, style }: { t: ToneName | [string, string]; children: React.ReactNode; style?: React.CSSProperties }) {
  const [bg, fg] = Array.isArray(t) ? t : tone(t);
  return <span className="lbl" style={{ height: 22, padding: '0 7px', fontSize: 11, background: bg, color: fg, ...style }}>{children}</span>;
}

export function LockChip({ type, long, style }: { type: LockType | 'none'; long?: boolean; style?: React.CSSProperties }) {
  const m = LOCK_META[type];
  const bg = type === 'none' ? 'var(--soft-default)' : m.bg;
  const fg = type === 'none' ? 'var(--default-text)' : m.fg;
  return (
    <span className="lktype" style={{ background: bg, color: fg, ...style }}>
      <Icon d={m.d} size={12} />{long ? m.label : m.short}
    </span>
  );
}

/** Milestone progress segments (released solid, pending outlined). */
export function MsSeg({ steps, height = 6, width, label }: { steps: Pick<MilestoneStep, 'sharePct' | 'status' | 'id'>[]; height?: number; width?: number; label?: string }) {
  return (
    <div className="lkseg" role="img" aria-label={label} style={{ height, width, flex: width ? 'none' : undefined }}>
      {steps.map((s) => <span key={s.id} className={s.status === 'released' ? 'r' : s.status === 'pending_approval' ? 'p' : ''} style={{ flex: s.sharePct }} />)}
    </div>
  );
}

/** Free/locked bar with explicit percentage (design markup). */
export function FreeLockBar({ free, locked, height = 6 }: { free: number; locked: number; height?: number }) {
  const total = free + locked;
  const freePct = total ? Math.round((free * 1000) / total) / 10 : 100;
  return (
    <div className="lkbar" role="img" aria-label={`آزاد ${money(free)} · قفل ${money(locked)}`} style={{ height }}>
      {(free > 0 || !total) && <span className="f" style={{ width: locked > 0 ? `${freePct}%` : '100%' }} />}
      {locked > 0 && <span className="l" style={{ flex: 1 }} />}
    </div>
  );
}

export function FreeLockLegend({ free, locked, size }: { free: number; locked: number; size?: number }) {
  if (!locked) return <div className="lkleg" style={size ? { fontSize: size } : undefined}><span><span className="lkdot" style={size ? { width: 6, height: 6 } : undefined} />همه آزاد</span></div>;
  return (
    <div className="lkleg" style={size ? { fontSize: size, gap: 8 } : undefined}>
      <span><span className="lkdot" style={size ? { width: 6, height: 6 } : undefined} />آزاد <b>{money(free)}</b></span>
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>{!size && <Icon d={I.lock} size={12} />}قفل <b>{money(locked)}</b></span>
    </div>
  );
}

/** Popover menu anchored to its trigger; closes on outside click / Escape. */
export function Popover({ trigger, children, open, onOpenChange, width = 200, align = 'start', up = false, style }: {
  trigger: React.ReactNode; children: React.ReactNode; open: boolean; onOpenChange: (o: boolean) => void; width?: number | string; align?: 'start' | 'end'; up?: boolean; style?: React.CSSProperties;
}) {
  const ref = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) onOpenChange(false); };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onOpenChange(false); };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('mousedown', onDown); document.removeEventListener('keydown', onKey); };
  }, [open, onOpenChange]);
  return (
    <div ref={ref} style={{ position: 'relative', ...style }}>
      {trigger}
      {open && (
        <div role="menu" className="glass" style={{ position: 'absolute', ...(up ? { bottom: 'calc(100% + 4px)' } : { top: 'calc(100% + 4px)' }), ...(align === 'start' ? { right: 0 } : { left: 0 }), zIndex: 25, width, boxSizing: 'border-box', borderRadius: 12, padding: 6, display: 'flex', flexDirection: 'column', gap: 2, boxShadow: 'var(--shadow-dropdown)', background: 'var(--bg-paper)' }}>
          {children}
        </div>
      )}
    </div>
  );
}

export function MenuItem({ onClick, children, on, danger, disabled }: { onClick: () => void; children: React.ReactNode; on?: boolean; danger?: boolean; disabled?: boolean }) {
  return (
    <button role="menuitem" disabled={disabled} onClick={onClick} className="trow" style={{ display: 'flex', alignItems: 'center', gap: 8, minHeight: 36, padding: '0 10px', borderRadius: 8, border: 0, background: on ? 'var(--nav-active)' : 'transparent', color: danger ? 'var(--error-text)' : on ? 'var(--primary-text)' : 'var(--text-primary)', fontFamily: 'inherit', fontSize: 13, fontWeight: on ? 700 : 500, textAlign: 'right', cursor: disabled ? 'default' : 'pointer', opacity: disabled ? 0.5 : 1 }}>
      <span style={{ flex: 1 }}>{children}</span>
      {on && <Icon d={I.check} size={16} strokeWidth={2} />}
    </button>
  );
}

/** Select-like field (design `.fld` button + chevron) with a popover list. */
export function SelectField<T extends string | number>({ value, options, onChange, label, invalid, width }: {
  value: T; options: { value: T; label: string }[]; onChange: (v: T) => void; label: string; invalid?: boolean; width?: number | string;
}) {
  const [open, setOpen] = useState(false);
  const cur = options.find((o) => o.value === value);
  return (
    <Popover open={open} onOpenChange={setOpen} width={width ?? '100%'} trigger={
      <button type="button" className="fld" aria-label={label} aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen((x) => !x)} style={{ width: '100%', fontFamily: 'inherit', cursor: 'pointer', textAlign: 'right', borderColor: invalid ? 'var(--error-main)' : undefined }}>
        <span style={{ flex: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{cur?.label ?? '—'}</span>
        <Icon d={I.chevD} size={16} style={{ color: 'var(--text-secondary)' }} />
      </button>
    }>
      {options.map((o) => <MenuItem key={String(o.value)} on={o.value === value} onClick={() => { onChange(o.value); setOpen(false); }}>{o.label}</MenuItem>)}
    </Popover>
  );
}

/** Design dialog on the dim overlay (fixed so it covers the whole panel). */
export function Dialog({ label, title, onClose, children, width }: { label: string; title: React.ReactNode; onClose: () => void; children: React.ReactNode; width?: number }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div className="dim" style={{ position: 'fixed', zIndex: 40 }} onClick={onClose}>
      <div className="glass dlg" role="dialog" aria-modal="true" aria-label={label} onClick={(e) => e.stopPropagation()} style={{ background: 'var(--bg-paper)', maxWidth: 'calc(100vw - 32px)', width }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <h6 style={{ margin: 0, fontSize: 18, fontWeight: 700, lineHeight: 1.4 }}>{title}</h6>
          <button className="ibtn" aria-label="بستن" onClick={onClose} style={{ marginRight: 'auto', width: 32, height: 32 }}><Icon d={I.x} size={18} /></button>
        </div>
        {children}
      </div>
    </div>
  );
}

/** Downloads a CSV (UTF-8 with BOM so Excel shows Persian correctly). */
export function downloadCsv(filename: string, rows: (string | number)[][]) {
  const esc = (v: string | number) => { const s = String(v ?? ''); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
  const blob = new Blob(['﻿' + rows.map((r) => r.map(esc).join(',')).join('\n')], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
