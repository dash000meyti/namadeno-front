'use client';
/**
 * Shared pieces of the login / signup flows (design: app-login, app-signup).
 * Every step uses the same four fixed-height slots: title 56 · field 108 · row 44 · button 48.
 */
import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { Icon } from '@/components/ui/Icon';
import { enDigits, faDigits } from '@/lib/format';
import { P } from './meta';

export type Anim = '' | 'fwd' | 'back';

const ICON_PHONE = 'M8 3h8a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2M11 18h2';
const ICON_KEY = 'M15 7a4 4 0 1 1-3.9 5H9v2H7v2H4v-3l6.1-6.1A4 4 0 0 1 15 7M16 9h.01';
const ICON_ID = 'M3 6a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2zM8 11a2 2 0 1 0 0-4 2 2 0 0 0 0 4M5.5 16c.6-1.6 1.6-2.5 2.5-2.5s1.9.9 2.5 2.5M14 9h4M14 13h3';
const ICON_TIMER = 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18M12 8v4l3 2';
const ICON_WARN_SHIELD = 'M12 3l7 3v5c0 5-3 8-7 10-4-2-7-5-7-10V6zM12 9v4M12 16h.01';

/** Mobile (latin digits) → «۰۹۱۲ ۳۴۵ ۴۵۶۷» */
export function fmtMobile(m: string) {
  const d = m.replace(/\D/g, '');
  const parts = [d.slice(0, 4), d.slice(4, 7), d.slice(7, 11)].filter(Boolean);
  return faDigits(parts.join(' '));
}
export const validMobile = (m: string) => /^09\d{9}$/.test(m);

/** «۰۹۱۲•••۴۵۶۷» rendered LTR like the design. */
export function MaskedMobile({ mobile }: { mobile: string }) {
  const d = mobile.replace(/\D/g, '');
  return (
    <span className="num" style={{ display: 'inline-flex', direction: 'ltr', fontWeight: 500, color: 'var(--text-primary)' }}>
      <span>{faDigits(d.slice(0, 4))}</span><span>•••</span><span>{faDigits(d.slice(-4))}</span>
    </span>
  );
}

/** Page frame: logo, card with progress header, OTP warning note, footer links and the transparent top bar. */
export function AuthShell({ flowLabel, stepNum, stepTotal, children, showNote, footer, onBack }: {
  flowLabel: string; stepNum: number; stepTotal: number; children: React.ReactNode; showNote: boolean; footer: React.ReactNode; onBack?: () => void;
}) {
  return (
    <>
      <div className="scr" style={{ padding: '4px 20px 28px', gap: 20 }}>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12, paddingTop: 4 }}>
          <span style={{ width: 72, height: 72, borderRadius: 20, background: 'var(--brand-gradient)', boxShadow: 'var(--shadow-primary)', display: 'grid', placeItems: 'center', color: '#FFFFFF' }}>
            <svg viewBox="0 0 64 40" width="44" height="28" aria-hidden="true"><path d="M3 37 L19 3 H33 L25 20 L31 28 L45 3 H61 L45 37 H31 L39 20 L33 12 L17 37 Z" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinejoin="round" /></svg>
          </span>
          <span className="wm" style={{ fontSize: 32, fontWeight: 800, lineHeight: 1.1 }}>نمادنو</span>
          <span style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.5 }}>ارزش پول شما، در واحدهای صندوق</span>
        </div>

        <div className="card" style={{ boxSizing: 'border-box', padding: '18px 16px 20px', display: 'flex', flexDirection: 'column', gap: 16, overflow: 'hidden' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 12, fontWeight: 600 }}>
              <span style={{ color: 'var(--primary-text)' }}>{flowLabel}</span>
              <span className="num" style={{ color: 'var(--text-secondary)', fontWeight: 500 }}>مرحله {faDigits(stepNum)} از {faDigits(stepTotal)}</span>
            </div>
            <div aria-hidden="true" style={{ display: 'flex', gap: 6 }}>
              {Array.from({ length: stepTotal }, (_, i) => (
                <span key={i} style={{ flex: 1, height: 4, borderRadius: 4, background: i < stepNum ? 'var(--primary-main)' : 'var(--progress-track)', transition: 'background .3s' }} />
              ))}
            </div>
          </div>
          {children}
        </div>

        <div role="note" aria-hidden={!showNote} style={{ height: 44, boxSizing: 'border-box', padding: '0 14px', borderRadius: 12, background: 'var(--soft-warning)', color: 'var(--warning-text)', display: 'flex', alignItems: 'center', gap: 8, opacity: showNote ? 1 : 0, transform: `translateY(${showNote ? '0' : '-6px'})`, transition: 'opacity .35s .1s, transform .35s .1s' }}>
          <Icon d={ICON_WARN_SHIELD} size={18} />
          <span style={{ fontSize: 12.5, fontWeight: 600, lineHeight: 1.6, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>کد تأیید را به هیچ‌کس، حتی پشتیبانی، ندهید.</span>
        </div>

        {footer}
        <div style={{ marginTop: 'auto', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
          <span style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.5 }}>
            پشتیبانی: <a href="tel:02191000000" className="num" style={{ display: 'inline-flex', direction: 'ltr', gap: 4, fontWeight: 600, color: 'var(--text-primary)' }}><span>۰۲۱</span><span>۹۱۰۰۰۰۰۰</span></a>
          </span>
        </div>
      </div>
      <header className="top" style={{ borderBottom: 0, background: 'transparent' }}>
        {onBack && (
          <button className="ibtn" aria-label="مرحله قبل" onClick={onBack} style={{ marginLeft: -4 }}>
            <Icon d={P.back} size={24} />
          </button>
        )}
        <span style={{ flex: 1 }} />
      </header>
    </>
  );
}

export function AuthFooterLink({ text, linkText, href }: { text: string; linkText: string; href: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, fontSize: 13, flex: 'none' }}>
      <span style={{ color: 'var(--text-secondary)' }}>{text}</span>
      <Link href={href} style={{ fontWeight: 700 }}>{linkText}</Link>
    </div>
  );
}

/** Step wrapper with the slide animation class. */
export function Step({ anim, children }: { anim: Anim; children: React.ReactNode }) {
  return <div className={anim === 'back' ? 'stp-back' : anim === 'fwd' ? 'stp-fwd' : ''} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>{children}</div>;
}

export function StepTitle({ title, sub }: { title: string; sub: React.ReactNode }) {
  return (
    <div style={{ height: 56, display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
      <h3 style={{ margin: 0, fontSize: 20, fontWeight: 700, lineHeight: '28px' }}>{title}</h3>
      <span style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: '22px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{sub}</span>
    </div>
  );
}

/** Primary 48px step button with the forward arrow. Disabled → 48% opacity like the design. */
export function StepButton({ label, onClick, disabled, busy }: { label: string; onClick: () => void; disabled?: boolean; busy?: boolean }) {
  const off = disabled || busy;
  return (
    <button
      className="btn"
      type="button"
      onClick={onClick}
      aria-disabled={off ? true : undefined}
      aria-busy={busy ? true : undefined}
      style={{ height: 48, width: '100%', boxSizing: 'border-box', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, background: 'var(--primary-main)', color: 'var(--primary-contrast)', fontSize: 15, boxShadow: off ? 'none' : 'var(--shadow-primary)', opacity: disabled ? 0.48 : busy ? 0.72 : 1, cursor: busy ? 'progress' : 'pointer' }}
    >
      {busy ? 'لطفاً صبر کنید…' : label}
      <Icon d={P.arrowFwd} size={18} strokeWidth={2} />
    </button>
  );
}

/** Help line under a field (22px). */
function Help({ text, error, success }: { text: React.ReactNode; error?: boolean; success?: boolean }) {
  return (
    <span role={error ? 'alert' : 'note'} style={{ height: 22, fontSize: 12, lineHeight: '22px', color: error ? 'var(--error-text)' : success ? 'var(--success-text)' : 'var(--text-secondary)', fontWeight: error || success ? 600 : 400, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{text}</span>
  );
}

/** Phone number field (108px slot). Value is latin digits. */
export function PhoneField({ value, onChange, help, error, onEnter }: { value: string; onChange: (v: string) => void; help: string; error?: string; onEnter?: () => void }) {
  return (
    <label style={{ height: 108, boxSizing: 'border-box', display: 'flex', flexDirection: 'column', gap: 6 }}>
      <span style={{ height: 20, fontSize: 13, fontWeight: 600, lineHeight: '20px' }}>شماره موبایل</span>
      <span style={{ height: 54, boxSizing: 'border-box', padding: '0 12px', borderRadius: 12, border: `1.5px solid ${error ? 'var(--error-main)' : 'var(--outline-border)'}`, background: 'var(--bg-paper)', display: 'flex', alignItems: 'center', gap: 10 }}>
        <Icon d={ICON_PHONE} size={20} style={{ color: 'var(--text-secondary)' }} />
        <input
          type="tel" inputMode="numeric" dir="ltr" autoComplete="tel-national" aria-label="شماره موبایل" className="num" placeholder="۰۹۱۲ ۳۴۵ ۴۵۶۷"
          value={fmtMobile(value)}
          onChange={(e: React.ChangeEvent<HTMLInputElement>) => onChange(enDigits(e.target.value).replace(/\D/g, '').slice(0, 11))}
          onKeyDown={(e: React.KeyboardEvent<HTMLInputElement>) => { if (e.key === 'Enter' && onEnter) onEnter(); }}
          style={{ flex: 1, minWidth: 0, height: 44, border: 0, background: 'transparent', color: 'var(--text-primary)', fontFamily: 'inherit', fontSize: 18, fontWeight: 400, outline: 'none', padding: 0, textAlign: 'left', letterSpacing: '.5px' }}
        />
        <span className="chip" dir="ltr">+۹۸</span>
      </span>
      <Help text={error || help} error={!!error} />
    </label>
  );
}

/** National-ID field (signup step 1). */
export function NidField({ value, onChange, error, onEnter }: { value: string; onChange: (v: string) => void; error?: string; onEnter?: () => void }) {
  return (
    <label style={{ height: 108, boxSizing: 'border-box', display: 'flex', flexDirection: 'column', gap: 6 }}>
      <span style={{ height: 20, fontSize: 13, fontWeight: 600, lineHeight: '20px' }}>کد ملی</span>
      <span style={{ height: 54, boxSizing: 'border-box', padding: '0 12px', borderRadius: 12, border: `1.5px solid ${error ? 'var(--error-main)' : 'var(--outline-border)'}`, background: 'var(--bg-paper)', display: 'flex', alignItems: 'center', gap: 10 }}>
        <Icon d={ICON_ID} size={20} style={{ color: 'var(--text-secondary)' }} />
        <input
          type="text" inputMode="numeric" dir="ltr" aria-label="کد ملی" maxLength={10} className="num" placeholder="۰۰۱۲۳۴۵۶۷۸"
          value={faDigits(value)}
          onChange={(e: React.ChangeEvent<HTMLInputElement>) => onChange(enDigits(e.target.value).replace(/\D/g, '').slice(0, 10))}
          onKeyDown={(e: React.KeyboardEvent<HTMLInputElement>) => { if (e.key === 'Enter' && onEnter) onEnter(); }}
          style={{ flex: 1, minWidth: 0, height: 44, border: 0, background: 'transparent', color: 'var(--text-primary)', fontFamily: 'inherit', fontSize: 18, fontWeight: 400, outline: 'none', padding: 0, textAlign: 'left', letterSpacing: 2 }}
        />
      </span>
      <Help text={error || 'باید با شماره موبایل مرحله بعد به نام خودتان باشد'} error={!!error} />
    </label>
  );
}

/**
 * OTP boxes backed by one real input (keyboard, paste and SMS autofill all work).
 * `boxClass` = `otpbox` (54px, auth) — KYC passes its own height.
 */
export function OtpBoxes({ value, onChange, length = 5, label, height = 54, fontSize, onComplete, autoFocus, error }: {
  value: string; onChange: (v: string) => void; length?: number; label: string; height?: number; fontSize?: number; onComplete?: (v: string) => void; autoFocus?: boolean; error?: boolean;
}) {
  const ref = useRef<HTMLInputElement | null>(null);
  const [focus, setFocus] = useState(false);
  useEffect(() => { if (autoFocus) ref.current?.focus(); }, [autoFocus]);
  const filled = value.length === length;
  return (
    <div dir="ltr" onClick={() => ref.current?.focus()} style={{ position: 'relative', height, display: 'grid', gridTemplateColumns: `repeat(${length}, minmax(0, 1fr))`, gap: 8, cursor: 'text' }}>
      {Array.from({ length }, (_, i) => {
        const ch = value[i];
        const active = focus && (i === value.length || (filled && i === length - 1));
        const bd = error ? 'var(--error-main)' : ch || active || (!focus && i === 0 && !value) ? 'var(--primary-main)' : 'var(--outline-border)';
        const bg = filled && !error ? 'var(--soft-primary)' : 'var(--bg-paper)';
        return <span key={i} className="otpbox" style={{ height, border: `1.5px solid ${bd}`, background: bg, ...(fontSize ? { fontSize } : null) }}>{ch ? faDigits(ch) : ''}</span>;
      })}
      <input
        ref={ref}
        type="text" inputMode="numeric" autoComplete="one-time-code" aria-label={label} maxLength={length}
        value={value}
        onFocus={() => setFocus(true)} onBlur={() => setFocus(false)}
        onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
          const v = enDigits(e.target.value).replace(/\D/g, '').slice(0, length);
          onChange(v);
          if (v.length === length && onComplete) onComplete(v);
        }}
        style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', opacity: 0, border: 0, padding: 0, margin: 0, color: 'transparent', background: 'transparent', caretColor: 'transparent', fontSize: 16 }}
      />
    </div>
  );
}

/** OTP field slot (108px) with countdown help line and dev-code hint. */
export function OtpField({ value, onChange, seconds, resent, devCode, error, onComplete }: {
  value: string; onChange: (v: string) => void; seconds: number; resent: boolean; devCode?: string; error?: string; onComplete?: (v: string) => void;
}) {
  const mm = `${faDigits(String(Math.floor(seconds / 60)).padStart(2, '0'))}:${faDigits(String(seconds % 60).padStart(2, '0'))}`;
  const help = error ? error : seconds > 0 ? (resent ? `کد جدید ارسال شد · ${mm} تا ارسال دوباره` : `${mm} تا امکان ارسال مجدد`) : 'می‌توانید کد را دوباره دریافت کنید';
  const color = error ? 'var(--error-text)' : resent && seconds > 0 ? 'var(--success-text)' : 'var(--text-secondary)';
  return (
    <div style={{ height: 108, boxSizing: 'border-box', display: 'flex', flexDirection: 'column', gap: 6 }}>
      <span style={{ height: 20, fontSize: 13, fontWeight: 600, lineHeight: '20px' }}>کد تأیید</span>
      <OtpBoxes value={value} onChange={onChange} label="کد تأیید ۵ رقمی" onComplete={onComplete} autoFocus error={!!error} />
      <span role={error ? 'alert' : undefined} style={{ height: 22, display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, lineHeight: '22px', color, whiteSpace: 'nowrap', fontWeight: error ? 600 : 400 }}>
        <Icon d={ICON_TIMER} size={16} />
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{help}</span>
        {devCode && <span className="num" style={{ marginRight: 'auto', fontSize: 11, color: 'var(--text-secondary)', fontWeight: 500 }}>کد آزمایشی: {faDigits(devCode)}</span>}
      </span>
    </div>
  );
}

/** Countdown helper for OTP resend. */
export function useCountdown() {
  const [left, setLeft] = useState(0);
  useEffect(() => {
    if (left <= 0) return;
    const t = setTimeout(() => setLeft((s) => Math.max(0, s - 1)), 1000);
    return () => clearTimeout(t);
  }, [left]);
  return [left, setLeft] as const;
}

/** Password field (108px slot) with show/hide. */
export function PasswordField({ label, value, onChange, help, helpTone, onEnter, autoComplete = 'current-password' }: {
  label: string; value: string; onChange: (v: string) => void; help: string; helpTone?: 'error' | 'success'; onEnter?: () => void; autoComplete?: string;
}) {
  const [show, setShow] = useState(false);
  const filled = value.length > 0;
  return (
    <div style={{ height: 108, boxSizing: 'border-box', display: 'flex', flexDirection: 'column', gap: 6 }}>
      <span style={{ height: 20, fontSize: 13, fontWeight: 600, lineHeight: '20px' }}>{label}</span>
      <span style={{ height: 54, boxSizing: 'border-box', padding: '0 4px 0 12px', borderRadius: 12, border: `1.5px solid ${helpTone === 'error' ? 'var(--error-main)' : filled ? 'var(--primary-main)' : 'var(--outline-border)'}`, background: 'var(--bg-paper)', display: 'flex', alignItems: 'center', gap: 10 }}>
        <Icon d={ICON_KEY} size={20} style={{ color: 'var(--text-secondary)' }} />
        <input
          type={show ? 'text' : 'password'} aria-label={label} className="num" autoComplete={autoComplete}
          dir={filled ? 'ltr' : 'rtl'} placeholder="رمز عبور را وارد کنید"
          value={value}
          onChange={(e: React.ChangeEvent<HTMLInputElement>) => onChange(e.target.value)}
          onKeyDown={(e: React.KeyboardEvent<HTMLInputElement>) => { if (e.key === 'Enter' && onEnter) onEnter(); }}
          style={{ flex: 1, minWidth: 0, height: 44, border: 0, background: 'transparent', padding: 0, fontFamily: 'inherit', fontSize: filled && !show ? 22 : 15, letterSpacing: filled && !show ? '2px' : 0, color: 'var(--text-primary)', textAlign: filled ? 'left' : 'right', outline: 'none' }}
        />
        <button type="button" className="ibtn" onClick={() => setShow((s) => !s)} aria-label={show ? 'پنهان کردن رمز' : 'نمایش رمز'} aria-pressed={show} style={{ width: 44, height: 44, border: 0, background: 'transparent', color: 'var(--text-secondary)', display: 'grid', placeItems: 'center', cursor: 'pointer', flex: 'none' }}>
          <Icon d={show ? P.eyeOff : 'M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6'} size={20} />
        </button>
      </span>
      <Help text={help} error={helpTone === 'error'} success={helpTone === 'success'} />
    </div>
  );
}

/** Password strength rules (design chips). */
export function pwRules(pw: string) {
  return [
    { t: '۸ کاراکتر یا بیشتر', ok: pw.length >= 8 },
    { t: 'حرف و عدد', ok: /[A-Za-z؀-ۿ]/.test(pw) && /[0-9۰-۹]/.test(pw) },
    { t: 'یک نماد مثل @', ok: /[^A-Za-z0-9؀-ۿ۰-۹\s]/.test(pw) },
  ];
}

export function PwRules({ pw }: { pw: string }) {
  return (
    <div style={{ height: 44, display: 'flex', alignItems: 'center', gap: 6 }} aria-label="شرایط رمز عبور">
      {pwRules(pw).map((r) => (
        <span key={r.t} style={{ height: 28, boxSizing: 'border-box', padding: '0 8px', borderRadius: 8, background: r.ok ? 'var(--soft-success)' : 'var(--soft-default)', color: r.ok ? 'var(--success-text)' : 'var(--text-secondary)', fontSize: 11.5, fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: 4, whiteSpace: 'nowrap', transition: 'background .3s, color .3s' }}>
          <Icon d={r.ok ? P.check : 'M12 12h.01'} size={14} strokeWidth={2} />{r.t}
        </span>
      ))}
    </div>
  );
}

/** Text link button used in the 44px action row (resend, forgot, …). */
export function RowLink({ d, label, onClick, color = 'var(--primary-text)', end, disabled }: { d: string; label: string; onClick: () => void; color?: string; end?: boolean; disabled?: boolean }) {
  return (
    <button type="button" onClick={onClick} aria-disabled={disabled ? true : undefined} style={{ ...(end ? { marginRight: 'auto' } : null), height: 44, border: 0, background: 'transparent', padding: '0 4px', fontFamily: 'inherit', fontSize: 13, fontWeight: 600, cursor: disabled ? 'default' : 'pointer', display: 'inline-flex', alignItems: 'center', gap: 4, color: disabled ? 'var(--text-disabled)' : color }}>
      <Icon d={d} size={16} />{label}
    </button>
  );
}

/** Checkbox in the design style («مرا به خاطر بسپار» / «قوانین را می‌پذیرم»). */
export function CheckBox({ checked, onToggle, label, error }: { checked: boolean; onToggle: () => void; label: string; error?: boolean }) {
  return (
    <button type="button" role="checkbox" aria-checked={checked} onClick={onToggle} style={{ height: 44, display: 'inline-flex', alignItems: 'center', gap: 10, border: 0, background: 'transparent', padding: 0, fontFamily: 'inherit', fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', cursor: 'pointer' }}>
      <span style={{ width: 22, height: 22, boxSizing: 'border-box', borderRadius: 6, border: `1.5px solid ${checked ? 'var(--primary-main)' : error ? 'var(--error-main)' : 'var(--outline-border)'}`, background: checked ? 'var(--primary-main)' : 'var(--bg-paper)', color: 'var(--primary-contrast)', display: 'grid', placeItems: 'center', flex: 'none' }}>
        {checked && <Icon d={P.check} size={14} strokeWidth={2.4} />}
      </span>
      {label}
    </button>
  );
}

export const AUTH_ICONS = {
  resend: 'M20 12a8 8 0 1 1-2.34-5.66M20 4v4h-4',
  edit: 'M4 20h4l11-11-4-4L4 16zM13 7l4 4',
  mail: 'M4 6h16v12H4zM4 7l8 6 8-6',
  lock: P.lock,
};
