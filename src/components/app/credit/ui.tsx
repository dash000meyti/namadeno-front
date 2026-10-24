'use client';
/** Small building blocks shared by the credit / card / installment screens (markup copied from the designs). */
import Link from 'next/link';
import type { CSSProperties, ReactNode } from 'react';
import { Icon } from '@/components/ui/Icon';
import { ApiRequestError } from '@/api/client';
import { HOURGLASS } from '@/lib/locks';
import { routes } from '@/lib/routes';
import { enDigits, faDigits, jDate, jDayMonth, money } from '@/lib/format';
import { now } from '@/lib/clock';
import type { BankAccount, Fund, Holding, LockType, Portfolio } from '@/types/domain';
import { CI, KIND_ICON, TONE, type Tone } from './icons';

export const pct1 = (x: number) => Math.round(x * 1000) / 10;
const DAY = 86_400_000;

/** Whole days from the (mock) clock to `iso`; negative when past. */
export function daysUntil(iso: string) {
  const a = now();
  const start = new Date(a.getFullYear(), a.getMonth(), a.getDate()).getTime();
  const d = new Date(iso);
  const end = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  return Math.round((end - start) / DAY);
}

/** «سررسید ۱۵ آبان (۴ روز دیگر)» */
export function dueLabel(iso: string) {
  const n = daysUntil(iso);
  const tail = n > 0 ? `${faDigits(n)} روز دیگر` : n === 0 ? 'امروز' : `${faDigits(-n)} روز گذشته`;
  return `سررسید ${jDayMonth(iso)} (${tail})`;
}

export function addDays(iso: string | Date, days: number) {
  return new Date(new Date(iso).getTime() + days * DAY).toISOString();
}

const LOCK_WORD: Record<LockType, string> = { collateral: 'رزرو پشتوانه', vesting: 'پس‌انداز', installment: 'رزرو اقساطی', milestone: 'رزرو مرحله‌ای', legal: 'مسدودی' };

/** What is already reserved on a holding («۲۰٬۰۰۰٬۰۰۰ پس‌انداز», «رزرو فعلی ۴۲٬۰۰۰٬۰۰۰», «همه آزاد»). */
export function lockedNote(h: Holding) {
  if (!h.locked) return 'همه آزاد';
  const types = Array.from(new Set(h.locks.map((l) => l.type)));
  if (types.length === 1) {
    const t = types[0];
    if (h.free <= 0) {
      const rel = t === 'vesting' ? h.locks.map((l) => l.releaseAt).filter(Boolean).sort().pop() : undefined;
      return `همه ${LOCK_WORD[t]}${rel ? ' تا ' + jDate(rel) : ''}`;
    }
    return `${money(h.locked)} ${LOCK_WORD[t]}`;
  }
  return `رزرو فعلی ${money(h.locked)}`;
}

export function errText(e: unknown) {
  return e instanceof ApiRequestError ? e.message : 'خطا در ارتباط با سرور';
}

export function Chev({ size = 18, style }: { size?: number; style?: CSSProperties }) {
  return <Icon d={CI.chevL} size={size} style={{ color: 'var(--text-disabled)', ...style }} />;
}

/** Inline API error. kyc_required → link to /app/kyc; active_loan → link to the active loan. */
export function ApiErrorNotice({ error, style }: { error: unknown; style?: CSSProperties }) {
  if (!error) return null;
  const e = error instanceof ApiRequestError ? error : null;
  const code = e?.code;
  const loanId = typeof e?.details?.loanId === 'string' ? (e.details.loanId as string) : undefined;
  let action: ReactNode = null;
  if (code === 'kyc_required') action = <Link href={routes.app.kyc} style={actBtn}>احراز هویت</Link>;
  else if (code === 'active_loan') action = <Link href={routes.app.payInstallment(loanId)} style={actBtn}>وام فعال</Link>;
  return (
    <div role="alert" style={{ minHeight: 48, boxSizing: 'border-box', padding: '8px 12px', borderRadius: 12, background: code === 'kyc_required' ? 'var(--soft-warning)' : 'var(--soft-error)', color: code === 'kyc_required' ? 'var(--warning-text)' : 'var(--error-text)', display: 'flex', alignItems: 'center', gap: 10, flex: 'none', ...style }}>
      <Icon d={code === 'kyc_required' ? CI.shieldAlert : CI.warn} size={20} />
      <span style={{ flex: 1, minWidth: 0, fontSize: 12, fontWeight: 600, lineHeight: 1.6 }}>{errText(error)}</span>
      {action}
    </div>
  );
}
const actBtn: CSSProperties = { height: 30, padding: '0 10px', borderRadius: 9, background: 'var(--primary-main)', color: 'var(--primary-contrast)', fontSize: 12, fontWeight: 700, display: 'inline-flex', alignItems: 'center', whiteSpace: 'nowrap', textDecoration: 'none', flex: 'none' };

/** KYC level-2 banner (design: app-credit). */
export function KycBanner({ text = 'برای اعتبار کارت، وام و خرید اقساطی، هویت پایه (ثبت احوال) را تکمیل کنید.' }: { text?: string }) {
  return (
    <Link href={routes.app.kyc} style={{ flex: 'none', boxSizing: 'border-box', padding: '12px 14px', borderRadius: 14, background: 'var(--soft-warning)', color: 'var(--text-primary)', textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 10 }}>
      <span style={{ width: 36, height: 36, borderRadius: 10, background: 'rgb(var(--warning-main-rgb) / .2)', color: 'var(--warning-text)', display: 'grid', placeItems: 'center', flex: 'none' }}><Icon d={CI.shieldAlert} size={20} /></span>
      <span style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 2, lineHeight: 1.6 }}>
        <span style={{ fontSize: 13, fontWeight: 700 }}>یک قدم مانده: احراز هویت سطح ۲</span>
        <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{text}</span>
      </span>
      <span style={{ height: 30, padding: '0 10px', borderRadius: 9, background: 'var(--primary-main)', color: 'var(--primary-contrast)', fontSize: 12, fontWeight: 700, display: 'inline-flex', alignItems: 'center', whiteSpace: 'nowrap' }}>احراز هویت</span>
    </Link>
  );
}

/** Three-step progress (design: loan / installment wizards). `current` is 0-based; earlier steps are done. */
export function Stepper({ steps, current }: { steps: string[]; current: number }) {
  return (
    <div style={{ height: 44, display: 'flex', alignItems: 'flex-start', flex: 'none' }}>
      {steps.map((label, i) => {
        const st = i < current ? 'done' : i === current ? 'cur' : 'next';
        const bg = st === 'done' ? 'var(--primary-main)' : st === 'cur' ? 'var(--soft-primary)' : 'transparent';
        const bd = st === 'next' ? 'var(--ring-track)' : 'var(--primary-main)';
        const fg = st === 'done' ? 'var(--primary-contrast)' : st === 'cur' ? 'var(--primary-text)' : 'var(--text-disabled)';
        const lc = st === 'cur' ? 'var(--primary-text)' : st === 'done' ? 'var(--text-primary)' : 'var(--text-disabled)';
        return (
          <div key={label} aria-current={st === 'cur' ? 'step' : undefined} style={{ flex: 1, position: 'relative', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
            {i > 0 && <span style={{ position: 'absolute', top: 11, right: 'calc(-50% + 16px)', left: 'calc(50% + 16px)', height: 2, borderRadius: 1, background: st === 'next' ? 'var(--ring-track)' : 'var(--primary-main)' }} />}
            <span style={{ width: 24, height: 24, boxSizing: 'border-box', borderRadius: '50%', background: bg, border: `2px solid ${bd}`, color: fg, display: 'grid', placeItems: 'center', fontSize: 11, fontWeight: 700, lineHeight: 1 }}>
              {st === 'done' ? <Icon d={CI.check} size={14} strokeWidth={2.2} /> : <span>{faDigits(i + 1)}</span>}
            </span>
            <span style={{ fontSize: 11, fontWeight: st === 'cur' ? 700 : 500, color: lc, lineHeight: 1, whiteSpace: 'nowrap' }}>{label}</span>
          </div>
        );
      })}
    </div>
  );
}

/** «مرحله ۲ از ۳» header label. */
export function StepLabel({ n, of = 3 }: { n: number; of?: number }) {
  return <span className="lbl" style={{ marginRight: 'auto', marginLeft: 4, background: 'var(--soft-default)', color: 'var(--default-text)', fontWeight: 600 }}>مرحله {faDigits(n)} از {faDigits(of)}</span>;
}

/** Segmented control (design: `seg()`). */
export function Segmented<T extends string | number>({ items, value, onChange, label }: { items: { id: T; label: string; disabled?: boolean }[]; value: T; onChange: (v: T) => void; label?: string }) {
  return (
    <div role="group" aria-label={label} style={{ height: 40, boxSizing: 'border-box', padding: 4, borderRadius: 8, background: 'var(--bg-neutral)', display: 'grid', gridTemplateColumns: `repeat(${items.length}, 1fr)`, gap: 4, flex: 'none' }}>
      {items.map((it) => {
        const on = it.id === value;
        return (
          <button key={String(it.id)} type="button" aria-pressed={on} disabled={it.disabled} onClick={() => onChange(it.id)}
            style={{ height: 32, border: 0, borderRadius: 6, background: on ? 'var(--seg-active)' : 'transparent', boxShadow: on ? 'var(--shadow-z1)' : 'none', color: on ? 'var(--primary-text)' : 'var(--text-secondary)', fontFamily: 'inherit', fontSize: 13, fontWeight: on ? 700 : 600, cursor: it.disabled ? 'not-allowed' : 'pointer', padding: 0, whiteSpace: 'nowrap', opacity: it.disabled ? 0.45 : 1 }}>
            {it.label}
          </button>
        );
      })}
    </div>
  );
}

/** Amount chips (design: `chips()`). */
export function AmountChips({ items, value, onPick, height = 32, disabled }: { items: { id: number; label: string }[]; value: number; onPick: (v: number) => void; height?: number; disabled?: boolean }) {
  return (
    <div style={{ height, display: 'flex', gap: 6, opacity: disabled ? 0.4 : 1 }}>
      {items.map((c) => {
        const on = !disabled && c.id === value;
        return (
          <button key={c.label} type="button" className="num" aria-pressed={on} aria-disabled={disabled} onClick={() => { if (!disabled) onPick(c.id); }}
            style={{ flex: 1, height, padding: '0 6px', border: `1px solid ${on ? 'transparent' : 'var(--outline-border)'}`, borderRadius: 8, background: on ? 'var(--soft-primary)' : 'transparent', color: on ? 'var(--primary-text)' : 'var(--text-secondary)', fontFamily: 'inherit', fontSize: 12, fontWeight: 600, cursor: disabled ? 'default' : 'pointer', whiteSpace: 'nowrap' }}>
            {c.label}
          </button>
        );
      })}
    </div>
  );
}

/** Amount text field: shows Persian digits with separators, parses any digits back to a number. */
export function AmountField({ id, value, onChange, label, disabled, invalid }: { id: string; value: number; onChange: (n: number) => void; label: string; disabled?: boolean; invalid?: boolean }) {
  return (
    <div className="row" style={{ height: 44, gap: 8, boxSizing: 'border-box', padding: '0 12px', borderRadius: 8, border: `1px solid ${invalid ? 'var(--error-main)' : disabled ? 'var(--outline-border)' : 'var(--primary-main)'}`, background: disabled ? 'var(--bg-neutral)' : 'var(--bg-paper)' }}>
      <input id={id} type="text" inputMode="numeric" dir="ltr" aria-label={label} aria-invalid={invalid || undefined} className="num" disabled={disabled}
        value={value ? money(value) : ''} placeholder={faDigits(0)}
        onChange={(e) => { const n = Number(enDigits(e.target.value).replace(/[^\d]/g, '')) || 0; onChange(Math.min(n, 1e12)); }}
        style={{ flex: 1, minWidth: 0, height: 40, border: 0, background: 'transparent', fontFamily: 'inherit', fontSize: 20, fontWeight: 300, color: 'var(--text-primary)', outline: 'none', padding: 0, textAlign: 'right' }} />
      <span style={{ fontSize: 12, color: 'var(--text-secondary)', flex: 'none' }}>تومان</span>
    </div>
  );
}

/** The design's slider (track + fill + knob) driven by an invisible native range input for drag/keyboard/a11y. */
export function Slider({ value, min, max, step, onChange, label, style }: { value: number; min: number; max: number; step: number; onChange: (v: number) => void; label: string; style?: CSSProperties }) {
  const p = max > min ? pct1((value - min) / (max - min)) : 0;
  return (
    <div dir="ltr" style={{ position: 'relative', height: 24, ...style }}>
      <span style={{ position: 'absolute', top: 9, left: 0, right: 0, height: 6, borderRadius: 3, background: 'var(--progress-track)' }} />
      <span style={{ position: 'absolute', top: 9, left: 0, width: `${p}%`, height: 6, borderRadius: 3, background: 'var(--primary-main)' }} />
      <span style={{ position: 'absolute', top: 0, left: `calc(${p}% - 12px)`, width: 24, height: 24, boxSizing: 'border-box', borderRadius: '50%', background: '#FFFFFF', border: '2px solid var(--primary-main)', boxShadow: 'var(--shadow-z8)', pointerEvents: 'none' }} />
      <input type="range" aria-label={label} aria-valuetext={money(value) + ' تومان'} min={min} max={Math.max(min, max)} step={step} value={value} disabled={max <= min}
        onChange={(e) => onChange(Number(e.target.value))}
        style={{ position: 'absolute', inset: 0, width: '100%', height: 24, margin: 0, opacity: 0, cursor: 'pointer' }} />
    </div>
  );
}

/** Switch (design: 33×20 track, white knob). */
export function Toggle({ on, onClick, label, disabled, style }: { on: boolean; onClick: () => void; label: string; disabled?: boolean; style?: CSSProperties }) {
  return (
    <button type="button" aria-pressed={on} aria-label={label} aria-disabled={disabled || undefined} onClick={() => { if (!disabled) onClick(); }} dir="ltr"
      style={{ width: 44, height: 44, border: 0, background: 'transparent', padding: 0, display: 'grid', placeItems: 'center', cursor: disabled ? 'default' : 'pointer', flex: 'none', ...style }}>
      <span style={{ position: 'relative', display: 'block', width: 33, height: 20, borderRadius: 999, background: on ? 'var(--primary-main)' : 'var(--switch-off)' }}>
        <span style={{ position: 'absolute', top: 3, left: on ? 16 : 3, width: 14, height: 14, borderRadius: '50%', background: '#FFFFFF', boxShadow: 'var(--shadow-z1)', transition: 'left .15s ease' }} />
      </span>
    </button>
  );
}

/** Radio row (design: `radios()`). */
export function RadioCard({ on, onClick, d, tone, title, sub, trailing, height = 50, disabled }: { on: boolean; onClick: () => void; d: string; tone: Tone; title: ReactNode; sub: ReactNode; trailing?: ReactNode; height?: number; disabled?: boolean }) {
  return (
    <button type="button" role="radio" aria-checked={on} aria-disabled={disabled || undefined} onClick={() => { if (!disabled) onClick(); }}
      style={{ height, boxSizing: 'border-box', width: '100%', padding: '0 12px', border: `1px solid ${on ? 'var(--primary-main)' : 'var(--glass-border)'}`, borderRadius: 12, background: on ? 'rgb(var(--primary-main-rgb) / .08)' : 'var(--card-bg)', boxShadow: 'var(--shadow-z1)', display: 'flex', alignItems: 'center', gap: 10, color: 'var(--text-primary)', fontFamily: 'inherit', textAlign: 'right', cursor: disabled ? 'not-allowed' : 'pointer', opacity: disabled ? 0.5 : 1, flex: 'none' }}>
      <span style={{ width: 20, height: 20, boxSizing: 'border-box', borderRadius: '50%', border: `2px solid ${on ? 'var(--primary-main)' : 'var(--outline-border)'}`, display: 'grid', placeItems: 'center', flex: 'none' }}><span style={{ width: 10, height: 10, borderRadius: '50%', background: on ? 'var(--primary-main)' : 'transparent' }} /></span>
      <span style={{ width: 34, height: 34, borderRadius: '50%', background: TONE[tone][0], color: TONE[tone][1], display: 'grid', placeItems: 'center', flex: 'none' }}><Icon d={d} size={17} /></span>
      <span className="col" style={{ flex: 1, gap: 2, lineHeight: 1.3 }}>
        <span style={{ fontSize: 14, fontWeight: 600, whiteSpace: 'nowrap' }}>{title}</span>
        <span className="num" style={{ fontSize: 11, fontWeight: 400, color: 'var(--text-secondary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{sub}</span>
      </span>
      {trailing}
    </button>
  );
}

export interface KvRow { k: ReactNode; v: ReactNode; u?: string; w?: number; c?: string }
/** Dashed key/value rows (design: `kv()`). */
export function KvRows({ rows, h = 30, vSize = 13 }: { rows: KvRow[]; h?: number; vSize?: number }) {
  return (
    <>
      {rows.map((r, i) => (
        <div key={i} className="row" style={{ height: h, gap: 8, borderBottom: `1px dashed ${i === rows.length - 1 ? 'transparent' : 'var(--divider)'}` }}>
          <span style={{ fontSize: 12, color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>{r.k}</span>
          <span className="num" style={{ marginRight: 'auto', fontSize: vSize, fontWeight: r.w ?? 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', color: r.c ?? 'var(--text-primary)' }}>
            {r.v} {r.u ? <span style={{ fontSize: 11, fontWeight: 400, color: 'var(--text-secondary)' }}>{r.u}</span> : null}
          </span>
        </div>
      ))}
    </>
  );
}

/** Free/reserved bar + legend with a custom free label («آزاد پس از تأیید»). */
export function LockSplit({ free, locked, freeLabel = 'آزاد' }: { free: number; locked: number; freeLabel?: string }) {
  const total = free + locked;
  const fp = total ? pct1(free / total) : 100;
  return (
    <>
      <div className="lkbar" role="img" aria-label={`آزاد ${money(free)} · رزرو ${money(locked)}`}>
        {free > 0 && <span className="f" style={{ width: locked > 0 ? `${fp}%` : '100%' }} />}
        {locked > 0 && <span className="l" style={{ flex: 1 }} />}
      </div>
      <div className="lkleg">
        <span><span className="lkdot" />{freeLabel} <b>{money(free)}</b></span>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}><Icon d={HOURGLASS} size={12} />رزرو <b>{money(locked)}</b></span>
      </div>
    </>
  );
}

/** Installment progress segments. */
export function Segs({ total, paid, selected = 0 }: { total: number; paid: number; selected?: number }) {
  return (
    <div style={{ height: 6, display: 'flex', gap: 3 }} role="img" aria-label={`${faDigits(paid)} از ${faDigits(total)} قسط پرداخت شده`}>
      {Array.from({ length: total }, (_, i) => {
        const sel = i >= paid && i < paid + selected;
        return <span key={i} style={{ flex: 1, height: 6, borderRadius: 3, background: i < paid ? 'var(--primary-main)' : sel ? 'var(--soft-primary)' : 'var(--progress-track)', boxShadow: sel ? 'inset 0 0 0 1px var(--primary-main)' : 'none' }} />;
      })}
    </div>
  );
}

/** Primary full-width action (design: 48px). */
export function PrimaryButton({ children, onClick, disabled, busy, d }: { children: ReactNode; onClick: () => void; disabled?: boolean; busy?: boolean; d?: string }) {
  return (
    <button type="button" onClick={onClick} disabled={disabled || busy} aria-busy={busy || undefined}
      style={{ height: 48, width: '100%', border: 0, boxSizing: 'border-box', borderRadius: 8, background: 'var(--primary-main)', color: 'var(--primary-contrast)', boxShadow: disabled ? 'none' : 'var(--shadow-primary)', fontFamily: 'inherit', fontSize: 15, fontWeight: 700, cursor: disabled || busy ? 'default' : 'pointer', flex: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, opacity: disabled ? 0.45 : busy ? 0.75 : 1 }}>
      {d && <Icon d={d} size={18} />}
      {busy ? 'در حال ثبت…' : children}
    </button>
  );
}

/** Payment-source radios + «رزروشده … جزئیات» line (designs: pay-installment, card-settle). */
export function SourcePicker({ value, onChange, portfolio, banks, funds, height = 50 }: { value: string; onChange: (v: string) => void; portfolio?: Portfolio; banks?: BankAccount[]; funds?: Fund[]; height?: number }) {
  const rial = portfolio?.holdings.find((h) => h.kind === 'rial');
  const fixed = portfolio?.holdings.find((h) => h.kind === 'fixed');
  const bank = banks?.find((b) => b.isDefault) ?? banks?.[0];
  const fixedFund = funds?.find((f) => f.id === 'fixed');
  const items = [
    { id: 'rial', title: 'کیف پول ریالی', sub: `آزاد ${money(rial?.free ?? 0)} تومان · قابل استفاده`, d: CI.wallet, t: 'def' as Tone },
    { id: 'bank', title: 'کارت بانکی', sub: `پرداخت از درگاه${bank ? ` · ${bank.bankName} •••• ${faDigits(bank.iban.slice(-4))}` : ''}`, d: CI.bank, t: 'primary' as Tone },
    { id: 'fixed', title: 'فروش از صندوق درآمد ثابت', sub: `آزاد ${money(fixed?.free ?? 0)} تومان · تسویه ${fixedFund?.settlement ?? 'T+1'}`, d: KIND_ICON.fixed, t: 'secondary' as Tone },
  ];
  const picked = value === 'rial' ? rial : value === 'fixed' ? fixed : undefined;
  return (
    <>
      <div role="radiogroup" aria-label="منبع پرداخت" style={{ display: 'flex', flexDirection: 'column', gap: height < 50 ? 6 : 8, flex: 'none' }}>
        {items.map((s) => <RadioCard key={s.id} on={value === s.id} onClick={() => onChange(s.id)} d={s.d} tone={s.t} title={s.title} sub={s.sub} height={height} />)}
      </div>
      {picked && picked.locked > 0 && (
        <div className="row" style={{ minHeight: height < 50 ? 24 : 28, gap: 6, padding: '0 4px', fontSize: 11, lineHeight: 1.5, color: 'var(--text-secondary)', flex: 'none' }}>
          <Icon d={HOURGLASS} size={12} />
          <span className="num" style={{ flex: 1 }}>رزروشده: {money(picked.locked)} · پس از آزاد شدن قابل استفاده است</span>
          <Link href={routes.app.asset(picked.kind)} style={{ fontWeight: 700, color: 'var(--primary-text)', textDecoration: 'none', whiteSpace: 'nowrap' }}>جزئیات</Link>
        </div>
      )}
    </>
  );
}

/** Free amount of a payment source ('bank' = unlimited). */
export function sourceFree(source: string, portfolio?: Portfolio) {
  if (source === 'bank') return Infinity;
  return portfolio?.holdings.find((h) => h.kind === source)?.free ?? 0;
}

/** Card section title row used across these screens. */
export function SectionTitle({ children, end, style }: { children: ReactNode; end?: ReactNode; style?: CSSProperties }) {
  return (
    <div className="row" style={{ height: 24, gap: 8, ...style }}>
      <span style={{ fontSize: 15, fontWeight: 700, whiteSpace: 'nowrap' }}>{children}</span>
      {end}
    </div>
  );
}
