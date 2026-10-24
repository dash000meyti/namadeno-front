'use client';
/**
 * Operator console — add organization. Kit wizard: heading → steps (info → contract & limits → organization users)
 * → form cards and settings groups → sticky action bar, with a summary of the draft on the side.
 * The draft is kept in this browser (localStorage) until the organization is created.
 */
import { Fragment, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type { LockType, Organization } from '@/types/domain';
import { useCreateOrganization, useOpFunds, useOpProducts } from '@/api/op';
import type { OrgCreate } from '@/api/op-core-extra';
import {
  ActionBar, Ava, Card, Chips, Dialog, Empty, Field, KV, List, ListRow, Note, NumInput, NumberInput, PageHeading, Pill, Select,
  SettingRow, SettingsGroup, Switch, Who,
} from '@/components/panel/kit';
import { Icon } from '@/components/ui/Icon';
import { LockTypeChip } from '@/components/ui/LockBar';
import { useToast } from '@/components/ui/Toast';
import { contractFunds, fundMeta } from '@/components/op/core/ContractEditor';
import { ICON, errMsg, parseJalali } from '@/components/op/core/ui';
import { enDigits, faDigits, jDate, time } from '@/lib/format';
import { now } from '@/lib/clock';
import { LOCK_META } from '@/lib/locks';
import { routes } from '@/lib/routes';

const SECTORS = ['هلدینگ و سرمایه‌گذاری', 'صنعتی و تولیدی', 'فناوری اطلاعات', 'بیمه و خدمات مالی', 'خدمات و بازرگانی'];
const ROLES = ['مدیر منابع انسانی', 'تأییدکننده مالی', 'کارشناس'];
const STEPS = [
  { label: 'اطلاعات سازمان', sub: 'مشخصات و نماینده' },
  { label: 'قرارداد و محدودیت‌ها', sub: 'تسهیلات، بسته‌ها، صندوق‌ها' },
  { label: 'کاربران سازمان', sub: 'دسترسی پنل سازمانی' },
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

const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
/** Whole number in [a, b]; an empty field counts as the minimum. */
const whole = (n: number, a: number, b: number) => (Number.isFinite(n) ? clamp(Math.round(n), a, b) : a);
const errText = (msg?: string) => (msg ? <span className="nm-help err" role="alert">{msg}</span> : undefined);

/** Namadno One text field (.nm-ctl) for the form cards and dialogs. */
function Ctl({ id, value, onChange, placeholder, ltr, suffix, invalid, numeric }: { id: string; value: string; onChange: (v: string) => void; placeholder?: string; ltr?: boolean; suffix?: string; invalid?: boolean; numeric?: boolean }) {
  return (
    <div className={'nm-ctl' + (invalid ? ' err' : '')}>
      <input id={id} dir={ltr ? 'ltr' : undefined} inputMode={numeric ? 'numeric' : undefined} value={value} placeholder={placeholder} aria-invalid={invalid || undefined} onChange={(e) => onChange(e.target.value)} style={ltr ? { textAlign: 'right' } : undefined} />
      {suffix && <span className="mute" style={{ fontSize: 13, flex: 'none' }}>{suffix}</span>}
    </div>
  );
}

/** The kit's steps (same classes) with finished steps clickable to go back — the kit Steps only links by href. */
function StepNav({ current, onPick }: { current: number; onPick: (i: number) => void }) {
  return (
    <nav className="nm-steps" aria-label="مراحل">
      {STEPS.map((s, i) => {
        const inner = (<><i>{i < current ? <Icon d={ICON.check} size={14} strokeWidth={2.4} /> : faDigits(i + 1)}</i><span className="nm-col"><b>{s.label}</b><small>{s.sub}</small></span></>);
        return (
          <Fragment key={s.label}>
            {i > 0 && <span className={'ln' + (i <= current ? ' done' : '')} aria-hidden="true" />}
            {i < current
              ? <button type="button" className="nm-step done" onClick={() => onPick(i)} style={{ border: 0, background: 'transparent', padding: 0, fontFamily: 'inherit', textAlign: 'right', cursor: 'pointer' }}>{inner}</button>
              : <span className={'nm-step' + (i === current ? ' cur' : '')} aria-current={i === current ? 'step' : undefined}>{inner}</span>}
          </Fragment>
        );
      })}
    </nav>
  );
}

export default function OpOrgNewPage() {
  const router = useRouter();
  const toast = useToast();
  const create = useCreateOrganization();
  const fundsQ = useOpFunds();
  const products = useOpProducts();
  const [f, setF] = useState<Form>(blank);
  const [step, setStep] = useState(1);
  const [tried, setTried] = useState<Record<number, boolean>>({});
  const [savedAt, setSavedAt] = useState<Date | null>(null);
  const [done, setDone] = useState<Organization | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [nu, setNu] = useState({ name: '', email: '', mobile: '', role: 2 });
  const [nuErr, setNuErr] = useState('');
  const [apiErr, setApiErr] = useState('');
  const loaded = useRef(false);
  const pristine = useRef(JSON.stringify(blank()));

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
    setStep((s) => Math.min(3, s + 1));
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
      hrUsers: f.users.map((u) => ({ name: u.name, email: u.email, mobile: enDigits(u.mobile), role: ROLES[u.role] })),
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

  const openAdd = () => { setNuErr(''); setAddOpen(true); };
  const addUser = () => {
    if (nu.name.trim().length < 3) { setNuErr('نام کاربر را وارد کنید.'); return; }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(nu.email.trim())) { setNuErr('ایمیل معتبر وارد کنید.'); return; }
    if (!/^09\d{9}$/.test(enDigits(nu.mobile).replace(/\s/g, ''))) { setNuErr('شماره موبایل باید با ۰۹ شروع شود و ۱۱ رقم باشد.'); return; }
    if (f.users.some((u) => u.email === nu.email.trim())) { setNuErr('این ایمیل قبلاً اضافه شده است.'); return; }
    set({ users: [...f.users, { id: 'nu-' + Date.now(), name: nu.name.trim(), email: nu.email.trim(), mobile: enDigits(nu.mobile).replace(/\s/g, ''), role: nu.role }] });
    setNu({ name: '', email: '', mobile: '', role: 2 }); setNuErr(''); setAddOpen(false);
  };

  const funds = contractFunds(fundsQ.data);
  const hasApprover = f.users.some((u) => u.role === 1);
  const polRows: { k: keyof Form['pol'] | 'legal'; t: LockType; sub: string; max?: { value: number; set: (n: number) => void; suffix: string } }[] = [
    { k: 'vesting', t: 'vesting', sub: 'قفل تا تاریخ روی بسته‌های سازمانی', max: { value: f.lock, set: (n) => set({ lock: whole(n, 1, 24) }), suffix: 'ماه' } },
    { k: 'milestone', t: 'milestone', sub: 'آزادسازی بخش‌به‌بخش با تأیید هر مرحله', max: { value: f.msMax, set: (n) => set({ msMax: whole(n, 2, 10) }), suffix: 'مرحله' } },
    { k: 'collateral', t: 'collateral', sub: 'قفل وثیقه روی بخش آزاد · طبق سقف وام و کارت' },
    { k: 'installment', t: 'installment', sub: f.bnpl ? 'هم‌زمان با هر خرید اقساطی کارکنان' : 'نیازمند فعال بودن خرید اقساطی' },
    { k: 'legal', t: 'legal', sub: 'همیشه فعال · فقط توسط بهره‌بردار با شماره مرجع' },
  ];
  const polOn = (k: keyof Form['pol'] | 'legal') => (k === 'legal' ? true : k === 'installment' ? f.bnpl && f.pol.installment : f.pol[k]);
  const polTxt = polRows.filter((p) => p.k !== 'legal' && polOn(p.k)).map((p) => LOCK_META[p.t].short).join('، ');
  const summary: [string, string][] = [
    ['شناسه ملی', f.nid ? faDigits(enDigits(f.nid)) : '—'],
    ['سقف وام', f.loan ? `${faDigits(f.loan)}٪ دارایی آزاد` : 'غیرفعال'],
    ['بازپرداخت', f.months.length ? f.months.map((m) => faDigits(m)).join(' / ') + ' ماه' : '—'],
    ['اعتبار کارت', f.card ? `${faDigits(f.card)}٪ دارایی آزاد` : 'غیرفعال'],
    ['خرید اقساطی', f.bnpl ? 'فعال' : 'غیرفعال'],
    ['قفل‌های مجاز', polTxt || 'فقط مسدودی قانونی'],
    ['برداشت نقدی', f.cash ? 'مجاز' : 'غیرمجاز'],
    ['صندوق‌ها', funds.filter((x) => f.funds.includes(x.id)).map((x) => x.shortName).join('، ') || '—'],
    ['کاربران سازمان', faDigits(f.users.length) + ' نفر'],
  ];

  return (
    <>
      <PageHeading title="افزودن سازمان" crumbs={[{ label: 'سازمان‌ها و قراردادها', href: routes.op.organizations }]} sub={done ? undefined : 'اطلاعات سازمان، قرارداد و کاربران پنل سازمانی در سه مرحله'}>
        {!done && (
          <>
            <Pill>{savedAt ? `پیش‌نویس ذخیره‌شده · ${time(savedAt)}` : 'پیش‌نویس جدید'}</Pill>
            <button type="button" className="nm-btn text" onClick={reset}>شروع دوباره</button>
          </>
        )}
      </PageHeading>

      {done ? (
        <Card>
          <Empty
            icon={ICON.check} tone="success" title={`سازمان «${done.name}» ایجاد شد`}
            sub={<>قرارداد <span className="ltr">{done.contractNo}</span> · نسخه ۱ · سقف وام {f.loan ? faDigits(f.loan) + '٪' : 'غیرفعال'} · اعتبار کارت {f.card ? faDigits(f.card) + '٪' : 'غیرفعال'} · {faDigits(f.users.length)} کاربر سازمانی</>}
            action={(
              <>
                <Pill tone="info" dot>در حال عقد — در انتظار امضای نماینده</Pill>
                {f.invite && f.users.length > 0 && <span className="mute" style={{ fontSize: 12.5 }}>دعوت‌نامه پیامکی برای {faDigits(f.users.length)} کاربر ارسال شد.</span>}
                <span style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'center', gap: 8, marginTop: 8 }}>
                  <button type="button" className="nm-btn" onClick={() => router.push(routes.op.organization(done.id))}>مشاهده سازمان</button>
                  <Link href={routes.op.organizations} className="nm-btn ghost">مشاهده سازمان‌ها</Link>
                  <button type="button" className="nm-btn text" onClick={reset}>افزودن سازمان دیگر</button>
                </span>
              </>
            )}
          />
        </Card>
      ) : (
        <>
          <StepNav current={step - 1} onPick={(i) => setStep(i + 1)} />

          <div className="nm-grid side">
            <div className="nm-stack">
              {step === 1 && (
                <Card title="اطلاعات سازمان" sub="مشخصات حقوقی سازمان و نماینده‌ای که قرارداد را امضا می‌کند">
                  <div className="nm-grid c2" style={{ gap: '16px 20px' }}>
                    <Field label="نام سازمان" htmlFor="o-name" error={err.name} style={{ gridColumn: '1 / -1' }}>
                      <Ctl id="o-name" value={f.name} onChange={(v) => set({ name: v })} placeholder="مثلاً شرکت توسعه آفاق" invalid={!!err.name} />
                    </Field>
                    <Field label="شناسه ملی" htmlFor="o-nid" error={err.nid}>
                      <Ctl id="o-nid" ltr numeric value={faDigits(f.nid)} onChange={(v) => set({ nid: enDigits(v).replace(/\D/g, '').slice(0, 11) })} placeholder="۱۴۰۰۸۷۶۵۴۳۲" invalid={!!err.nid} />
                    </Field>
                    <Field label="تعداد کارکنان" htmlFor="o-staff" error={err.staff}>
                      <Ctl id="o-staff" numeric value={faDigits(f.staff)} onChange={(v) => set({ staff: enDigits(v).replace(/\D/g, '').slice(0, 6) })} placeholder="۲۶۰" suffix="نفر" invalid={!!err.staff} />
                    </Field>
                    <Field label="حوزه فعالیت" style={{ gridColumn: '1 / -1' }}>
                      <Chips label="حوزه فعالیت" value={f.sector} onChange={(i) => set({ sector: i })} options={SECTORS.map((s, i) => ({ key: i, label: s }))} />
                    </Field>
                    <Field label="نماینده سازمان" htmlFor="o-rep" error={err.rep}>
                      <Ctl id="o-rep" value={f.rep} onChange={(v) => set({ rep: v })} placeholder="نام و نام خانوادگی" invalid={!!err.rep} />
                    </Field>
                    <Field label="تلفن نماینده" htmlFor="o-tel" error={err.tel}>
                      <Ctl id="o-tel" ltr numeric value={faDigits(f.tel)} onChange={(v) => set({ tel: enDigits(v).replace(/[^\d-]/g, '').slice(0, 14) })} placeholder="۰۲۱-۴۴۵۵۰۰۰۰" invalid={!!err.tel} />
                    </Field>
                  </div>
                  <Note tone="info">پس از ایجاد، قرارداد با وضعیت «در حال عقد» ثبت می‌شود و تا امضای نماینده سازمان، کارکنان نمی‌توانند بسته دریافت کنند.</Note>
                </Card>
              )}

              {step === 2 && (
                <>
                  <SettingsGroup title="تسهیلات" footer="این مقادیر سقف چیزی است که منابع انسانی سازمان می‌تواند به کارکنان بدهد.">
                    <SettingRow label="سقف وام" desc="درصدی از دارایی آزاد کارمند که به‌عنوان وثیقه قفل می‌شود · ۰ یعنی غیرفعال" htmlFor="o-loan">
                      <NumberInput id="o-loan" label="سقف وام" value={f.loan} onChange={(n) => set({ loan: whole(n, 0, 60) })} suffix="٪" width={52} decimals />
                    </SettingRow>
                    <SettingRow label="گزینه‌های بازپرداخت" desc={errText(err.months) ?? 'کارمند یکی از این مدت‌ها را انتخاب می‌کند'} stack>
                      <Chips label="گزینه‌های بازپرداخت" value={f.months} disabled={!f.loan} onChange={(m) => set({ months: f.months.includes(m) ? f.months.filter((x) => x !== m) : [...f.months, m].sort((a, b) => a - b) })} options={monthsOptions.map((m) => ({ key: m, label: `${faDigits(m)} ماه` }))} />
                    </SettingRow>
                    <SettingRow label="اعتبار کارت" desc="درصدی از دارایی آزاد برای شارژ کارت نمادنو · ۰ یعنی غیرفعال" htmlFor="o-card">
                      <NumberInput id="o-card" label="اعتبار کارت" value={f.card} onChange={(n) => set({ card: whole(n, 0, 50) })} suffix="٪" width={52} decimals />
                    </SettingRow>
                    <SettingRow label="سقف اعتبار هر نفر" desc={errText(err.perCap)} htmlFor="o-percap">
                      <NumberInput id="o-percap" label="سقف اعتبار هر نفر" value={f.perCap ? Number(f.perCap) : NaN} onChange={(n) => set({ perCap: Number.isFinite(n) ? String(Math.round(Math.abs(n))).slice(0, 12) : '' })} suffix="تومان" width={120} invalid={!!err.perCap} />
                    </SettingRow>
                    <SettingRow label="خرید اقساطی" desc="فروشگاه‌های طرف قرارداد با قفل وثیقه روی دارایی">
                      <Switch on={f.bnpl} onChange={(v) => set({ bnpl: v })} label="خرید اقساطی" />
                    </SettingRow>
                  </SettingsGroup>

                  <SettingsGroup title="سیاست‌های قفل مجاز" footer="سازمان فقط با این سیاست‌ها می‌تواند بسته ارسال کند یا وثیقه بگیرد. دارایی قفل‌شده سود می‌گیرد ولی تا آزادسازی قابل فروش یا برداشت نیست.">
                    {polRows.map((p) => {
                      const on = polOn(p.k);
                      const dis = p.k === 'legal' || (p.k === 'installment' && !f.bnpl);
                      return (
                        <SettingRow key={p.k} label={<LockTypeChip type={p.t} long />} desc={p.sub}>
                          {p.max && on && <NumberInput label={`حداکثر ${LOCK_META[p.t].label}`} value={p.max.value} onChange={p.max.set} suffix={p.max.suffix} width={40} decimals />}
                          <Switch on={on} disabled={dis} label={LOCK_META[p.t].label} onChange={() => { if (p.k !== 'legal') set({ pol: { ...f.pol, [p.k]: !f.pol[p.k] } }); }} />
                        </SettingRow>
                      );
                    })}
                  </SettingsGroup>

                  <SettingsGroup title="بسته‌ها و صندوق‌ها" footer={errText(err.funds) ?? 'کارکنان فقط به صندوق‌های مجاز تخصیص می‌دهند.'}>
                    <SettingRow label="برداشت نقدی" desc="اجازه برداشت ریالی در بسته‌های جدید">
                      <Switch on={f.cash} onChange={(v) => set({ cash: v })} label="برداشت نقدی" />
                    </SettingRow>
                    {funds.map((x) => {
                      const soon = x.status === 'coming_soon';
                      const on = f.funds.includes(x.id);
                      return (
                        <SettingRow key={x.id} label={x.name} desc={soon ? undefined : fundMeta(x)}>
                          {soon ? <Pill>به‌زودی</Pill> : <Switch on={on} onChange={() => set({ funds: on ? f.funds.filter((y) => y !== x.id) : [...f.funds, x.id] })} label={x.name} />}
                        </SettingRow>
                      );
                    })}
                  </SettingsGroup>

                  <SettingsGroup title="مدت قرارداد">
                    <SettingRow label="تاریخ شروع" desc={errText(err.start) ?? 'تاریخ شمسی، مثلاً ۱۴۰۵/۰۸/۰۱'} htmlFor="o-start">
                      <NumInput id="o-start" label="تاریخ شروع" text ltr width={112} value={f.start} onChange={(v) => set({ start: faDigits(enDigits(v).replace(/[^\d/]/g, '').slice(0, 10)) })} placeholder="۱۴۰۵/۰۸/۰۱" invalid={!!err.start} suffix={<Icon d={ICON.calendar} size={16} />} />
                    </SettingRow>
                    <SettingRow label="تاریخ پایان" desc={errText(err.end)} htmlFor="o-end">
                      <NumInput id="o-end" label="تاریخ پایان" text ltr width={112} value={f.end} onChange={(v) => set({ end: faDigits(enDigits(v).replace(/[^\d/]/g, '').slice(0, 10)) })} placeholder="۱۴۰۶/۰۷/۳۰" invalid={!!err.end} suffix={<Icon d={ICON.calendar} size={16} />} />
                    </SettingRow>
                  </SettingsGroup>
                </>
              )}

              {step === 3 && (
                <>
                  <Card title="کاربران سازمان" count={f.users.length || undefined}
                    actions={<button type="button" className="nm-btn sm ghost" onClick={openAdd}><Icon d={ICON.plus} size={15} strokeWidth={2} />افزودن کاربر</button>}>
                    <span className="mute" style={{ fontSize: 12.5, lineHeight: 1.7 }}>این افراد به پنل سازمانی دسترسی می‌گیرند. برای ارسال بسته، حداقل یک تأییدکننده مالی لازم است.</span>
                    {f.users.length ? (
                      <List>
                        {f.users.map((u) => (
                          <ListRow key={u.id}
                            lead={<Ava letter={u.name[0]} id={u.id} />}
                            title={u.name}
                            sub={<><span className="ltr">{u.email}</span> · <span className="num ltr">{faDigits(u.mobile.replace(/^(\d{4})(\d{3})(\d{4})$/, '$1 $2 $3'))}</span></>}
                            trail={(
                              <>
                                <Select label={`نقش ${u.name}`} value={u.role} align="end" options={ROLES.map((t, i) => ({ key: i, label: t }))} onChange={(r) => set({ users: f.users.map((x) => (x.id === u.id ? { ...x, role: r } : x)) })} />
                                <button type="button" className="nm-ib" aria-label={`حذف ${u.name}`} onClick={() => set({ users: f.users.filter((x) => x.id !== u.id) })}><Icon d={ICON.trash} size={17} /></button>
                              </>
                            )}
                          />
                        ))}
                      </List>
                    ) : (
                      <Empty icon={ICON.users} tone={err.users ? 'error' : undefined} title={err.users ?? 'هنوز کاربری اضافه نشده است'} sub="مدیر منابع انسانی و تأییدکننده‌ی مالی سازمان را اضافه کنید."
                        action={<button type="button" className="nm-btn sm" onClick={openAdd}>افزودن کاربر</button>} />
                    )}
                    {!hasApprover && f.users.length > 0 && <Note tone="warn">هیچ کاربری نقش «تأییدکننده مالی» ندارد؛ بسته‌ها بدون تأیید مالی ارسال نمی‌شوند.</Note>}
                  </Card>
                  <SettingsGroup>
                    <SettingRow label="ارسال دعوت‌نامه پیامکی" desc="لینک ورود به پنل سازمانی برای کاربران ارسال می‌شود">
                      <Switch on={f.invite} onChange={(v) => set({ invite: v })} label="ارسال دعوت‌نامه" />
                    </SettingRow>
                  </SettingsGroup>
                </>
              )}

              {apiErr && <Note tone="err">{apiErr}</Note>}
            </div>

            <Card title="خلاصه">
              <Who
                lead={<Ava letter={f.name.trim()[0] ?? 'س'} tone="primary" sq size="lg" />}
                title={f.name.trim() || 'سازمان جدید'}
                sub={`${SECTORS[f.sector]}${f.staff ? ` · ${faDigits(f.staff)} نفر` : ''}`}
                pills={<Pill tone="info">پیش‌نویس قرارداد · نسخه ۱</Pill>}
              />
              <KV rows={summary.map(([k, v]) => [k, <span key={k} className="num">{v}</span>])} />
            </Card>
          </div>

          <ActionBar actions={(
            <>
              {step === 1
                ? <Link href={routes.op.organizations} className="nm-btn ghost">انصراف</Link>
                : <button type="button" className="nm-btn ghost" onClick={() => setStep((s) => Math.max(1, s - 1))}><Icon d={ICON.chevR} size={16} />قبلی</button>}
              {step < 3
                ? <button type="button" className="nm-btn" onClick={next}>بعدی<Icon d={ICON.chevL} size={16} /></button>
                : <button type="button" className="nm-btn" disabled={create.isPending} onClick={submit}><Icon d={ICON.check} size={16} strokeWidth={2} />{create.isPending ? 'در حال ایجاد…' : 'ایجاد سازمان'}</button>}
            </>
          )}>
            <span>مرحله <b className="num" style={{ color: 'var(--text-primary)', fontWeight: 600 }}>{faDigits(step)}</b> از {faDigits(STEPS.length)} · {STEPS[step - 1].label}</span>
          </ActionBar>
        </>
      )}

      <Dialog
        open={addOpen} onClose={() => setAddOpen(false)} width={520} title="افزودن کاربر سازمان"
        footer={(
          <>
            <button type="button" className="nm-btn ghost" onClick={() => setAddOpen(false)}>انصراف</button>
            <button type="button" className="nm-btn" onClick={addUser}>افزودن کاربر</button>
          </>
        )}
      >
        <Field label="نام و نام خانوادگی" htmlFor="nu-name">
          <Ctl id="nu-name" value={nu.name} onChange={(v) => { setNu({ ...nu, name: v }); setNuErr(''); }} />
        </Field>
        <div className="nm-grid c2" style={{ gap: 12 }}>
          <Field label="ایمیل" htmlFor="nu-email">
            <Ctl id="nu-email" ltr value={nu.email} onChange={(v) => { setNu({ ...nu, email: v }); setNuErr(''); }} />
          </Field>
          <Field label="موبایل" htmlFor="nu-mobile">
            <Ctl id="nu-mobile" ltr numeric placeholder="۰۹۱۲۰۰۰۰۰۰۰" value={faDigits(nu.mobile)} onChange={(v) => { setNu({ ...nu, mobile: enDigits(v).replace(/\D/g, '').slice(0, 11) }); setNuErr(''); }} />
          </Field>
        </div>
        <Field label="نقش">
          <Chips label="نقش کاربر سازمان" value={nu.role} onChange={(r) => setNu({ ...nu, role: r })} options={ROLES.map((t, i) => ({ key: i, label: t }))} />
        </Field>
        {nuErr && <Note tone="err">{nuErr}</Note>}
      </Dialog>
    </>
  );
}
