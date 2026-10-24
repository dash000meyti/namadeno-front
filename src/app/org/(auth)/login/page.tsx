'use client';
/** Organization panel sign-in — shared sign-in layout (AuthLayout), same card language as the app. */
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useOrgLogin } from '@/api/auth';
import { Icon } from '@/components/ui/Icon';
import { AuthField, AuthLayout, CheckRow, PasswordToggle } from '@/components/ui/AuthLayout';
import { routes } from '@/lib/routes';
import { enDigits } from '@/lib/format';
import { errMsg } from '@/components/org/people/shared';

const BUILDING = 'M5 21V4a1 1 0 0 1 1-1h8a1 1 0 0 1 1 1v17M15 9h3a1 1 0 0 1 1 1v11M3 21h18M9 7h2M9 11h2M9 15h2';
const MAIL = 'M3 6h18v12H3zM3 6l9 7 9-7';
const LOCK = 'M6 11h12v9H6zM9 11V8a3 3 0 0 1 6 0v3M12 15v2';
const SHIELD = 'M12 3l8 3v6c0 4.5-3.4 7.8-8 9-4.6-1.2-8-4.5-8-9V6zM9 12l2 2 4-4';
const ORGS: Record<string, string> = { 'ARM-1404': 'هلدینگ آرمان' };

export default function OrgLoginPage() {
  const router = useRouter();
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
  const err = (k: keyof typeof errors) => (touched ? errors[k] : '');

  const submit = (e?: React.FormEvent) => {
    e?.preventDefault();
    setTouched(true);
    if (invalid || login.isPending) return;
    login.mutate({ email: email.trim(), password: enDigits(password) }, {
      onSuccess: () => router.replace(routes.org.dashboard),
    });
  };

  return (
    <AuthLayout
      tag="پنل سازمانی"
      foot={<><span>دسترسی فقط برای سازمان‌های همراه نمادنو</span><span>پشتیبانی سازمانی <span className="num" dir="ltr">۰۲۱-۹۱۰۰۰۰۰۰</span></span></>}
    >
      <form onSubmit={submit} noValidate className="nm-auth-card" aria-labelledby="org-login-title">
        <h1 id="org-login-title">ورود سازمان‌ها</h1>
        <p className="sub">پاداش‌ها، همکاران و گزارش‌های سازمان‌تان را از اینجا مدیریت کنید.</p>

        <AuthField label="کد سازمان" icon={BUILDING} htmlFor="org-code" error={err('org')}>
          <input id="org-code" type="text" value={orgCode} onChange={(e) => setOrgCode(e.target.value)} aria-invalid={!!err('org')} className="num" dir="ltr" autoComplete="organization" style={{ textAlign: 'right', fontWeight: 500 }} />
          {orgName && <span className="lbl" style={{ height: 24, fontSize: 11.5, background: 'var(--soft-success)', color: 'var(--success-text)' }}>{orgName}</span>}
        </AuthField>
        <AuthField label="ایمیل سازمانی" icon={MAIL} htmlFor="org-email" error={err('email')}>
          <input id="org-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} aria-invalid={!!err('email')} className="num" dir="ltr" autoComplete="username" style={{ textAlign: 'right' }} />
        </AuthField>
        <AuthField
          label="رمز عبور" icon={LOCK} htmlFor="org-pass" error={err('password')}
          action={<button type="button" className="x" onClick={() => setForgot((x) => !x)} aria-expanded={forgot}>فراموشی رمز</button>}
        >
          <input id="org-pass" type={showPw ? 'text' : 'password'} value={password} onChange={(e) => setPassword(e.target.value)} aria-invalid={!!err('password')} className="num" dir="ltr" autoComplete="current-password" style={{ textAlign: 'right', letterSpacing: showPw || !password ? 'normal' : '.12em' }} />
          <PasswordToggle shown={showPw} onToggle={() => setShowPw((x) => !x)} />
        </AuthField>
        {forgot && (
          <div role="status" className="nm-note mute">
            برای بازنشانی رمز با مدیر حساب سازمان یا پشتیبانی سازمانی <span className="num" dir="ltr" style={{ fontWeight: 600 }}>۰۲۱-۹۱۰۰۰۰۰۰</span> تماس بگیرید.
          </div>
        )}
        <CheckRow checked={remember} onToggle={() => setRemember((x) => !x)} label="مرا در این دستگاه به خاطر بسپار" />

        {login.isError && <div role="alert" className="nm-note err"><Icon name="risk" size={18} /><span>{errMsg(login.error)}</span></div>}

        <button type="submit" className="nm-btn lg block" disabled={login.isPending}>
          {login.isPending ? 'در حال ورود…' : 'ورود'}
        </button>
        <div className="nm-note info"><Icon d={SHIELD} size={18} /><span>ورود دومرحله‌ای فعال است؛ پس از ورود، کد تأیید به موبایل شما پیامک می‌شود.</span></div>
      </form>
    </AuthLayout>
  );
}
