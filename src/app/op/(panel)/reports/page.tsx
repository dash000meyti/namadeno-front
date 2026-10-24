'use client';
/**
 * /op/reports — kit report page: period tabs and «export all» in the heading → four report cards in one grid
 * (AUM, credit, organizations, operations & SLA — key number, small kit chart, Excel / PDF) →
 * scheduled reports (list card with a switch per row, «new schedule» dialog). Exports are built client-side (CSV / print to PDF).
 */
import { useState } from 'react';
import type { ReactNode } from 'react';
import { useOpReports, type OpReports } from '@/api/op';
import { useCreateSchedule, useReportsExtra, useUpdateSchedule, type ReportSchedule, type ReportsExtra } from '@/api/op-system-extra';
import {
  Allocation, Bars, BigNum, Card, Chips, Dialog, Empty, ErrorBlock, Field, FreeLocked, Ident, Legend, LineChart, List, ListRow, Note,
  PageHeading, Pill, Ring, SkeletonCard, Spark, Switch, Table, Tabs, Tile, type Column, type Tone,
} from '@/components/panel/kit';
import { Icon } from '@/components/ui/Icon';
import { useToast } from '@/components/ui/Toast';
import { IC } from '@/components/op/system/ui';
import { bn, dayTime, dec, downloadCsv, errMsg, printReport, raw, spct } from '@/components/op/system/fmt';
import { faDigits, jDate } from '@/lib/format';

type Range = 3 | 6 | 12;
const RANGES: { key: Range; label: string }[] = [{ key: 3, label: '۳ ماه' }, { key: 6, label: '۶ ماه' }, { key: 12, label: '۱۲ ماه' }];
const rangeText = (r: Range) => (r === 3 ? '۳ ماه گذشته' : r === 6 ? '۶ ماه گذشته' : '۱۲ ماه گذشته');
type Kind = 'aum' | 'credit' | 'orgs' | 'sla';
type Sec = { title: string; rows: (string | number)[][] };
type Exp = (kind: Kind, title: string) => void;
const SVC: Record<ReportsExtra['sla']['services'][number]['status'], [string, Tone]> = { ok: ['سالم', 'success'], slow: ['کند', 'warning'], down: ['اختلال', 'error'] };
const ORG_COLORS = ['var(--chart-1)', 'var(--chart-2)', 'var(--chart-3)', 'var(--chart-5)'];

function sections(kind: Kind, x: ReportsExtra, core: OpReports | undefined, range: Range): Sec[] {
  if (kind === 'aum') {
    const m = x.aumMonthly.slice(-range);
    const last = m[m.length - 1]?.aum ?? 0;
    return [
      { title: 'AUM و جریان ورودی ماهانه', rows: [['ماه', 'AUM (تومان)', 'جریان ورودی (تومان)'], ...m.map((r) => [r.month, raw(r.aum), raw(r.inflow)])] },
      { title: 'تفکیک آزاد / رزروشده', rows: [['بخش', 'ارزش (تومان)'], ['آزاد', raw(last - x.lockedValue)], ['رزروشده', raw(x.lockedValue)]] },
      ...(core ? [{ title: 'AUM به تفکیک صندوق', rows: [['صندوق', 'AUM (تومان)'], ...core.aumByFund.map((f) => [f.name, raw(f.aum)])] }] : []),
    ];
  }
  if (kind === 'credit') {
    return [
      { title: 'تسهیلات — وام پرداختی و اقساط وصول‌شده', rows: [['ماه', 'وام پرداختی (تومان)', 'اقساط وصول‌شده (تومان)'], ...x.credit.map((r) => [r.month, raw(r.disbursed), raw(r.collected)])] },
      { title: 'مانده تسهیلات', rows: [['شاخص', 'مقدار (تومان)'], ['مانده کل', raw(x.creditOutstanding)]] },
    ];
  }
  if (kind === 'orgs') {
    const orgs = [...(core?.byOrganization ?? [])].sort((a, b) => b.budgetUsed - a.budgetUsed);
    return [{ title: 'سازمان‌ها — بسته‌های ارسالی', rows: [['سازمان', 'بسته‌های ارسالی (تومان)', 'کارکنان'], ...orgs.map((o) => [o.name, raw(o.budgetUsed), o.employees])] }];
  }
  return [{ title: 'عملیات و SLA — ۳۰ روز', rows: [['سرویس', 'دسترس‌پذیری (%)', 'وضعیت'], ...x.sla.services.map((s) => [s.name, s.uptime, s.status === 'ok' ? 'سالم' : s.status === 'slow' ? 'کند' : 'اختلال']), ['کل پلتفرم', x.sla.overall, '']] }];
}

export default function OpReportsPage() {
  const toast = useToast();
  const core = useOpReports();
  const extra = useReportsExtra();
  const [range, setRange] = useState<Range>(6);
  const x = extra.data;

  const exportCsv: Exp = (kind, title) => {
    if (!x) return;
    const secs = sections(kind, x, core.data, range);
    downloadCsv(`namadno-${kind}-${range}m`, secs.flatMap((s, i) => [...(i ? [[]] : []), [s.title], ...s.rows]));
    toast(`دانلود Excel «${title}» — ${rangeText(range)} آغاز شد`);
  };
  const exportPdf: Exp = (kind, title) => {
    if (!x) return;
    const ok = printReport(`${title} — ${rangeText(range)}`, sections(kind, x, core.data, range));
    toast(ok ? `نسخهٔ چاپی «${title}» باز شد؛ «ذخیره به PDF» را انتخاب کنید` : 'پنجرهٔ چاپ مسدود شد؛ اجازهٔ پنجرهٔ بازشو را بدهید', ok ? 'success' : 'error');
  };
  const exportAll = () => {
    if (!x) return;
    const secs = (['aum', 'credit', 'orgs', 'sla'] as const).flatMap((k) => sections(k, x, core.data, range));
    downloadCsv(`namadno-reports-${range}m`, secs.flatMap((s, i) => [...(i ? [[]] : []), [s.title], ...s.rows]));
    toast(`خروجی همهٔ گزارش‌ها برای ${rangeText(range)} آماده شد`);
  };

  return (
    <>
      <PageHeading title="گزارش‌ها" crumbs={[{ label: 'سیستم' }]} sub="دارایی تحت مدیریت، تسهیلات، سازمان‌ها و عملیات؛ خروجی Excel و PDF و ارسال زمان‌بندی‌شده">
        <Tabs label="بازه زمانی" value={range} onChange={setRange} items={RANGES} />
        <button type="button" className="nm-btn" onClick={exportAll} disabled={!x}><Icon d={IC.excel} size={17} />خروجی همهٔ گزارش‌ها</button>
      </PageHeading>

      {extra.isLoading ? (
        <div className="nm-grid c2">{[0, 1, 2, 3].map((i) => <SkeletonCard key={i} h={320} />)}</div>
      ) : extra.isError || !x ? (
        <ErrorBlock error={extra.error} message={errMsg(extra.error)} onRetry={() => extra.refetch()} />
      ) : (
        <div className="nm-grid c2 stretch">
          <AumCard x={x} range={range} onPdf={exportPdf} onCsv={exportCsv} />
          <CreditCard x={x} onPdf={exportPdf} onCsv={exportCsv} />
          <OrgsCard x={x} core={core.data} onPdf={exportPdf} onCsv={exportCsv} />
          <SlaCard x={x} onPdf={exportPdf} onCsv={exportCsv} />
        </div>
      )}

      {!extra.isError && <Schedules x={x} loading={extra.isLoading} />}
    </>
  );
}

/** One report: title, freshness and exports in the header → key number + change → a line of context → chart. */
function ReportCard({ kind, title, updated, value, unit, delta, deltaTone, desc, onPdf, onCsv, children }: {
  kind: Kind; title: string; updated: string; value: string; unit: string; delta: string; deltaTone: Tone; desc: ReactNode; onPdf: Exp; onCsv: Exp; children: ReactNode;
}) {
  return (
    <Card title={title} sub={updated} actions={(
      <>
        <button type="button" className="nm-btn sm ghost" onClick={() => onCsv(kind, title)} aria-label={`دانلود Excel ${title}`}><Icon d={IC.download} size={15} />Excel</button>
        <button type="button" className="nm-btn sm ghost" onClick={() => onPdf(kind, title)} aria-label={`دانلود PDF ${title}`}><Icon d={IC.download} size={15} />PDF</button>
      </>
    )}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        <span style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}><BigNum value={value} unit={unit} /><Pill tone={deltaTone}>{delta}</Pill></span>
        <span className="mute" style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', fontSize: 12.5 }}>{desc}</span>
      </div>
      <div style={{ marginTop: 'auto', display: 'flex', flexDirection: 'column', gap: 14 }}>{children}</div>
    </Card>
  );
}

function AumCard({ x, range, onPdf, onCsv }: { x: ReportsExtra; range: Range; onPdf: Exp; onCsv: Exp }) {
  const m = x.aumMonthly.slice(-range);
  const lastRow = m[m.length - 1];
  const last = lastRow?.aum ?? 0;
  const first = m[0]?.aum ?? 0;
  const growth = first ? (last / first - 1) * 100 : 0;
  const locked = Math.min(x.lockedValue, last);
  // y axis starts near the lowest month so the trend stays readable; the inflow (a few billions) gets its own sparkline
  const lo = m.length ? Math.floor((Math.min(...m.map((r) => r.aum)) / 1e9) * 0.09) * 10 : 0;
  return (
    <ReportCard kind="aum" title="AUM و جریان ورودی" updated={dayTime(x.updated.aum)} value={bn(last)} unit="میلیارد تومان" delta={spct(growth, 0)} deltaTone={growth >= 0 ? 'success' : 'error'} onPdf={onPdf} onCsv={onCsv}
      desc={lastRow ? (
        <>
          جریان ورودی ماهانه
          <Spark values={m.map((r) => r.inflow)} color="var(--chart-2)" width={64} height={18} label={`روند جریان ورودی ${rangeText(range)}`} />
          <span><b className="num" style={{ color: 'var(--text-primary)', fontWeight: 600 }}>{bn(lastRow.inflow)}</b> میلیارد در {lastRow.month}</span>
        </>
      ) : 'دارایی تحت مدیریت · آزاد و رزروشده'}>
      {m.length > 1
        ? <LineChart labels={m.map((r) => r.month)} series={[{ name: 'AUM', color: 'var(--chart-1)', values: m.map((r) => r.aum / 1e9), area: true }]} min={lo} height={150} fmt={(n) => dec(n, 0)} label={`AUM ${m[0].month} تا ${m[m.length - 1].month} — میلیارد تومان`} />
        : <Empty title="داده‌ای برای این بازه ثبت نشده است" />}
      <FreeLocked free={Math.max(0, last - locked)} locked={locked} fmt={(n) => bn(n)} unit="میلیارد" height={6} />
    </ReportCard>
  );
}

function CreditCard({ x, onPdf, onCsv }: { x: ReportsExtra; onPdf: Exp; onCsv: Exp }) {
  const disbursed = x.credit.reduce((s, c) => s + c.disbursed, 0);
  const collected = x.credit.reduce((s, c) => s + c.collected, 0);
  return (
    <ReportCard kind="credit" title="تسهیلات" updated={dayTime(x.updated.credit)} value={bn(x.creditOutstanding)} unit="میلیارد تومان مانده" delta={spct(x.creditDeltaPct, 0)} deltaTone={x.creditDeltaPct >= 0 ? 'success' : 'error'} onPdf={onPdf} onCsv={onCsv}
      desc={<>جمع <span className="num">{faDigits(x.credit.length)}</span> ماه: پرداختی <b className="num" style={{ color: 'var(--text-primary)', fontWeight: 600 }}>{bn(disbursed)}</b> · وصول <b className="num" style={{ color: 'var(--text-primary)', fontWeight: 600 }}>{bn(collected)}</b> میلیارد</>}>
      {x.credit.length
        ? <Bars data={x.credit.map((c) => ({ label: c.month, values: [c.collected / 1e9, c.disbursed / 1e9] }))} series={[{ name: 'اقساط وصول‌شده', color: 'var(--chart-3)' }, { name: 'وام پرداختی', color: 'var(--chart-1)' }]} height={150} label={`وام پرداختی و اقساط وصول‌شده ${faDigits(x.credit.length)} ماه اخیر`} />
        : <Empty title="داده‌ای ثبت نشده است" />}
      <Legend items={[{ label: 'وام پرداختی', color: 'var(--chart-1)' }, { label: 'اقساط وصول‌شده', color: 'var(--chart-3)' }]} />
    </ReportCard>
  );
}

function OrgsCard({ x, core, onPdf, onCsv }: { x: ReportsExtra; core?: OpReports; onPdf: Exp; onCsv: Exp }) {
  const orgs = [...(core?.byOrganization ?? [])].sort((a, b) => b.budgetUsed - a.budgetUsed);
  const sum = orgs.reduce((s, o) => s + o.budgetUsed, 0);
  const rest = orgs.slice(4).reduce((s, o) => s + o.budgetUsed, 0);
  const items = [
    ...orgs.slice(0, 4).map((o, i) => ({ label: o.name, value: o.budgetUsed, color: ORG_COLORS[i] })),
    ...(rest > 0 ? [{ label: 'سایر سازمان‌ها', value: rest, color: 'var(--chart-4)' }] : []),
  ];
  return (
    <ReportCard kind="orgs" title="سازمان‌ها" updated={dayTime(x.updated.orgs)} value={bn(sum)} unit={`میلیارد تومان · ${faDigits(x.orgCount)} سازمان`} delta={`+${faDigits(x.newOrgs)} سازمان`} deltaTone="success" onPdf={onPdf} onCsv={onCsv}
      desc="بسته‌های ارسالی به تفکیک سازمان · میلیارد تومان">
      {items.length ? <Allocation items={items} fmt={(n) => bn(n)} /> : <Empty title="داده‌ای موجود نیست" />}
    </ReportCard>
  );
}

function SlaCard({ x, onPdf, onCsv }: { x: ReportsExtra; onPdf: Exp; onCsv: Exp }) {
  return (
    <ReportCard kind="sla" title="عملیات و SLA" updated="لحظه‌ای" value={dec(x.sla.overall) + '٪'} unit="دسترس‌پذیری" delta={(x.sla.delta < 0 ? '−' : '+') + dec(Math.abs(x.sla.delta))} deltaTone={x.sla.delta < 0 ? 'error' : 'success'} onPdf={onPdf} onCsv={onCsv}
      desc="دسترس‌پذیری سرویس‌ها · ۳۰ روز">
      <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
        <Ring value={x.sla.overall / 100} size={104} color="var(--success-main)" label={`دسترس‌پذیری ${dec(x.sla.overall)}٪ در ۳۰ روز`}>
          <span className="num" style={{ fontSize: 18, fontWeight: 600 }}>{dec(x.sla.overall)}٪</span>
          <span className="mute" style={{ fontSize: 11 }}>۳۰ روز</span>
        </Ring>
        <div style={{ flex: 1, minWidth: 0 }}>
          {x.sla.services.length ? (
            <List>
              {x.sla.services.map((s) => (
                <ListRow key={s.name} title={<span style={{ fontWeight: 500 }}>{s.name}</span>}
                  trail={<><span className="num">{dec(s.uptime)}٪</span><Pill tone={SVC[s.status][1]} dot>{SVC[s.status][0]}</Pill></>} />
              ))}
            </List>
          ) : <span className="mute" style={{ fontSize: 12.5 }}>سرویسی پایش نمی‌شود</span>}
        </div>
      </div>
    </ReportCard>
  );
}

// ───────────────────────── scheduled reports ─────────────────────────

const PERIODS = ['روزانه · ۰۸:۰۰', 'هفتگی · شنبه', 'ماهانه · اول ماه'];
type Form = { name: string; period: string; recipients: string; format: 'PDF' | 'XLSX' };
const EMPTY: Form = { name: '', period: PERIODS[1], recipients: '', format: 'PDF' };

function Schedules({ x, loading }: { x?: ReportsExtra; loading: boolean }) {
  const toast = useToast();
  const update = useUpdateSchedule();
  const create = useCreateSchedule();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<Form>(EMPTY);
  const [err, setErr] = useState('');
  const list = x?.schedules ?? [];
  const active = list.filter((s) => s.enabled).length;
  const startNew = () => { setForm(EMPTY); setErr(''); setOpen(true); };
  const put = (p: Partial<Form>) => { setForm((f) => ({ ...f, ...p })); setErr(''); };
  const submit = () => {
    if (form.name.trim().length < 3) return setErr('عنوان گزارش را وارد کنید.');
    if (!form.recipients.trim()) return setErr('گیرندگان گزارش را مشخص کنید.');
    create.mutate(form, {
      onSuccess: (s) => { setOpen(false); toast(`زمان‌بندی جدید ایجاد شد؛ اولین ارسال ${jDate(s.nextAt)}`); },
      onError: (e) => setErr(errMsg(e)),
    });
  };
  const toggle = (r: ReportSchedule) => update.mutate({ id: r.id, enabled: !r.enabled }, {
    onSuccess: () => toast(`«${r.name}» ${r.enabled ? 'متوقف' : 'فعال'} شد`),
    onError: (e) => toast(errMsg(e), 'error'),
  });

  const columns: Column<ReportSchedule>[] = [
    { key: 'name', label: 'گزارش', width: 'minmax(0, 1.4fr)', render: (r) => <Ident lead={<Tile d={IC.file} tone="primary" />} title={r.name} /> },
    { key: 'period', label: 'دوره', width: '132px', render: (r) => <span className="el mute">{r.period}</span> },
    { key: 'to', label: 'گیرندگان', width: 'minmax(0, 1fr)', render: (r) => <span className="el mute" title={r.recipients}>{r.recipients}</span> },
    { key: 'format', label: 'قالب', width: '72px', render: (r) => <Pill>{r.format}</Pill> },
    { key: 'next', label: 'ارسال بعدی', width: '104px', render: (r) => <span className="num sm">{r.enabled ? jDate(r.nextAt) : '—'}</span> },
    { key: 'on', label: 'فعال', width: '56px', align: 'end', render: (r) => <Switch on={r.enabled} label={`فعال‌سازی ${r.name}`} disabled={update.isPending && update.variables?.id === r.id} onChange={() => toggle(r)} /> },
  ];

  return (
    <>
      <Card flush title="گزارش‌های زمان‌بندی‌شده" count={list.length || undefined} sub={list.length ? `${faDigits(active)} فعال` : undefined}
        actions={<button type="button" className="nm-btn sm ghost" onClick={startNew}><Icon d={IC.plus} size={15} strokeWidth={2} />زمان‌بندی جدید</button>}>
        <Table columns={columns} rows={list} rowKey={(r) => r.id} rowLabel={(r) => r.name} dimRow={(r) => !r.enabled} loading={loading} minWidth={720}
          empty={<Empty icon={IC.calendar} title="گزارش زمان‌بندی‌شده‌ای ثبت نشده است" action={<button type="button" className="nm-btn sm ghost" onClick={startNew}>زمان‌بندی جدید</button>} />} />
      </Card>

      <Dialog open={open} onClose={() => setOpen(false)} width={520} label="زمان‌بندی گزارش جدید" title="زمان‌بندی گزارش جدید"
        footer={(
          <>
            <button type="button" className="nm-btn ghost" onClick={() => setOpen(false)}>انصراف</button>
            <button type="button" className="nm-btn" onClick={submit} disabled={create.isPending}><Icon d={IC.calendar} size={16} />{create.isPending ? 'در حال ثبت…' : 'ایجاد زمان‌بندی'}</button>
          </>
        )}
      >
        <Field label="عنوان گزارش" htmlFor="sc-name">
          <span className="nm-in" style={{ width: '100%' }}><input id="sc-name" value={form.name} placeholder="مثلاً گزارش هفتگی رزروهای پشتوانه" onChange={(e) => put({ name: e.target.value })} /></span>
        </Field>
        <Field label="دوره ارسال">
          <Chips label="دوره ارسال" value={form.period} onChange={(p) => put({ period: p })} options={PERIODS.map((p) => ({ key: p, label: p }))} />
        </Field>
        <Field label="گیرندگان" htmlFor="sc-to">
          <span className="nm-in" style={{ width: '100%' }}><input id="sc-to" value={form.recipients} placeholder="مثلاً مالی، ریسک" onChange={(e) => put({ recipients: e.target.value })} /></span>
        </Field>
        <Field label="قالب">
          <Chips label="قالب" value={form.format} onChange={(f) => put({ format: f })} options={[{ key: 'PDF', label: 'PDF' }, { key: 'XLSX', label: 'XLSX' }]} />
        </Field>
        {err && <Note tone="err">{err}</Note>}
      </Dialog>
    </>
  );
}
