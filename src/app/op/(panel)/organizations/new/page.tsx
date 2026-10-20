'use client';
/** Operator console — add organization wizard (design: op-org-new): info → contract & limits → org users → created. */
import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type { LockType, Organization } from '@/types/domain';
import { useCreateOrganization, useOpFunds, useOpProducts } from '@/api/op';
import type { OrgCreate } from '@/api/op-core-extra';
import { Icon } from '@/components/ui/Icon';
import { useToast } from '@/components/ui/Toast';
import { contractFunds, fundDot } from '@/components/op/core/ContractEditor';
import { Check, ICON, LkType, Modal, ModalTitle, Switch, TILES, errMsg, parseJalali } from '@/components/op/core/ui';
import { enDigits, faDigits, jDate, money, time } from '@/lib/format';
import { now } from '@/lib/clock';
import { LOCK_META } from '@/lib/locks';
import { routes } from '@/lib/routes';

const SECTORS = ['هلدینگ و سرمایه‌گذاری', 'صنعتی و تولیدی', 'فناوری اطلاعات', 'بیمه و خدمات مالی', 'خدمات و بازرگانی'];
const ROLES = [
  { t: 'مدیر منابع انسانی', bg: 'var(--soft-primary)', fg: 'var(--primary-text)' },
  { t: 'تأییدکننده مالی', bg: 'var(--soft-success)', fg: 'var(--success-text)' },
  { t: 'کارشناس', bg: 'var(--soft-default)', fg: 'var(--default-text)' },
];
const DRAFT_KEY = 'nm-op-org-draft';

interface OrgUser { id: string; name: string; email: string; mobile: string; role: number }
interface Form {
  name: string; nid: string; sector: number; staff: string; rep: string; tel: string;
  loan: number; months: number[]; card: number; perCap: string; bnpl: boolean; cash: boolean; invite: boolean;
  pol: { vesting: boolean; milestone: boolean; collateral: boolean; installment: boolean }; lock: number; msMax: number;
  funds: string[]; start: string; end: string; users: OrgUser[];
}

const blank = (): Form => {
  const t = now();
  return {
    name: '', nid: '', sector: 2, staff: '', rep: '', tel: '',
    loan: 40, months: [6, 12, 18], card: 25, perCap: '50000000', bnpl: true, cash: true, invite: true,
    pol: { vesting: true, milestone: true, collateral: true, installment: true }, lock: 3, msMax: 5,
    funds: ['gold', 'fixed'], start: jDate(t), end: jDate(new Date(t.getTime() + 364 * 86400000)), users: [],
  };
};

function Field({ id, label, error, children }: { id?: string; label: string; error?: string; children: ReactNode }) {
  return (
    <div className="fg">
      <label className="fl" htmlFor={id}>{label}</label>
      {children}
      {error && <span role="alert" style={{ fontSize: 11, color: 'var(--error-text)', fontWeight: 600 }}>{error}</span>}
    </div>
  );
}

function Input({ id, value, onChange, placeholder, ltr, suffix, prefix, error }: { id: string; value: string; onChange: (v: string) => void; placeholder?: string; ltr?: boolean; suffix?: string; prefix?: ReactNode; error?: boolean }) {
  return (
    <span style={{ display: 'flex', alignItems: 'center', height: 40, boxSizing: 'border-box', border: `1px solid ${error ? 'var(--error-main)' : 'var(--outline-border)'}`, borderRadius: 8, background: 'var(--bg-paper)', overflow: 'hidden' }}>
      {prefix && <span style={{ display: 'grid', placeItems: 'center', padding: '0 10px', color: 'var(--text-secondary)' }}>{prefix}</span>}
      <input id={id} dir={ltr ? 'ltr' : undefined} value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} style={{ flex: 1, minWidth: 0, height: 38, border: 0, background: 'transparent', color: 'var(--text-primary)', fontFamily: 'inherit', fontSize: 13, fontVariantNumeric: 'tabular-nums', outline: 0, padding: '0 12px', textAlign: ltr ? 'right' : undefined }} />
      {suffix && <span style={{ height: '100%', display: 'flex', alignItems: 'center', padding: '0 10px', borderRight: '1px solid var(--divider)', fontSize: 12, color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>{suffix}</span>}
    </span>
  );
}

function Stepper({ label, value, onInc, onDec, width = 64, height = 36 }: { label: string; value: string; onInc: () => void; onDec: () => void; width?: number; height?: number }) {
  const b = { width: height, height: height - 2, border: 0, background: 'transparent', color: 'var(--text-secondary)', cursor: 'pointer', display: 'grid', placeItems: 'center', padding: 0 } as const;
  return (
    <div style={{ display: 'inline-flex', alignItems: 'center', height, boxSizing: 'border-box', border: '1px solid var(--outline-border)', borderRadius: 8, overflow: 'hidden', background: 'var(--bg-paper)', flex: 'none' }}>
      <button type="button" aria-label={`افزایش ${label}`} onClick={onInc} style={b}><Icon d={ICON.plus} size={16} strokeWidth={2} /></button>
      <span className="num" aria-live="polite" style={{ minWidth: width, height: height - 2, lineHeight: `${height - 2}px`, textAlign: 'center', fontSize: 14, fontWeight: 500, borderLeft: '1px solid var(--divider)', borderRight: '1px solid var(--divider)' }}>{value}</span>
      <button type="button" aria-label={`کاهش ${label}`} onClick={onDec} style={b}><Icon d={ICON.minus} size={16} strokeWidth={2} /></button>
    </div>
  );
}

function Row({ title, sub, children }: { title: string; sub?: string; children: ReactNode }) {
  return (
    <div style={{ minHeight: 56, display: 'flex', alignItems: 'center', gap: 16, padding: '8px 0', borderBottom: '1px dashed var(--divider)' }}>
      <span style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 2, lineHeight: 1.4 }}><span style={{ fontSize: 13, fontWeight: 600 }}>{title}</span>{sub && <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{sub}</span>}</span>
      {children}
    </div>
  );
}

const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));

export default function OpOrgNewPage() {
  const router = useRouter();
  const toast = useToast();
  const create = useCreateOrganization();
  const fundsQ = useOpFunds();
  const products = useOpProducts();
  const [f, setF] = useState<Form>(blank);
  const [step, setStep] = useState(1);
  const [tried, setTried] = useState<Record<number, boolean>>({});
  const [dd, setDd] = useState(false);
  const [savedAt, setSavedAt] = useState<Date | null>(null);
  const [done, setDone] = useState<Organization | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [nu, setNu] = useState({ name: '', email: '', mobile: '', role: 2 });
  const [nuErr, setNuErr] = useState('');
  const [apiErr, setApiErr] = useState('');
  const loaded = useRef(false);
  const pristine = useRef(JSON.stringify(blank()));
  const ddRef = useRef<HTMLDivElement | null>(null);

  // draft persistence (per browser)
  useEffect(() => {
    try {
      const raw = localStorage.getItem(DRAFT_KEY);
      if (raw) {
        const d = JSON.parse(raw) as { f: Form; step: number; at: string };
        setF({ ...blank(), ...d.f }); setStep(d.step || 1); setSavedAt(new Date(d.at));
      }
    } catch { /* ignore */ }
    loaded.current = true;
  }, []);
  useEffect(() => {
    if (!loaded.current || done) return;
    if (step === 1 && JSON.stringify(f) === pristine.current) return; // nothing typed yet
    const at = new Date();
    try { localStorage.setItem(DRAFT_KEY, JSON.stringify({ f, step, at: at.toISOString() })); setSavedAt(at); } catch { /* ignore */ }
  }, [f, step, done]);
  useEffect(() => {
    if (!dd) return;
    const onDown = (e: Event) => { if (ddRef.current && !ddRef.current.contains(e.target as Node)) setDd(false); };
    window.addEventListener('mousedown', onDown);
    return () => window.removeEventListener('mousedown', onDown);
  }, [dd]);

  const set = (p: Partial<Form>) => { setF((x) => ({ ...x, ...p })); setApiErr(''); };
  const monthsOptions = Array.from(new Set([...(products.data?.find((p) => p.kind === 'loan')?.monthsOptions ?? [3, 6, 12, 18]), ...f.months])).sort((a, b) => a - b);
  const startIso = parseJalali(f.start);
  const endIso = parseJalali(f.end);

  const errors = (n: number): Record<string, string> => {
    const e: Record<string, string> = {};
    if (n === 1) {
      if (f.name.trim().length < 2) e.name = 'نام سازمان را وارد کنید.';
      if (!/^\d{11}$/.test(enDigits(f.nid))) e.nid = 'شناسه ملی ۱۱ رقمی است.';
      const s = Number(enDigits(f.staff));
      if (!Number.isInteger(s) || s < 1) e.staff = 'تعداد کارکنان را وارد کنید.';
      if (f.rep.trim().length < 3) e.rep = 'نام نماینده را وارد کنید.';
      if (enDigits(f.tel).replace(/\D/g, '').length < 8) e.tel = 'شماره تماس معتبر وارد کنید.';
    }
    if (n === 2) {
      if (f.loan > 0 && !f.months.length) e.months = 'حداقل یک گزینه بازپرداخت انتخاب کنید.';
      if (!(Number(enDigits(f.perCap)) > 0)) e.perCap = 'سقف اعتبار هر نفر را وارد کنید.';
      if (!f.funds.length) e.funds = 'حداقل یک صندوق مجاز انتخاب کنید.';
      if (!startIso) e.start = 'تاریخ شروع معتبر نیست (مثلاً ۱۴۰۵/۰۸/۰۱).';
      if (!endIso) e.end = 'تاریخ پایان معتبر نیست.';
      else if (startIso && endIso <= startIso) e.end = 'تاریخ پایان باید بعد از تاریخ شروع باشد.';
    }
    if (n === 3 && !f.users.length) e.users = 'حداقل یک کاربر سازمانی اضافه کنید.';
    return e;
  };
  const err = tried[step] ? errors(step) : {};

  const next = () => {
    const e = errors(step);
    setTried((t) => ({ ...t, [step]: true }));
    if (Object.keys(e).length) { toast('لطفاً خطاهای فرم را برطرف کنید', 'error'); return; }
    setStep((s) => Math.min(3, s + 1)); setDd(false);
  };

  const submit = () => {
    setTried((t) => ({ ...t, 1: true, 2: true, 3: true }));
    for (const n of [1, 2, 3]) if (Object.keys(errors(n)).length) { setStep(n); toast('لطفاً خطاهای فرم را برطرف کنید', 'error'); return; }
    const name = f.name.trim();
    const payload: OrgCreate = {
      name, legalName: name, industry: SECTORS[f.sector], employees: Number(enDigits(f.staff)),
      contractStart: startIso!, contractEnd: endIso!,
      settings: {
        allowedFunds: f.funds, cashWithdrawalAllowed: f.cash,
        lockPolicies: ['none', ...(f.pol.vesting ? (['vesting'] as const) : []), ...(f.pol.milestone ? (['milestone'] as const) : [])],
        loanEnabled: f.loan > 0, loanMaxPct: f.loan, loanMonthsOptions: f.months, cardEnabled: f.card > 0, installmentEnabled: f.bnpl,
      },
      contract: {
        cardPct: f.card, perPersonCap: Number(enDigits(f.perCap)), vestingMaxMonths: f.lock, milestoneMaxSteps: f.msMax,
        allowCollateral: f.pol.collateral, allowInstallmentLock: f.bnpl && f.pol.installment,
        nationalId: enDigits(f.nid), representative: { name: f.rep.trim(), phone: enDigits(f.tel) },
      },
      hrUsers: f.users.map((u) => ({ name: u.name, email: u.email, mobile: enDigits(u.mobile), role: ROLES[u.role].t })),
      sendInvites: f.invite,
    };
    create.mutate(payload, {
      onSuccess: (o) => {
        try { localStorage.removeItem(DRAFT_KEY); } catch { /* ignore */ }
        setDone(o); toast(`سازمان ${o.name} ایجاد شد`);
      },
      onError: (e) => { setApiErr(errMsg(e)); toast(errMsg(e), 'error'); },
    });
  };

  const reset = () => {
    try { localStorage.removeItem(DRAFT_KEY); } catch { /* ignore */ }
    setF(blank()); setStep(1); setTried({}); setDone(null); setApiErr(''); setSavedAt(null);
  };

  const addUser = () => {
    if (nu.name.trim().length < 3) { setNuErr('نام کاربر را وارد کنید.'); return; }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(nu.email.trim())) { setNuErr('ایمیل معتبر وارد کنید.'); return; }
    if (!/^09\d{9}$/.test(enDigits(nu.mobile).replace(/\s/g, ''))) { setNuErr('شماره موبایل باید با ۰۹ شروع شود و ۱۱ رقم باشد.'); return; }
    if (f.users.some((u) => u.email === nu.email.trim())) { setNuErr('این ایمیل قبلاً اضافه شده است.'); return; }
    set({ users: [...f.users, { id: 'nu-' + Date.now(), name: nu.name.trim(), email: nu.email.trim(), mobile: enDigits(nu.mobile).replace(/\s/g, ''), role: nu.role }] });
    setNu({ name: '', email: '', mobile: '', role: 2 }); setNuErr(''); setAddOpen(false);
  };

  const steps = [['اطلاعات سازمان', 'مشخصات و نماینده'], ['قرارداد و محدودیت‌ها', 'تسهیلات، بسته‌ها، صندوق‌ها'], ['کاربران سازمان', 'دسترسی پنل سازمانی']];
  const funds = contractFunds(fundsQ.data);
  const hasApprover = f.users.some((u) => u.role === 1);
  const polRows: { k: keyof Form['pol'] | 'legal'; t: LockType; sub: string; stepper?: { value: string; inc: () => void; dec: () => void } }[] = [
    { k: 'vesting', t: 'vesting', sub: 'قفل تا تاریخ روی بسته‌های سازمانی', stepper: { value: faDigits(f.lock) + ' ماه', inc: () => set({ lock: clamp(f.lock + 1, 1, 24) }), dec: () => set({ lock: clamp(f.lock - 1, 1, 24) }) } },
    { k: 'milestone', t: 'milestone', sub: 'آزادسازی بخش‌به‌بخش با تأیید هر مرحله', stepper: { value: faDigits(f.msMax) + ' مرحله', inc: () => set({ msMax: clamp(f.msMax + 1, 2, 10) }), dec: () => set({ msMax: clamp(f.msMax - 1, 2, 10) }) } },
    { k: 'collateral', t: 'collateral', sub: 'قفل وثیقه روی بخش آزاد · طبق سقف وام و کارت' },
    { k: 'installment', t: 'installment', sub: f.bnpl ? 'هم‌زمان با هر خرید اقساطی کارکنان' : 'نیازمند فعال بودن خرید اقساطی' },
    { k: 'legal', t: 'legal', sub: 'همیشه فعال · فقط توسط بهره‌بردار با شماره مرجع' },
  ];
  const polOn = (k: keyof Form['pol'] | 'legal') => (k === 'legal' ? true : k === 'installment' ? f.bnpl && f.pol.installment : f.pol[k]);
  const polTxt = polRows.filter((p) => p.k !== 'legal' && polOn(p.k)).map((p) => LOCK_META[p.t].short).join('، ');
  const summary = [
    { k: 'شناسه ملی', v: f.nid ? faDigits(enDigits(f.nid)) : '—' },
    { k: 'سقف وام', v: f.loan ? `${faDigits(f.loan)}٪ دارایی آزاد` : 'غیرفعال' },
    { k: 'بازپرداخت', v: f.months.length ? f.months.map((m) => faDigits(m)).join(' / ') + ' ماه' : '—' },
    { k: 'اعتبار کارت', v: f.card ? `${faDigits(f.card)}٪ دارایی آزاد` : 'غیرفعال' },
    { k: 'خرید اقساطی', v: f.bnpl ? 'فعال' : 'غیرفعال' },
    { k: 'قفل‌های مجاز', v: polTxt || 'فقط مسدودی قانونی' },
    { k: 'برداشت نقدی', v: f.cash ? 'مجاز' : 'غیرمجاز' },
    { k: 'صندوق‌ها', v: funds.filter((x) => f.funds.includes(x.id)).map((x) => x.shortName).join('، ') || '—' },
    { k: 'کاربران سازمان', v: faDigits(f.users.length) + ' نفر' },
  ];

  return (
    <>
      <div style={{ minHeight: 48, flex: 'none', display: 'flex', alignItems: 'center', gap: 14 }}>
        <Link href={routes.op.organizations} className="ibtn" aria-label="بازگشت" style={{ width: 40, height: 40, border: '1px solid var(--outline-border)', borderRadius: 10, flex: 'none', color: 'var(--text-primary)', boxSizing: 'border-box' }}><Icon d="M9 6l6 6-6 6" size={20} /></Link>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, minWidth: 0 }}>
          <h4 style={{ margin: 0, fontSize: 20, lineHeight: 1.3, fontWeight: 700 }}>افزودن سازمان</h4>
          <nav aria-label="مسیر" style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 13, lineHeight: 1.3 }}>
            <Link href={routes.op.overview} style={{ color: 'var(--text-primary)' }}>بهره‌بردار</Link>
            <span style={{ width: 4, height: 4, borderRadius: '50%', background: 'var(--text-disabled)' }} />
            <Link href={routes.op.organizations} style={{ color: 'var(--text-primary)' }}>سازمان‌ها و قراردادها</Link>
            <span style={{ width: 4, height: 4, borderRadius: '50%', background: 'var(--text-disabled)' }} />
            <span style={{ color: 'var(--text-disabled)' }}>افزودن سازمان</span>
          </nav>
        </div>
        {!done && (
          <div style={{ marginRight: 'auto', display: 'flex', alignItems: 'center', gap: 8 }}>
            <span className="lbl" style={{ background: 'var(--soft-default)', color: 'var(--default-text)' }}>{savedAt ? `پیش‌نویس ذخیره‌شده · ${time(savedAt)}` : 'پیش‌نویس جدید'}</span>
            <button type="button" className="btnt" onClick={reset} style={{ height: 30 }}>شروع دوباره</button>
          </div>
        )}
      </div>

      {!done ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          <div className="card" style={{ flex: 'none', boxSizing: 'border-box', padding: '16px 24px', display: 'flex', alignItems: 'center', gap: 16 }}>
            {steps.map(([t, sub], i) => {
              const n = i + 1, isDone = n < step, cur = n === step;
              return (
                <span key={t} style={{ display: 'contents' }}>
                  <button type="button" onClick={() => { if (n <= step) { setStep(n); setDd(false); } }} aria-current={cur ? 'step' : undefined} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: 0, border: 0, background: 'transparent', fontFamily: 'inherit', color: 'inherit', cursor: n <= step ? 'pointer' : 'default', textAlign: 'right', flex: 'none' }}>
                    <span style={{ width: 36, height: 36, borderRadius: '50%', display: 'grid', placeItems: 'center', background: isDone || cur ? 'var(--primary-main)' : 'var(--step-pending)', color: isDone || cur ? 'var(--primary-contrast)' : 'var(--step-pending-text)', fontSize: 14, fontWeight: 700, flex: 'none', boxShadow: cur ? '0 0 0 4px var(--soft-primary)' : 'none' }}>
                      {isDone ? <Icon d={ICON.check} size={14} strokeWidth={3} /> : faDigits(n)}
                    </span>
                    <span style={{ display: 'flex', flexDirection: 'column', lineHeight: 1.35 }}><span style={{ fontSize: 14, fontWeight: 700, color: isDone || cur ? 'var(--text-primary)' : 'var(--text-secondary)' }}>{t}</span><span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{sub}</span></span>
                  </button>
                  {i < 2 && <span style={{ flex: 1, minWidth: 24, height: 2, borderRadius: 1, background: isDone ? 'var(--primary-main)' : 'var(--divider)' }} />}
                </span>
              );
            })}
          </div>

          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 20 }}>
            <div className="card" style={{ flex: 1, minWidth: 0, boxSizing: 'border-box', padding: 24, display: 'flex', flexDirection: 'column', gap: 20 }}>
              {step === 1 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}><h6 style={{ margin: 0, fontSize: 16, fontWeight: 700 }}>اطلاعات سازمان</h6><span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>مشخصات حقوقی سازمان و نماینده‌ای که قرارداد را امضا می‌کند.</span></div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px 20px' }}>
                    <Field id="o-name" label="نام سازمان" error={err.name}><Input id="o-name" value={f.name} onChange={(v) => set({ name: v })} placeholder="مثلاً شرکت توسعه آفاق" error={!!err.name} /></Field>
                    <Field id="o-nid" label="شناسه ملی" error={err.nid}><Input id="o-nid" ltr value={faDigits(f.nid)} onChange={(v) => set({ nid: enDigits(v).replace(/\D/g, '').slice(0, 11) })} placeholder="۱۴۰۰۸۷۶۵۴۳۲" error={!!err.nid} /></Field>
                    <div className="fg" style={{ position: 'relative' }} ref={ddRef}>
                      <span className="fl" id="sector-l">حوزه فعالیت</span>
                      <button type="button" aria-labelledby="sector-l" aria-haspopup="listbox" aria-expanded={dd} onClick={() => setDd((x) => !x)} style={{ height: 40, boxSizing: 'border-box', display: 'flex', alignItems: 'center', gap: 8, padding: '0 12px', border: `1px solid ${dd ? 'var(--primary-main)' : 'var(--outline-border)'}`, borderRadius: 8, background: 'var(--bg-paper)', color: 'var(--text-primary)', fontFamily: 'inherit', fontSize: 13, cursor: 'pointer', textAlign: 'right' }}>
                        <span style={{ flex: 1 }}>{SECTORS[f.sector]}</span><Icon d={ICON.chevD} size={16} style={{ color: 'var(--text-secondary)' }} />
                      </button>
                      {dd && (
                        <div className="glass" role="listbox" aria-labelledby="sector-l" style={{ position: 'absolute', top: 70, right: 0, left: 0, zIndex: 10, borderRadius: 12, padding: 6, display: 'flex', flexDirection: 'column', gap: 2, boxShadow: 'var(--shadow-dropdown)', background: 'var(--bg-paper)' }}>
                          {SECTORS.map((s, i) => {
                            const on = i === f.sector;
                            return (
                              <button key={s} type="button" role="option" aria-selected={on} onClick={() => { set({ sector: i }); setDd(false); }} style={{ height: 36, display: 'flex', alignItems: 'center', gap: 8, padding: '0 10px', border: 0, borderRadius: 8, background: on ? 'var(--nav-active)' : 'transparent', color: 'var(--text-primary)', fontFamily: 'inherit', fontSize: 13, fontWeight: on ? 700 : 500, cursor: 'pointer', textAlign: 'right' }}>
                                <span style={{ flex: 1 }}>{s}</span>{on && <span style={{ color: 'var(--primary-text)', display: 'grid' }}><Icon d={ICON.check} size={14} strokeWidth={3} /></span>}
                              </button>
                            );
                          })}
                        </div>
                      )}
                    </div>
                    <Field id="o-staff" label="تعداد کارکنان" error={err.staff}><Input id="o-staff" value={faDigits(f.staff)} onChange={(v) => set({ staff: enDigits(v).replace(/\D/g, '').slice(0, 6) })} placeholder="۲۶۰" suffix="نفر" error={!!err.staff} /></Field>
                    <Field id="o-rep" label="نماینده سازمان" error={err.rep}><Input id="o-rep" value={f.rep} onChange={(v) => set({ rep: v })} placeholder="نام و نام خانوادگی" error={!!err.rep} /></Field>
                    <Field id="o-tel" label="تلفن نماینده" error={err.tel}><Input id="o-tel" ltr value={faDigits(f.tel)} onChange={(v) => set({ tel: enDigits(v).replace(/[^\d-]/g, '').slice(0, 14) })} placeholder="۰۲۱-۴۴۵۵۰۰۰۰" error={!!err.tel} /></Field>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: '12px 14px', borderRadius: 12, background: 'var(--soft-info)', color: 'var(--info-text)', fontSize: 13, lineHeight: 1.6 }}>
                    <Icon d={ICON.info} size={20} style={{ marginTop: 1 }} />
                    <span>پس از ایجاد، قرارداد با وضعیت «در حال عقد» ثبت می‌شود و تا امضای نماینده سازمان، کارکنان نمی‌توانند بسته دریافت کنند.</span>
                  </div>
                </div>
              )}

              {step === 2 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}><h6 style={{ margin: 0, fontSize: 16, fontWeight: 700 }}>قرارداد و محدودیت‌ها</h6><span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>این مقادیر سقف چیزی است که منابع انسانی سازمان می‌تواند به کارکنان بدهد.</span></div>
                  <div style={{ display: 'flex', flexDirection: 'column' }}>
                    <span className="sec">تسهیلات</span>
                    <Row title="سقف وام" sub="درصدی از دارایی آزاد کارمند که به‌عنوان وثیقه قفل می‌شود"><Stepper label="سقف وام" value={f.loan ? faDigits(f.loan) + '٪' : 'غیرفعال'} onInc={() => set({ loan: clamp(f.loan + 5, 0, 60) })} onDec={() => set({ loan: clamp(f.loan - 5, 0, 60) })} /></Row>
                    <Row title="گزینه‌های بازپرداخت" sub={err.months ?? 'کارمند یکی از این مدت‌ها را انتخاب می‌کند'}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                        {monthsOptions.map((m) => {
                          const on = f.months.includes(m);
                          return <button key={m} type="button" aria-pressed={on} disabled={!f.loan} onClick={() => set({ months: on ? f.months.filter((x) => x !== m) : [...f.months, m].sort((a, b) => a - b) })} style={{ height: 32, minWidth: 44, padding: '0 10px', borderRadius: 8, border: `1px solid ${on ? 'var(--primary-main)' : 'var(--outline-border)'}`, background: on ? 'var(--soft-primary)' : 'transparent', color: on ? 'var(--primary-text)' : 'var(--text-secondary)', fontFamily: 'inherit', fontSize: 12, fontWeight: 700, fontVariantNumeric: 'tabular-nums', cursor: f.loan ? 'pointer' : 'default', whiteSpace: 'nowrap', opacity: f.loan ? 1 : 0.5 }}>{faDigits(m)} ماه</button>;
                        })}
                      </div>
                    </Row>
                    {err.months && <span role="alert" style={{ fontSize: 11, color: 'var(--error-text)', fontWeight: 600, paddingTop: 4 }}>{err.months}</span>}
                    <Row title="اعتبار کارت" sub="درصدی از دارایی آزاد برای شارژ کارت نمادنو"><Stepper label="اعتبار کارت" value={f.card ? faDigits(f.card) + '٪' : 'غیرفعال'} onInc={() => set({ card: clamp(f.card + 5, 0, 50) })} onDec={() => set({ card: clamp(f.card - 5, 0, 50) })} /></Row>
                    <Row title="سقف اعتبار هر نفر" sub={err.perCap}>
                      <span style={{ display: 'flex', alignItems: 'center', height: 36, boxSizing: 'border-box', border: `1px solid ${err.perCap ? 'var(--error-main)' : 'var(--outline-border)'}`, borderRadius: 8, background: 'var(--bg-paper)', overflow: 'hidden', flex: 'none' }}>
                        <input id="o-percap" aria-label="سقف اعتبار هر نفر" inputMode="numeric" value={f.perCap ? money(Number(f.perCap)) : ''} onChange={(e) => set({ perCap: enDigits(e.target.value).replace(/\D/g, '').slice(0, 12) })} style={{ width: 120, height: 34, border: 0, background: 'transparent', color: 'var(--text-primary)', fontFamily: 'inherit', fontSize: 13, fontVariantNumeric: 'tabular-nums', textAlign: 'center', outline: 0 }} />
                        <span style={{ height: '100%', display: 'flex', alignItems: 'center', padding: '0 10px', borderRight: '1px solid var(--divider)', fontSize: 12, color: 'var(--text-secondary)' }}>تومان</span>
                      </span>
                    </Row>
                    <Row title="خرید اقساطی" sub="فروشگاه‌های طرف قرارداد با قفل وثیقه روی دارایی"><Switch on={f.bnpl} onToggle={() => set({ bnpl: !f.bnpl })} label="خرید اقساطی" /></Row>
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column' }}>
                    <span className="sec">سیاست‌های قفل مجاز</span>
                    <span style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.6, marginBottom: 4 }}>سازمان فقط با این سیاست‌ها می‌تواند بسته ارسال کند یا وثیقه بگیرد. دارایی قفل‌شده سود می‌گیرد ولی تا آزادسازی قابل فروش یا برداشت نیست.</span>
                    {polRows.map((p) => {
                      const on = polOn(p.k);
                      const dis = p.k === 'legal' || (p.k === 'installment' && !f.bnpl);
                      return (
                        <div key={p.k} style={{ minHeight: 52, display: 'flex', alignItems: 'center', gap: 12, padding: '6px 0', borderBottom: '1px dashed var(--divider)', opacity: dis && p.k !== 'legal' ? 0.5 : 1 }}>
                          <Check on={on} label={LOCK_META[p.t].label} disabled={dis} onToggle={() => { if (p.k !== 'legal') set({ pol: { ...f.pol, [p.k]: !f.pol[p.k] } }); }} />
                          <LkType type={p.t} />
                          <span style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 2, lineHeight: 1.4 }}><span style={{ fontSize: 13, fontWeight: 600 }}>{LOCK_META[p.t].label}</span><span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{p.sub}</span></span>
                          {p.stepper && on && <><span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>حداکثر</span><Stepper label={LOCK_META[p.t].label} value={p.stepper.value} onInc={p.stepper.inc} onDec={p.stepper.dec} width={84} height={32} /></>}
                        </div>
                      );
                    })}
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column' }}>
                    <span className="sec">بسته‌ها و صندوق‌ها</span>
                    <Row title="برداشت نقدی" sub="اجازه برداشت ریالی در بسته‌های جدید"><Switch on={f.cash} onToggle={() => set({ cash: !f.cash })} label="برداشت نقدی" /></Row>
                    <Row title="صندوق‌های مجاز" sub={err.funds ?? 'کارکنان فقط به این صندوق‌ها تخصیص می‌دهند'}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 18, flexWrap: 'wrap' }}>
                        {funds.map((x) => {
                          const soon = x.status === 'coming_soon';
                          const on = f.funds.includes(x.id);
                          return (
                            <span key={x.id} style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: 13, fontWeight: 500, color: soon ? 'var(--text-disabled)' : 'var(--text-primary)' }}>
                              <Check on={on && !soon} label={x.name} disabled={soon} dim={soon} onToggle={() => set({ funds: on ? f.funds.filter((y) => y !== x.id) : [...f.funds, x.id] })} />
                              <span style={{ width: 8, height: 8, borderRadius: '50%', background: `var(${fundDot(x.id)})`, flex: 'none' }} />{x.name}
                              {soon && <span className="lbl" style={{ height: 20, padding: '0 6px', fontSize: 11, background: 'var(--soft-default)', color: 'var(--default-text)' }}>به‌زودی</span>}
                            </span>
                          );
                        })}
                      </div>
                    </Row>
                    {err.funds && <span role="alert" style={{ fontSize: 11, color: 'var(--error-text)', fontWeight: 600, paddingTop: 4 }}>{err.funds}</span>}
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                    <span className="sec">مدت قرارداد</span>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px 20px' }}>
                      <Field id="o-start" label="تاریخ شروع" error={err.start}><Input id="o-start" ltr value={f.start} onChange={(v) => set({ start: faDigits(enDigits(v).replace(/[^\d/]/g, '').slice(0, 10)) })} prefix={<Icon d={ICON.calendar} size={18} />} placeholder="۱۴۰۵/۰۸/۰۱" error={!!err.start} /></Field>
                      <Field id="o-end" label="تاریخ پایان" error={err.end}><Input id="o-end" ltr value={f.end} onChange={(v) => set({ end: faDigits(enDigits(v).replace(/[^\d/]/g, '').slice(0, 10)) })} prefix={<Icon d={ICON.calendar} size={18} />} placeholder="۱۴۰۶/۰۷/۳۰" error={!!err.end} /></Field>
                    </div>
                  </div>
                </div>
              )}

              {step === 3 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                  <div style={{ display: 'flex', alignItems: 'flex-end', gap: 12 }}>
                    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 4 }}><h6 style={{ margin: 0, fontSize: 16, fontWeight: 700 }}>کاربران سازمان</h6><span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>این افراد به پنل سازمانی دسترسی می‌گیرند. برای ارسال بسته، حداقل یک تأییدکننده مالی لازم است.</span></div>
                    <button type="button" className="btno" onClick={() => { setNuErr(''); setAddOpen(true); }}><Icon d={ICON.plus} size={18} strokeWidth={2} />افزودن</button>
                  </div>
                  <div style={{ border: `1px solid ${err.users ? 'var(--error-main)' : 'var(--divider)'}`, borderRadius: 12, overflow: 'hidden' }}>
                    <div style={{ height: 36, display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 150px 190px 40px', alignItems: 'center', gap: 12, padding: '0 14px', background: 'var(--table-head)', color: 'var(--grey-600)', fontSize: 12, fontWeight: 700 }}>
                      <span>کاربر</span><span>موبایل</span><span>نقش (برای تغییر کلیک کنید)</span><span />
                    </div>
                    {f.users.map((u, i) => {
                      const r = ROLES[u.role];
                      return (
                        <div key={u.id} style={{ minHeight: 60, display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 150px 190px 40px', alignItems: 'center', gap: 12, padding: '0 14px', borderTop: '1px dashed var(--divider)', fontSize: 13 }}>
                          <span style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
                            <span style={{ width: 36, height: 36, borderRadius: '50%', background: TILES[i % 5][0], color: TILES[i % 5][1], display: 'grid', placeItems: 'center', fontWeight: 700, flex: 'none' }}>{u.name[0]}</span>
                            <span style={{ display: 'flex', flexDirection: 'column', lineHeight: 1.35, minWidth: 0 }}><span style={{ fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{u.name}</span><span dir="ltr" style={{ fontSize: 12, color: 'var(--text-secondary)', textAlign: 'right', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{u.email}</span></span>
                          </span>
                          <span className="num" dir="ltr" style={{ fontSize: 13, fontWeight: 400, textAlign: 'right' }}>{faDigits(u.mobile.replace(/^(\d{4})(\d{3})(\d{4})$/, '$1 $2 $3'))}</span>
                          <span><button type="button" onClick={() => set({ users: f.users.map((x) => (x.id === u.id ? { ...x, role: (x.role + 1) % 3 } : x)) })} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, height: 30, padding: '0 10px', borderRadius: 8, border: 0, background: r.bg, color: r.fg, fontFamily: 'inherit', fontSize: 12, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap' }}>{r.t}<Icon d={ICON.chevD} size={14} /></button></span>
                          <button type="button" className="ibtn" aria-label={`حذف ${u.name}`} onClick={() => set({ users: f.users.filter((x) => x.id !== u.id) })} style={{ width: 36, height: 36, color: 'var(--error-text)' }}><Icon d={ICON.trash} size={18} /></button>
                        </div>
                      );
                    })}
                    {!f.users.length && <div style={{ height: 72, display: 'grid', placeItems: 'center', borderTop: '1px dashed var(--divider)', fontSize: 13, color: err.users ? 'var(--error-text)' : 'var(--text-secondary)' }}>{err.users ?? 'هنوز کاربری اضافه نشده است.'}</div>}
                  </div>
                  {!hasApprover && f.users.length > 0 && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 14px', borderRadius: 12, background: 'var(--soft-warning)', color: 'var(--warning-text)', fontSize: 13, fontWeight: 600 }}>
                      <Icon d="M12 4l9 16H3zM12 10v4M12 17h.01" size={20} />
                      <span>هیچ کاربری نقش «تأییدکننده مالی» ندارد؛ بسته‌ها بدون تأیید مالی ارسال نمی‌شوند.</span>
                    </div>
                  )}
                  <Row title="ارسال دعوت‌نامه پیامکی" sub="لینک ورود به پنل سازمانی برای کاربران ارسال می‌شود"><Switch on={f.invite} onToggle={() => set({ invite: !f.invite })} label="ارسال دعوت‌نامه" /></Row>
                </div>
              )}

              {apiErr && <div role="alert" style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', borderRadius: 8, background: 'var(--soft-error)', color: 'var(--error-text)', fontSize: 12, fontWeight: 600 }}><Icon d={ICON.alert} size={16} />{apiErr}</div>}

              <div style={{ marginTop: 4, paddingTop: 16, borderTop: '1px solid var(--divider)', display: 'flex', alignItems: 'center', gap: 8 }}>
                {step === 1 ? <Link href={routes.op.organizations} className="btno">انصراف</Link> : <button type="button" className="btno" onClick={() => { setStep((s) => Math.max(1, s - 1)); setDd(false); }}><Icon d="M9 6l6 6-6 6" size={18} />قبلی</button>}
                <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>مرحله <span className="num" style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{faDigits(step)}</span> از ۳</span>
                <span style={{ marginRight: 'auto' }} />
                {step < 3
                  ? <button type="button" className="btnp" onClick={next} style={{ height: 40, padding: '0 20px', fontSize: 14 }}>بعدی<Icon d={ICON.chevL} size={18} /></button>
                  : <button type="button" className="btnp" disabled={create.isPending} onClick={submit} style={{ height: 40, padding: '0 20px', fontSize: 14, boxShadow: 'var(--shadow-primary)', opacity: create.isPending ? 0.7 : 1 }}><Icon d={ICON.check} size={18} strokeWidth={2} />{create.isPending ? 'در حال ایجاد…' : 'ایجاد سازمان'}</button>}
              </div>
            </div>

            <div style={{ width: 320, flex: 'none', display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div className="card" style={{ boxSizing: 'border-box', padding: 20, display: 'flex', flexDirection: 'column', gap: 12 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span style={{ width: 40, height: 40, borderRadius: 10, background: 'var(--soft-primary)', color: 'var(--primary-text)', display: 'grid', placeItems: 'center', fontWeight: 700, flex: 'none' }}>{f.name.trim()[0] ?? 'س'}</span>
                  <span style={{ display: 'flex', flexDirection: 'column', lineHeight: 1.35, minWidth: 0 }}><span style={{ fontSize: 15, fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{f.name.trim() || 'سازمان جدید'}</span><span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{SECTORS[f.sector]}{f.staff ? ` · ${faDigits(f.staff)} نفر` : ''}</span></span>
                </div>
                <span className="lbl" style={{ alignSelf: 'flex-start', background: 'var(--soft-info)', color: 'var(--info-text)' }}>پیش‌نویس قرارداد · نسخه ۱</span>
                <div style={{ display: 'flex', flexDirection: 'column' }}>
                  {summary.map((m) => (
                    <div key={m.k} style={{ minHeight: 34, display: 'flex', alignItems: 'center', gap: 10, borderBottom: '1px dashed var(--divider)', fontSize: 13 }}>
                      <span style={{ flex: 'none', color: 'var(--text-secondary)' }}>{m.k}</span>
                      <span className="num" style={{ marginRight: 'auto', fontWeight: 600, fontSize: 13, textAlign: 'left', minWidth: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{m.v}</span>
                    </div>
                  ))}
                </div>
              </div>
              <div className="card" style={{ boxSizing: 'border-box', padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 10 }}>
                <span className="sec">پیشرفت</span>
                {steps.map(([t], i) => {
                  const n = i + 1, d = n < step, cur = n === step;
                  return (
                    <div key={t} style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 13 }}>
                      <span style={{ width: 20, height: 20, borderRadius: '50%', display: 'grid', placeItems: 'center', background: d ? 'var(--soft-success)' : cur ? 'var(--soft-primary)' : 'var(--soft-default)', color: d ? 'var(--success-text)' : cur ? 'var(--primary-text)' : 'var(--default-text)', flex: 'none' }}><Icon d={d ? ICON.check : 'M12 12h.01'} size={12} strokeWidth={3} /></span>
                      <span style={{ flex: 1, fontWeight: 500 }}>{t}</span>
                      <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{d ? 'تکمیل شد' : cur ? 'در حال ویرایش' : 'باقی‌مانده'}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      ) : (
        <div className="card" style={{ flex: 'none', boxSizing: 'border-box', padding: '48px 40px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16, textAlign: 'center' }}>
          <span style={{ width: 80, height: 80, borderRadius: '50%', background: 'var(--soft-success)', color: 'var(--success-text)', display: 'grid', placeItems: 'center' }}><Icon d={ICON.check} size={40} strokeWidth={2} /></span>
          <h3 style={{ margin: 0, fontSize: 24, fontWeight: 700, lineHeight: 1.4 }}>سازمان ایجاد شد</h3>
          <span style={{ fontSize: 15, fontWeight: 600 }}>{done.name}</span>
          <span className="num" style={{ fontSize: 14, color: 'var(--text-secondary)' }}>قرارداد <span dir="ltr">{done.contractNo}</span> · نسخه ۱ · سقف وام {f.loan ? faDigits(f.loan) + '٪' : 'غیرفعال'} · اعتبار کارت {f.card ? faDigits(f.card) + '٪' : 'غیرفعال'} · {faDigits(f.users.length)} کاربر سازمانی</span>
          <span className="lbl" style={{ background: 'var(--soft-info)', color: 'var(--info-text)' }}>در حال عقد — در انتظار امضای نماینده</span>
          {f.invite && f.users.length > 0 && <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>دعوت‌نامه پیامکی برای {faDigits(f.users.length)} کاربر ارسال شد.</span>}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 8 }}>
            <button type="button" className="btnp" onClick={() => router.push(routes.op.organization(done.id))} style={{ height: 44, padding: '0 24px', fontSize: 14, boxShadow: 'var(--shadow-primary)' }}>مشاهده سازمان</button>
            <Link href={routes.op.organizations} className="btno" style={{ height: 44, padding: '0 20px', fontSize: 14 }}>مشاهده سازمان‌ها</Link>
            <button type="button" className="btnt" onClick={reset} style={{ height: 44, padding: '0 16px', fontSize: 14 }}>افزودن سازمان دیگر</button>
          </div>
        </div>
      )}

      <Modal open={addOpen} onClose={() => setAddOpen(false)} label="افزودن کاربر سازمان">
        <ModalTitle title="افزودن کاربر سازمان" onClose={() => setAddOpen(false)} />
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <label className="fg" htmlFor="nu-name" style={{ gridColumn: '1 / -1' }}><span className="fl">نام و نام خانوادگی</span><input id="nu-name" className="fi" value={nu.name} onChange={(e) => { setNu({ ...nu, name: e.target.value }); setNuErr(''); }} /></label>
          <label className="fg" htmlFor="nu-email"><span className="fl">ایمیل</span><input id="nu-email" className="fi" dir="ltr" value={nu.email} onChange={(e) => { setNu({ ...nu, email: e.target.value }); setNuErr(''); }} /></label>
          <label className="fg" htmlFor="nu-mobile"><span className="fl">موبایل</span><input id="nu-mobile" className="fi" dir="ltr" inputMode="numeric" placeholder="۰۹۱۲۰۰۰۰۰۰۰" value={faDigits(nu.mobile)} onChange={(e) => { setNu({ ...nu, mobile: enDigits(e.target.value).replace(/\D/g, '').slice(0, 11) }); setNuErr(''); }} /></label>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <span className="fl">نقش</span>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>{ROLES.map((r, i) => <button key={r.t} type="button" className={'chip' + (nu.role === i ? ' on' : '')} aria-pressed={nu.role === i} onClick={() => setNu({ ...nu, role: i })}>{r.t}</button>)}</div>
        </div>
        {nuErr && <span role="alert" style={{ fontSize: 12, color: 'var(--error-text)', fontWeight: 600 }}>{nuErr}</span>}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <button type="button" className="btnp" onClick={addUser}>افزودن کاربر</button>
          <button type="button" className="btno" onClick={() => setAddOpen(false)}>انصراف</button>
        </div>
      </Modal>
    </>
  );
}
