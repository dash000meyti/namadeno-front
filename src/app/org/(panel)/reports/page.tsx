'use client';
/** Design: org-reports.dc.html — monthly sent chart, allocation by unit, exports and scheduled reports. */
import { useState } from 'react';
import { PageHeading } from '@/components/panel/PanelShell';
import { Icon } from '@/components/ui/Icon';
import { useOrgReports } from '@/api/org';
import { useCreateSchedule, useExportReport, useReportsOverview, useToggleSchedule, type ReportExport, type ReportFile, type ReportSchedule } from '@/api/org-packages-extra';
import { routes } from '@/lib/routes';
import { faDigits, jDate, time } from '@/lib/format';
import { now } from '@/lib/clock';
import { I, soft } from '@/components/org/packages/meta';
import { CardError, CardSkeleton, Switch, errMsg, useFlash, useOrgCrumb } from '@/components/org/packages/ui';

type Range = 'm1' | 'm3' | 'm6' | 'y1';
const SCH_GRID = '1.4fr 130px 1fr 72px 110px 56px';
const ICONS: Record<ReportSchedule['icon'], string> = { wallet: I.wallet, percent: I.percent, file: I.file, pkg: I.pkg, clock: I.clock };
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

function printableHtml(f: ReportFile) {
  const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');
  return `<!doctype html><html lang="fa" dir="rtl"><head><meta charset="utf-8"><title>${esc(f.title)}</title><style>body{font-family:Tahoma,sans-serif;padding:24px;color:#1F2433}h1{font-size:18px}table{border-collapse:collapse;width:100%;font-size:12px}th,td{border:1px solid #DEE2EB;padding:6px 8px;text-align:right}th{background:#F1F3F8}</style></head><body><h1>${esc(f.title)} · نمادنو</h1><table><thead><tr>${f.columns.map((c) => `<th>${esc(c)}</th>`).join('')}</tr></thead><tbody>${f.rows.map((r) => `<tr>${r.map((c) => `<td>${esc(c)}</td>`).join('')}</tr>`).join('')}</tbody></table><script>window.onload=function(){window.print()}<\/script></body></html>`;
}

export default function OrgReportsPage() {
  const orgCrumb = useOrgCrumb();
  const { data: reports, isError: rErr, refetch: rRefetch } = useOrgReports();
  const { data: ov, isLoading, isError, refetch } = useReportsOverview();
  const toggle = useToggleSchedule();
  const create = useCreateSchedule();
  const exp = useExportReport();
  const { flash, toast } = useFlash();
  const [range, setRange] = useState<Range>('m6');

  const monthly = (reports?.monthly ?? []).map((m, i, arr) => ({ label: m.month, v: m.sent + (i === arr.length - 1 ? ov?.currentMonthExtra ?? 0 : 0) }));
  const sets: Record<Range, { note: string; items: { label: string; v: number }[]; w: number }> = {
    m1: { note: '۴ هفته گذشته · میلیارد تومان', items: (ov?.weekly ?? []).map((w) => ({ label: w.label, v: w.sent })), w: 44 },
    m3: { note: '۳ ماه گذشته · میلیارد تومان', items: monthly.slice(-3), w: 56 },
    m6: { note: '۶ ماه گذشته · میلیارد تومان', items: monthly.slice(-6), w: 36 },
    y1: { note: '۱۲ ماه گذشته · میلیارد تومان', items: [...(ov?.earlierMonths ?? []).map((m) => ({ label: m.month, v: m.sent })), ...monthly].slice(-12), w: 20 },
  };
  const set = sets[range];
  const mx = Math.max(1, ...set.items.map((x) => x.v)) * 1.12;
  const sum = set.items.reduce((s, x) => s + x.v, 0);
  const schedules = ov?.schedules ?? [];
  const active = schedules.filter((s) => s.enabled).length;

  const doExport = (e: ReportExport, format: 'xlsx' | 'pdf') => {
    const w = format === 'pdf' ? window.open('', '_blank') : null;
    exp.mutate({ id: e.id, format }, {
      onSuccess: (f) => {
        if (format === 'xlsx') downloadCsv(f);
        else if (w) { w.document.open(); w.document.write(printableHtml(f)); w.document.close(); }
        else {
          const url = URL.createObjectURL(new Blob([printableHtml(f)], { type: 'text/html;charset=utf-8' }));
          window.open(url, '_blank');
        }
        flash(`${e.title} (${format === 'xlsx' ? 'Excel' : 'PDF'}) آماده دانلود شد`);
      },
      onError: (err) => { w?.close(); flash(errMsg(err), 'error'); },
    });
  };
  const toggleSchedule = (s: ReportSchedule) => toggle.mutate({ id: s.id, enabled: !s.enabled }, {
    onSuccess: (r) => flash(`«${r.title}» ${r.enabled ? 'فعال' : 'غیرفعال'} شد`),
    onError: (err) => flash(errMsg(err), 'error'),
  });
  const newSchedule = () => create.mutate({}, { onSuccess: () => flash('زمان‌بندی جدید ثبت شد · اولین ارسال شنبه ۰۹:۰۰'), onError: (err) => flash(errMsg(err), 'error') });

  return (
    <>
      <PageHeading title="گزارش‌ها" crumbs={[orgCrumb, { label: 'منابع انسانی', href: routes.org.dashboard }, { label: 'گزارش‌ها' }]}>
        <div role="group" aria-label="بازه زمانی" style={{ height: 36, display: 'flex', gap: 4, padding: 4, boxSizing: 'border-box', borderRadius: 8, background: 'var(--bg-neutral)' }}>
          {([['m1', '۳۰ روز'], ['m3', '۳ ماه'], ['m6', '۶ ماه'], ['y1', 'یک سال']] as const).map(([k, label]) => {
            const on = range === k;
            return <button key={k} aria-pressed={on} onClick={() => setRange(k)} style={{ height: 28, padding: '0 12px', border: 0, borderRadius: 6, background: on ? 'var(--bg-paper)' : 'transparent', color: on ? 'var(--text-primary)' : 'var(--text-secondary)', boxShadow: on ? 'var(--shadow-z1)' : 'none', fontFamily: 'inherit', fontSize: 12, fontWeight: on ? 700 : 500, cursor: 'pointer', whiteSpace: 'nowrap' }}>{label}</button>;
          })}
        </div>
        <button className="btn" onClick={newSchedule} disabled={create.isPending} style={{ background: 'var(--primary-main)', color: 'var(--primary-contrast)', boxShadow: 'var(--shadow-primary)' }}><Icon d={I.clock} size={18} strokeWidth={2} />زمان‌بندی گزارش</button>
      </PageHeading>

      {(isError || rErr) && <CardError onRetry={() => { refetch(); rRefetch(); }} />}

      {/* Charts row */}
      <div style={{ minHeight: 224, flex: 'none', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
        {reports && ov ? (
          <div className="card" style={{ boxSizing: 'border-box', padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 10, minWidth: 0, height: 224 }}>
            <div style={{ height: 24, display: 'flex', alignItems: 'center', gap: 10 }}>
              <h6 style={{ margin: 0, fontSize: 15, fontWeight: 700, lineHeight: 1.2, whiteSpace: 'nowrap' }}>بسته‌های ارسالی ماهانه</h6>
              <span className="cell" style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{set.note}</span>
              <span className="num" style={{ marginRight: 'auto', fontSize: 12, fontWeight: 500, whiteSpace: 'nowrap' }}>جمع {bn(sum)} میلیارد</span>
            </div>
            <div dir="ltr" role="img" aria-label={`نمودار ${set.note}`} style={{ flex: 1, minHeight: 0, position: 'relative', display: 'flex', alignItems: 'stretch', gap: 10, padding: '0 4px' }}>
              <div style={{ position: 'absolute', inset: '18px 4px 22px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', pointerEvents: 'none' }}>
                {[0, 1, 2, 3].map((i) => <span key={i} style={{ height: 1, background: 'var(--chart-grid)' }} />)}
              </div>
              {set.items.map((m, i) => (
                <div key={m.label + i} dir="rtl" title={`${m.label}: ${bn(m.v)} میلیارد تومان`} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, minWidth: 0 }}>
                  <span className="num" style={{ height: 14, fontSize: 11, fontWeight: 500, lineHeight: '14px', whiteSpace: 'nowrap' }}>{bn(m.v)}</span>
                  <div style={{ flex: 1, width: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', alignItems: 'center' }}>
                    <span style={{ width: set.w, maxWidth: '100%', height: `${Math.round((m.v / mx) * 100)}%`, background: i === set.items.length - 1 ? 'var(--chart-1)' : 'var(--primary-light)', borderRadius: '6px 6px 0 0', display: 'block' }} />
                  </div>
                  <span style={{ height: 16, fontSize: 11, lineHeight: '16px', color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>{m.label}</span>
                </div>
              ))}
            </div>
          </div>
        ) : <CardSkeleton h={224} />}

        {ov ? (
          <div className="card" style={{ boxSizing: 'border-box', padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 10, minWidth: 0, minHeight: 224 }}>
            <div style={{ height: 24, display: 'flex', alignItems: 'center', gap: 10 }}>
              <h6 style={{ margin: 0, fontSize: 15, fontWeight: 700, lineHeight: 1.2, whiteSpace: 'nowrap' }}>ترکیب تخصیص کارکنان</h6>
              <span className="cell" style={{ fontSize: 12, color: 'var(--text-secondary)' }}>به تفکیک واحد</span>
              <span style={{ marginRight: 'auto', display: 'flex', alignItems: 'center', gap: 10, fontSize: 11, color: 'var(--text-secondary)' }}>
                {[['طلا', '--warning-main'], ['درآمد ثابت', '--chart-3'], ['ریال', '--chart-4']].map(([label, color]) => (
                  <span key={label} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, whiteSpace: 'nowrap' }}><span style={{ width: 8, height: 8, borderRadius: 2, background: `var(${color})` }} />{label}</span>
                ))}
              </span>
            </div>
            <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', justifyContent: 'space-between', gap: 6 }}>
              {ov.units.slice(0, 6).map((u) => (
                <div key={u.department} style={{ display: 'flex', alignItems: 'center', gap: 10, height: 26 }}>
                  <span style={{ width: 84, fontSize: 12, color: 'var(--text-secondary)', whiteSpace: 'nowrap', flex: 'none', overflow: 'hidden', textOverflow: 'ellipsis' }}>{u.department}</span>
                  <span dir="ltr" style={{ flex: 1, display: 'flex', height: 12, borderRadius: 6, overflow: 'hidden', gap: 2, background: 'var(--bg-neutral)' }}><span style={{ width: `${u.gold}%`, background: 'var(--warning-main)' }} /><span style={{ width: `${u.fixed}%`, background: 'var(--chart-3)' }} /><span style={{ width: `${u.rial}%`, background: 'var(--chart-4)' }} /></span>
                  <span className="num" style={{ width: 92, fontSize: 11, color: 'var(--text-secondary)', whiteSpace: 'nowrap', textAlign: 'left', flex: 'none' }}>{faDigits(u.gold)}٪ · {faDigits(u.fixed)}٪ · {faDigits(u.rial)}٪</span>
                </div>
              ))}
              {!ov.units.length && <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>هنوز بسته‌ای توسط کارکنان تأیید نشده است.</span>}
            </div>
          </div>
        ) : <CardSkeleton h={224} />}
      </div>

      {/* Export cards */}
      <div style={{ flex: 'none', display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 20 }}>
        {(ov?.exports ?? []).map((e) => {
          const t = soft(e.tone);
          const busy = exp.isPending && exp.variables?.id === e.id;
          return (
            <div key={e.id} className="card" style={{ minHeight: 108, boxSizing: 'border-box', padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 14, minWidth: 0 }}>
              <span style={{ width: 44, height: 44, borderRadius: 12, background: t.bg, color: t.fg, display: 'grid', placeItems: 'center', flex: 'none' }}><Icon d={ICONS[e.icon]} size={22} /></span>
              <span style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 3, lineHeight: 1.25 }}>
                <span style={{ fontSize: 14, fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{e.title}</span>
                <span style={{ fontSize: 11, color: 'var(--text-secondary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{e.desc}</span>
                <span className="num" style={{ fontSize: 11, color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>آخرین خروجی: {lastText(e.lastAt)}</span>
              </span>
              <span style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {(['xlsx', 'pdf'] as const).map((f) => (
                  <button key={f} onClick={() => doExport(e, f)} disabled={busy} style={{ height: 28, padding: '0 10px', borderRadius: 8, border: '1px solid var(--outline-border)', background: 'transparent', color: 'var(--text-primary)', fontFamily: 'inherit', fontSize: 12, fontWeight: 600, cursor: busy ? 'wait' : 'pointer', display: 'inline-flex', alignItems: 'center', gap: 6, opacity: busy ? 0.6 : 1 }}>
                    <Icon d={I.download} size={14} />{f === 'xlsx' ? 'Excel' : 'PDF'}
                  </button>
                ))}
              </span>
            </div>
          );
        })}
        {isLoading && [0, 1, 2].map((i) => <CardSkeleton key={i} h={108} />)}
      </div>

      {/* Scheduled reports */}
      <div className="card" style={{ flex: 'none', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <div style={{ height: 44, flex: 'none', boxSizing: 'border-box', padding: '0 16px', display: 'flex', alignItems: 'center', gap: 10, borderBottom: '1px solid var(--divider)' }}>
          <h6 style={{ margin: 0, fontSize: 15, fontWeight: 700, lineHeight: 1.2 }}>گزارش‌های زمان‌بندی‌شده</h6>
          <span className="num" style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{faDigits(active)} فعال از {faDigits(schedules.length)}</span>
          <span style={{ marginRight: 'auto', fontSize: 11, color: 'var(--text-secondary)' }}>ارسال خودکار به ایمیل گیرندگان</span>
        </div>
        <div className="th" style={{ height: 32, flex: 'none', display: 'grid', gridTemplateColumns: SCH_GRID, alignItems: 'center', gap: 8, padding: '0 16px' }}>
          <span className="cell">گزارش</span><span className="cell">دوره</span><span className="cell">گیرندگان</span><span className="cell">قالب</span><span className="cell">آخرین ارسال</span><span className="cell">فعال</span>
        </div>
        {schedules.map((s) => {
          const t = soft(s.tone);
          return (
            <div key={s.id} style={{ height: 38, flex: 'none', display: 'grid', gridTemplateColumns: SCH_GRID, alignItems: 'center', gap: 8, padding: '0 16px', borderBottom: '1px dashed var(--divider)', fontSize: 12, color: s.enabled ? 'var(--text-primary)' : 'var(--text-disabled)' }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}><span style={{ width: 24, height: 24, borderRadius: 6, background: t.bg, color: t.fg, display: 'grid', placeItems: 'center', flex: 'none' }}><Icon d={ICONS[s.icon]} size={13} /></span><span className="cell" style={{ fontWeight: 600, fontSize: 13 }}>{s.title}</span></span>
              <span className="cell">{s.period}</span>
              <span className="cell" style={{ color: 'var(--text-secondary)' }}>{s.to}</span>
              <span><span className="lbl" style={{ height: 20, padding: '0 6px', fontSize: 11, background: 'var(--soft-default)', color: 'var(--default-text)' }}>{s.format}</span></span>
              <span className="num cell" style={{ color: 'var(--text-secondary)' }}>{lastText(s.lastAt)}</span>
              <span><Switch on={s.enabled} label={`فعال‌سازی ${s.title}`} disabled={toggle.isPending && toggle.variables?.id === s.id} onToggle={() => toggleSchedule(s)} /></span>
            </div>
          );
        })}
        {isLoading && [0, 1, 2].map((i) => <div key={i} style={{ height: 38, borderBottom: '1px dashed var(--divider)', opacity: 0.5 }} />)}
      </div>
      {toast}
    </>
  );
}
