'use client';
/** /op/reports — design: op-reports.dc.html (4 report cards with SVG charts, client-side CSV / print-to-PDF exports, scheduled reports). */
import { useMemo, useState } from 'react';
import { PageHeading } from '@/components/panel/PanelShell';
import { Icon } from '@/components/ui/Icon';
import { Skeleton, ErrorState } from '@/components/app/Screen';
import { useToast } from '@/components/ui/Toast';
import { useOpReports, type OpReports } from '@/api/op';
import { useCreateSchedule, useReportsExtra, useUpdateSchedule, type ReportsExtra } from '@/api/op-system-extra';
import { routes } from '@/lib/routes';
import { faDigits, jDate } from '@/lib/format';
import { bn, dayTime, dec, downloadCsv, errMsg, printReport, raw, smoothPath, spct } from '@/components/op/system/fmt';
import { CardHead, Chip, DlgHead, FormError, IC, Lbl, Modal, Sw, TILE_TONES, TONES, type ToneKey } from '@/components/op/system/ui';

type Range = 3 | 6 | 12;
const RANGES: [Range, string][] = [[3, '۳ ماه'], [6, '۶ ماه'], [12, '۱۲ ماه']];
const rangeText = (r: Range) => (r === 3 ? '۳ ماه گذشته' : r === 6 ? '۶ ماه گذشته' : '۱۲ ماه گذشته');
type Section = { title: string; rows: (string | number)[][] };

function sections(kind: 'aum' | 'credit' | 'orgs' | 'sla', x: ReportsExtra, core: OpReports | undefined, range: Range): Section[] {
  if (kind === 'aum') {
    const m = x.aumMonthly.slice(-range);
    const last = m[m.length - 1]?.aum ?? 0;
    return [
      { title: 'AUM و جریان ورودی ماهانه', rows: [['ماه', 'AUM (تومان)', 'جریان ورودی (تومان)'], ...m.map((r) => [r.month, raw(r.aum), raw(r.inflow)])] },
      { title: 'تفکیک آزاد / قفل‌شده', rows: [['بخش', 'ارزش (تومان)'], ['آزاد', raw(last - x.lockedValue)], ['قفل‌شده', raw(x.lockedValue)]] },
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

  const exportCsv = (kind: 'aum' | 'credit' | 'orgs' | 'sla', title: string) => {
    if (!x) return;
    const secs = sections(kind, x, core.data, range);
    downloadCsv(`namadno-${kind}-${range}m`, secs.flatMap((s, i) => [...(i ? [[]] : []), [s.title], ...s.rows]));
    toast(`دانلود Excel «${title}» — ${rangeText(range)} آغاز شد`);
  };
  const exportPdf = (kind: 'aum' | 'credit' | 'orgs' | 'sla', title: string) => {
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
      <PageHeading title="گزارش‌ها" crumbs={[{ label: 'بهره‌بردار', href: routes.op.overview }, { label: 'سیستم', href: routes.op.settings }, { label: 'گزارش‌ها' }]}>
        <div style={{ display: 'inline-flex', alignItems: 'center', borderRadius: 8, border: '1px solid var(--outline-border)', overflow: 'hidden', height: 36 }}>
          {RANGES.map(([r, l]) => <button key={r} type="button" aria-pressed={range === r} onClick={() => setRange(r)} style={{ height: 36, padding: '0 12px', border: 0, background: range === r ? 'var(--soft-primary)' : 'transparent', color: range === r ? 'var(--primary-text)' : 'var(--text-secondary)', fontFamily: 'inherit', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>{l}</button>)}
        </div>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--text-secondary)' }}><Icon d={IC.calendar} size={16} />{rangeText(range)}</span>
        <button type="button" className="btnp" onClick={exportAll} disabled={!x}><Icon d={IC.excel} size={18} />خروجی همهٔ گزارش‌ها</button>
      </PageHeading>

      {extra.isLoading ? (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 24 }}>{[0, 1, 2, 3].map((i) => <Skeleton key={i} h={268} />)}</div>
      ) : extra.isError || !x ? (
        <ErrorState message={errMsg(extra.error)} onRetry={() => extra.refetch()} />
      ) : (
        <div style={{ flex: 'none', display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 24 }}>
          <AumCard x={x} range={range} onPdf={exportPdf} onCsv={exportCsv} />
          <CreditCard x={x} onPdf={exportPdf} onCsv={exportCsv} />
          <OrgsCard x={x} core={core.data} onPdf={exportPdf} onCsv={exportCsv} />
          <SlaCard x={x} onPdf={exportPdf} onCsv={exportCsv} />
        </div>
      )}

      <Schedules x={x} loading={extra.isLoading} />
    </>
  );
}

type Exp = (kind: 'aum' | 'credit' | 'orgs' | 'sla', title: string) => void;
function ReportCard({ kind, title, sub, updated, d, tone, value, unit, delta, deltaTone, onPdf, onCsv, children }: {
  kind: 'aum' | 'credit' | 'orgs' | 'sla'; title: string; sub: string; updated: string; d: string; tone: ToneKey; value: string; unit: string; delta: string; deltaTone: ToneKey; onPdf: Exp; onCsv: Exp; children: React.ReactNode;
}) {
  const [bg, fg] = TONES[tone];
  return (
    <div className="card" style={{ boxSizing: 'border-box', minHeight: 268, padding: 16, display: 'flex', flexDirection: 'column', gap: 10, minWidth: 0 }}>
      <div style={{ height: 36, display: 'flex', alignItems: 'center', gap: 10 }}>
        <span style={{ width: 36, height: 36, borderRadius: 10, background: bg, color: fg, display: 'grid', placeItems: 'center', flex: 'none' }}><Icon d={d} size={20} /></span>
        <span style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', lineHeight: 1.25 }}>
          <span style={{ fontSize: 14, fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{title}</span>
          <span style={{ fontSize: 11, color: 'var(--text-secondary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={`${sub} · ${updated}`}>{sub} · {updated}</span>
        </span>
      </div>
      {children}
      <div style={{ height: 36, display: 'flex', alignItems: 'baseline', gap: 5, whiteSpace: 'nowrap', overflow: 'hidden' }}>
        <span className="num" style={{ fontSize: 22, lineHeight: 1.1 }}>{value}</span>
        <span style={{ fontSize: 11, color: 'var(--text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis' }}>{unit}</span>
        <Lbl tone={deltaTone} style={{ marginRight: 'auto', height: 20, padding: '0 6px' }}>{delta}</Lbl>
      </div>
      <div style={{ marginTop: 'auto', height: 32, display: 'flex', alignItems: 'center', gap: 6 }}>
        <button type="button" className="btnp" onClick={() => onPdf(kind, title)} style={{ height: 32, padding: '0 10px', fontSize: 12 }}><Icon d={IC.download} size={16} />دانلود PDF</button>
        <button type="button" className="btno" onClick={() => onCsv(kind, title)} style={{ height: 32, padding: '0 10px', fontSize: 12 }}>Excel</button>
      </div>
    </div>
  );
}

function AumCard({ x, range, onPdf, onCsv }: { x: ReportsExtra; range: Range; onPdf: Exp; onCsv: Exp }) {
  const m = x.aumMonthly.slice(-range);
  const chart = useMemo(() => {
    if (m.length < 2) return null;
    const aums = m.map((r) => r.aum), flows = m.map((r) => r.inflow);
    const lo = Math.min(...aums) * 0.92, hi = Math.max(...aums) * 1.04;
    const flo = Math.min(...flows) - (Math.max(...flows) - Math.min(...flows) || 1), fhi = Math.max(...flows) * 1.6;
    const pts = (arr: number[], a: number, b: number) => arr.map((v, i) => [Math.round(((i * 184) / (arr.length - 1)) * 10) / 10, Math.round((78 - ((v - a) / (b - a || 1)) * 66) * 10) / 10] as [number, number]);
    const pA = pts(aums, lo, hi), pF = pts(flows, flo, fhi);
    const dA = smoothPath(pA);
    const last = pA[pA.length - 1];
    return { aum: dA, flow: smoothPath(pF), area: `${dA} L${last[0]} 84 L0 84 Z`, last };
  }, [m]);
  const last = m[m.length - 1]?.aum ?? 0;
  const first = m[0]?.aum ?? 0;
  const growth = first ? (last / first - 1) * 100 : 0;
  const free = Math.max(0, last - x.lockedValue);
  const freePct = last ? Math.round((free / last) * 1000) / 10 : 100;
  return (
    <ReportCard kind="aum" title="AUM و جریان ورودی" sub="دارایی تحت مدیریت · آزاد و قفل‌شده" updated={dayTime(x.updated.aum)} d={IC.funds} tone="primary" value={bn(last)} unit="میلیارد تومان" delta={spct(growth, 0)} deltaTone={growth >= 0 ? 'success' : 'error'} onPdf={onPdf} onCsv={onCsv}>
      <div dir="ltr" style={{ height: 84, flex: 'none' }}>
        {chart && (
          <svg viewBox="0 0 184 84" width="100%" height="84" preserveAspectRatio="none" role="img" aria-label={`AUM ${m[0].month} تا ${m[m.length - 1].month}`} style={{ display: 'block', overflow: 'visible' }}>
            <defs><linearGradient id="rp-line" x1="0" y1="0" x2="0" y2="1"><stop offset="0" style={{ stopColor: 'var(--chart-1)', stopOpacity: 0.24 }} /><stop offset="1" style={{ stopColor: 'var(--chart-1)', stopOpacity: 0 }} /></linearGradient></defs>
            <line x1="0" x2="184" y1="22" y2="22" style={{ stroke: 'var(--chart-grid)' }} strokeWidth="1" strokeDasharray="3 4" vectorEffect="non-scaling-stroke" />
            <line x1="0" x2="184" y1="48" y2="48" style={{ stroke: 'var(--chart-grid)' }} strokeWidth="1" strokeDasharray="3 4" vectorEffect="non-scaling-stroke" />
            <path d={chart.area} fill="url(#rp-line)" />
            <path d={chart.flow} fill="none" style={{ stroke: 'var(--chart-2)' }} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" strokeDasharray="4 4" vectorEffect="non-scaling-stroke" />
            <path d={chart.aum} fill="none" style={{ stroke: 'var(--chart-1)' }} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
          </svg>
        )}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
        <div className="lkbar" role="img" aria-label={`AUM آزاد ${bn(free)} · قفل ${bn(x.lockedValue)} میلیارد`}><span className="f" style={{ width: `${freePct}%` }} /><span className="l" style={{ flex: 1 }} /></div>
        <div className="lkleg" style={{ fontSize: 11, gap: 10 }}><span><span className="lkdot" />آزاد <b>{bn(free)}</b></span><span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}><Icon d={IC.lock} size={11} />قفل <b>{bn(x.lockedValue)}</b></span></div>
      </div>
    </ReportCard>
  );
}

function CreditCard({ x, onPdf, onCsv }: { x: ReportsExtra; onPdf: Exp; onCsv: Exp }) {
  const max = Math.max(1, ...x.credit.map((c) => c.disbursed + c.collected));
  return (
    <ReportCard kind="credit" title="تسهیلات" sub="وام پرداختی · اقساط وصول‌شده" updated={dayTime(x.updated.credit)} d={IC.percent} tone="success" value={bn(x.creditOutstanding)} unit="میلیارد مانده" delta={spct(x.creditDeltaPct, 0)} deltaTone={x.creditDeltaPct >= 0 ? 'success' : 'error'} onPdf={onPdf} onCsv={onCsv}>
      <div dir="ltr" role="img" aria-label="وام پرداختی و اقساط وصول‌شده ۶ ماه اخیر" style={{ height: 84, flex: 'none', display: 'flex', alignItems: 'flex-end', gap: 6, padding: '0 2px' }}>
        {x.credit.map((c) => (
          <div key={c.month} title={`${c.month} · پرداختی ${bn(c.disbursed)} · وصول ${bn(c.collected)} میلیارد`} style={{ flex: 1, height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', gap: 2 }}>
            <span style={{ height: `${Math.round((c.disbursed / max) * 100)}%`, borderRadius: '4px 4px 0 0', background: 'var(--chart-1)' }} />
            <span style={{ height: `${Math.round((c.collected / max) * 100)}%`, borderRadius: '0 0 3px 3px', background: 'var(--chart-3)' }} />
          </div>
        ))}
      </div>
    </ReportCard>
  );
}

function OrgsCard({ x, core, onPdf, onCsv }: { x: ReportsExtra; core?: OpReports; onPdf: Exp; onCsv: Exp }) {
  const orgs = [...(core?.byOrganization ?? [])].sort((a, b) => b.budgetUsed - a.budgetUsed);
  const top = orgs.slice(0, 4);
  const max = top[0]?.budgetUsed || 1;
  const sum = orgs.reduce((s, o) => s + o.budgetUsed, 0);
  return (
    <ReportCard kind="orgs" title="سازمان‌ها" sub="بسته‌های ارسالی · میلیارد تومان" updated={dayTime(x.updated.orgs)} d={IC.building} tone="info" value={bn(sum)} unit={`میلیارد · ${faDigits(x.orgCount)} سازمان`} delta={`+${faDigits(x.newOrgs)} سازمان`} deltaTone="success" onPdf={onPdf} onCsv={onCsv}>
      <div style={{ height: 84, flex: 'none', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', padding: '2px 0' }}>
        {top.map((o) => (
          <div key={o.id} style={{ height: 16, display: 'flex', alignItems: 'center', gap: 8, fontSize: 11 }}>
            <span style={{ width: 64, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', color: 'var(--text-secondary)' }} title={o.name}>{o.name}</span>
            <span style={{ flex: 1, height: 8, borderRadius: 4, background: 'var(--progress-track)', overflow: 'hidden', display: 'flex' }}><span style={{ width: `${Math.round((o.budgetUsed / max) * 100)}%`, background: 'var(--chart-1)', borderRadius: 4 }} /></span>
            <span className="num" style={{ width: 30, textAlign: 'left' }}>{bn(o.budgetUsed)}</span>
          </div>
        ))}
        {!top.length && <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>داده‌ای موجود نیست</span>}
      </div>
    </ReportCard>
  );
}

function SlaCard({ x, onPdf, onCsv }: { x: ReportsExtra; onPdf: Exp; onCsv: Exp }) {
  const C = 2 * Math.PI * 34;
  const dash = (x.sla.overall / 100) * C;
  return (
    <ReportCard kind="sla" title="عملیات و SLA" sub="دسترس‌پذیری سرویس‌ها · ۳۰ روز" updated="لحظه‌ای" d={IC.shield} tone="warning" value={dec(x.sla.overall) + '٪'} unit="دسترس‌پذیری" delta={(x.sla.delta < 0 ? '−' : '+') + dec(Math.abs(x.sla.delta))} deltaTone={x.sla.delta < 0 ? 'error' : 'success'} onPdf={onPdf} onCsv={onCsv}>
      <div dir="ltr" style={{ height: 84, flex: 'none', display: 'flex', alignItems: 'center', gap: 12 }}>
        <svg viewBox="0 0 84 84" width="84" height="84" role="img" aria-label={`دسترس‌پذیری ${dec(x.sla.overall)}٪`} style={{ flex: 'none' }}>
          <circle cx="42" cy="42" r="34" fill="none" style={{ stroke: 'var(--progress-track)' }} strokeWidth="9" />
          <circle cx="42" cy="42" r="34" fill="none" style={{ stroke: 'var(--chart-2)' }} strokeWidth="9" strokeLinecap="round" strokeDasharray={`${dash.toFixed(1)} ${C.toFixed(1)}`} transform="rotate(-90 42 42)" />
          <text x="42" y="47" textAnchor="middle" fontSize="15" fontWeight="300" style={{ fill: 'var(--text-primary)', fontFamily: 'inherit' }}>{dec(x.sla.overall)}٪</text>
        </svg>
        <div dir="rtl" style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 6, fontSize: 11, color: 'var(--text-secondary)' }}>
          {x.sla.services.map((s) => (
            <span key={s.name} style={{ display: 'flex', alignItems: 'center', gap: 6, whiteSpace: 'nowrap' }}>
              <span style={{ width: 8, height: 8, borderRadius: '50%', background: s.status === 'ok' ? 'var(--success-main)' : s.status === 'slow' ? 'var(--warning-main)' : 'var(--error-main)', flex: 'none' }} />
              <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis' }}>{s.name}</span>
              <span className="num" dir="ltr" style={{ color: 'var(--text-primary)' }}>{dec(s.uptime)}٪</span>
            </span>
          ))}
        </div>
      </div>
    </ReportCard>
  );
}

const SCOLS = 'minmax(0, 1fr) 96px 120px 72px 104px 56px';
const PERIODS = ['روزانه · ۰۸:۰۰', 'هفتگی · شنبه', 'ماهانه · اول ماه'];
function Schedules({ x, loading }: { x?: ReportsExtra; loading: boolean }) {
  const toast = useToast();
  const update = useUpdateSchedule();
  const create = useCreateSchedule();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ name: '', period: PERIODS[1], recipients: '', format: 'PDF' as 'PDF' | 'XLSX' });
  const [err, setErr] = useState('');
  const list = x?.schedules ?? [];
  const active = list.filter((s) => s.enabled).length;
  const submit = () => {
    if (form.name.trim().length < 3) return setErr('عنوان گزارش را وارد کنید.');
    if (!form.recipients.trim()) return setErr('گیرندگان گزارش را مشخص کنید.');
    create.mutate(form, {
      onSuccess: (s) => { setOpen(false); toast(`زمان‌بندی جدید ایجاد شد؛ اولین ارسال ${jDate(s.nextAt)}`); },
      onError: (e) => setErr(errMsg(e)),
    });
  };
  return (
    <div className="card" style={{ flex: 'none', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <CardHead title="گزارش‌های زمان‌بندی‌شده" badge={<Lbl>{faDigits(active)} فعال</Lbl>}>
        <button type="button" className="btnt" onClick={() => { setForm({ name: '', period: PERIODS[1], recipients: '', format: 'PDF' }); setErr(''); setOpen(true); }} style={{ marginRight: 'auto', height: 28, padding: '0 8px', fontSize: 12 }}><Icon d={IC.plus} size={16} strokeWidth={2} />زمان‌بندی جدید</button>
      </CardHead>
      <div style={{ overflowX: 'auto' }}>
        <div style={{ minWidth: 700 }}>
          <div style={{ height: 32, display: 'grid', gridTemplateColumns: SCOLS, alignItems: 'center', padding: '0 20px', background: 'var(--table-head)', color: 'var(--grey-600)', fontSize: 12, fontWeight: 700 }}>
            <span>گزارش</span><span>دوره</span><span>گیرندگان</span><span>قالب</span><span>ارسال بعدی</span><span>فعال</span>
          </div>
          {loading && <div style={{ padding: 20 }}><Skeleton h={160} /></div>}
          {list.map((r, i) => {
            const [bg, fg] = TONES[TILE_TONES[i % 6]];
            return (
              <div key={r.id} style={{ minHeight: 40, display: 'grid', gridTemplateColumns: SCOLS, alignItems: 'center', padding: '0 20px', borderBottom: '1px dashed var(--divider)', fontSize: 13, opacity: r.enabled ? 1 : 0.7 }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}><span style={{ width: 28, height: 28, borderRadius: 8, background: bg, color: fg, display: 'grid', placeItems: 'center', flex: 'none' }}><Icon d={IC.file} size={16} /></span><span style={{ fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{r.name}</span></span>
                <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{r.period}</span>
                <span style={{ fontSize: 12, color: 'var(--text-secondary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', paddingLeft: 8 }}>{r.recipients}</span>
                <span><Lbl dir="ltr" style={{ height: 20, padding: '0 6px', fontSize: 11 }}>{r.format}</Lbl></span>
                <span className="num" style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{r.enabled ? jDate(r.nextAt) : '—'}</span>
                <span><Sw on={r.enabled} label={`فعال‌سازی ${r.name}`} disabled={update.isPending && update.variables?.id === r.id}
                  onClick={() => update.mutate({ id: r.id, enabled: !r.enabled }, { onSuccess: () => toast(`«${r.name}» ${r.enabled ? 'متوقف' : 'فعال'} شد`), onError: (e) => toast(errMsg(e), 'error') })} /></span>
              </div>
            );
          })}
        </div>
      </div>
      <Modal open={open} onClose={() => setOpen(false)} width={520} label="زمان‌بندی گزارش جدید">
        <DlgHead title="زمان‌بندی گزارش جدید" onClose={() => setOpen(false)} />
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div className="fg"><label className="fl" htmlFor="sc-name">عنوان گزارش</label><input id="sc-name" className="fi" value={form.name} placeholder="مثلاً گزارش هفتگی قفل‌های وثیقه" onChange={(e: React.ChangeEvent<HTMLInputElement>) => { setForm({ ...form, name: e.target.value }); setErr(''); }} /></div>
          <div className="fg"><span className="fl">دوره ارسال</span><div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>{PERIODS.map((p) => <Chip key={p} on={form.period === p} onClick={() => setForm({ ...form, period: p })} style={{ height: 30, padding: '0 12px' }}>{p}</Chip>)}</div></div>
          <div className="fg"><label className="fl" htmlFor="sc-to">گیرندگان</label><input id="sc-to" className="fi" value={form.recipients} placeholder="مثلاً مالی، ریسک" onChange={(e: React.ChangeEvent<HTMLInputElement>) => { setForm({ ...form, recipients: e.target.value }); setErr(''); }} /></div>
          <div className="fg"><span className="fl">قالب</span><div style={{ display: 'flex', gap: 6 }}>{(['PDF', 'XLSX'] as const).map((f) => <Chip key={f} dir="ltr" on={form.format === f} onClick={() => setForm({ ...form, format: f })} style={{ height: 30, minWidth: 56 }}>{f}</Chip>)}</div></div>
        </div>
        <FormError>{err}</FormError>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <button type="button" className="btnp" onClick={submit} disabled={create.isPending} style={{ opacity: create.isPending ? 0.7 : 1 }}><Icon d={IC.calendar} size={16} />{create.isPending ? 'در حال ثبت…' : 'ایجاد زمان‌بندی'}</button>
          <button type="button" className="btno" onClick={() => setOpen(false)}>انصراف</button>
        </div>
      </Modal>
    </div>
  );
}
