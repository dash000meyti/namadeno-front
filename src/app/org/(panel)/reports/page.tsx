'use client';
/**
 * Organization — reports. Kit overview page: period tabs in the heading → sent packages (Bars) and allocation by
 * department → export rows (Excel / PDF) → scheduled reports (table, a switch per row).
 * «زمان‌بندی گزارش» opens a small dialog (optional title + format) and creates the schedule.
 */
import { useState } from 'react';
import {
  Bars, Card, Chips, Dialog, Empty, ErrorBlock, Field, Ident, Legend, List, ListRow, PageHeading, Pill, SkeletonCard,
  Switch, Table, Tabs, Tile, type Column,
} from '@/components/panel/kit';
import { Icon } from '@/components/ui/Icon';
import { useToast } from '@/components/ui/Toast';
import { useOrgReports } from '@/api/org';
import {
  useCreateSchedule, useExportReport, useReportsOverview, useToggleSchedule,
  type ReportExport, type ReportFile, type ReportSchedule, type ReportsOverview,
} from '@/api/org-packages-extra';
import { faDigits, jDate, time } from '@/lib/format';
import { now } from '@/lib/clock';
import { I } from '@/components/org/packages/meta';
import { errMsg } from '@/components/org/packages/ui';

type Range = 'm1' | 'm3' | 'm6' | 'y1';
type Format = ReportSchedule['format'];
type Unit = ReportsOverview['units'][number];
const RANGES: { key: Range; label: string }[] = [{ key: 'm1', label: '۳۰ روز' }, { key: 'm3', label: '۳ ماه' }, { key: 'm6', label: '۶ ماه' }, { key: 'y1', label: 'یک سال' }];
const FORMATS: { key: Format; label: string }[] = [{ key: 'Excel', label: 'Excel' }, { key: 'PDF', label: 'PDF' }];
const ICONS: Record<ReportSchedule['icon'], string> = { wallet: I.wallet, percent: I.percent, file: I.file, pkg: I.pkg, clock: I.clock };
/** Allocation shares per department (same colors as the dashboard). */
const MIX: { key: 'gold' | 'fixed' | 'rial'; label: string; color: string }[] = [
  { key: 'gold', label: 'طلا', color: 'var(--warning-main)' },
  { key: 'fixed', label: 'درآمد ثابت', color: 'var(--chart-3)' },
  { key: 'rial', label: 'ریال', color: 'var(--chart-4)' },
];
const SENT = [{ name: 'ارسال', color: 'var(--chart-1)' }];
const bn = (v: number) => faDigits((v / 1e9).toFixed(1), true);
const lastText = (iso?: string) => (!iso ? '—' : jDate(iso) === jDate(now()) ? 'امروز ' + time(iso) : jDate(iso));

function downloadCsv(f: ReportFile) {
  const esc = (s: string) => `"${s.replace(/"/g, '""')}"`;
  const csv = '﻿' + [f.columns, ...f.rows].map((r) => r.map(esc).join(',')).join('\r\n');
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = f.fileName + '.csv';
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Standalone print document for the PDF export (opened in a new window, outside the app theme). */
function printableHtml(f: ReportFile) {
  const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');
  return `<!doctype html><html lang="fa" dir="rtl"><head><meta charset="utf-8"><title>${esc(f.title)}</title><style>body{font-family:Tahoma,sans-serif;padding:24px;color:#1F2433}h1{font-size:18px}table{border-collapse:collapse;width:100%;font-size:12px}th,td{border:1px solid #DEE2EB;padding:6px 8px;text-align:right}th{background:#F1F3F8}</style></head><body><h1>${esc(f.title)} · نمادنو</h1><table><thead><tr>${f.columns.map((c) => `<th>${esc(c)}</th>`).join('')}</tr></thead><tbody>${f.rows.map((r) => `<tr>${r.map((c) => `<td>${esc(c)}</td>`).join('')}</tr>`).join('')}</tbody></table><script>window.onload=function(){window.print()}<\/script></body></html>`;
}

export default function OrgReportsPage() {
  const toast = useToast();
  const { data: reports, isError: rErr, refetch: rRefetch } = useOrgReports();
  const { data: ov, isLoading, isError, refetch } = useReportsOverview();
  const toggle = useToggleSchedule();
  const create = useCreateSchedule();
  const exp = useExportReport();
  const [range, setRange] = useState<Range>('m6');
  const [dlg, setDlg] = useState(false);
  const [title, setTitle] = useState('');
  const [format, setFormat] = useState<Format>('Excel');

  const monthly = (reports?.monthly ?? []).map((m, i, arr) => ({ label: m.month, v: m.sent + (i === arr.length - 1 ? ov?.currentMonthExtra ?? 0 : 0) }));
  const sets: Record<Range, { note: string; items: { label: string; v: number }[] }> = {
    m1: { note: '۴ هفته گذشته · میلیارد تومان', items: (ov?.weekly ?? []).map((w) => ({ label: w.label, v: w.sent })) },
    m3: { note: '۳ ماه گذشته · میلیارد تومان', items: monthly.slice(-3) },
    m6: { note: '۶ ماه گذشته · میلیارد تومان', items: monthly.slice(-6) },
    y1: { note: '۱۲ ماه گذشته · میلیارد تومان', items: [...(ov?.earlierMonths ?? []).map((m) => ({ label: m.month, v: m.sent })), ...monthly].slice(-12) },
  };
  const set = sets[range];
  const sum = set.items.reduce((s, x) => s + x.v, 0);
  const schedules = ov?.schedules ?? [];
  const active = schedules.filter((s) => s.enabled).length;

  const doExport = (e: ReportExport, fmt: 'xlsx' | 'pdf') => {
    // the print window opens synchronously (inside the click) so pop-up blockers allow it
    const w = fmt === 'pdf' ? window.open('', '_blank') : null;
    exp.mutate({ id: e.id, format: fmt }, {
      onSuccess: (f) => {
        if (fmt === 'xlsx') downloadCsv(f);
        else if (w) { w.document.open(); w.document.write(printableHtml(f)); w.document.close(); }
        else {
          const url = URL.createObjectURL(new Blob([printableHtml(f)], { type: 'text/html;charset=utf-8' }));
          window.open(url, '_blank');
        }
        toast(`${e.title} (${fmt === 'xlsx' ? 'Excel' : 'PDF'}) آماده دانلود شد`);
      },
      onError: (err) => { w?.close(); toast(errMsg(err), 'error'); },
    });
  };
  const toggleSchedule = (s: ReportSchedule) => toggle.mutate({ id: s.id, enabled: !s.enabled }, {
    onSuccess: (r) => toast(`«${r.title}» ${r.enabled ? 'فعال' : 'غیرفعال'} شد`),
    onError: (err) => toast(errMsg(err), 'error'),
  });
  const openSchedule = () => { setTitle(''); setFormat('Excel'); setDlg(true); };
  const newSchedule = () => {
    if (create.isPending) return;
    create.mutate({ title: title.trim() || undefined, format }, {
      onSuccess: () => { setDlg(false); toast('زمان‌بندی جدید ثبت شد · اولین ارسال شنبه ۰۹:۰۰'); },
      onError: (err) => toast(errMsg(err), 'error'),
    });
  };

  const schCols: Column<ReportSchedule>[] = [
    {
      key: 'title', label: 'گزارش', width: 'minmax(0, 1.5fr)', render: (s) => (
        <Ident lead={<Tile d={ICONS[s.icon]} tone={s.enabled ? s.tone : 'neutral'} />} title={<span style={s.enabled ? undefined : { color: 'var(--text-secondary)' }}>{s.title}</span>} sub={s.period} />
      ),
    },
    { key: 'to', label: 'گیرندگان', width: 'minmax(0, 1fr)', render: (s) => <span className="el mute">{s.to}</span> },
    { key: 'fmt', label: 'قالب', width: '64px', render: (s) => <Pill>{s.format}</Pill> },
    { key: 'last', label: 'آخرین ارسال', width: '108px', render: (s) => <span className="num sm">{lastText(s.lastAt)}</span> },
    { key: 'on', label: 'فعال', width: '44px', align: 'end', render: (s) => <Switch on={s.enabled} label={`فعال‌سازی ${s.title}`} disabled={toggle.isPending && toggle.variables?.id === s.id} onChange={() => toggleSchedule(s)} /> },
  ];

  const heading = (
    <PageHeading title="گزارش‌ها" crumbs={[{ label: 'مدیریت' }]} sub="ارسال بسته‌ها، تخصیص کارکنان، خروجی‌ها و گزارش‌های زمان‌بندی‌شده">
      <Tabs label="بازه زمانی" value={range} onChange={setRange} items={RANGES} />
      <button type="button" className="nm-btn" onClick={openSchedule}><Icon d={I.clock} size={17} />زمان‌بندی گزارش</button>
    </PageHeading>
  );

  const dialog = (
    <Dialog
      open={dlg} onClose={() => setDlg(false)} title="زمان‌بندی گزارش" sub="ارسال خودکار هفتگی، شنبه‌ها ساعت ۰۹:۰۰، به ایمیل گیرندگان."
      icon={<Tile d={I.clock} tone="primary" size="lg" />}
      footer={(
        <>
          <button type="button" className="nm-btn ghost" onClick={() => setDlg(false)}>انصراف</button>
          <button type="button" className="nm-btn" disabled={create.isPending} onClick={newSchedule}>{create.isPending ? 'در حال ثبت…' : 'ثبت زمان‌بندی'}</button>
        </>
      )}
    >
      <Field label="عنوان گزارش (اختیاری)" htmlFor="sch-title">
        <span className="nm-in" style={{ width: '100%' }}>
          <input id="sch-title" type="text" value={title} autoFocus placeholder="گزارش هفتگی بسته‌های دارایی"
            onChange={(e) => setTitle(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') newSchedule(); }} />
        </span>
      </Field>
      <Field label="قالب فایل">
        <Chips label="قالب فایل" value={format} onChange={setFormat} options={FORMATS} />
      </Field>
    </Dialog>
  );

  if (isError || rErr) return <>{heading}<ErrorBlock message="دریافت گزارش‌ها ممکن نشد" onRetry={() => { refetch(); rRefetch(); }} />{dialog}</>;

  return (
    <>
      {heading}

      <div className="nm-grid c2 stretch">
        {reports && ov ? (
          <Card title="بسته‌های ارسالی" sub={set.note} actions={<span className="num" style={{ fontSize: 12.5, fontWeight: 600 }}>جمع {bn(sum)} میلیارد</span>}>
            <Bars label={`نمودار ${set.note}`} data={set.items.map((x) => ({ label: x.label, values: [x.v] }))} series={SENT} showValues fmt={bn} highlight={set.items.length - 1} height={200} />
          </Card>
        ) : <SkeletonCard h={276} />}

        {ov ? (
          <Card title="ترکیب تخصیص کارکنان" sub="به تفکیک واحد" actions={<Legend items={MIX.map((m) => ({ label: m.label, color: m.color }))} />}>
            {ov.units.length
              ? <div className="nm-list">{ov.units.slice(0, 6).map((u) => <UnitRow key={u.department} u={u} />)}</div>
              : <Empty title="هنوز بسته‌ای توسط کارکنان تأیید نشده است" />}
          </Card>
        ) : <SkeletonCard h={276} />}
      </div>

      {!ov ? <SkeletonCard h={240} /> : (
        <Card title="خروجی گزارش‌ها">
          <List>
            {ov.exports.map((e) => {
              const busy = exp.isPending && exp.variables?.id === e.id;
              return (
                <ListRow
                  key={e.id}
                  lead={<Tile d={ICONS[e.icon]} tone={e.tone} />}
                  title={e.title}
                  sub={<>{e.desc} · آخرین خروجی: <span className="num">{lastText(e.lastAt)}</span></>}
                  trail={(
                    <>
                      <button type="button" className="nm-btn sm ghost" disabled={busy} aria-label={`خروجی Excel ${e.title}`} onClick={() => doExport(e, 'xlsx')}><Icon d={I.download} size={15} />Excel</button>
                      <button type="button" className="nm-btn sm ghost" disabled={busy} aria-label={`خروجی PDF ${e.title}`} onClick={() => doExport(e, 'pdf')}><Icon d={I.download} size={15} />PDF</button>
                    </>
                  )}
                />
              );
            })}
          </List>
        </Card>
      )}

      <Card flush title="گزارش‌های زمان‌بندی‌شده" sub={ov ? `${faDigits(active)} فعال از ${faDigits(schedules.length)} · ارسال خودکار به ایمیل گیرندگان` : undefined}>
        <Table
          columns={schCols} rows={schedules} rowKey={(s) => s.id} rowLabel={(s) => s.title} loading={isLoading}
          empty={<Empty icon={I.clock} title="گزارش زمان‌بندی‌شده‌ای ندارید" action={<button type="button" className="nm-btn sm" onClick={openSchedule}>زمان‌بندی گزارش</button>} />}
          minWidth={680}
        />
      </Card>

      {dialog}
    </>
  );
}

/** One department: name, a stacked share bar (gold / fixed income / rial) and the three percentages. */
function UnitRow({ u }: { u: Unit }) {
  const said = MIX.map((m) => `${m.label} ${faDigits(u[m.key])}٪`).join('، ');
  return (
    <div className="nm-li" style={{ minHeight: 40, padding: '6px 0' }}>
      <span className="nm-el" style={{ width: 96, flex: 'none', fontSize: 13 }} title={u.department}>{u.department}</span>
      <span role="img" aria-label={`${u.department}: ${said}`} style={{ flex: 1, minWidth: 0, display: 'flex', gap: 2, height: 10, borderRadius: 6, overflow: 'hidden', background: 'var(--fill)' }}>
        {MIX.filter((m) => u[m.key] > 0).map((m) => <i key={m.key} style={{ flex: u[m.key], background: m.color, minWidth: 3 }} />)}
      </span>
      <span className="num mute" style={{ width: 112, flex: 'none', textAlign: 'left', fontSize: 12 }}>{MIX.map((m) => `${faDigits(u[m.key])}٪`).join(' · ')}</span>
    </div>
  );
}
