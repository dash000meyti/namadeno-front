'use client';
/** Organization panel login (design: org-login). */
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useOrgLogin } from '@/api/auth';
import { Icon, LogoMark } from '@/components/ui/Icon';
import { useColorMode } from '@/theme/ColorModeProvider';
import { routes } from '@/lib/routes';
import { enDigits } from '@/lib/format';
import { errMsg } from '@/components/org/people/shared';

const MOON = 'M20.5 14.2A8.5 8.5 0 0 1 9.8 3.5a8.5 8.5 0 1 0 10.7 10.7';
const SUN = 'M12 16.5a4.5 4.5 0 1 0 0-9 4.5 4.5 0 0 0 0 9M12 2.5v2.5M12 19v2.5M2.5 12H5M19 12h2.5M5.3 5.3l1.8 1.8M16.9 16.9l1.8 1.8M5.3 18.7l1.8-1.8M16.9 7.1l1.8-1.8';
const EYE = 'M2 12c1-2.5 5-7 10-7s9 4.5 10 7c-1 2.5-5 7-10 7S3 14.5 2 12zM12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6';
const EYE_OFF = 'M3 3l18 18M10.6 10.6a2 2 0 0 0 2.8 2.8M9.9 5.1A10.5 10.5 0 0 1 12 5c5 0 9 4.5 10 7-.4 1-1.3 2.4-2.7 3.7M6.6 6.6C4.3 8 2.7 10.2 2 12c1 2.5 5 7 10 7 1.5 0 2.9-.4 4.1-1';
const ORGS: Record<string, string> = { 'ARM-1404': 'هلدینگ آرمان' };

export default function OrgLoginPage() {
  const router = useRouter();
  const { mode, toggle } = useColorMode();
  const login = useOrgLogin();
  const [orgCode, setOrgCode] = useState('ARM-1404');
  const [email, setEmail] = useState('nima.rezaei@arman.co');
  const [password, setPassword] = useState('Arman@1405');
  const [showPw, setShowPw] = useState(false);
  const [remember, setRemember] = useState(true);
  const [touched, setTouched] = useState(false);
  const [forgot, setForgot] = useState(false);

  const orgName = ORGS[orgCode.trim().toUpperCase()];
  const errors = {
    org: !orgCode.trim() ? 'کد سازمان را وارد کنید' : !orgName ? 'سازمانی با این کد پیدا نشد' : '',
    email: !email.trim() ? 'ایمیل سازمانی را وارد کنید' : !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()) ? 'ایمیل معتبر نیست' : '',
    password: !password ? 'رمز عبور را وارد کنید' : password.length < 6 ? 'رمز عبور حداقل ۶ کاراکتر است' : '',
  };
  const invalid = !!(errors.org || errors.email || errors.password);

  const submit = (e?: React.FormEvent) => {
    e?.preventDefault();
    setTouched(true);
    if (invalid || login.isPending) return;
    login.mutate({ email: email.trim(), password: enDigits(password) }, {
      onSuccess: () => router.replace(routes.org.dashboard),
    });
  };

  const fieldErr = (msg: string) => (touched && msg ? <span role="alert" style={{ fontSize: 11, color: 'var(--error-text)', lineHeight: '18px' }}>{msg}</span> : null);
  const border = (msg: string) => (touched && msg ? { borderColor: 'var(--error-main)' } : undefined);

  return (
    <div className="s-org" dir="rtl" style={{ minHeight: '100dvh', overflow: 'hidden', position: 'relative', background: 'var(--bg-default)', backgroundImage: 'var(--bg-aurora)', color: 'var(--text-primary)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '96px 16px 72px', boxSizing: 'border-box' }}>
      {/* Top-left controls */}
      <div style={{ position: 'absolute', top: 20, left: 24, display: 'flex', alignItems: 'center', gap: 4 }}>
        <button className="ibtn" aria-label="تغییر تم" onClick={toggle} style={{ background: 'var(--glass-bg)', boxShadow: '0 0 0 1px var(--glass-edge)' }}>
          <Icon d={mode === 'dark' ? SUN : MOON} size={22} />
        </button>
      </div>

      {/* Brand */}
      <div style={{ position: 'absolute', top: 24, right: 32, display: 'flex', alignItems: 'center', gap: 12 }}>
        <LogoMark />
        <span style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
          <span className="wm" style={{ fontSize: 22, fontWeight: 700, lineHeight: 1 }}>نمادنو</span>
          <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', lineHeight: 1 }}>· پنل سازمانی</span>
        </span>
      </div>

      {/* Card */}
      <form onSubmit={submit} noValidate className="glass" style={{ width: 440, maxWidth: '100%', boxSizing: 'border-box', borderRadius: 20, padding: 32, display: 'flex', flexDirection: 'column', gap: 20 }}>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12, textAlign: 'center' }}>
          <span style={{ width: 56, height: 56, borderRadius: 16, background: 'var(--brand-gradient)', display: 'grid', placeItems: 'center', color: '#FFFFFF', boxShadow: 'var(--shadow-primary)' }}>
            <svg viewBox="0 0 64 40" width="34" height="21" aria-hidden="true"><path d="M3 37 L19 3 H33 L25 20 L31 28 L45 3 H61 L45 37 H31 L39 20 L33 12 L17 37 Z" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinejoin="round" /></svg>
          </span>
          <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700, lineHeight: 1.3 }}>ورود به پنل سازمانی</h1>
          <span style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.5 }}>مدیریت بسته‌های دارایی، تسهیلات و کارکنان سازمان شما</span>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
            <span className="flbl">کد سازمان</span>
            <span className="fld" style={{ height: 48, ...border(errors.org) }}>
              <Icon d="M5 21V4a1 1 0 0 1 1-1h8a1 1 0 0 1 1 1v17M15 9h3a1 1 0 0 1 1 1v11M3 21h18M9 7h2M9 11h2M9 15h2" size={18} style={{ color: 'var(--text-secondary)' }} />
              <input type="text" value={orgCode} onChange={(e) => setOrgCode(e.target.value)} aria-label="کد سازمان" aria-invalid={touched && !!errors.org} className="num" dir="ltr" autoComplete="organization" style={{ textAlign: 'right', fontWeight: 500 }} />
              {orgName && <span className="lbl" style={{ height: 22, padding: '0 7px', fontSize: 11, background: 'var(--soft-success)', color: 'var(--success-text)' }}>{orgName}</span>}
            </span>
            {fieldErr(errors.org)}
          </label>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
            <span className="flbl">ایمیل سازمانی</span>
            <span className="fld" style={{ height: 48, ...border(errors.email) }}>
              <Icon d="M3 6h18v12H3zM3 6l9 7 9-7" size={18} style={{ color: 'var(--text-secondary)' }} />
              <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} aria-label="ایمیل سازمانی" aria-invalid={touched && !!errors.email} className="num" dir="ltr" autoComplete="username" style={{ textAlign: 'right', fontWeight: 500 }} />
            </span>
            {fieldErr(errors.email)}
          </label>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
            <span className="flbl">رمز عبور</span>
            <span className="fld" style={{ height: 48, ...border(errors.password) }}>
              <Icon d="M6 11h12v9H6zM9 11V8a3 3 0 0 1 6 0v3M12 15v2" size={18} style={{ color: 'var(--text-secondary)' }} />
              <input type={showPw ? 'text' : 'password'} value={password} onChange={(e) => setPassword(e.target.value)} aria-label="رمز عبور" aria-invalid={touched && !!errors.password} className="num" dir="ltr" autoComplete="current-password" style={{ textAlign: 'right', fontWeight: 500, letterSpacing: showPw || !password ? 'normal' : '.12em' }} />
              <button type="button" className="ibtn" aria-label={showPw ? 'پنهان کردن رمز' : 'نمایش رمز'} aria-pressed={showPw} onClick={() => setShowPw((x) => !x)} style={{ width: 32, height: 32 }}>
                <Icon d={showPw ? EYE_OFF : EYE} size={18} />
              </button>
            </span>
            {fieldErr(errors.password)}
          </label>
          <div style={{ height: 24, display: 'flex', alignItems: 'center', gap: 10 }}>
            <button type="button" aria-pressed={remember} onClick={() => setRemember((x) => !x)} style={{ display: 'flex', alignItems: 'center', gap: 8, border: 0, background: 'transparent', padding: 0, fontFamily: 'inherit', fontSize: 13, color: 'var(--text-primary)', cursor: 'pointer' }}>
              <span className={'chk' + (remember ? ' on' : '')}>{remember && <Icon d="M5 12.5l4.5 4.5L19 7" size={12} strokeWidth={3} />}</span>مرا به خاطر بسپار
            </button>
            <button type="button" className="lg-link" onClick={() => setForgot((x) => !x)} aria-expanded={forgot} style={{ marginRight: 'auto', border: 0, background: 'transparent', padding: 0, fontFamily: 'inherit', color: 'var(--primary-text)', cursor: 'pointer' }}>فراموشی رمز</button>
          </div>
          {forgot && (
            <div role="status" style={{ fontSize: 12, lineHeight: 1.6, color: 'var(--text-secondary)', padding: '8px 12px', borderRadius: 10, background: 'var(--bg-neutral)' }}>
              برای بازنشانی رمز با مدیر حساب سازمان یا پشتیبانی سازمانی <span className="num" dir="ltr" style={{ fontWeight: 500 }}>۰۲۱-۹۱۰۰۰۰۰۰</span> تماس بگیرید.
            </div>
          )}
        </div>

        {login.isError && (
          <div role="alert" style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', borderRadius: 10, background: 'var(--soft-error)', color: 'var(--error-text)', fontSize: 12, lineHeight: 1.5 }}>
            <Icon d="M12 3l10 18H2zM12 10v5M12 18h.01" size={18} /><span>{errMsg(login.error)}</span>
          </div>
        )}

        <button type="submit" className="btn" disabled={login.isPending} style={{ height: 48, fontSize: 15, background: 'var(--primary-main)', color: 'var(--primary-contrast)', boxShadow: 'var(--shadow-primary)', opacity: login.isPending ? 0.7 : 1 }}>
          {login.isPending ? 'در حال ورود…' : 'ورود'}<Icon d="M14 6l-6 6 6 6" size={18} strokeWidth={2} />
        </button>

        <div style={{ display: 'flex', alignItems: 'center', gap: 10, boxSizing: 'border-box', padding: '10px 12px', borderRadius: 10, background: 'var(--soft-info)', color: 'var(--info-text)', fontSize: 12, lineHeight: 1.5 }}>
          <Icon d="M12 3l8 3v6c0 4.5-3.4 7.8-8 9-4.6-1.2-8-4.5-8-9V6zM9 12l2 2 4-4" size={18} />
          <span>ورود دو‌مرحله‌ای فعال است؛ پس از ورود، کد تأیید به موبایل شما پیامک می‌شود.</span>
        </div>
      </form>

      {/* Footer */}
      <div style={{ position: 'absolute', bottom: 20, left: 0, right: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 16, fontSize: 12, color: 'var(--text-secondary)', flexWrap: 'wrap', padding: '0 16px' }}>
        <span>دسترسی فقط برای کاربران مجاز سازمان‌های طرف قرارداد</span>
        <span style={{ width: 4, height: 4, borderRadius: '50%', background: 'var(--text-disabled)' }} />
        <span className="num" dir="ltr">v2.8.0</span>
        <span style={{ width: 4, height: 4, borderRadius: '50%', background: 'var(--text-disabled)' }} />
        <span>پشتیبانی سازمانی <span className="num" dir="ltr" style={{ fontWeight: 500 }}>۰۲۱-۹۱۰۰۰۰۰۰</span></span>
      </div>
    </div>
  );
}
