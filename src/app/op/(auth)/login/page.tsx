'use client';
/** Operator console login (design: op-login). */
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useOpLogin } from '@/api/auth';
import { useOpOverview } from '@/api/op';
import { Icon, LogoMark } from '@/components/ui/Icon';
import { useToast } from '@/components/ui/Toast';
import { useColorMode } from '@/theme/ColorModeProvider';
import { faDigits, money } from '@/lib/format';
import { routes } from '@/lib/routes';
import { ICON, errMsg } from '@/components/op/core/ui';

const SUN = 'M12 16.5a4.5 4.5 0 1 0 0-9 4.5 4.5 0 0 0 0 9M12 2.5v2.5M12 19v2.5M2.5 12H5M19 12h2.5M5.3 5.3l1.8 1.8M16.9 16.9l1.8 1.8M5.3 18.7l1.8-1.8M16.9 7.1l1.8-1.8';
const MOON = 'M20.5 14.2A8.5 8.5 0 0 1 9.8 3.5a8.5 8.5 0 1 0 10.7 10.7';
const EYE = 'M2.5 12s3.5-6.5 9.5-6.5 9.5 6.5 9.5 6.5-3.5 6.5-9.5 6.5S2.5 12 2.5 12M12 14.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5';
const EYE_OFF = 'M3 3l18 18M10.6 10.6a2.5 2.5 0 0 0 3.4 3.4M7.4 7.5C4.3 9.3 2.5 12 2.5 12s3.5 6.5 9.5 6.5c1.7 0 3.2-.5 4.5-1.2M10 5.7A10 10 0 0 1 12 5.5c6 0 9.5 6.5 9.5 6.5s-.9 1.6-2.5 3.2';
const KEY = 'M14 10a4 4 0 1 0-3.9 3.1L4 19v1h3l1-1v-2h2l1-1 .5-.5a4 4 0 0 0 2.5.5M15.5 8.5h.01';
const MAIL = 'M3 6h18v12H3zM3 7l9 6 9-6';
const PASS = 'M6 11V8a6 6 0 0 1 12 0v3M5 11h14v10H5zM12 15v2';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function OpLoginPage() {
  const router = useRouter();
  const toast = useToast();
  const { mode, toggle } = useColorMode();
  const login = useOpLogin();
  const { data: ov } = useOpOverview();
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

  const s = ov?.stats;
  const facts = [
    { title: 'سازمان طرف قرارداد', value: s ? faDigits(s.organizations) : '۴۲', d: ICON.building, bg: 'var(--soft-primary)', fg: 'var(--primary-text)' },
    { title: 'کاربر فعال', value: s ? money(s.users) : '۱۲٬۸۴۰', d: ICON.users, bg: 'var(--soft-info)', fg: 'var(--info-text)' },
    { title: 'میلیارد تومان AUM', value: s ? faDigits(Math.round(s.aum / 1e9)) : '۴۸۰', d: ICON.funds, bg: 'var(--soft-success)', fg: 'var(--success-text)' },
    { title: 'درخواست در انتظار', value: s ? faDigits(s.pendingRequests) : '۲۳', d: ICON.inbox, bg: 'var(--soft-warning)', fg: 'var(--warning-text)' },
  ];

  return (
    <div className="s-op" dir="rtl" style={{ minHeight: '100dvh', position: 'relative', background: 'var(--bg-default)', backgroundImage: 'var(--bg-aurora)', color: 'var(--text-primary)', display: 'flex', flexDirection: 'row' }}>
      <div style={{ position: 'absolute', top: 20, left: 24, zIndex: 2, display: 'flex', alignItems: 'center', gap: 8 }}>
        <span className="lbl" dir="ltr" style={{ gap: 6, background: 'var(--soft-success)', color: 'var(--success-text)' }}><span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--success-main)' }} />Production</span>
        <button type="button" className="ibtn" aria-label="تغییر تم" onClick={toggle} style={{ background: 'var(--glass-bg)', boxShadow: '0 0 0 1px var(--glass-edge)', color: 'var(--text-primary)' }}>
          <Icon d={mode === 'dark' ? SUN : MOON} size={22} />
        </button>
      </div>

      <section style={{ width: 560, flex: 'none', boxSizing: 'border-box', padding: '64px 72px', display: 'flex', flexDirection: 'column', gap: 32 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, height: 56 }}>
          <span style={{ borderRadius: 16, boxShadow: 'var(--shadow-primary)', display: 'inline-flex' }}><LogoMark size={56} radius={16} /></span>
          <span style={{ display: 'flex', flexDirection: 'column', lineHeight: 1.1, gap: 4 }}>
            <span className="wm" style={{ fontSize: 30, fontWeight: 700 }}>نمادنو</span>
            <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)' }}>کنسول بهره‌بردار</span>
          </span>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <h2 style={{ margin: 0, fontSize: 30, lineHeight: 1.35, fontWeight: 800 }}>مدیریت صندوق‌ها، سازمان‌ها و قوانین پلتفرم</h2>
          <p style={{ margin: 0, fontSize: 14, lineHeight: 1.8, color: 'var(--text-secondary)' }}>دسترسی فقط برای تیم بهره‌بردار. هر ورود ثبت می‌شود و برای عملیات حساس (تغییر قرارداد، غیرفعال‌سازی صندوق) تأیید دومرحله‌ای لازم است.</p>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 12 }}>
          {facts.map((f) => (
            <div key={f.title} className="card" style={{ boxSizing: 'border-box', padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 12 }}>
              <span style={{ width: 36, height: 36, borderRadius: 10, background: f.bg, color: f.fg, display: 'grid', placeItems: 'center', flex: 'none' }}><Icon d={f.d} size={20} /></span>
              <span style={{ display: 'flex', flexDirection: 'column', lineHeight: 1.2, gap: 3, minWidth: 0 }}>
                <span className="num" style={{ fontSize: 20 }}>{f.value}</span>
                <span style={{ fontSize: 12, color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>{f.title}</span>
              </span>
            </div>
          ))}
        </div>
        <div style={{ marginTop: 'auto', display: 'flex', alignItems: 'center', gap: 10, fontSize: 12, color: 'var(--text-secondary)' }}>
          <span style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--success-main)', boxShadow: '0 0 0 3px var(--soft-success)', flex: 'none' }} />
          <span>همهٔ سرویس‌ها سالم</span>
          <span style={{ width: 4, height: 4, borderRadius: '50%', background: 'var(--text-disabled)' }} />
          <span className="num" dir="ltr">v2.8.0</span>
          <span style={{ width: 4, height: 4, borderRadius: '50%', background: 'var(--text-disabled)' }} />
          <span>آخرین استقرار <span className="num" dir="ltr">۱۴۰۵/۰۷/۱۴</span></span>
        </div>
      </section>

      <section style={{ flex: 1, minWidth: 0, display: 'grid', placeItems: 'center', boxSizing: 'border-box', padding: 40 }}>
        <form
          className="glass"
          noValidate
          onSubmit={(e) => { e.preventDefault(); submit(); }}
          style={{ width: 440, maxWidth: '100%', boxSizing: 'border-box', borderRadius: 20, padding: 32, display: 'flex', flexDirection: 'column', gap: 20 }}
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <h4 style={{ margin: 0, fontSize: 22, lineHeight: 1.3, fontWeight: 700 }}>ورود به کنسول بهره‌بردار</h4>
            <span style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.5 }}>با حساب سازمانی خود وارد شوید</span>
          </div>

          <div className="fg">
            <label className="fl" htmlFor="op-email">ایمیل سازمانی</label>
            <span style={{ height: 44, boxSizing: 'border-box', padding: '0 12px', borderRadius: 8, border: '1px solid var(--outline-border)', background: 'var(--bg-paper)', display: 'flex', alignItems: 'center', gap: 10 }}>
              <Icon d={MAIL} size={18} style={{ color: 'var(--text-secondary)' }} />
              <input id="op-email" type="email" dir="ltr" autoComplete="username" value={email} onChange={(e) => { setEmail(e.target.value); setError(''); }} style={{ flex: 1, minWidth: 0, height: 40, border: 0, background: 'transparent', color: 'var(--text-primary)', fontFamily: 'inherit', fontSize: 14, outline: 0, textAlign: 'left', padding: 0 }} />
            </span>
          </div>

          <div className="fg">
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <label className="fl" htmlFor="op-pass">رمز عبور</label>
              <button type="button" onClick={() => toast('لینک بازنشانی رمز به ایمیل سازمانی ارسال شد')} style={{ marginRight: 'auto', height: 20, border: 0, background: 'transparent', padding: 0, color: 'var(--primary-text)', fontFamily: 'inherit', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>فراموشی رمز</button>
            </div>
            <span style={{ height: 44, boxSizing: 'border-box', padding: '0 12px 0 6px', borderRadius: 8, border: '1px solid var(--outline-border)', background: 'var(--bg-paper)', display: 'flex', alignItems: 'center', gap: 10 }}>
              <Icon d={PASS} size={18} style={{ color: 'var(--text-secondary)' }} />
              <input id="op-pass" type={show ? 'text' : 'password'} dir="ltr" autoComplete="current-password" value={password} onChange={(e) => { setPassword(e.target.value); setError(''); }} style={{ flex: 1, minWidth: 0, height: 40, border: 0, background: 'transparent', color: 'var(--text-primary)', fontFamily: 'inherit', fontSize: 14, outline: 0, textAlign: 'left', padding: 0, letterSpacing: show ? 0 : 2 }} />
              <button type="button" className="ibtn" aria-label="نمایش رمز" aria-pressed={show} onClick={() => setShow((x) => !x)} style={{ width: 32, height: 32 }}><Icon d={show ? EYE_OFF : EYE} size={18} /></button>
            </span>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <button type="button" className={'ck' + (remember ? ' on' : '')} aria-label="مرا به خاطر بسپار" aria-pressed={remember} onClick={() => setRemember((x) => !x)}>
              {remember && <Icon d={ICON.check} size={14} strokeWidth={3} />}
            </button>
            <span style={{ fontSize: 13 }}>مرا در این دستگاه به خاطر بسپار</span>
            <span className="lbl" style={{ marginRight: 'auto', height: 20, padding: '0 6px', fontSize: 11, background: 'var(--soft-default)', color: 'var(--default-text)' }}>۳۰ روز</span>
          </div>

          {error && <div role="alert" style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', borderRadius: 8, background: 'var(--soft-error)', color: 'var(--error-text)', fontSize: 12, fontWeight: 600 }}><Icon d={ICON.alert} size={16} />{error}</div>}

          <button type="submit" className="btnp" disabled={login.isPending} style={{ height: 44, fontSize: 14, boxShadow: 'var(--shadow-primary)', opacity: login.isPending ? 0.7 : 1 }}>
            {login.isPending ? 'در حال ورود…' : 'ورود'}<Icon d={ICON.chevL} size={18} />
          </button>

          <div style={{ display: 'flex', alignItems: 'center', gap: 12, color: 'var(--text-disabled)', fontSize: 11 }}>
            <span style={{ flex: 1, height: 1, background: 'var(--divider)' }} /><span>یا</span><span style={{ flex: 1, height: 1, background: 'var(--divider)' }} />
          </div>

          <button type="button" className="btno" disabled={login.isPending} onClick={() => submit(true)} style={{ height: 44, fontSize: 14 }}><Icon d={KEY} size={18} />ورود با SSO سازمانی</button>

          <span style={{ fontSize: 11, lineHeight: 1.6, color: 'var(--text-disabled)', textAlign: 'center' }}>ورود شما در لاگ امنیتی ثبت می‌شود · پشتیبانی داخلی <span className="num" dir="ltr">۴۰۰۰</span></span>
        </form>
      </section>
    </div>
  );
}
