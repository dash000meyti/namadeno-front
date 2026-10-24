'use client';
/** Operator console sign-in — shared sign-in layout (AuthLayout), same card language as the app and the org panel. */
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useOpLogin } from '@/api/auth';
import { Icon } from '@/components/ui/Icon';
import { useToast } from '@/components/ui/Toast';
import { AuthField, AuthLayout, CheckRow, PasswordToggle } from '@/components/ui/AuthLayout';
import { routes } from '@/lib/routes';
import { errMsg } from '@/components/op/core/ui';

const KEY = 'M14 10a4 4 0 1 0-3.9 3.1L4 19v1h3l1-1v-2h2l1-1 .5-.5a4 4 0 0 0 2.5.5M15.5 8.5h.01';
const MAIL = 'M3 6h18v12H3zM3 7l9 6 9-6';
const LOCK = 'M6 11V8a6 6 0 0 1 12 0v3M5 11h14v10H5zM12 15v2';
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function OpLoginPage() {
  const router = useRouter();
  const toast = useToast();
  const login = useOpLogin();
  const [email, setEmail] = useState('ali.naderi@namadno.ir');
  const [password, setPassword] = useState('namadno-2026');
  const [show, setShow] = useState(false);
  const [remember, setRemember] = useState(true);
  const [error, setError] = useState('');

  const submit = (sso = false) => {
    if (!sso) {
      if (!EMAIL_RE.test(email.trim())) { setError('ایمیل سازمانی معتبر وارد کنید.'); return; }
      if (!password) { setError('رمز عبور را وارد کنید.'); return; }
    }
    setError('');
    login.mutate({ email: email.trim() || 'sso@namadno.ir', password: sso ? 'sso' : password }, {
      onSuccess: () => router.replace(routes.op.overview),
      onError: (e) => setError(errMsg(e)),
    });
  };

  return (
    <AuthLayout
      tag="کنسول بهره‌بردار"
      foot={<><span>دسترسی فقط برای تیم بهره‌بردار؛ هر ورود در لاگ امنیتی ثبت می‌شود</span><span className="num" dir="ltr">v2.8.0</span></>}
    >
      <form className="nm-auth-card" noValidate onSubmit={(e) => { e.preventDefault(); submit(); }} aria-labelledby="op-login-title">
        <h1 id="op-login-title">ورود به کنسول</h1>

        <AuthField label="ایمیل سازمانی" icon={MAIL} htmlFor="op-email">
          <input id="op-email" type="email" dir="ltr" autoComplete="username" value={email} onChange={(e) => { setEmail(e.target.value); setError(''); }} style={{ textAlign: 'right' }} />
        </AuthField>
        <AuthField
          label="رمز عبور" icon={LOCK} htmlFor="op-pass"
          action={<button type="button" className="x" onClick={() => toast('لینک بازنشانی رمز به ایمیل سازمانی ارسال شد')}>فراموشی رمز</button>}
        >
          <input id="op-pass" type={show ? 'text' : 'password'} dir="ltr" autoComplete="current-password" value={password} onChange={(e) => { setPassword(e.target.value); setError(''); }} style={{ textAlign: 'right', letterSpacing: show ? 0 : '.12em' }} />
          <PasswordToggle shown={show} onToggle={() => setShow((x) => !x)} />
        </AuthField>
        <CheckRow checked={remember} onToggle={() => setRemember((x) => !x)} label="مرا در این دستگاه به خاطر بسپار (۳۰ روز)" />

        {error && <div role="alert" className="nm-note err"><Icon name="risk" size={18} /><span>{error}</span></div>}

        <button type="submit" className="nm-btn lg block" disabled={login.isPending}>{login.isPending ? 'در حال ورود…' : 'ورود'}</button>
        <div className="nm-divider">یا</div>
        <button type="button" className="nm-btn lg block line" disabled={login.isPending} onClick={() => submit(true)}><Icon d={KEY} size={18} />ورود با SSO سازمانی</button>
      </form>
    </AuthLayout>
  );
}
