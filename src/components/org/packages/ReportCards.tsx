'use client';
/**
 * Report pieces of the organization dashboard (the separate «گزارش‌ها» page was merged into it):
 * sent packages chart with a period switch, allocation by unit, and the Excel / PDF exports as menu items.
 */
import { useState } from 'react';
import { Bars, Card, Empty, Legend, SkeletonCard, Tabs } from '@/components/panel/kit';
import { useToast } from '@/components/ui/Toast';
import { useOrgReports } from '@/api/org';
import { useExportReport, useReportsOverview, type ReportExport, type ReportFile, type ReportsOverview } from '@/api/org-packages-extra';
import { faDigits } from '@/lib/format';
import { errMsg } from '@/components/org/packages/ui';

type Range = 'm1' | 'm3' | 'm6' | 'y1';
type Unit = ReportsOverview['units'][number];
const RANGES: { key: Range; label: string }[] = [{ key: 'm1', label: '۳۰ روز' }, { key: 'm3', label: '۳ ماه' }, { key: 'm6', label: '۶ ماه' }, { key: 'y1', label: 'یک سال' }];
/** Allocation shares (same colors as the team assets card). */
const MIX: { key: 'gold' | 'fixed' | 'rial'; label: string; color: string }[] = [
  { key: 'gold', label: 'طلا', color: 'var(--warning-main)' },
  { key: 'fixed', label: 'درآمد ثابت', color: 'var(--chart-3)' },
  { key: 'rial', label: 'ریال', color: 'var(--chart-4)' },
];
const SENT = [{ name: 'ارسال', color: 'var(--chart-1)' }];
const bn = (v: number) => faDigits((v / 1e9).toFixed(1), true);

/** Sent packages per week / month with a period switch. */
export function SentChartCard() {
  const reports = useOrgReports();
  const ov = useReportsOverview();
  const [range, setRange] = useState<Range>('m6');
  if (!reports.data || !ov.data) return <SkeletonCard h={276} />;
  const monthly = reports.data.monthly.map((m, i, arr) => ({ label: m.month, v: m.sent + (i === arr.length - 1 ? ov.data.currentMonthExtra : 0) }));
  const sets: Record<Range, { note: string; items: { label: string; v: number }[] }> = {
    m1: { note: '۴ هفته گذشته', items: ov.data.weekly.map((w) => ({ label: w.label, v: w.sent })) },
    m3: { note: '۳ ماه گذشته', items: monthly.slice(-3) },
    m6: { note: '۶ ماه گذشته', items: monthly.slice(-6) },
    y1: { note: '۱۲ ماه گذشته', items: [...ov.data.earlierMonths.map((m) => ({ label: m.month, v: m.sent })), ...monthly].slice(-12) },
  };
  const set = sets[range];
  const sum = set.items.reduce((s, x) => s + x.v, 0);
  return (
    <Card title="بسته‌های ارسالی" sub={`جمع ${bn(sum)} میلیارد تومان`} actions={<Tabs label="بازه زمانی" value={range} onChange={setRange} items={RANGES} />}>
      <Bars label={`نمودار بسته‌های ارسالی ${set.note} (میلیارد تومان)`} data={set.items.map((x) => ({ label: x.label, values: [x.v] }))} series={SENT} showValues fmt={bn} highlight={set.items.length - 1} height={200} />
    </Card>
  );
}

/** How colleagues split their accepted packages, per unit. */
export function UnitsMixCard() {
  const ov = useReportsOverview();
  if (!ov.data) return <SkeletonCard h={276} />;
  return (
    <Card title="ترکیب تخصیص کارکنان" sub="به تفکیک واحد" actions={<Legend items={MIX.map((m) => ({ label: m.label, color: m.color }))} />}>
      {ov.data.units.length
        ? <div className="nm-list">{ov.data.units.slice(0, 6).map((u) => <UnitRow key={u.department} u={u} />)}</div>
        : <Empty title="هنوز بسته‌ای توسط کارکنان تأیید نشده است" />}
    </Card>
  );
}

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

/** Menu items for the dashboard's «خروجی گزارش» button: each report as Excel and as PDF. */
export function useReportExportItems(): ({ label: string; onClick: () => void; disabled?: boolean } | 'sep')[] {
  const toast = useToast();
  const ov = useReportsOverview();
  const exp = useExportReport();
  const run = (e: ReportExport, fmt: 'xlsx' | 'pdf') => {
    // the print window opens synchronously (inside the click) so pop-up blockers allow it
    const w = fmt === 'pdf' ? window.open('', '_blank') : null;
    exp.mutate({ id: e.id, format: fmt }, {
      onSuccess: (f) => {
        if (fmt === 'xlsx') downloadCsv(f);
        else if (w) { w.document.open(); w.document.write(printableHtml(f)); w.document.close(); }
        else window.open(URL.createObjectURL(new Blob([printableHtml(f)], { type: 'text/html;charset=utf-8' })), '_blank');
        toast(`${e.title} (${fmt === 'xlsx' ? 'Excel' : 'PDF'}) آماده دانلود شد`);
      },
      onError: (err) => { w?.close(); toast(errMsg(err), 'error'); },
    });
  };
  const list = ov.data?.exports ?? [];
  return list.flatMap((e, i) => [
    ...(i > 0 ? ['sep' as const] : []),
    { label: `${e.title} · Excel`, onClick: () => run(e, 'xlsx'), disabled: exp.isPending },
    { label: `${e.title} · PDF`, onClick: () => run(e, 'pdf'), disabled: exp.isPending },
  ]);
}
