'use client';
/**
 * Shared sign-in layout for the organization panel and the operator console — the same language as the
 * app's sign-in: full logo, a surface tag, one card, labelled fields and a capsule button (ui.css: .nm-auth*).
 */
import Link from 'next/link';
import { Icon } from '@/components/ui/Icon';
import { LogoFull } from '@/components/ui/Brand';
import { Motif } from '@/components/ui/Motif';
import { useColorMode } from '@/theme/ColorModeProvider';

const SUN = 'M12 16.5a4.5 4.5 0 1 0 0-9 4.5 4.5 0 0 0 0 9M12 2.5v2.5M12 19v2.5M2.5 12H5M19 12h2.5M5.3 5.3l1.8 1.8M16.9 16.9l1.8 1.8M5.3 18.7l1.8-1.8M16.9 7.1l1.8-1.8';
const MOON = 'M20.5 14.2A8.5 8.5 0 0 1 9.8 3.5a8.5 8.5 0 1 0 10.7 10.7';
const EYE = 'M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6';
const EYE_OFF = 'M3 3l18 18M10.6 10.6a2 2 0 0 0 2.8 2.8M9.9 5.1A10.5 10.5 0 0 1 12 5c5 0 9 4.5 10 7-.4 1-1.3 2.4-2.7 3.7M6.6 6.6C4.3 8 2.7 10.2 2 12c1 2.5 5 7 10 7 1.5 0 2.9-.4 4.1-1';

export function AuthLayout({ tag, children, foot }: { tag: string; children: React.ReactNode; foot?: React.ReactNode }) {
  const { mode, toggle } = useColorMode();
  return (
    <div className="nm-auth" dir="rtl">
      <Motif variant="grid" />
      <div className="nm-auth-top">
        <Link href="/"><Icon name="back" size={16} />بازگشت به نمادنو</Link>
        <button type="button" className="nm-ib" onClick={toggle} aria-label={mode === 'dark' ? 'تم روشن' : 'تم تیره'} style={{ marginRight: 'auto' }}>
          <Icon d={mode === 'dark' ? SUN : MOON} size={20} />
        </button>
      </div>
      <div className="nm-auth-brand">
        <LogoFull height={38} />
        <span className="tag">{tag}</span>
      </div>
      {children}
      {foot && <div className="nm-auth-foot">{foot}</div>}
    </div>
  );
}

/** Labelled field with an icon; `action` sits at the end of the label row (e.g. «فراموشی رمز»). */
export function AuthField({ label, icon, htmlFor, action, error, help, children }: { label: string; icon: string; htmlFor: string; action?: React.ReactNode; error?: string; help?: string; children: React.ReactNode }) {
  return (
    <div className="nm-field">
      <span className="l"><label htmlFor={htmlFor}>{label}</label>{action}</span>
      <span className={'nm-ctl' + (error ? ' err' : '')}>
        <Icon d={icon} size={20} />
        {children}
      </span>
      {(error || help) && <span className={'nm-help' + (error ? ' err' : '')} role={error ? 'alert' : undefined}>{error || help}</span>}
    </div>
  );
}

export function PasswordToggle({ shown, onToggle }: { shown: boolean; onToggle: () => void }) {
  return (
    <button type="button" className="nm-ib" aria-label={shown ? 'پنهان کردن رمز' : 'نمایش رمز'} aria-pressed={shown} onClick={onToggle}>
      <Icon d={shown ? EYE_OFF : EYE} size={20} />
    </button>
  );
}

export function CheckRow({ checked, onToggle, label }: { checked: boolean; onToggle: () => void; label: string }) {
  return (
    <button type="button" className="nm-check" aria-pressed={checked} onClick={onToggle}>
      <i>{checked && <Icon d="M5 12.5l4.5 4.5L19 7" size={13} strokeWidth={3} />}</i>{label}
    </button>
  );
}
