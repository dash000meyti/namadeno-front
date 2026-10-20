'use client';
/**
 * Employee login (design: app-login).
 * phone → OTP (default) · «ورود با رمز عبور» swaps step 2 to password (still 2 steps)
 * · «فراموشی رمز» → OTP → new password.
 */
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useLogin, useRequestOtp, useResetPassword, useVerifyOtp, type OtpPurpose } from '@/api/auth';
import { routes } from '@/lib/routes';
import {
  AUTH_ICONS, AuthFooterLink, AuthShell, CheckBox, MaskedMobile, OtpField, PasswordField, PhoneField, PwRules, RowLink, Step, StepButton,
  StepTitle, pwRules, useCountdown, validMobile, type Anim,
} from '@/components/app/core/auth';
import { errMsg } from '@/components/app/core/ui';

type StepKey = 'phone' | 'otp' | 'pass' | 'fotp' | 'setpass';
const PREV: Partial<Record<StepKey, StepKey>> = { pass: 'phone', otp: 'phone', fotp: 'pass', setpass: 'fotp' };

export default function LoginPage() {
  const router = useRouter();
  const [step, setStep] = useState<StepKey>('phone');
  const [anim, setAnim] = useState<Anim>('');
  const [mobile, setMobile] = useState('');
  const [phoneErr, setPhoneErr] = useState('');
  const [remember, setRemember] = useState(true);
  const [code, setCode] = useState('');
  const [codeErr, setCodeErr] = useState('');
  const [devCode, setDevCode] = useState<string | undefined>();
  const [resent, setResent] = useState(false);
  const [left, setLeft] = useCountdown();
  const [pw, setPw] = useState('');
  const [pwErr, setPwErr] = useState('');
  const [resetCode, setResetCode] = useState('');

  const requestOtp = useRequestOtp();
  const verifyOtp = useVerifyOtp();
  const login = useLogin();
  const reset = useResetPassword();

  const forgotFlow = step === 'fotp' || step === 'setpass';
  const flow: StepKey[] = forgotFlow ? ['fotp', 'setpass'] : ['phone', step === 'pass' ? 'pass' : 'otp'];
  const idx = flow.indexOf(step);

  const go = (to: StepKey, dir: Anim) => {
    setStep(to); setAnim(dir); setPw(''); setPwErr(''); setCode(''); setCodeErr(''); setResent(false);
  };

  const sendOtp = (purpose: OtpPurpose, then: () => void, isResend = false) => {
    requestOtp.mutate({ mobile, purpose }, {
      onSuccess: (r) => { setDevCode(r.devCode); setLeft(r.ttl || 120); if (isResend) { setResent(true); setCode(''); setCodeErr(''); } then(); },
      onError: (e) => {
        if (step === 'phone') setPhoneErr(errMsg(e));
        else if (step === 'pass') setPwErr(errMsg(e));
        else setCodeErr(errMsg(e));
      },
    });
  };

  const done = () => router.replace(routes.app.home);

  // ── step actions
  const submitPhone = () => {
    if (!validMobile(mobile)) { setPhoneErr('شماره موبایل معتبر نیست؛ مثل ۰۹۱۲۳۴۵۴۵۶۷'); return; }
    setPhoneErr('');
    sendOtp('login', () => go('otp', 'fwd'));
  };
  const submitOtp = (v = code) => {
    if (v.length < 5) { setCodeErr('کد ۵ رقمی را کامل وارد کنید'); return; }
    if (step === 'otp') {
      verifyOtp.mutate({ mobile, code: v, purpose: 'login' }, { onSuccess: done, onError: (e) => setCodeErr(errMsg(e)) });
    } else {
      verifyOtp.mutate({ mobile, code: v, purpose: 'reset' }, { onSuccess: () => { setResetCode(v); go('setpass', 'fwd'); }, onError: (e) => setCodeErr(errMsg(e)) });
    }
  };
  const submitLogin = () => {
    if (!pw) { setPwErr('رمز عبور را وارد کنید'); return; }
    login.mutate({ mobile, password: pw }, { onSuccess: done, onError: (e) => setPwErr(errMsg(e)) });
  };
  const rulesOk = pwRules(pw).every((r) => r.ok);
  const submitNewPass = () => {
    if (!rulesOk) { setPwErr('رمز باید همه شرایط زیر را داشته باشد'); return; }
    reset.mutate({ mobile, code: resetCode, password: pw }, { onSuccess: done, onError: (e) => setPwErr(errMsg(e)) });
  };

  const isOtp = step === 'otp' || step === 'fotp';

  return (
    <AuthShell
      flowLabel={forgotFlow ? 'بازیابی رمز عبور' : 'ورود به نمادنو'}
      stepNum={idx + 1}
      stepTotal={flow.length}
      showNote={isOtp}
      onBack={PREV[step] ? () => go(PREV[step] as StepKey, 'back') : undefined}
      footer={<AuthFooterLink text="حساب ندارید؟" linkText="ثبت‌نام" href={routes.app.signup} />}
    >
      {step === 'phone' && (
        <Step anim={anim} key="phone">
          <StepTitle title="ورود به حساب" sub="شماره موبایل حساب نمادنو خود را وارد کنید" />
          <PhoneField value={mobile} onChange={(v) => { setMobile(v); setPhoneErr(''); }} help="کد ورود به این شماره پیامک می‌شود" error={phoneErr} onEnter={submitPhone} />
          <div style={{ height: 44, display: 'flex', alignItems: 'center', gap: 8 }}>
            <CheckBox checked={remember} onToggle={() => setRemember((r) => !r)} label="مرا به خاطر بسپار" />
          </div>
          <StepButton label="ادامه" onClick={submitPhone} disabled={!validMobile(mobile)} busy={requestOtp.isPending} />
        </Step>
      )}

      {step === 'pass' && (
        <Step anim={anim} key="pass">
          <StepTitle title="رمز عبور" sub={<>سلام، رمز حساب <MaskedMobile mobile={mobile} /> را وارد کنید</>} />
          <PasswordField
            label="رمز عبور" value={pw} onChange={(v) => { setPw(v); setPwErr(''); }} onEnter={submitLogin}
            help={pwErr || 'بعد از ۵ تلاش ناموفق، ورود ۱۵ دقیقه قفل می‌شود'} helpTone={pwErr ? 'error' : undefined}
          />
          <div style={{ height: 44, display: 'flex', alignItems: 'center', gap: 8 }}>
            <RowLink d={AUTH_ICONS.lock} label="فراموشی رمز" onClick={() => sendOtp('reset', () => go('fotp', 'fwd'))} />
            <RowLink d={AUTH_ICONS.mail} label="ورود با کد پیامکی" color="var(--text-secondary)" end onClick={() => go('otp', 'back')} />
          </div>
          <StepButton label="ورود" onClick={submitLogin} disabled={!pw} busy={login.isPending || requestOtp.isPending} />
        </Step>
      )}

      {isOtp && (
        <Step anim={anim} key={step}>
          <StepTitle title="کد تأیید" sub={<>کد ۵ رقمی به <MaskedMobile mobile={mobile} /> پیامک شد</>} />
          <OtpField
            value={code} onChange={(v) => { setCode(v); setCodeErr(''); }} seconds={left} resent={resent} devCode={devCode} error={codeErr}
            onComplete={(v) => submitOtp(v)}
          />
          <div style={{ height: 44, display: 'flex', alignItems: 'center', gap: 8 }}>
            <RowLink d={AUTH_ICONS.resend} label="ارسال مجدد" disabled={left > 0 || requestOtp.isPending} onClick={() => { if (left <= 0) sendOtp(step === 'otp' ? 'login' : 'reset', () => {}, true); }} />
            <RowLink
              d={step === 'otp' ? AUTH_ICONS.lock : AUTH_ICONS.edit}
              label={step === 'otp' ? 'ورود با رمز عبور' : 'بازگشت به رمز عبور'}
              end
              onClick={() => go('pass', step === 'otp' ? 'fwd' : 'back')}
            />
          </div>
          <StepButton label={step === 'otp' ? 'ورود' : 'تأیید کد'} onClick={() => submitOtp()} disabled={code.length < 5} busy={verifyOtp.isPending} />
        </Step>
      )}

      {step === 'setpass' && (
        <Step anim={anim} key="setpass">
          <StepTitle title="رمز عبور جدید" sub="رمز جدید جایگزین رمز قبلی می‌شود" />
          <PasswordField
            label="رمز عبور جدید" value={pw} onChange={(v) => { setPw(v); setPwErr(''); }} onEnter={submitNewPass} autoComplete="new-password"
            help={pwErr || (rulesOk ? 'رمز قوی است' : 'حداقل ۸ کاراکتر، شامل حرف، عدد و یک نماد')}
            helpTone={pwErr ? 'error' : rulesOk ? 'success' : undefined}
          />
          <PwRules pw={pw} />
          <StepButton label="ذخیره و ورود" onClick={submitNewPass} disabled={!rulesOk} busy={reset.isPending} />
        </Step>
      )}
    </AuthShell>
  );
}
