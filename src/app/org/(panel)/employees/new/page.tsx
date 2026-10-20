'use client';
/** Add employee — single form or Excel/CSV import (design: org-employee-new). */
import Link from 'next/link';
import { Suspense, useMemo, useRef, useState, type DragEvent } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { PageHeading } from '@/components/panel/PanelShell';
import { Icon } from '@/components/ui/Icon';
import { useCreateEmployee, useOrgEmployees, useOrgMe } from '@/api/org';
import { useImportEmployees, type ImportRow, type NewEmployeeInput } from '@/api/org-people-extra';
import { ApiRequestError } from '@/api/client';
import { routes } from '@/lib/routes';
import { now } from '@/lib/clock';
import { enDigits, faDigits, jDate } from '@/lib/format';
import { flashToast, usePanelToast } from '@/components/org/people/PanelToast';
import { I, SelectField, downloadCsv, errMsg, jalaliToIsoAny, tone } from '@/components/org/people/shared';
import { readSheet } from '@/components/org/people/sheet';
import '../page.css';

const DEPTS = ['فنی', 'فروش', 'مالی', 'عملیات', 'منابع انسانی', 'پشتیبانی'];
const ROLES = ['کارمند', 'سرپرست', 'مدیر واحد'];
const CARD_OPTS = [
  { value: 25, label: 'پیش‌فرض قرارداد · ۲۵٪ دارایی' },
  { value: 15, label: '۱۵٪ دارایی' },
  { value: 10, label: '۱۰٪ دارایی' },
  { value: 0, label: 'بدون اعتبار کارت' },
];
const SAMPLE: string[][] = [
  ['مینا راد', '1088', '0012345679', '09120000000', 'عملیات', '1405/08/01'],
  ['کامران زارع', '1089', '0023456789', '09131112222', 'فنی', '1405/08/01'],
  ['شیدا کاظمی', '1090', '0012345678', '09123334444', 'فروش', '1405/08/05'],
  ['پویا نیک‌نام', '1091', '0045678901', '091255', 'مالی', '1405/08/05'],
  ['الهام صادقی', '1092', '0056789012', '09356667777', 'منابع انسانی', '1405/08/10'],
];

const digits = (s: string) => enDigits(s).replace(/[\s-]/g, '');
const fmtMobile = (m: string) => (m.length === 11 ? faDigits(`${m.slice(0, 4)} ${m.slice(4, 7)} ${m.slice(7)}`) : faDigits(m));
function parseJalali(s: string): string | null {
  const m = /^(\d{4})\/(\d{1,2})\/(\d{1,2})$/.exec(digits(s));
  if (!m) return null;
  return jalaliToIsoAny(+m[1], +m[2], +m[3]);
}

interface Form { fullName: string; employeeCode: string; nationalId: string; mobile: string; department: string; joinedAt: string; role: string; email: string; cardPct: number }
type Errors = Partial<Record<keyof Form, string>>;

function NewEmployee() {
  const sp = useSearchParams();
  const router = useRouter();
  const me = useOrgMe();
  const emps = useOrgEmployees();
  const create = useCreateEmployee();
  const importer = useImportEmployees();
  const { show, node: toast } = usePanelToast();
  const [tab, setTab] = useState<'single' | 'excel'>(sp.get('tab') === 'excel' ? 'excel' : 'single');
  const [sms, setSms] = useState(true);
  const [form, setForm] = useState<Form>({ fullName: '', employeeCode: '', nationalId: '', mobile: '', department: '', joinedAt: jDate(now()), role: 'کارمند', email: '', cardPct: 25 });
  const [submitted, setSubmitted] = useState(false);
  const [blurred, setBlurred] = useState<Partial<Record<keyof Form, boolean>>>({});
  const [serverErr, setServerErr] = useState<Errors>({});
  const [file, setFile] = useState<{ name: string; rows: string[][] } | null>(null);
  const [fileErr, setFileErr] = useState('');
  const [drag, setDrag] = useState(false);
  const [reading, setReading] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const existing = useMemo(() => emps.data ?? [], [emps.data]);
  const departments = useMemo(() => [...new Set([...DEPTS, ...existing.map((e) => e.department)])], [existing]);

  // ── single form validation
  const errors: Errors = (() => {
    const e: Errors = {};
    const name = form.fullName.trim();
    const code = digits(form.employeeCode);
    const nid = digits(form.nationalId);
    const mob = digits(form.mobile);
    if (!name) e.fullName = 'نام و نام خانوادگی را وارد کنید';
    else if (name.length < 3 || /\d/.test(enDigits(name))) e.fullName = 'نام معتبر نیست';
    if (!code) e.employeeCode = 'کد پرسنلی را وارد کنید';
    else if (!/^\d{3,8}$/.test(code)) e.employeeCode = 'کد پرسنلی باید عددی باشد';
    else if (existing.some((x) => x.employeeCode === code)) e.employeeCode = 'این کد پرسنلی قبلاً ثبت شده است';
    if (!nid) e.nationalId = 'کد ملی را وارد کنید';
    else if (!/^\d{10}$/.test(nid)) e.nationalId = 'کد ملی باید ۱۰ رقم باشد';
    else if (existing.some((x) => x.nationalId === nid)) e.nationalId = 'کارمندی با این کد ملی وجود دارد';
    if (!mob) e.mobile = 'شماره موبایل را وارد کنید';
    else if (!/^09\d{9}$/.test(mob)) e.mobile = 'شماره موبایل معتبر نیست';
    if (!form.department) e.department = 'واحد را انتخاب کنید';
    const iso = parseJalali(form.joinedAt);
    if (!iso) e.joinedAt = 'تاریخ را به شکل ۱۴۰۵/۰۸/۰۱ وارد کنید';
    else if (new Date(iso).getTime() - now().getTime() > 90 * 86400000) e.joinedAt = 'تاریخ شروع حداکثر ۹۰ روز آینده است';
    if (form.email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) e.email = 'ایمیل معتبر نیست';
    return { ...e, ...serverErr };
  })();
  const errOf = (k: keyof Form) => (submitted || blurred[k] ? errors[k] : undefined);
  const set = <K extends keyof Form>(k: K, v: Form[K]) => { setForm((f) => ({ ...f, [k]: v })); setServerErr((s) => ({ ...s, [k]: undefined })); };

  const submitSingle = () => {
    setSubmitted(true);
    const has = Object.values(errors).some(Boolean);
    if (has || create.isPending) { if (has) show('لطفاً خطاهای فرم را برطرف کنید', 'error'); return; }
    const input: NewEmployeeInput = {
      fullName: form.fullName.trim(), employeeCode: digits(form.employeeCode), nationalId: digits(form.nationalId), mobile: digits(form.mobile),
      department: form.department, jobTitle: form.role === 'کارمند' ? '' : form.role, joinedAt: parseJalali(form.joinedAt) ?? undefined,
      email: form.email.trim() || undefined, role: form.role, cardLimitPct: form.cardPct, sendSms: sms,
    };
    create.mutate(input, {
      onSuccess: (e) => {
        flashToast(`${e.fullName} ثبت شد${sms ? ` · کد فعال‌سازی به ${fmtMobile(e.mobile)} پیامک شد` : ''}`);
        router.push(routes.org.employee(e.id));
      },
      onError: (err) => {
        const code = err instanceof ApiRequestError ? err.code : '';
        const map: Record<string, keyof Form> = { duplicate: 'nationalId', bad_national_id: 'nationalId', duplicate_code: 'employeeCode', bad_mobile: 'mobile' };
        if (map[code]) setServerErr({ [map[code]]: errMsg(err) });
        show(errMsg(err), 'error');
      },
    });
  };

  // ── excel rows validation
  const preview = useMemo(() => {
    if (!file) return [];
    let rows = file.rows;
    if (rows[0] && rows[0].some((c) => /نام|name|کد/i.test(c)) && !/^\d/.test(digits(rows[0][1] ?? ''))) rows = rows.slice(1);
    const seenNid = new Set<string>();
    const seenCode = new Set<string>();
    return rows.map((r, i) => {
      const name = (r[0] ?? '').trim();
      const code = digits(r[1] ?? '');
      let nid = digits(r[2] ?? '');
      if (/^\d{8,9}$/.test(nid)) nid = nid.padStart(10, '0'); // Excel drops leading zeros
      let mob = digits(r[3] ?? '');
      if (/^9\d{9}$/.test(mob)) mob = '0' + mob;
      const unit = (r[4] ?? '').trim();
      const date = (r[5] ?? '').trim();
      let error = '';
      if (!name) error = 'نام خالی';
      else if (!/^\d{3,8}$/.test(code)) error = 'کد پرسنلی نامعتبر';
      else if (existing.some((x) => x.employeeCode === code) || seenCode.has(code)) error = 'کد پرسنلی تکراری';
      else if (!/^\d{10}$/.test(nid)) error = 'کد ملی نامعتبر';
      else if (existing.some((x) => x.nationalId === nid) || seenNid.has(nid)) error = 'کد ملی تکراری';
      else if (!/^09\d{9}$/.test(mob)) error = 'موبایل نامعتبر';
      else if (date && !parseJalali(date)) error = 'تاریخ نامعتبر';
      seenNid.add(nid);
      seenCode.add(code);
      return { n: i + 1, name, code, nid, mob, unit: unit || 'عمومی', date, error };
    });
  }, [file, existing]);
  const valid = preview.filter((p) => !p.error);
  const invalidN = preview.length - valid.length;

  const loadFile = async (f: File | undefined) => {
    if (!f) return;
    setFileErr('');
    if (f.size > 5 * 1024 * 1024) { setFileErr('حجم فایل بیشتر از ۵ مگابایت است.'); return; }
    setReading(true);
    try {
      const rows = await readSheet(f);
      if (!rows.length) throw new Error('فایل خالی است.');
      if (rows.length > 1001) throw new Error('حداکثر ۱٬۰۰۰ ردیف در هر فایل مجاز است.');
      setFile({ name: f.name, rows });
    } catch (e) {
      setFile(null);
      setFileErr(errMsg(e));
    } finally {
      setReading(false);
    }
  };

  const submitExcel = () => {
    if (!valid.length || importer.isPending) return;
    const rows: ImportRow[] = valid.map((p) => ({ fullName: p.name, employeeCode: p.code, nationalId: p.nid, mobile: p.mob, department: p.unit, joinedAt: p.date ? parseJalali(p.date) ?? undefined : undefined }));
    importer.mutate({ rows, sendSms: sms }, {
      onSuccess: (r) => {
        if (r.created.length) {
          flashToast(`${faDigits(r.created.length)} کارمند ثبت شد${r.errors.length ? ` · ${faDigits(r.errors.length)} ردیف خطا داشت` : ''}${sms ? ' · کدهای فعال‌سازی پیامک شد' : ''}`);
          router.push(routes.org.employees);
        } else show(r.errors[0]?.message ?? 'هیچ ردیفی ثبت نشد', 'error');
      },
      onError: (e) => show(errMsg(e), 'error'),
    });
  };

  const single = tab === 'single';
  const firstName = form.fullName.trim() || 'کارمند';
  const flow = [
    { label: single ? 'ثبت اطلاعات' : 'بارگذاری و اعتبارسنجی فایل', sub: single ? 'توسط منابع انسانی · همین صفحه' : file ? `${faDigits(preview.length)} ردیف · ${faDigits(valid.length)} معتبر · ${faDigits(invalidN)} خطا` : 'هنوز فایلی بارگذاری نشده' },
    { label: 'پیامک کد فعال‌سازی', sub: sms ? 'کد ۶ رقمی · اعتبار ۷۲ ساعت' : 'بعداً از پروفایل کارمند ارسال می‌شود' },
    { label: 'فعال‌سازی و احراز هویت در اپ', sub: 'کد پرسنلی + کد فعال‌سازی · KYC' },
    { label: 'حساب فعال', sub: 'دریافت بسته‌ها، اعتبار و تسهیلات طبق قرارداد' },
  ];
  const busy = create.isPending || importer.isPending;

  const field = (k: keyof Form, label: string, input: React.ReactNode) => (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 0, minWidth: 0 }}>
      <span className="flbl">{label}</span>
      {input}
      {errOf(k) && <span role="alert" style={{ fontSize: 11, lineHeight: '18px', color: 'var(--error-text)' }}>{errOf(k)}</span>}
    </label>
  );
  const fldStyle = (k: keyof Form) => (errOf(k) ? { borderColor: 'var(--error-main)' } : undefined);
  const blur = (k: keyof Form) => () => setBlurred((b) => ({ ...b, [k]: true }));

  return (
    <div className="pg-emp" style={{ display: 'flex', flexDirection: 'column', gap: 20, flex: '1 0 auto' }}>
      <PageHeading title="افزودن کارمند" crumbs={[{ label: me.data?.organization.name ?? 'سازمان', href: routes.org.dashboard }, { label: 'کارکنان', href: routes.org.employees }, { label: 'افزودن کارمند' }]}>
        <Link href={routes.org.employees} className="btn" style={{ background: 'transparent', color: 'var(--text-secondary)', padding: '0 10px', textDecoration: 'none' }}>انصراف</Link>
      </PageHeading>

      <div role="tablist" style={{ height: 40, flex: 'none', display: 'flex', alignItems: 'center', gap: 4, borderBottom: '1px solid var(--divider)' }}>
        {([['single', 'افزودن تکی', I.user], ['excel', 'ورود از اکسل', I.upload]] as const).map(([k, label, d]) => {
          const on = tab === k;
          return (
            <button key={k} role="tab" aria-selected={on} onClick={() => setTab(k)} style={{ display: 'inline-flex', alignItems: 'center', gap: 8, height: 40, padding: '0 14px', border: 0, borderBottom: `2px solid ${on ? 'var(--primary-main)' : 'transparent'}`, background: 'transparent', color: on ? 'var(--primary-text)' : 'var(--text-secondary)', fontFamily: 'inherit', fontSize: 14, fontWeight: on ? 700 : 500, cursor: 'pointer', whiteSpace: 'nowrap' }}>
              <Icon d={d} size={18} />{label}
            </button>
          );
        })}
      </div>

      <div style={{ flex: 1, minHeight: 0, display: 'flex', gap: 20, alignItems: 'flex-start' }}>
        {/* Summary (right) */}
        <div className="card" style={{ width: 320, flex: 'none', alignSelf: 'stretch', boxSizing: 'border-box', padding: 20, display: 'flex', flexDirection: 'column', gap: 14 }}>
          <h6 style={{ margin: 0, fontSize: 16, fontWeight: 700, lineHeight: 1.2 }}>{single ? 'پس از ثبت چه می‌شود؟' : 'پس از بارگذاری چه می‌شود؟'}</h6>
          <div style={{ boxSizing: 'border-box', padding: 14, borderRadius: 12, background: 'var(--soft-primary)', display: 'flex', alignItems: 'center', gap: 12 }}>
            <span style={{ width: 40, height: 40, borderRadius: 10, background: 'var(--primary-main)', color: '#FFFFFF', display: 'grid', placeItems: 'center', flex: 'none' }}><Icon d={I.mail} size={20} /></span>
            <span style={{ fontSize: 13, lineHeight: 1.5, color: 'var(--text-primary)' }}>
              {single
                ? (sms ? `پس از ثبت، کد فعال‌سازی برای ${firstName} پیامک می‌شود و حساب تا احراز هویت در اپ در وضعیت «در انتظار فعال‌سازی» می‌ماند.` : `حساب ${firstName} در وضعیت «در انتظار فعال‌سازی» ثبت می‌شود؛ کد فعال‌سازی را بعداً از پروفایل کارمند ارسال کنید.`)
                : 'ردیف‌های معتبر ثبت می‌شوند و برای هر نفر کد فعال‌سازی پیامک می‌شود؛ ردیف‌های خطادار برای اصلاح علامت می‌خورند.'}
            </span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
            {flow.map((f, i) => (
              <div key={f.label} style={{ display: 'flex', alignItems: 'flex-start', gap: 12, minHeight: 52 }}>
                <span style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', alignSelf: 'stretch' }}>
                  <span style={{ width: 26, height: 26, borderRadius: '50%', display: 'grid', placeItems: 'center', flex: 'none', background: i === 0 ? 'var(--primary-main)' : 'var(--step-pending)', color: i === 0 ? '#FFFFFF' : 'var(--step-pending-text)', fontSize: 12, fontWeight: 700 }}>{faDigits(i + 1)}</span>
                  {i < flow.length - 1 && <span style={{ flex: 1, width: 2, margin: '4px 0', background: 'var(--divider)' }} />}
                </span>
                <span style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 2, lineHeight: 1.3, paddingTop: 3 }}><span style={{ fontSize: 13, fontWeight: 600 }}>{f.label}</span><span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>{f.sub}</span></span>
              </div>
            ))}
          </div>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, boxSizing: 'border-box', padding: '10px 12px', borderRadius: 10, background: 'var(--soft-info)', color: 'var(--info-text)', fontSize: 12, lineHeight: 1.5 }}>
            <Icon d={I.info} size={18} style={{ marginTop: 1 }} />
            <span>سقف اعتبار کارت و دسترسی به تسهیلات پس از فعال‌سازی و طبق قرارداد سازمان (تا ۲۵٪ دارایی) محاسبه می‌شود.</span>
          </div>
          <div style={{ marginTop: 'auto', display: 'flex', flexDirection: 'column', gap: 8 }}>
            <button className="btn" disabled={busy || (!single && !valid.length)} onClick={single ? submitSingle : submitExcel} style={{ height: 40, background: 'var(--primary-main)', color: 'var(--primary-contrast)', boxShadow: 'var(--shadow-primary)' }}>
              <Icon d={I.check} size={18} />{busy ? 'در حال ثبت…' : single ? 'ثبت کارمند' : `ثبت ${faDigits(valid.length)} کارمند معتبر`}
            </button>
            <Link href={routes.org.employees} className="btn" style={{ height: 40, border: '1px solid var(--outline-border)', background: 'transparent', color: 'var(--text-primary)', textDecoration: 'none' }}>انصراف</Link>
          </div>
        </div>

        {single ? (
          <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 16 }}>
            <form className="card" noValidate onSubmit={(e) => { e.preventDefault(); submitSingle(); }} style={{ boxSizing: 'border-box', padding: 20, display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div style={{ height: 24, display: 'flex', alignItems: 'center', gap: 8 }}><h6 style={{ margin: 0, fontSize: 16, fontWeight: 700, lineHeight: 1.2 }}>اطلاعات کارمند</h6><span style={{ marginRight: 'auto', fontSize: 12, color: 'var(--text-secondary)' }}>همه فیلدها به‌جز ایمیل الزامی است</span></div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: '14px 16px' }}>
                {field('fullName', 'نام و نام خانوادگی', <span className="fld" style={fldStyle('fullName')}><input type="text" value={form.fullName} onChange={(e) => set('fullName', e.target.value)} onBlur={blur('fullName')} placeholder="مینا راد" aria-label="نام و نام خانوادگی" aria-invalid={!!errOf('fullName')} /></span>)}
                {field('employeeCode', 'کد پرسنلی', <span className="fld" style={fldStyle('employeeCode')}><input type="text" inputMode="numeric" value={form.employeeCode} onChange={(e) => set('employeeCode', e.target.value)} onBlur={blur('employeeCode')} placeholder="۱۰۸۸" aria-label="کد پرسنلی" aria-invalid={!!errOf('employeeCode')} className="num" /></span>)}
                {field('nationalId', 'کد ملی', <span className="fld" style={fldStyle('nationalId')}><input type="text" inputMode="numeric" maxLength={12} value={form.nationalId} onChange={(e) => set('nationalId', e.target.value)} onBlur={blur('nationalId')} placeholder="۰۰۱۲۳۴۵۶۷۸" aria-label="کد ملی" aria-invalid={!!errOf('nationalId')} dir="ltr" style={{ textAlign: 'right', fontWeight: 500 }} className="num" /></span>)}
                {field('mobile', 'موبایل', <span className="fld" style={fldStyle('mobile')}><input type="tel" value={form.mobile} onChange={(e) => set('mobile', e.target.value)} onBlur={blur('mobile')} placeholder="۰۹۱۲ ۰۰۰ ۰۰۰۰" aria-label="موبایل" aria-invalid={!!errOf('mobile')} dir="ltr" style={{ textAlign: 'right', fontWeight: 500 }} className="num" /></span>)}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 0, minWidth: 0 }}>
                  <span className="flbl">واحد</span>
                  <SelectField label="واحد" value={form.department} invalid={!!errOf('department')} options={[{ value: '', label: 'انتخاب واحد' }, ...departments.map((d) => ({ value: d, label: d }))]} onChange={(v) => set('department', v)} />
                  {errOf('department') && <span role="alert" style={{ fontSize: 11, lineHeight: '18px', color: 'var(--error-text)' }}>{errOf('department')}</span>}
                </div>
                {field('joinedAt', 'تاریخ شروع همکاری', <span className="fld" style={fldStyle('joinedAt')}><input type="text" value={form.joinedAt} onChange={(e) => set('joinedAt', e.target.value)} onBlur={blur('joinedAt')} aria-label="تاریخ شروع همکاری" aria-invalid={!!errOf('joinedAt')} className="num" /><Icon d={I.calendar} size={18} style={{ color: 'var(--text-secondary)' }} /></span>)}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 0, minWidth: 0 }}>
                  <span className="flbl">نقش</span>
                  <SelectField label="نقش" value={form.role} options={ROLES.map((r) => ({ value: r, label: r }))} onChange={(v) => set('role', v)} />
                </div>
                {field('email', 'ایمیل سازمانی (اختیاری)', <span className="fld" style={fldStyle('email')}><input type="email" value={form.email} onChange={(e) => set('email', e.target.value)} onBlur={blur('email')} placeholder="m.rad@arman.co" aria-label="ایمیل سازمانی (اختیاری)" aria-invalid={!!errOf('email')} dir="ltr" style={{ textAlign: 'right', fontWeight: 500 }} className="num" /></span>)}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 0, minWidth: 0 }}>
                  <span className="flbl">سقف اعتبار کارت</span>
                  <SelectField label="سقف اعتبار کارت" value={form.cardPct} options={CARD_OPTS} onChange={(v) => set('cardPct', v)} />
                </div>
              </div>
              <div style={{ minHeight: 48, boxSizing: 'border-box', padding: '0 12px', borderRadius: 10, border: '1px solid var(--divider)', display: 'flex', alignItems: 'center', gap: 12 }}>
                <span style={{ flex: 1, display: 'flex', flexDirection: 'column', lineHeight: 1.25, padding: '6px 0' }}>
                  <span style={{ fontSize: 13, fontWeight: 600 }}>ارسال کد فعال‌سازی</span>
                  <span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>{sms ? `بلافاصله پس از ثبت، کد ۶ رقمی به ${digits(form.mobile) ? fmtMobile(digits(form.mobile)) : 'موبایل کارمند'} پیامک می‌شود` : 'کد بعداً از پروفایل کارمند ارسال می‌شود'}</span>
                </span>
                <span className="lbl" style={{ height: 20, padding: '0 6px', fontSize: 11, background: tone(sms ? 'success' : 'default')[0], color: tone(sms ? 'success' : 'default')[1] }}>{sms ? 'فعال' : 'غیرفعال'}</span>
                <button type="button" role="switch" aria-checked={sms} aria-label="ارسال کد فعال‌سازی" onClick={() => setSms((x) => !x)} style={{ width: 40, height: 24, borderRadius: 12, border: 0, padding: 2, boxSizing: 'border-box', background: sms ? 'var(--primary-main)' : 'var(--grey-400)', display: 'flex', alignItems: 'center', justifyContent: sms ? 'flex-end' : 'flex-start', cursor: 'pointer' }}>
                  <span style={{ width: 20, height: 20, borderRadius: '50%', background: '#FFFFFF', boxShadow: 'var(--shadow-z1)' }} />
                </button>
              </div>
              <button type="submit" hidden aria-hidden="true" />
            </form>
            <button onClick={() => setTab('excel')} className="card" style={{ flex: 'none', boxSizing: 'border-box', padding: '14px 20px', display: 'flex', alignItems: 'center', gap: 14, border: '1.5px dashed var(--outline-border)', background: 'var(--bg-neutral)', boxShadow: 'none', fontFamily: 'inherit', color: 'var(--text-primary)', cursor: 'pointer', textAlign: 'right' }}>
              <span style={{ width: 40, height: 40, borderRadius: 10, background: 'var(--soft-success)', color: 'var(--success-text)', display: 'grid', placeItems: 'center', flex: 'none' }}><Icon d={I.xls} size={20} /></span>
              <span style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 2, lineHeight: 1.3 }}><span style={{ fontSize: 13, fontWeight: 600 }}>چند کارمند دارید؟ از اکسل وارد کنید</span><span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>XLSX یا CSV · ستون‌ها: نام، کد پرسنلی، کد ملی، موبایل، واحد، تاریخ شروع</span></span>
              <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--primary-text)', display: 'inline-flex', alignItems: 'center', gap: 4 }}>ورود از اکسل<Icon d={I.chevL} size={16} /></span>
            </button>
          </div>
        ) : (
          <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div
              className="card"
              role="button"
              tabIndex={0}
              aria-label="انتخاب فایل اکسل"
              onClick={() => inputRef.current?.click()}
              onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); inputRef.current?.click(); } }}
              onDragOver={(e: DragEvent<HTMLDivElement>) => { e.preventDefault(); setDrag(true); }}
              onDragLeave={() => setDrag(false)}
              onDrop={(e: DragEvent<HTMLDivElement>) => { e.preventDefault(); setDrag(false); void loadFile(e.dataTransfer.files[0]); }}
              style={{ height: 200, flex: 'none', boxSizing: 'border-box', border: `1.5px dashed ${drag ? 'var(--primary-main)' : 'var(--outline-border)'}`, background: drag ? 'var(--nav-active)' : 'var(--bg-neutral)', boxShadow: 'none', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 10, textAlign: 'center', cursor: 'pointer' }}
            >
              <input ref={inputRef} type="file" accept=".xlsx,.csv,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" hidden onChange={(e) => { void loadFile(e.target.files?.[0]); e.target.value = ''; }} />
              <span style={{ width: 52, height: 52, borderRadius: 14, background: 'var(--soft-primary)', color: 'var(--primary-text)', display: 'grid', placeItems: 'center' }}><Icon d={I.upload} size={26} /></span>
              <span style={{ fontSize: 15, fontWeight: 600 }}>{reading ? 'در حال خواندن فایل…' : <>فایل اکسل را اینجا بکشید یا <span style={{ color: 'var(--primary-text)' }}>انتخاب کنید</span></>}</span>
              <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>XLSX یا CSV · حداکثر ۵ مگابایت · تا ۱٬۰۰۰ ردیف در هر فایل</span>
              <span style={{ display: 'flex', alignItems: 'center', gap: 16, fontSize: 13, marginTop: 4 }} onClick={(e) => e.stopPropagation()}>
                <button type="button" onClick={() => downloadCsv('namadno-employees.csv', [['نام', 'کد پرسنلی', 'کد ملی', 'موبایل', 'واحد', 'تاریخ شروع'], ['مینا راد', '1088', '0012345679', '09120000000', 'عملیات', '1405/08/01']])} style={{ display: 'inline-flex', alignItems: 'center', gap: 8, border: 0, background: 'transparent', padding: 0, fontFamily: 'inherit', fontSize: 13, cursor: 'pointer' }}>
                  <Icon d={I.xls} size={18} style={{ color: 'var(--text-secondary)' }} /><span style={{ fontWeight: 600, color: 'var(--primary-text)' }}>دانلود قالب اکسل (namadno-employees.csv)</span>
                </button>
                <button type="button" onClick={() => { setFileErr(''); setFile({ name: 'employees-mehr.xlsx', rows: SAMPLE }); }} style={{ border: 0, background: 'transparent', padding: 0, fontFamily: 'inherit', fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)', cursor: 'pointer', textDecoration: 'underline' }}>استفاده از فایل نمونه</button>
              </span>
            </div>
            {fileErr && (
              <div role="alert" style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', borderRadius: 10, background: 'var(--soft-error)', color: 'var(--error-text)', fontSize: 12 }}><Icon d={I.warn} size={18} />{fileErr}</div>
            )}
            <div className="card" style={{ minHeight: 160, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
              <div style={{ height: 44, flex: 'none', boxSizing: 'border-box', padding: '0 16px', display: 'flex', alignItems: 'center', gap: 8, borderBottom: '1px solid var(--divider)' }}>
                <h6 style={{ margin: 0, fontSize: 14, fontWeight: 700 }}>پیش‌نمایش ردیف‌ها</h6>
                {file && <span className="lbl" style={{ height: 20, fontSize: 11, background: 'var(--soft-success)', color: 'var(--success-text)' }}>{faDigits(valid.length)} معتبر</span>}
                {file && !!invalidN && <span className="lbl" style={{ height: 20, fontSize: 11, background: 'var(--soft-error)', color: 'var(--error-text)' }}>{faDigits(invalidN)} خطا</span>}
                {file && <span style={{ marginRight: 'auto', fontSize: 12, color: 'var(--text-secondary)' }}>{file.name} · {faDigits(preview.length)} ردیف</span>}
                {file && <button className="ibtn" aria-label="حذف فایل" onClick={() => setFile(null)} style={{ width: 28, height: 28 }}><Icon d={I.x} size={14} /></button>}
              </div>
              <div className="th" style={{ height: 32, flex: 'none', display: 'grid', gridTemplateColumns: '40px 1.3fr 90px 120px 120px 100px 110px', alignItems: 'center', gap: 8, padding: '0 16px' }}>
                <span className="cell">#</span><span className="cell">نام</span><span className="cell">کد پرسنلی</span><span className="cell">کد ملی</span><span className="cell">موبایل</span><span className="cell">واحد</span><span className="cell">اعتبارسنجی</span>
              </div>
              {!file && <div style={{ padding: 32, textAlign: 'center', fontSize: 13, color: 'var(--text-secondary)' }}>پس از انتخاب فایل، ردیف‌ها و نتیجه اعتبارسنجی اینجا نمایش داده می‌شود.</div>}
              <div style={{ maxHeight: 400, overflowY: 'auto' }}>
                {preview.map((p) => (
                  <div key={p.n} style={{ height: 40, flex: 'none', display: 'grid', gridTemplateColumns: '40px 1.3fr 90px 120px 120px 100px 110px', alignItems: 'center', gap: 8, padding: '0 16px', borderBottom: '1px dashed var(--divider)', fontSize: 13, background: p.error ? 'rgb(var(--error-main-rgb) / .04)' : undefined }}>
                    <span className="num cell" style={{ color: 'var(--text-secondary)', fontWeight: 400 }}>{faDigits(p.n)}</span>
                    <span className="cell" style={{ fontWeight: 600 }}>{p.name || '—'}</span>
                    <span className="num cell" style={{ fontWeight: 400 }}>{faDigits(p.code)}</span>
                    <span className="num cell" dir="ltr" style={{ fontWeight: 400, textAlign: 'right' }}>{faDigits(p.nid)}</span>
                    <span className="num cell" dir="ltr" style={{ fontWeight: 400, textAlign: 'right' }}>{fmtMobile(p.mob)}</span>
                    <span className="cell" style={{ color: 'var(--text-secondary)', fontSize: 12 }}>{p.unit}</span>
                    <span><span className="lbl" style={{ height: 22, padding: '0 6px', fontSize: 11, background: tone(p.error ? 'error' : 'success')[0], color: tone(p.error ? 'error' : 'success')[1] }}>{p.error || 'معتبر'}</span></span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
      {toast}
    </div>
  );
}

export default function NewEmployeePage() {
  return (
    <Suspense fallback={null}>
      <NewEmployee />
    </Suspense>
  );
}
