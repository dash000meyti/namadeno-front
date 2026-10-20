'use client';
/** «حساب من» (design: app-profile) — KYC block, account, security, theme, notifications, support, demo reset, logout. */
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useBankAccounts, useFaq, useMe, usePortfolio, useResetMockData, useSetDefaultBank } from '@/api/app';
import { useLogout } from '@/api/auth';
import { useChangePasswordCore, useSecurity } from '@/api/app-core-extra';
import { AppHeader } from '@/components/app/AppHeader';
import { BottomNav } from '@/components/app/BottomNav';
import { Scr, Skeleton } from '@/components/app/Screen';
import { Icon } from '@/components/ui/Icon';
import { useToast } from '@/components/ui/Toast';
import { P } from '@/components/app/core/meta';
import { ErrorNote, GlassSheet, Switch, errMsg } from '@/components/app/core/ui';
import { useColorMode } from '@/theme/ColorModeProvider';
import { faDigits, jDayMonth, maskMobile, money } from '@/lib/format';
import { routes } from '@/lib/routes';

const PREFS_KEY = 'nm-app-prefs';
type Prefs = { bio: boolean; n1: boolean; n2: boolean };

const KYC_TAG: Record<number, [string, string, string, string]> = {
  1: ['پایه', 'var(--soft-warning)', 'var(--warning-text)', 'اعتبار و وام نیازمند سطح ۲ است'],
  2: ['میانی', 'var(--soft-info)', 'var(--info-text)', 'خرید و فروش صندوق نیازمند سطح ۳ است'],
  3: ['کامل', 'var(--soft-success)', 'var(--success-text)', 'احراز هویت کامل است'],
};

function SectionCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-secondary)', padding: '0 4px' }}>{title}</span>
      <div className="card" style={{ padding: '0 14px', display: 'flex', flexDirection: 'column' }}>{children}</div>
    </div>
  );
}

function RowIcon({ d, tone }: { d: string; tone: 'warning' | 'primary' | 'secondary' | 'info' | 'error' }) {
  return (
    <span style={{ width: 40, height: 40, borderRadius: 12, background: `var(--soft-${tone})`, color: `var(--${tone}-text)`, display: 'grid', placeItems: 'center', flex: 'none' }}>
      <Icon d={d} size={20} />
    </span>
  );
}

function RowText({ title, sub }: { title: string; sub: React.ReactNode }) {
  return (
    <span style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 2, lineHeight: 1.4 }}>
      <span style={{ fontSize: 14, fontWeight: 600 }}>{title}</span>
      <span className="num" style={{ fontSize: 12, fontWeight: 400, color: 'var(--text-secondary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{sub}</span>
    </span>
  );
}

const Chev = () => <Icon d={P.chevLeft} size={18} style={{ color: 'var(--text-secondary)' }} />;
const dashed = { borderBottom: '1px dashed var(--divider)' };

export default function ProfilePage() {
  const router = useRouter();
  const toast = useToast();
  const me = useMe();
  const pf = usePortfolio();
  const banks = useBankAccounts();
  const security = useSecurity();
  const { mode, setMode } = useColorMode();
  const logout = useLogout();
  const resetDemo = useResetMockData();

  const [sheet, setSheet] = useState<'' | 'banks' | 'pass' | 'support'>('');
  const [prefs, setPrefs] = useState<Prefs>({ bio: true, n1: true, n2: true });
  useEffect(() => {
    try { const raw = localStorage.getItem(PREFS_KEY); if (raw) setPrefs((p) => ({ ...p, ...(JSON.parse(raw) as Partial<Prefs>) })); } catch { /* storage unavailable */ }
  }, []);
  const toggle = (k: keyof Prefs) => setPrefs((p) => {
    const n = { ...p, [k]: !p[k] };
    try { localStorage.setItem(PREFS_KEY, JSON.stringify(n)); } catch { /* ignore */ }
    return n;
  });

  const lvl = me.data?.kycLevel ?? 1;
  const kt = KYC_TAG[lvl] ?? KYC_TAG[1];
  const lockCount = (pf.data?.holdings ?? []).reduce((s, h) => s + h.locks.length, 0);
  const defBank = banks.data?.find((b) => b.isDefault) ?? banks.data?.[0];

  const doLogout = () => logout.mutate(undefined, { onSettled: () => router.replace(routes.app.login) });
  const doReset = () => resetDemo.mutate(undefined, {
    onSuccess: () => toast('داده‌های نمایشی بازنشانی شد'),
    onError: (e) => toast(errMsg(e), 'error'),
  });

  return (
    <>
      <Scr gap={16}>
        {/* identity + KYC */}
        {me.isLoading || !me.data ? (
          <Skeleton h={190} />
        ) : (
          <div className="card" style={{ boxSizing: 'border-box', padding: 16, display: 'flex', flexDirection: 'column', gap: 12, backgroundImage: 'linear-gradient(135deg, rgb(var(--primary-main-rgb) / .10), transparent 60%)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
              <span style={{ width: 60, height: 60, borderRadius: '50%', background: 'var(--primary-main)', color: 'var(--primary-contrast)', display: 'grid', placeItems: 'center', fontSize: 24, fontWeight: 700, boxShadow: 'var(--shadow-primary)', flex: 'none' }}>{me.data.avatarLetter}</span>
              <span style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 3, lineHeight: 1.4 }}>
                <span style={{ fontSize: 17, fontWeight: 700 }}>{me.data.fullName}</span>
                <span className="num" dir="ltr" style={{ fontSize: 13, fontWeight: 400, color: 'var(--text-secondary)', textAlign: 'right' }}>{maskMobile(me.data.mobile)}</span>
                <span style={{ fontSize: 12, color: 'var(--text-secondary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {me.data.orgName}{me.data.employeeCode ? ` · کد پرسنلی ${faDigits(me.data.employeeCode)}` : ''}
                </span>
              </span>
            </div>
            <Link href={routes.app.kyc} aria-label={`احراز هویت: سطح ${faDigits(lvl)} از ۳`} style={{ boxSizing: 'border-box', padding: '10px 12px', borderRadius: 14, background: 'var(--bg-neutral)', color: 'var(--text-primary)', textDecoration: 'none', display: 'flex', flexDirection: 'column', gap: 8 }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <Icon d={P.shieldCheck} size={18} style={{ color: kt[2] }} />
                <span style={{ fontSize: 13, fontWeight: 700, whiteSpace: 'nowrap' }}>احراز هویت · سطح <span className="num">{faDigits(lvl)}</span> از ۳</span>
                <span className="lbl" style={{ height: 20, padding: '0 6px', fontSize: 11, background: kt[1], color: kt[2] }}>{kt[0]}</span>
                <span style={{ marginRight: 'auto', height: 28, padding: '0 10px', borderRadius: 8, background: lvl < 3 ? 'var(--primary-main)' : 'transparent', color: lvl < 3 ? 'var(--primary-contrast)' : 'var(--primary-text)', fontSize: 12, fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: 2, whiteSpace: 'nowrap' }}>
                  {lvl < 3 ? 'ارتقا' : 'مشاهده'}<Icon d={P.chevLeft} size={14} />
                </span>
              </span>
              <span aria-hidden="true" style={{ display: 'flex', gap: 5 }}>
                {[1, 2, 3].map((n) => <span key={n} style={{ flex: 1, height: 5, borderRadius: 5, background: n <= lvl ? 'var(--success-main)' : 'rgb(var(--grey-500-rgb) / .2)' }} />)}
              </span>
              <span style={{ fontSize: 11.5, color: 'var(--text-secondary)' }}>{kt[3]}</span>
            </Link>
          </div>
        )}

        <SectionCard title="حساب">
          <Link href={routes.app.home} className="rowbtn" style={{ ...dashed, textDecoration: 'none' }}>
            <RowIcon d={P.lock} tone="warning" />
            <RowText title="دارایی‌های قفل‌شده" sub={pf.data ? `${faDigits(lockCount)} قفل فعال · آزاد ${money(pf.data.free)}` : '…'} />
            <span className="num" style={{ fontSize: 15, fontWeight: 400, whiteSpace: 'nowrap' }}>{pf.data ? money(pf.data.locked) : ''}</span>
            <Chev />
          </Link>
          <button className="rowbtn" onClick={() => setSheet('banks')}>
            <RowIcon d={P.bank} tone="primary" />
            <RowText title="حساب‌های بانکی" sub={defBank ? `${defBank.bankName} · پیش‌فرض · ${faDigits(banks.data?.length ?? 0)} حساب متصل` : 'حسابی متصل نیست'} />
            <Chev />
          </button>
        </SectionCard>

        <SectionCard title="امنیت">
          <button className="rowbtn" onClick={() => setSheet('pass')} style={dashed}>
            <RowIcon d="M6 11h12v10H6zM8 11V8a4 4 0 0 1 8 0v3M12 15v2" tone="secondary" />
            <RowText title="رمز ورود" sub={security.data ? `آخرین تغییر: ${jDayMonth(security.data.passwordChangedAt, true)}` : '…'} />
            <Chev />
          </button>
          <div style={{ minHeight: 60, boxSizing: 'border-box', padding: '8px 0', display: 'flex', alignItems: 'center', gap: 12 }}>
            <RowIcon d="M7 10a5 5 0 0 1 10 0v2M12 10v4c0 2.5-.8 4.5-2 6M9.5 21c-.6-1-1-2.2-1.2-3.5M15 13v1c0 2.5-.4 4.5-1.2 6.5M4.5 15c.3-1.5.5-3 .5-5a7 7 0 0 1 12.6-4.2M19 10c0 1.5 0 3-.3 4.5" tone="secondary" />
            <RowText title="ورود با اثر انگشت" sub={prefs.bio ? 'فعال روی این دستگاه' : 'غیرفعال'} />
            <Switch on={prefs.bio} onToggle={() => toggle('bio')} label="ورود با اثر انگشت" />
          </div>
        </SectionCard>

        <SectionCard title="ظاهر">
          <div style={{ padding: '12px 0', display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <RowIcon d="M12 21a9 9 0 1 0 0-18zM12 3a9 9 0 0 1 0 18" tone="primary" />
              <RowText title="تم برنامه" sub="انتخاب شما در همه صفحه‌ها حفظ می‌شود" />
            </div>
            <div role="radiogroup" aria-label="تم برنامه" style={{ height: 44, boxSizing: 'border-box', padding: 4, borderRadius: 10, background: 'var(--bg-neutral)', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 4 }}>
              {([
                ['light', 'Light', 'M12 17a5 5 0 1 0 0-10 5 5 0 0 0 0 10M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41'],
                ['dark', 'Dark', 'M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5'],
              ] as const).map(([k, label, d]) => {
                const sel = mode === k;
                return (
                  <button key={k} role="radio" aria-checked={sel} onClick={() => setMode(k)} style={{ border: 0, borderRadius: 8, background: sel ? 'var(--seg-active)' : 'transparent', boxShadow: sel ? 'var(--shadow-z1)' : 'none', color: sel ? 'var(--text-primary)' : 'var(--text-secondary)', fontFamily: 'inherit', fontSize: 13, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, padding: 0 }}>
                    <Icon d={d} size={18} />{label}
                  </button>
                );
              })}
            </div>
          </div>
        </SectionCard>

        <SectionCard title="اعلان‌ها">
          <div style={{ minHeight: 60, boxSizing: 'border-box', padding: '8px 0', display: 'flex', alignItems: 'center', gap: 12, ...dashed }}>
            <RowIcon d={P.inbox} tone="primary" />
            <RowText title="دریافتی‌ها و بسته‌های سازمانی" sub={prefs.n1 ? 'اعلان فوری هنگام دریافت بسته' : 'خاموش'} />
            <Switch on={prefs.n1} onToggle={() => toggle('n1')} label="دریافتی‌ها و بسته‌های سازمانی" />
          </div>
          <div style={{ minHeight: 60, boxSizing: 'border-box', padding: '8px 0', display: 'flex', alignItems: 'center', gap: 12 }}>
            <RowIcon d="M4 6h16v14H4zM4 10h16M8 3v4M16 3v4" tone="warning" />
            <RowText title="سررسید قسط و وام" sub={prefs.n2 ? 'یادآوری ۳ روز پیش از سررسید' : 'خاموش'} />
            <Switch on={prefs.n2} onToggle={() => toggle('n2')} label="سررسید قسط و وام" />
          </div>
        </SectionCard>

        <SectionCard title="پشتیبانی">
          <button className="rowbtn" onClick={() => setSheet('support')} style={dashed}>
            <RowIcon d="M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18M9.5 9a2.5 2.5 0 0 1 4.9.7c0 1.6-2.4 2-2.4 3.3M12 17h.01" tone="info" />
            <RowText title="پشتیبانی و سؤالات" sub="پرسش‌های پرتکرار و تماس با ما" />
            <Chev />
          </button>
          <button className="rowbtn" onClick={doReset} disabled={resetDemo.isPending} aria-busy={resetDemo.isPending || undefined}>
            <RowIcon d={P.refresh} tone="error" />
            <RowText title="بازنشانی داده‌های نمایشی" sub={resetDemo.isPending ? 'در حال بازنشانی…' : 'بازگرداندن موجودی‌ها، بسته‌ها و تراکنش‌ها به حالت اولیه'} />
          </button>
        </SectionCard>

        <button onClick={doLogout} disabled={logout.isPending} className="card" style={{ height: 52, boxSizing: 'border-box', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, color: 'var(--error-text)', fontSize: 14, fontWeight: 700, fontFamily: 'inherit', cursor: 'pointer', width: '100%' }}>
          <Icon d="M10 4H6a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h4M15 8l4 4-4 4M19 12H9" size={20} />{logout.isPending ? 'در حال خروج…' : 'خروج از حساب'}
        </button>
        <span style={{ textAlign: 'center', fontSize: 12, color: 'var(--text-secondary)' }}>نمادنو · نسخه ۱٫۰٫۰</span>
      </Scr>

      <AppHeader title="حساب من" back={routes.app.home} />
      <BottomNav active="assets" />

      <BanksSheet open={sheet === 'banks'} onClose={() => setSheet('')} />
      <PasswordSheet open={sheet === 'pass'} onClose={() => setSheet('')} />
      <SupportSheet open={sheet === 'support'} onClose={() => setSheet('')} />
    </>
  );
}

function BanksSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const toast = useToast();
  const banks = useBankAccounts();
  const setDefault = useSetDefaultBank();
  const current = banks.data?.find((b) => b.isDefault)?.id ?? banks.data?.[0]?.id;
  const [sel, setSel] = useState<string | undefined>(undefined);
  useEffect(() => { if (open) setSel(current); }, [open, current]);

  const save = () => {
    if (!sel || sel === current) { onClose(); return; }
    setDefault.mutate(sel, {
      onSuccess: () => { onClose(); toast('حساب پیش‌فرض ذخیره شد'); },
      onError: (e) => toast(errMsg(e), 'error'),
    });
  };

  return (
    <GlassSheet open={open} onClose={onClose} title="حساب‌های بانکی">
      <span style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.6, marginTop: -6 }}>حساب پیش‌فرض برای برداشت از کیف پول ریالی</span>
      <div role="radiogroup" aria-label="حساب پیش‌فرض" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {(banks.data ?? []).map((b) => {
          const on = b.id === sel;
          return (
            <button key={b.id} role="radio" aria-checked={on} onClick={() => setSel(b.id)} style={{ minHeight: 64, boxSizing: 'border-box', padding: '10px 12px', borderRadius: 12, border: `1.5px solid ${on ? 'var(--primary-main)' : 'var(--outline-border)'}`, background: on ? 'var(--soft-primary)' : 'transparent', fontFamily: 'inherit', color: 'var(--text-primary)', textAlign: 'right', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 12 }}>
              <span style={{ width: 40, height: 40, borderRadius: 12, background: 'var(--soft-default)', color: 'var(--default-text)', display: 'grid', placeItems: 'center', flex: 'none' }}><Icon d={P.bank} size={20} /></span>
              <span style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 3, lineHeight: 1.4 }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 14, fontWeight: 600 }}>
                  {b.bankName}
                  {b.id === current && <span className="lbl" style={{ height: 20, background: 'var(--soft-primary)', color: 'var(--primary-text)' }}>پیش‌فرض</span>}
                </span>
                <span className="num" dir="ltr" style={{ fontSize: 12, fontWeight: 400, color: 'var(--text-secondary)', textAlign: 'right' }}>{`IR•• •••• ${faDigits(b.iban.slice(-4))}`}</span>
              </span>
              <span style={{ width: 22, height: 22, boxSizing: 'border-box', borderRadius: '50%', border: `2px solid ${on ? 'var(--primary-main)' : 'var(--outline-border)'}`, display: 'grid', placeItems: 'center', flex: 'none' }}>
                <span style={{ width: 10, height: 10, borderRadius: '50%', background: on ? 'var(--primary-main)' : 'transparent' }} />
              </span>
            </button>
          );
        })}
      </div>
      <div style={{ boxSizing: 'border-box', padding: '10px 12px', borderRadius: 12, background: 'var(--soft-info)', color: 'var(--info-text)', display: 'flex', alignItems: 'center', gap: 10 }}>
        <Icon d={P.info} size={18} />
        <span style={{ fontSize: 12, fontWeight: 500, lineHeight: 1.6 }}>حساب جدید فقط به نام خود شما و از طریق سازمان ثبت می‌شود.</span>
      </div>
      <button className="btn" onClick={save} disabled={setDefault.isPending} style={{ height: 48, width: '100%', boxSizing: 'border-box', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, background: 'var(--primary-main)', color: 'var(--primary-contrast)', boxShadow: 'var(--shadow-primary)', fontSize: 15, opacity: setDefault.isPending ? 0.72 : 1 }}>
        {setDefault.isPending ? 'در حال ذخیره…' : 'ذخیره'}
      </button>
    </GlassSheet>
  );
}

function PasswordSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const change = useChangePasswordCore();
  const [vals, setVals] = useState({ current: '', next: '', confirm: '' });
  const [err, setErr] = useState('');
  const [done, setDone] = useState(false);
  useEffect(() => { if (open) { setVals({ current: '', next: '', confirm: '' }); setErr(''); setDone(false); change.reset(); } }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  const save = () => {
    if (!vals.current) { setErr('رمز فعلی را وارد کنید'); return; }
    if (vals.next.length < 8 || !/[A-Za-z]/.test(vals.next) || !/\d/.test(vals.next)) { setErr('رمز جدید باید حداقل ۸ کاراکتر و شامل عدد و حرف انگلیسی باشد'); return; }
    if (vals.next !== vals.confirm) { setErr('تکرار رمز جدید با رمز جدید یکسان نیست'); return; }
    setErr('');
    change.mutate({ current: vals.current, next: vals.next }, { onSuccess: () => setDone(true) });
  };
  const fields: [keyof typeof vals, string, string][] = [['current', 'رمز فعلی', 'current-password'], ['next', 'رمز جدید', 'new-password'], ['confirm', 'تکرار رمز جدید', 'new-password']];

  return (
    <GlassSheet open={open} onClose={onClose} title="تغییر رمز ورود">
      {!done ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {fields.map(([k, label, ac]) => (
            <label key={k} style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <span style={{ fontSize: 13, fontWeight: 600 }}>{label}</span>
              <input
                type="password" dir="ltr" placeholder="••••••••" aria-label={label} autoComplete={ac}
                value={vals[k]}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => { setVals((v) => ({ ...v, [k]: e.target.value })); setErr(''); }}
                onKeyDown={(e: React.KeyboardEvent<HTMLInputElement>) => { if (e.key === 'Enter') save(); }}
                style={{ height: 48, boxSizing: 'border-box', padding: '0 12px', borderRadius: 8, border: '1px solid var(--outline-border)', background: 'var(--bg-paper)', color: 'var(--text-primary)', fontFamily: 'inherit', fontSize: 16, outline: 'none', textAlign: 'left' }}
              />
            </label>
          ))}
          <span role={err ? 'alert' : undefined} style={{ fontSize: 12, color: err ? 'var(--error-text)' : 'var(--text-secondary)', fontWeight: err ? 600 : 400, lineHeight: 1.6 }}>{err || 'حداقل ۸ کاراکتر، شامل عدد و حرف انگلیسی'}</span>
          <ErrorNote error={change.error} />
          <button className="btn" onClick={save} disabled={change.isPending} style={{ height: 48, width: '100%', boxSizing: 'border-box', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, background: 'var(--primary-main)', color: 'var(--primary-contrast)', boxShadow: 'var(--shadow-primary)', fontSize: 15, opacity: change.isPending ? 0.72 : 1 }}>
            {change.isPending ? 'در حال ذخیره…' : 'ذخیره رمز'}
          </button>
        </div>
      ) : (
        <div style={{ padding: '12px 0 4px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, textAlign: 'center' }}>
          <span style={{ width: 72, height: 72, borderRadius: '50%', background: 'var(--soft-success)', color: 'var(--success-text)', display: 'grid', placeItems: 'center' }}><Icon d={P.check} size={34} strokeWidth={2} /></span>
          <span style={{ fontSize: 18, fontWeight: 700 }}>رمز ورود تغییر کرد</span>
          <span style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.6 }}>از ورود بعدی، رمز جدید را وارد کنید.</span>
          <button className="btn" onClick={onClose} style={{ height: 48, width: '100%', boxSizing: 'border-box', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, background: 'var(--primary-main)', color: 'var(--primary-contrast)', boxShadow: 'var(--shadow-primary)', fontSize: 15, marginTop: 8 }}>بستن</button>
        </div>
      )}
    </GlassSheet>
  );
}

function SupportSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const faq = useFaq();
  const [openIdx, setOpenIdx] = useState(0);
  const items = (faq.data ?? []).slice(0, 3);
  return (
    <GlassSheet open={open} onClose={onClose} title="پشتیبانی و سؤالات">
      <div className="card" style={{ padding: '0 14px', display: 'flex', flexDirection: 'column' }}>
        {faq.isLoading && <div style={{ height: 120 }} />}
        {items.map((f, i) => {
          const on = openIdx === i;
          return (
            <div key={f.id} style={{ borderBottom: `1px dashed ${i === items.length - 1 ? 'transparent' : 'var(--divider)'}` }}>
              <button aria-expanded={on} onClick={() => setOpenIdx(on ? -1 : i)} style={{ width: '100%', minHeight: 52, boxSizing: 'border-box', padding: '10px 0', border: 0, background: 'transparent', fontFamily: 'inherit', color: 'var(--text-primary)', textAlign: 'right', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ flex: 1, minWidth: 0, fontSize: 13, fontWeight: 600, lineHeight: 1.6 }}>{f.q}</span>
                <Icon d={on ? P.chevUp : P.chevDown} size={18} style={{ color: 'var(--text-secondary)' }} />
              </button>
              {on && <p style={{ margin: 0, padding: '0 0 12px', fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.8 }}>{f.a}</p>}
            </div>
          );
        })}
      </div>
      <a href="tel:02191000000" className="card" style={{ boxSizing: 'border-box', padding: '12px 14px', display: 'flex', alignItems: 'center', gap: 12, color: 'var(--text-primary)', textDecoration: 'none' }}>
        <span style={{ width: 40, height: 40, borderRadius: 12, background: 'var(--soft-success)', color: 'var(--success-text)', display: 'grid', placeItems: 'center', flex: 'none' }}><Icon d={P.phone} size={20} /></span>
        <span style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 2, lineHeight: 1.4 }}>
          <span style={{ fontSize: 14, fontWeight: 600 }}>تماس با پشتیبانی</span>
          <span className="num" style={{ fontSize: 12, fontWeight: 400, color: 'var(--text-secondary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>شنبه تا چهارشنبه، ۸ تا ۱۷</span>
        </span>
        <span className="num" dir="ltr" style={{ fontSize: 13, fontWeight: 700, whiteSpace: 'nowrap' }}>۰۲۱-۹۱۰۰۰۰۰۰</span>
      </a>
      <Link href={routes.app.support} className="btn" style={{ height: 44, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--soft-primary)', color: 'var(--primary-text)', textDecoration: 'none' }}>همه پرسش‌ها و درخواست‌ها</Link>
    </GlassSheet>
  );
}
