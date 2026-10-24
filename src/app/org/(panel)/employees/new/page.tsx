'use client';
/**
 * Organization panel — add employee. Kit form page: mode tabs (single form · Excel/CSV import) → form or import cards
 * next to «what happens next» → sticky action bar. Validation, the sheet reader and the import rules are unchanged.
 */
import Link from 'next/link';
import { Suspense, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useCreateEmployee, useOrgEmployees } from '@/api/org';
import { useImportEmployees, useOrgDepartments, type ImportRow } from '@/api/org-people-extra';
import {
  ActionBar, Card, Empty, FileDrop, List, ListRow, Note, PageHeading, Pill, SettingRow, SettingsGroup, Switch, Table, TableFoot, Tabs, Tile,
  usePaging, type Column,
} from '@/components/panel/kit';
import { Icon } from '@/components/ui/Icon';
import { useToast } from '@/components/ui/Toast';
import { flashToast } from '@/components/org/people/PanelToast';
import { I, downloadCsv, errMsg } from '@/components/org/people/shared';
import { readSheet } from '@/components/org/people/sheet';
import { EmployeeFields, digits, fmtMobile, newEmpForm, parseJalaliDate, toEmployeeInput, useEmpForm } from '@/components/org/people/EmployeeForm';
import { routes } from '@/lib/routes';
import { DEFAULT_UNIT } from '@/lib/org';
import { faDigits } from '@/lib/format';

const SAMPLE: string[][] = [
  ['مینا راد', '1088', '0012345679', '09120000000', 'عملیات', '1405/08/01'],
  ['کامران زارع', '1089', '0023456789', '09131112222', 'فنی', '1405/08/01'],
  ['شیدا کاظمی', '1090', '0012345678', '09123334444', 'فروش', '1405/08/05'],
  ['پویا نیک‌نام', '1091', '0045678901', '091255', 'مالی', '1405/08/05'],
  ['الهام صادقی', '1092', '0056789012', '09356667777', 'منابع انسانی', '1405/08/10'],
];
const PREVIEW_PAGE = 10;

interface PreviewRow { n: number; name: string; code: string; nid: string; mob: string; unit: string; date: string; error: string }

const PREVIEW_COLS: Column<PreviewRow>[] = [
  { key: 'n', label: '#', width: '36px', render: (p) => <span className="num mute">{faDigits(p.n)}</span> },
  { key: 'name', label: 'نام', width: 'minmax(0, 1.3fr)', render: (p) => (p.name ? <b className="el" style={{ fontWeight: 600 }}>{p.name}</b> : <span className="mute sm">از ثبت احوال</span>) },
  { key: 'code', label: 'کد پرسنلی', width: '84px', render: (p) => <span className="num">{faDigits(p.code)}</span> },
  { key: 'nid', label: 'کد ملی', width: '112px', render: (p) => <span className="num ltr">{faDigits(p.nid)}</span> },
  { key: 'mob', label: 'موبایل', width: '120px', render: (p) => <span className="num ltr">{fmtMobile(p.mob)}</span> },
  { key: 'unit', label: 'واحد', width: '100px', render: (p) => <span className="sm el">{p.unit}</span> },
  { key: 'check', label: 'اعتبارسنجی', width: '128px', render: (p) => <Pill tone={p.error ? 'error' : 'success'}>{p.error || 'معتبر'}</Pill> },
];

function NewEmployee() {
  const sp = useSearchParams();
  const router = useRouter();
  const emps = useOrgEmployees();
  const create = useCreateEmployee();
  const importer = useImportEmployees();
  const show = useToast();
  const [tab, setTab] = useState<'single' | 'excel'>(sp.get('tab') === 'excel' ? 'excel' : 'single');
  const [sms, setSms] = useState(true);
  const [file, setFile] = useState<{ name: string; rows: string[][] } | null>(null);
  const [fileErr, setFileErr] = useState('');
  const [reading, setReading] = useState(false);

  const existing = useMemo(() => emps.data ?? [], [emps.data]);
  const units = useOrgDepartments();
  const departments = useMemo(() => [...new Set([...(units.data ?? []).map((d) => d.name), ...existing.map((e) => e.department)])], [units.data, existing]);

  const f = useEmpForm(newEmpForm({ department: sp.get('dept') ?? '' }), existing);

  const submitSingle = () => {
    const ok = f.check();
    if (!ok || create.isPending) { if (!ok) show('لطفاً خطاهای فرم را برطرف کنید', 'error'); return; }
    const input = toEmployeeInput(f.form, sms);
    create.mutate(input, {
      onSuccess: (e) => {
        flashToast(`${e.fullName} ثبت شد${sms && e.mobile ? ` · کد فعال‌سازی به ${fmtMobile(e.mobile)} پیامک شد` : ''}`);
        router.push(routes.org.employee(e.id));
      },
      onError: (err) => { f.serverError(err); show(errMsg(err), 'error'); },
    });
  };

  // ── excel rows validation
  const preview: PreviewRow[] = useMemo(() => {
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
      // required: national id (the unit falls back to «سایر»); other columns are checked only when filled in
      if (!/^\d{10}$/.test(nid)) error = nid ? 'کد ملی نامعتبر' : 'کد ملی خالی';
      else if (existing.some((x) => x.nationalId === nid) || seenNid.has(nid)) error = 'کد ملی تکراری';
      else if (name && (name.length < 3 || /\d/.test(name))) error = 'نام نامعتبر';
      else if (code && !/^\d{3,8}$/.test(code)) error = 'کد پرسنلی نامعتبر';
      else if (code && (existing.some((x) => x.employeeCode === code) || seenCode.has(code))) error = 'کد پرسنلی تکراری';
      else if (mob && !/^09\d{9}$/.test(mob)) error = 'موبایل نامعتبر';
      else if (date && !parseJalaliDate(date)) error = 'تاریخ نامعتبر';
      seenNid.add(nid);
      if (code) seenCode.add(code);
      return { n: i + 1, name, code, nid, mob, unit: unit || DEFAULT_UNIT, date, error };
    });
  }, [file, existing]);
  const valid = preview.filter((p) => !p.error);
  const invalidN = preview.length - valid.length;
  const pp = usePaging(preview, PREVIEW_PAGE, file);

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
    const rows: ImportRow[] = valid.map((p) => ({ fullName: p.name || undefined, employeeCode: p.code || undefined, nationalId: p.nid, mobile: p.mob || undefined, department: p.unit, joinedAt: p.date ? parseJalaliDate(p.date) ?? undefined : undefined }));
    importer.mutate({ rows, sendSms: sms }, {
      onSuccess: (r) => {
        if (r.created.length) {
          flashToast(`${faDigits(r.created.length)} کارمند ثبت شد${r.errors.length ? ` · ${faDigits(r.errors.length)} ردیف خطا داشت` : ''}${sms ? ' · کد فعال‌سازی به موبایل‌های ثبت‌شده پیامک شد' : ''}`);
          router.push(routes.org.employees);
        } else show(r.errors[0]?.message ?? 'هیچ ردیفی ثبت نشد', 'error');
      },
      onError: (e) => show(errMsg(e), 'error'),
    });
  };

  const single = tab === 'single';
  const firstName = f.form.fullName.trim() || 'کارمند';
  const flow = [
    { d: single ? I.user : I.xls, label: single ? 'ثبت اطلاعات' : 'بارگذاری و اعتبارسنجی فایل', sub: single ? 'توسط منابع انسانی · همین صفحه' : file ? `${faDigits(preview.length)} ردیف · ${faDigits(valid.length)} معتبر · ${faDigits(invalidN)} خطا` : 'هنوز فایلی بارگذاری نشده' },
    { d: I.mail, label: 'پیامک کد فعال‌سازی', sub: sms ? 'کد ۶ رقمی · اعتبار ۷۲ ساعت' : 'بعداً از پروفایل کارمند ارسال می‌شود' },
    { d: I.shield, label: 'فعال‌سازی و احراز هویت در اپ', sub: 'کد پرسنلی + کد فعال‌سازی · KYC' },
    { d: I.check, label: 'حساب فعال', sub: 'دریافت بسته‌ها، اعتبار و تسهیلات طبق قرارداد' },
  ];
  const busy = create.isPending || importer.isPending;
  const errCount = Object.values(f.errors).filter(Boolean).length;
  const mob = digits(f.form.mobile);

  const smsGroup = (
    <SettingsGroup>
      <SettingRow
        label="ارسال کد فعال‌سازی"
        desc={single
          ? (sms ? (mob ? `بلافاصله پس از ثبت، کد ۶ رقمی به ${fmtMobile(mob)} پیامک می‌شود` : 'با وارد کردن موبایل، کد ۶ رقمی بلافاصله پیامک می‌شود') : 'کد بعداً از پروفایل کارمند ارسال می‌شود')
          : (sms ? 'بلافاصله پس از ثبت، کد ۶ رقمی به موبایل هر کارمند پیامک می‌شود' : 'کدها بعداً از پروفایل هر کارمند ارسال می‌شود')}
      >
        <Switch on={sms} onChange={setSms} label="ارسال کد فعال‌سازی" />
      </SettingRow>
    </SettingsGroup>
  );

  return (
    <>
      <PageHeading title="افزودن کارمند" crumbs={[{ label: 'کارکنان', href: routes.org.employees }]} sub="یک کارمند را ثبت کنید یا فهرست کارکنان را از فایل اکسل وارد کنید" />

      <Tabs label="روش افزودن" size="lg" value={tab} onChange={setTab} items={[{ key: 'single', label: 'افزودن تکی' }, { key: 'excel', label: 'ورود از اکسل' }]} />

      <div className="nm-grid side">
        <div className="nm-stack">
          {single ? (
            <>
              <Card title="اطلاعات کارمند" sub="فقط کد ملی و واحد الزامی است">
                <EmployeeFields f={f} departments={departments} onSubmit={submitSingle} />
              </Card>
              {smsGroup}
            </>
          ) : (
            <>
              <Card title="فایل کارکنان"
                actions={(
                  <button type="button" className="nm-btn sm text" onClick={() => downloadCsv('namadno-employees.csv', [['نام', 'کد پرسنلی', 'کد ملی', 'موبایل', 'واحد', 'تاریخ شروع'], ['مینا راد', '1088', '0012345679', '09120000000', 'عملیات', '1405/08/01']])}>
                    <Icon d={I.xls} size={15} />دانلود قالب اکسل
                  </button>
                )}>
                <FileDrop onFile={(f) => void loadFile(f)} busy={reading} title="فایل اکسل را اینجا بکشید یا انتخاب کنید" hint="XLSX یا CSV · حداکثر ۵ مگابایت · تا ۱٬۰۰۰ ردیف در هر فایل">
                  <button type="button" className="nm-btn sm ghost" onClick={() => { setFileErr(''); setFile({ name: 'employees-mehr.xlsx', rows: SAMPLE }); }}>استفاده از فایل نمونه</button>
                </FileDrop>
              </Card>
              {fileErr && <Note tone="err">{fileErr}</Note>}
              {file && (
                <Card flush title="پیش‌نمایش ردیف‌ها" count={preview.length} sub={file.name}
                  actions={(
                    <>
                      <Pill tone="success">{faDigits(valid.length)} معتبر</Pill>
                      {invalidN > 0 && <Pill tone="error">{faDigits(invalidN)} خطا</Pill>}
                      <button type="button" className="nm-ib" aria-label="حذف فایل" onClick={() => setFile(null)}><Icon d={I.x} size={16} /></button>
                    </>
                  )}>
                  <Table columns={PREVIEW_COLS} rows={pp.rows} rowKey={(p) => String(p.n)} rowLabel={(p) => p.name || `ردیف ${faDigits(p.n)}`} minWidth={720}
                    empty={<Empty icon={I.xls} title="ردیفی برای ثبت در فایل پیدا نشد" sub="ستون‌ها به ترتیب: نام، کد پرسنلی، کد ملی، موبایل، واحد، تاریخ شروع · فقط کد ملی الزامی است؛ واحد خالی «سایر» ثبت می‌شود" />} />
                  {preview.length > 0 && <TableFoot shown={pp.rows.length} total={preview.length} unit="ردیف" page={pp.page} pages={pp.pages} onPage={pp.setPage} />}
                </Card>
              )}
              {smsGroup}
            </>
          )}
        </div>

        <Card title={single ? 'پس از ثبت چه می‌شود؟' : 'پس از بارگذاری چه می‌شود؟'}>
          <Note tone="info" icon={I.mail}>
            {single
              ? (sms ? `پس از ثبت، کد فعال‌سازی برای ${firstName} پیامک می‌شود و حساب تا احراز هویت در اپ در وضعیت «در انتظار فعال‌سازی» می‌ماند.` : `حساب ${firstName} در وضعیت «در انتظار فعال‌سازی» ثبت می‌شود؛ کد فعال‌سازی را بعداً از پروفایل کارمند ارسال کنید.`)
              : `ردیف‌های معتبر ثبت می‌شوند${sms ? ' و برای هر نفر کد فعال‌سازی پیامک می‌شود' : ''}؛ ردیف‌های خطادار برای اصلاح علامت می‌خورند.`}
          </Note>
          <List>
            {flow.map((s, i) => (
              <ListRow key={s.label} lead={<Tile d={s.d} tone={i === 0 ? 'primary' : 'neutral'} />} title={s.label} sub={<span className="num" style={{ whiteSpace: 'normal' }}>{s.sub}</span>} />
            ))}
          </List>
          <span className="mute" style={{ fontSize: 12, lineHeight: 1.7 }}>سقف اعتبار کارت و دسترسی به تسهیلات پس از فعال‌سازی و طبق قرارداد سازمان (تا ۲۵٪ دارایی) محاسبه می‌شود.</span>
        </Card>
      </div>

      <ActionBar actions={(
        <>
          <Link href={routes.org.employees} className="nm-btn ghost">انصراف</Link>
          <button type="button" className="nm-btn" disabled={busy || (!single && !valid.length)} onClick={single ? submitSingle : submitExcel}>
            <Icon d={I.check} size={16} strokeWidth={2.2} />{busy ? 'در حال ثبت…' : single ? 'ثبت کارمند' : `ثبت ${faDigits(valid.length)} کارمند معتبر`}
          </button>
        </>
      )}>
        {single
          ? (f.submitted && errCount > 0 ? <Pill tone="error" dot>{faDigits(errCount)} فیلد نیاز به اصلاح دارد</Pill> : <span>حساب {firstName} در وضعیت «در انتظار فعال‌سازی» ثبت می‌شود</span>)
          : (file ? (invalidN > 0 ? <span>ردیف‌های خطادار ثبت نمی‌شوند؛ آن‌ها را در فایل اصلاح و دوباره بارگذاری کنید</span> : <span>همه‌ی ردیف‌های فایل معتبرند</span>) : <span>هنوز فایلی بارگذاری نشده</span>)}
      </ActionBar>
    </>
  );
}

export default function NewEmployeePage() {
  return (
    <Suspense fallback={null}>
      <NewEmployee />
    </Suspense>
  );
}
