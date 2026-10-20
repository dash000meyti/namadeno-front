'use client';
/** Employee signup (design: app-signup) — national ID → phone → OTP → password. */
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useRequestOtp, useSignup, useVerifyOtp } from '@/api/auth';
import { routes } from '@/lib/routes';
import { faDigits } from '@/lib/format';
import { Icon } from '@/components/ui/Icon';
import {
  AUTH_ICONS, AuthFooterLink, AuthShell, CheckBox, MaskedMobile, NidField, OtpField, PasswordField, PhoneField, PwRules, RowLink, Step,
  StepButton, StepTitle, pwRules, useCountdown, validMobile, type Anim,
} from '@/components/app/core/auth';
import { GlassSheet, errMsg } from '@/components/app/core/ui';

type StepKey = 'nid' | 'phone' | 'otp' | 'setpass';
const FLOW: StepKey[] = ['nid', 'phone', 'otp', 'setpass'];
const PREV: Partial<Record<StepKey, StepKey>> = { phone: 'nid', otp: 'phone', setpass: 'otp' };

const TERMS = [
  'حساب نمادنو فقط با شماره‌ای فعال می‌شود که سازمان شما ثبت کرده است.',
  'دارایی‌ها به‌صورت واحد صندوق‌های سرمایه‌گذاری نگهداری می‌شوند و ارزش آن‌ها ممکن است تغییر کند.',
  'بسته‌های سازمانی تا تأیید شما به دارایی‌تان اضافه نمی‌شوند.',
  'اطلاعات شما محرمانه و مطابق مقررات سازمان بورس نگهداری می‌شود.',
];

export default function SignupPage() {
  const router = useRouter();
  const [step, setStep] = useState<StepKey>('nid');
  const [anim, setAnim] = useState<Anim>('');
  const [nid, setNid] = useState('');
  const [nidErr, setNidErr] = useState('');
  const [mobile, setMobile] = useState('');
  const [phoneErr, setPhoneErr] = useState('');
  const [agree, setAgree] = useState(false);
  const [showAgreeErr, setShowAgreeErr] = useState(false);
  const [terms, setTerms] = useState(false);
  const [code, setCode] = useState('');
  const [codeErr, setCodeErr] = useState('');
  const [devCode, setDevCode] = useState<string | undefined>();
  const [resent, setResent] = useState(false);
  const [left, setLeft] = useCountdown();
  const [pw, setPw] = useState('');
  const [pwErr, setPwErr] = useState('');

  const requestOtp = useRequestOtp();
  const verifyOtp = useVerifyOtp();
  const signup = useSignup();

  const go = (to: StepKey, dir: Anim) => { setStep(to); setAnim(dir); setPw(''); setPwErr(''); setCode(''); setCodeErr(''); setResent(false); };
  const agreeErr = showAgreeErr && !agree;

  const submitNid = () => {
    // Format check only — the registry inquiry (server) validates the ID itself.
    if (!/^\d{10}$/.test(nid) || /^(\d)\1{9}$/.test(nid)) { setNidErr(nid.length < 10 ? 'کد ملی باید ۱۰ رقم باشد' : 'کد ملی معتبر نیست'); return; }
    setNidErr('');
    go('phone', 'fwd');
  };
  const sendCode = (isResend = false) => {
    if (!agree) { setShowAgreeErr(true); return; }
    if (!validMobile(mobile)) { setPhoneErr('شماره موبایل معتبر نیست؛ مثل ۰۹۱۲۳۴۵۴۵۶۷'); return; }
    requestOtp.mutate({ mobile, purpose: 'signup' }, {
      onSuccess: (r) => {
        setDevCode(r.devCode); setLeft(r.ttl || 120);
        if (isResend) { setResent(true); setCode(''); setCodeErr(''); } else go('otp', 'fwd');
      },
      onError: (e) => { if (isResend) setCodeErr(errMsg(e)); else setPhoneErr(errMsg(e)); },
    });
  };
  const submitOtp = (v = code) => {
    if (v.length < 5) { setCodeErr('کد ۵ رقمی را کامل وارد کنید'); return; }
    verifyOtp.mutate({ mobile, code: v, purpose: 'signup' }, { onSuccess: () => go('setpass', 'fwd'), onError: (e) => setCodeErr(errMsg(e)) });
  };
  const rulesOk = pwRules(pw).every((r) => r.ok);
  const submitSignup = () => {
    if (!rulesOk) { setPwErr('رمز باید همه شرایط زیر را داشته باشد'); return; }
    signup.mutate({ nationalId: nid, mobile, password: pw }, { onSuccess: () => router.replace(routes.app.home), onError: (e) => setPwErr(errMsg(e)) });
  };

  const idx = FLOW.indexOf(step);

  return (
    <>
      <AuthShell
        flowLabel="ثبت‌نام در نمادنو"
        stepNum={idx + 1}
        stepTotal={FLOW.length}
        showNote={step === 'otp'}
        onBack={PREV[step] ? () => go(PREV[step] as StepKey, 'back') : undefined}
        footer={<AuthFooterLink text="حساب کاربری دارید؟" linkText="ورود" href={routes.app.login} />}
      >
        {step === 'nid' && (
          <Step anim={anim} key="nid">
            <StepTitle title="کد ملی" sub="برای احراز هویت، کد ملی ۱۰ رقمی خود را وارد کنید" />
            <NidField value={nid} onChange={(v) => { setNid(v); setNidErr(''); }} error={nidErr} onEnter={submitNid} />
            <div style={{ height: 44, display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5, color: 'var(--text-secondary)' }}>
              <Icon d="M12 3l7 3v5c0 5-3 8-7 10-4-2-7-5-7-10V6zM9 12l2 2 4-4" size={18} style={{ color: 'var(--success-text)' }} />
              استعلام از ثبت احوال؛ اطلاعات شما محرمانه می‌ماند
            </div>
            <StepButton label="ادامه" onClick={submitNid} disabled={nid.length !== 10} />
          </Step>
        )}

        {step === 'phone' && (
          <Step anim={anim} key="phone">
            <StepTitle title="شماره موبایل" sub="با شماره‌ای که در سازمان ثبت شده ثبت‌نام کنید" />
            <PhoneField
              value={mobile} onChange={(v) => { setMobile(v); setPhoneErr(''); }} onEnter={() => sendCode()}
              help={agreeErr ? '' : 'کد تأیید به این شماره پیامک می‌شود'}
              error={agreeErr ? 'برای دریافت کد، ابتدا قوانین را بپذیرید' : phoneErr}
            />
            <div style={{ height: 44, display: 'flex', alignItems: 'center', gap: 8 }}>
              <CheckBox checked={agree} onToggle={() => { setAgree((a) => !a); setShowAgreeErr(false); }} label="قوانین را می‌پذیرم" error={agreeErr} />
              <button type="button" onClick={() => setTerms(true)} style={{ marginRight: 'auto', height: 44, border: 0, background: 'transparent', padding: '0 4px', fontFamily: 'inherit', fontSize: 13, fontWeight: 600, color: 'var(--primary-text)', cursor: 'pointer' }}>مطالعه قوانین</button>
            </div>
            <StepButton label="دریافت کد" onClick={() => sendCode()} disabled={!agree} busy={requestOtp.isPending} />
          </Step>
        )}

        {step === 'otp' && (
          <Step anim={anim} key="otp">
            <StepTitle title="کد تأیید" sub={<>کد ۵ رقمی به <MaskedMobile mobile={mobile} /> پیامک شد</>} />
            <OtpField value={code} onChange={(v) => { setCode(v); setCodeErr(''); }} seconds={left} resent={resent} devCode={devCode} error={codeErr} onComplete={(v) => submitOtp(v)} />
            <div style={{ height: 44, display: 'flex', alignItems: 'center', gap: 8 }}>
              <RowLink d={AUTH_ICONS.resend} label="ارسال مجدد" disabled={left > 0 || requestOtp.isPending} onClick={() => { if (left <= 0) sendCode(true); }} />
              <RowLink d={AUTH_ICONS.edit} label="ویرایش شماره" end onClick={() => go('phone', 'back')} />
            </div>
            <StepButton label="تأیید کد" onClick={() => submitOtp()} disabled={code.length < 5} busy={verifyOtp.isPending} />
          </Step>
        )}

        {step === 'setpass' && (
          <Step anim={anim} key="setpass">
            <StepTitle title="تعیین رمز عبور" sub="از این رمز برای ورودهای بعدی استفاده می‌کنید" />
            <PasswordField
              label="رمز عبور" value={pw} onChange={(v) => { setPw(v); setPwErr(''); }} onEnter={submitSignup} autoComplete="new-password"
              help={pwErr || (rulesOk ? 'رمز قوی است' : 'حداقل ۸ کاراکتر، شامل حرف، عدد و یک نماد')}
              helpTone={pwErr ? 'error' : rulesOk ? 'success' : undefined}
            />
            <PwRules pw={pw} />
            <StepButton label="ثبت‌نام و ورود" onClick={submitSignup} disabled={!rulesOk} busy={signup.isPending} />
          </Step>
        )}
      </AuthShell>

      <GlassSheet open={terms} onClose={() => setTerms(false)} title="قوانین و شرایط استفاده">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {TERMS.map((t, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
              <span className="num" style={{ width: 24, height: 24, borderRadius: '50%', background: 'var(--soft-primary)', color: 'var(--primary-text)', display: 'grid', placeItems: 'center', fontSize: 12, fontWeight: 700, flex: 'none' }}>{faDigits(i + 1)}</span>
              <span style={{ fontSize: 13, lineHeight: 1.8 }}>{t}</span>
            </div>
          ))}
        </div>
        <button className="btn" onClick={() => { setTerms(false); setAgree(true); setShowAgreeErr(false); }} style={{ height: 48, width: '100%', boxSizing: 'border-box', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, background: 'var(--primary-main)', color: 'var(--primary-contrast)', boxShadow: 'var(--shadow-primary)', fontSize: 15 }}>می‌پذیرم</button>
      </GlassSheet>
    </>
  );
}
