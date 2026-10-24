'use client';
/**
 * Organization panel sign-in — shared sign-in layout (AuthLayout), same card language as the app.
 * A user created with a temporary password (no SMS invite) sets their own password here before entering the panel.
 */
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useOrgLogin, useOrgSetPassword } from '@/api/auth';
import { getSession, setSession } from '@/api/client';
import { Icon } from '@/components/ui/Icon';
import { AuthField, AuthLayout, CheckRow, PasswordToggle } from '@/components/ui/AuthLayout';
import { routes } from '@/lib/routes';
import { enDigits } from '@/lib/format';
import { errMsg } from '@/components/org/people/shared';

const MAIL = 'M3 6h18v12H3zM3 6l9 7 9-7';
const LOCK = 'M6 11h12v9H6zM9 11V8a3 3 0 0 1 6 0v3M12 15v2';

export default function OrgLoginPage() {
  const router = useRouter();
  const login = useOrgLogin();
  const [email, setEmail] = useState('m.tehrani@arman.co');
  const [password, setPassword] = useState('Arman@1405');
  const [showPw, setShowPw] = useState(false);
  const [remember, setRemember] = useState(true);
  const [touched, setTouched] = useState(false);
  const [forgot, setForgot] = useState(false);
  // a session that still has a temporary password goes straight to «تعیین رمز عبور»
  const [mustChange, setMustChange] = useState(false);
  useEffect(() => { if (getSession('org_admin')?.mustChangePassword) setMustChange(true); }, []);

  const errors = {
    email: !email.trim() ? 'ایمیل سازمانی را وارد کنید' : !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()) ? 'ایمیل معتبر نیست' : '',
    password: !password ? 'رمز عبور را وارد کنید' : password.length < 6 ? 'رمز عبور حداقل ۶ کاراکتر است' : '',
  };
  const invalid = !!(errors.email || errors.password);
  const err = (k: keyof typeof errors) => (touched ? errors[k] : '');

  const submit = (e?: React.FormEvent) => {
    e?.preventDefault();
    setTouched(true);
    if (invalid || login.isPending) return;
    login.mutate({ email: email.trim(), password: enDigits(password) }, {
      onSuccess: (s) => { if (s.mustChangePassword) setMustChange(true); else router.replace(routes.org.dashboard); },
    });
  };

  if (mustChange) return <SetPassword onDone={() => router.replace(routes.org.dashboard)} />;

  return (
    <AuthLayout
      tag="پنل سازمانی"
      foot={<><span>دسترسی فقط برای سازمان‌های همراه نمادنو</span><span>پشتیبانی سازمانی <span className="num" dir="ltr">۰۲۱-۹۱۰۰۰۰۰۰</span></span></>}
    >
      <form onSubmit={submit} noValidate className="nm-auth-card" aria-labelledby="org-login-title">
        <h1 id="org-login-title">ورود سازمان‌ها</h1>

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
            <Icon name="info" size={18} />
            <span>برای بازنشانی رمز با مدیر حساب سازمان یا پشتیبانی سازمانی <span className="num" dir="ltr" style={{ fontWeight: 600 }}>۰۲۱-۹۱۰۰۰۰۰۰</span> تماس بگیرید.</span>
          </div>
        )}
        <CheckRow checked={remember} onToggle={() => setRemember((x) => !x)} label="مرا در این دستگاه به خاطر بسپار" />

        {login.isError && <div role="alert" className="nm-note err"><Icon name="risk" size={18} /><span>{errMsg(login.error)}</span></div>}

        <button type="submit" className="nm-btn lg block" disabled={login.isPending}>
          {login.isPending ? 'در حال ورود…' : 'ورود'}
        </button>
      </form>
    </AuthLayout>
  );
}

/** First login with a temporary password: choose a new password (≥ 8 characters, letters and digits) and repeat it. */
function SetPassword({ onDone }: { onDone: () => void }) {
  const save = useOrgSetPassword();
  const [pw, setPw] = useState('');
  const [again, setAgain] = useState('');
  const [show, setShow] = useState(false);
  const [touched, setTouched] = useState(false);
  const errors = {
    pw: !pw ? 'رمز عبور تازه را وارد کنید' : !/^(?=.*[A-Za-z])(?=.*\d).{8,}$/.test(enDigits(pw)) ? 'حداقل ۸ نویسه، شامل حرف لاتین و عدد' : '',
    again: !again ? 'رمز عبور را تکرار کنید' : again !== pw ? 'با رمز عبور تازه یکسان نیست' : '',
  };
  const err = (k: keyof typeof errors) => (touched ? errors[k] : '');
  const submit = (e?: React.FormEvent) => {
    e?.preventDefault();
    setTouched(true);
    if (errors.pw || errors.again || save.isPending) return;
    save.mutate({ password: enDigits(pw) }, {
      onSuccess: () => {
        const s = getSession('org_admin');
        if (s) setSession({ ...s, mustChangePassword: undefined }, 'org_admin');
        onDone();
      },
    });
  };
  const field = { className: 'num', dir: 'ltr' as const, style: { textAlign: 'right' as const, letterSpacing: show ? 'normal' : '.12em' } };
  return (
    <AuthLayout tag="پنل سازمانی" foot={<span>رمز موقت فقط برای اولین ورود است</span>}>
      <form onSubmit={submit} noValidate className="nm-auth-card" aria-labelledby="org-setpw-title">
        <h1 id="org-setpw-title">تعیین رمز عبور</h1>
        <p className="sub">برای ادامه، به‌جای رمز موقت یک رمز تازه انتخاب کنید.</p>
        <AuthField label="رمز عبور تازه" icon={LOCK} htmlFor="org-newpw" error={err('pw')}>
          <input id="org-newpw" type={show ? 'text' : 'password'} value={pw} onChange={(e) => setPw(e.target.value)} aria-invalid={!!err('pw')} autoComplete="new-password" autoFocus {...field} />
          <PasswordToggle shown={show} onToggle={() => setShow((x) => !x)} />
        </AuthField>
        <AuthField label="تکرار رمز عبور" icon={LOCK} htmlFor="org-newpw2" error={err('again')}>
          <input id="org-newpw2" type={show ? 'text' : 'password'} value={again} onChange={(e) => setAgain(e.target.value)} aria-invalid={!!err('again')} autoComplete="new-password" {...field} />
        </AuthField>
        {save.isError && <div role="alert" className="nm-note err"><Icon name="risk" size={18} /><span>{errMsg(save.error)}</span></div>}
        <button type="submit" className="nm-btn lg block" disabled={save.isPending}>{save.isPending ? 'در حال ذخیره…' : 'ذخیره و ورود'}</button>
      </form>
    </AuthLayout>
  );
}
