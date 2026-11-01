'use client';
/**
 * Organization panel sign-in — shared sign-in layout (AuthLayout), same card language as the app.
 * One Namadno account per person: members with panel access sign in with their national ID and the password of their
 * Namadno account (the same password as in the app). «فراموشی رمز» — and «فعال‌سازی حساب» for a member who has not
 * activated the account yet — opens a step in the same card: a code to the account's mobile, then a new password
 * (it also works in the app) and straight into the panel.
 */
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useOrgLogin, useOrgRequestOtp, useOrgResetPassword } from '@/api/auth';
import { ApiRequestError } from '@/api/client';
import { Icon } from '@/components/ui/Icon';
import { AuthField, AuthLayout, CheckRow, PasswordToggle } from '@/components/ui/AuthLayout';
import { OtpBoxes, useCountdown } from '@/components/app/core/auth';
import { errMsg } from '@/components/org/people/shared';
import { routes } from '@/lib/routes';
import { enDigits, faDigits, nidOk } from '@/lib/format';

const ID_CARD = 'M3 5h18v14H3zM7 10h4M7 14h6M15 9.5a1.5 1.5 0 1 0 0 .01M14 15h3';
const LOCK = 'M6 11h12v9H6zM9 11V8a3 3 0 0 1 6 0v3M12 15v2';
const TIMER = 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18M12 8v4l3 2';
/** Demo: مهسا تهرانی, administrator of هلدینگ آرمان (src/mocks/seed/platform.ts). */
const DEMO_NID = '0025679010';
const PW_RULE = 'حداقل ۸ نویسه، شامل حرف و عدد';

const onlyDigits = (s: string) => enDigits(s).replace(/\D/g, '').slice(0, 10);
const nidError = (n: string) => (!n ? 'کد ملی را وارد کنید' : !nidOk(n) ? 'کد ملی ۱۰ رقمی معتبر نیست' : '');
const strongPw = (s: string) => /^(?=.*[A-Za-z؀-ۿ])(?=.*\d).{8,}$/.test(enDigits(s));
const codeOf = (e: unknown) => (e instanceof ApiRequestError ? e.code : '');

/** National ID input: shows Persian digits, keeps Latin digits. */
function NidField({ id, value, onChange, error, autoFocus }: { id: string; value: string; onChange: (v: string) => void; error?: string; autoFocus?: boolean }) {
  return (
    <AuthField label="کد ملی" icon={ID_CARD} htmlFor={id} error={error}>
      <input
        id={id} type="text" inputMode="numeric" dir="ltr" className="num" maxLength={10} autoComplete="username" autoFocus={autoFocus}
        value={faDigits(value)} onChange={(e) => onChange(onlyDigits(e.target.value))} aria-invalid={!!error} style={{ textAlign: 'right' }}
      />
    </AuthField>
  );
}

export default function OrgLoginPage() {
  const router = useRouter();
  const login = useOrgLogin();
  const [nid, setNid] = useState(DEMO_NID);
  const [password, setPassword] = useState('Arman@1405');
  const [showPw, setShowPw] = useState(false);
  const [remember, setRemember] = useState(true);
  const [touched, setTouched] = useState(false);
  // «فعال‌سازی یا بازیابی رمز» replaces the sign-in form inside the same card
  const [reset, setReset] = useState(false);

  const errors = { nid: nidError(nid), password: !password ? 'رمز عبور را وارد کنید' : '' };
  const invalid = !!(errors.nid || errors.password);
  const err = (k: keyof typeof errors) => (touched ? errors[k] : '');
  const notActivated = login.isError && codeOf(login.error) === 'not_activated';

  const submit = (e?: React.FormEvent) => {
    e?.preventDefault();
    setTouched(true);
    if (invalid || login.isPending) return;
    login.mutate({ nationalId: nid, password: enDigits(password) }, { onSuccess: () => router.replace(routes.org.dashboard) });
  };
  const openReset = () => { login.reset(); setReset(true); };

  return (
    <AuthLayout
      tag="پنل سازمانی"
      foot={<><span>دسترسی پنل را مدیر سازمان می‌دهد</span><span>پشتیبانی سازمانی <span className="num" dir="ltr">۰۲۱-۹۱۰۰۰۰۰۰</span></span></>}
    >
      {reset ? (
        <ResetPassword
          initialNid={nid}
          onBack={(n) => { if (n) setNid(n); setReset(false); }}
          onDone={() => router.replace(routes.org.dashboard)}
        />
      ) : (
        <form onSubmit={submit} noValidate className="nm-auth-card" aria-labelledby="org-login-title">
          <h1 id="org-login-title">ورود سازمان‌ها</h1>
          <p className="sub">با همان حساب نمادنو وارد شوید؛ کد ملی و رمزی که در اپ نمادنو دارید.</p>

          <NidField id="org-nid" value={nid} onChange={setNid} error={err('nid')} />
          <AuthField
            label="رمز عبور" icon={LOCK} htmlFor="org-pass" error={err('password')}
            action={<button type="button" className="x" onClick={openReset}>فراموشی رمز</button>}
          >
            <input id="org-pass" type={showPw ? 'text' : 'password'} value={password} onChange={(e) => setPassword(e.target.value)} aria-invalid={!!err('password')} className="num" dir="ltr" autoComplete="current-password" style={{ textAlign: 'right', letterSpacing: showPw || !password ? 'normal' : '.12em' }} />
            <PasswordToggle shown={showPw} onToggle={() => setShowPw((x) => !x)} />
          </AuthField>
          <CheckRow checked={remember} onToggle={() => setRemember((x) => !x)} label="مرا در این دستگاه به خاطر بسپار" />

          {login.isError && (
            <div role="alert" className={'nm-note ' + (notActivated ? 'warn' : 'err')}>
              <Icon name="risk" size={18} />
              <span style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 6 }}>
                <span>{errMsg(login.error)}</span>
                {notActivated && <button type="button" className="nm-link" onClick={openReset}>فعال‌سازی حساب</button>}
              </span>
            </div>
          )}

          <button type="submit" className="nm-btn lg block" disabled={login.isPending}>
            {login.isPending ? 'در حال ورود…' : 'ورود'}
          </button>
        </form>
      )}
    </AuthLayout>
  );
}

/**
 * Activation or password reset of the Namadno account, inside the sign-in card:
 * A) national ID → «ارسال کد» (SMS to the account's mobile); B) code + new password (twice) → «ذخیره و ورود».
 */
function ResetPassword({ initialNid, onBack, onDone }: { initialNid: string; onBack: (nid?: string) => void; onDone: () => void }) {
  const request = useOrgRequestOtp();
  const save = useOrgResetPassword();
  const [left, setLeft] = useCountdown();
  const [nid, setNid] = useState(initialNid);
  const [sent, setSent] = useState<{ mobile: string; devCode?: string } | null>(null);
  const [code, setCode] = useState('');
  const [pw, setPw] = useState('');
  const [again, setAgain] = useState('');
  const [show, setShow] = useState(false);
  const [touched, setTouched] = useState(false);

  const send = (e?: React.FormEvent) => {
    e?.preventDefault();
    setTouched(true);
    if (nidError(nid) || request.isPending) return;
    request.mutate({ nationalId: nid }, {
      onSuccess: (r) => { setSent({ mobile: r.mobile, devCode: r.devCode }); setLeft(r.ttl); setCode(''); setTouched(false); save.reset(); },
    });
  };

  const errors = {
    code: code.length < 5 ? 'کد ۵ رقمی را وارد کنید' : '',
    pw: !pw ? 'رمز عبور تازه را وارد کنید' : !strongPw(pw) ? PW_RULE : '',
    again: !again ? 'رمز عبور را تکرار کنید' : again !== pw ? 'با رمز عبور تازه یکسان نیست' : '',
  };
  const err = (k: keyof typeof errors) => (touched ? errors[k] : '');
  const submit = (e?: React.FormEvent) => {
    e?.preventDefault();
    setTouched(true);
    if (errors.code || errors.pw || errors.again || save.isPending) return;
    save.mutate({ nationalId: nid, code, password: enDigits(pw) }, { onSuccess: onDone });
  };

  const head = (
    <>
      <h1 id="org-reset-title">فعال‌سازی یا بازیابی رمز</h1>
      <p className="sub">کد تأیید به موبایل ثبت‌شده در حساب نمادنوی شما پیامک می‌شود؛ رمز تازه در اپ نمادنو هم به کار می‌رود.</p>
    </>
  );
  const back = <button type="button" className="nm-link" style={{ alignSelf: 'center' }} onClick={() => onBack(nid)}>بازگشت به ورود</button>;

  if (!sent) {
    return (
      <form onSubmit={send} noValidate className="nm-auth-card" aria-labelledby="org-reset-title">
        {head}
        <NidField id="org-reset-nid" value={nid} onChange={setNid} error={touched ? nidError(nid) : ''} autoFocus />
        {request.isError && <div role="alert" className="nm-note err"><Icon name="risk" size={18} /><span>{errMsg(request.error)}</span></div>}
        <button type="submit" className="nm-btn lg block" disabled={request.isPending}>{request.isPending ? 'در حال ارسال…' : 'ارسال کد'}</button>
        {back}
      </form>
    );
  }

  const mm = `${faDigits(String(Math.floor(left / 60)).padStart(2, '0'))}:${faDigits(String(left % 60).padStart(2, '0'))}`;
  const field = { className: 'num', dir: 'ltr' as const, style: { textAlign: 'right' as const, letterSpacing: show ? 'normal' : '.12em' } };
  return (
    <form onSubmit={submit} noValidate className="nm-auth-card" aria-labelledby="org-reset-title">
      {head}
      <div className="nm-note mute" role="status">
        <Icon name="info" size={18} />
        <span style={{ flex: 1, minWidth: 0 }}>کد به <span className="num" dir="ltr" style={{ display: 'inline-block', fontWeight: 600, color: 'var(--text-primary)' }}>{faDigits(sent.mobile)}</span> فرستاده شد</span>
        <button type="button" className="nm-link" style={{ flex: 'none' }} onClick={() => { setSent(null); setTouched(false); save.reset(); }}>تغییر کد ملی</button>
      </div>

      <div className="nm-field">
        <span className="l">
          <span>کد تأیید</span>
          {left <= 0 && <button type="button" className="x" onClick={() => send()} disabled={request.isPending}>{request.isPending ? 'در حال ارسال…' : 'ارسال دوباره'}</button>}
        </span>
        <OtpBoxes value={code} onChange={setCode} label="کد تأیید ۵ رقمی" autoFocus error={!!err('code')} />
        <span className={'nm-help' + (err('code') ? ' err' : '')} role={err('code') ? 'alert' : undefined} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          {err('code') || <><Icon d={TIMER} size={15} />{left > 0 ? `${mm} تا امکان ارسال دوباره` : 'می‌توانید کد را دوباره دریافت کنید'}</>}
          {sent.devCode && <span className="num" style={{ marginRight: 'auto', fontSize: 11, fontWeight: 500, color: 'var(--text-secondary)' }}>کد آزمایشی: {faDigits(sent.devCode)}</span>}
        </span>
      </div>

      <AuthField label="رمز عبور تازه" icon={LOCK} htmlFor="org-newpw" error={err('pw')} help={PW_RULE}>
        <input id="org-newpw" type={show ? 'text' : 'password'} value={pw} onChange={(e) => setPw(e.target.value)} aria-invalid={!!err('pw')} autoComplete="new-password" {...field} />
        <PasswordToggle shown={show} onToggle={() => setShow((x) => !x)} />
      </AuthField>
      <AuthField label="تکرار رمز عبور" icon={LOCK} htmlFor="org-newpw2" error={err('again')}>
        <input id="org-newpw2" type={show ? 'text' : 'password'} value={again} onChange={(e) => setAgain(e.target.value)} aria-invalid={!!err('again')} autoComplete="new-password" {...field} />
      </AuthField>

      {(save.isError || request.isError) && <div role="alert" className="nm-note err"><Icon name="risk" size={18} /><span>{errMsg(save.error ?? request.error)}</span></div>}

      <button type="submit" className="nm-btn lg block" disabled={save.isPending}>{save.isPending ? 'در حال ذخیره…' : 'ذخیره و ورود'}</button>
      {back}
    </form>
  );
}
