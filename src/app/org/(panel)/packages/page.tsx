'use client';
/** Design: org-packages.dc.html — list of asset packages with status tabs, search and side stats. */
import Link from 'next/link';
import { useMemo, useState } from 'react';
import { PageHeading } from '@/components/panel/PanelShell';
import { Icon } from '@/components/ui/Icon';
import { useOrgPackages, useOrgReports } from '@/api/org';
import { routes } from '@/lib/routes';
import { faDigits, jDate, money } from '@/lib/format';
import type { OrgPackage } from '@/types/domain';
import { I, effectiveStatus, jParts, monthName, policySub, reasonMeta, soft, splitCompact, statusLabel } from '@/components/org/packages/meta';
import { CardError, CardSkeleton, CountTabs, Kpi, LockChip, Pager, SearchBox, useOrgCrumb } from '@/components/org/packages/ui';
import { now } from '@/lib/clock';

type TabKey = 'all' | 'draft' | 'sent' | 'completed' | 'cancelled';
const PAGE = 8;
const GRID = 'minmax(0, 1fr) 52px 84px 96px 104px 116px';

export default function OrgPackagesPage() {
  const orgCrumb = useOrgCrumb();
  const { data, isLoading, isError, refetch } = useOrgPackages();
  const { data: reports } = useOrgReports();
  const [tab, setTab] = useState<TabKey>('all');
  const [q, setQ] = useState('');
  const [page, setPage] = useState(0);

  const all = useMemo(() => data ?? [], [data]);
  const inTab = (x: OrgPackage, k: TabKey) => k === 'all' || effectiveStatus(x) === k;
  const rows = useMemo(() => all.filter((x) => inTab(x, tab) && (!q.trim() || x.title.includes(q.trim()))), [all, tab, q]);
  const pageRows = rows.slice(page * PAGE, page * PAGE + PAGE);

  // ───── KPIs ─────
  const today = jParts(now());
  const sent = all.filter((x) => x.status !== 'draft' && x.status !== 'cancelled' && x.sentAt);
  const inMonth = (x: OrgPackage, dm: number) => { const p = jParts(x.sentAt!); let m = today.m - dm, y = today.y; if (m < 1) { m += 12; y -= 1; } return p.y === y && p.m === m; };
  const thisMonth = sent.filter((x) => inMonth(x, 0));
  const lastMonth = sent.filter((x) => inMonth(x, 1));
  const thisMonthSum = thisMonth.reduce((s, x) => s + x.total, 0);
  const pendingRecipients = sent.filter((x) => x.status === 'sent').flatMap((x) => x.recipients.filter((r) => r.status === 'pending'));
  const pendingSum = pendingRecipients.reduce((s, r) => s + r.amount, 0);
  const yearSent = sent.filter((x) => jParts(x.sentAt!).y === today.y);
  const yearSum = yearSent.reduce((s, x) => s + x.total, 0);
  const yearRecipients = yearSent.reduce((s, x) => s + x.recipients.length, 0);
  const yearAccepted = yearSent.reduce((s, x) => s + x.recipients.filter((r) => r.status === 'accepted').length, 0);
  const acceptPct = yearRecipients ? Math.round((yearAccepted * 100) / yearRecipients) : 0;
  const diff = thisMonth.length - lastMonth.length;
  const ms = splitCompact(thisMonthSum);
  const ps = splitCompact(pendingSum);
  const ys = splitCompact(yearSum);

  // ───── monthly trend (side card) ─────
  const monthly = reports?.monthly ?? [];
  const last6 = monthly.slice(-6);
  const cur = last6[last6.length - 1];
  const prev = last6[last6.length - 2];
  const trendPct = cur && prev && prev.sent ? ((cur.sent - prev.sent) / prev.sent) * 100 : 0;
  const maxBar = Math.max(1, ...last6.map((m) => m.sent));
  const curS = splitCompact(cur?.sent ?? 0);
  const C = 2 * Math.PI * 27;

  const tabs = ([['all', 'همه', 'default'], ['draft', 'پیش‌نویس', 'default'], ['sent', 'ارسال‌شده', 'info'], ['completed', 'تکمیل‌شده', 'success'], ['cancelled', 'لغوشده', 'error']] as const)
    .map(([key, label, tone]) => ({ key, label, tone, count: all.filter((x) => inTab(x, key)).length }));

  return (
    <>
      <PageHeading title="بسته‌های دارایی" crumbs={[orgCrumb, { label: 'منابع انسانی', href: routes.org.employees }, { label: 'بسته‌های دارایی' }]}>
        <span style={{ fontSize: 12, color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>{faDigits(yearSent.length)} بسته · امسال</span>
        <Link href={routes.org.newRecipients()} className="btn" style={{ background: 'var(--primary-main)', color: 'var(--primary-contrast)', boxShadow: 'var(--shadow-primary)', textDecoration: 'none' }}>
          <Icon d={I.plus} size={18} strokeWidth={2} />ارسال بسته جدید
        </Link>
      </PageHeading>

      {/* KPI row */}
      <div style={{ flex: 'none', display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 20 }}>
        <Kpi title="ارسال‌شده این ماه" value={faDigits(thisMonth.length)} unit={`بسته · ${ms.value} ${ms.unit}`.trim()} d={I.pkg} tone="primary" delta={diff === 0 ? 'بدون تغییر' : `${diff > 0 ? '+' : '−'}${faDigits(Math.abs(diff))} بسته`} dtone={diff >= 0 ? 'success' : 'warning'} />
        <Kpi title="در انتظار تأیید کارمند" value={faDigits(pendingRecipients.length)} unit={`بسته · ${ps.value} ${ps.unit}`.trim()} d={I.inbox} tone="warning" delta="یادآوری فعال" dtone="warning" />
        <Kpi title="جمع بسته‌های امسال" value={ys.value} unit={`${ys.unit} · ${money(yearRecipients)} بسته`} d={I.reports} tone="success" delta={`تأیید ${faDigits(acceptPct)}٪`} dtone="success" />
      </div>

      <div style={{ flex: '1 0 auto', display: 'flex', gap: 20, alignItems: 'flex-start' }}>
        {/* Table card */}
        <div className="card" style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          <div style={{ height: 52, flex: 'none', boxSizing: 'border-box', padding: '0 12px', display: 'flex', alignItems: 'center', gap: 4, borderBottom: '1px solid var(--divider)', overflowX: 'auto' }}>
            <CountTabs items={tabs} value={tab} onChange={(k) => { setTab(k); setPage(0); }} />
            <SearchBox value={q} onChange={(v) => { setQ(v); setPage(0); }} placeholder="جستجوی عنوان…" label="جستجوی بسته" />
          </div>
          <div style={{ minWidth: 640 }}>
            <div className="th" style={{ height: 36, display: 'grid', gridTemplateColumns: GRID, alignItems: 'center', gap: 8, padding: '0 14px' }}>
              <span className="cell">عنوان</span><span className="cell">گیرندگان</span><span className="cell">مبلغ کل</span><span className="cell">پذیرش کارکنان</span><span className="cell">سیاست قفل</span><span className="cell">وضعیت</span>
            </div>
            {isLoading && [0, 1, 2, 3].map((i) => <div key={i} style={{ height: 50, borderBottom: '1px dashed var(--divider)', opacity: 0.5 }} />)}
            {isError && <div style={{ padding: 16 }}><CardError onRetry={() => refetch()} /></div>}
            {!isLoading && !isError && !pageRows.length && (
              <div style={{ padding: '32px 16px', textAlign: 'center', fontSize: 13, color: 'var(--text-secondary)' }}>{q ? 'بسته‌ای با این عنوان پیدا نشد' : 'بسته‌ای در این وضعیت نیست'}</div>
            )}
            {pageRows.map((r) => {
              const rm = reasonMeta(r.reason);
              const t = soft(rm.tone);
              const sl = statusLabel(r);
              const sc = soft(sl.tone);
              const acc = r.recipients.filter((x) => x.status === 'accepted').length;
              const n = r.recipients.length;
              const isDraft = r.status === 'draft';
              const pct = n && !isDraft ? Math.round((acc * 100) / n) : 0;
              const date = r.sentAt ?? r.createdAt;
              const meta = isDraft
                ? (r.amountPerPerson ? `پیش‌نویس · ${money(r.amountPerPerson)} هر نفر` : 'پیش‌نویس · مبلغ تعیین نشده')
                : `${money(r.amountPerPerson)} هر نفر · ${jDate(date)}`;
              const total = r.total ? splitCompact(r.total) : null;
              return (
                <Link key={r.id} href={isDraft ? routes.org.newSettings(r.id) : routes.org.package(r.id)} className="row-a" style={{ minHeight: 50, display: 'grid', gridTemplateColumns: GRID, alignItems: 'center', gap: 8, padding: '0 14px', borderBottom: '1px dashed var(--divider)', fontSize: 13 }}>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
                    <span style={{ width: 32, height: 32, borderRadius: 8, background: t.bg, color: t.fg, display: 'grid', placeItems: 'center', flex: 'none' }}><Icon d={I.pkg} size={16} /></span>
                    <span style={{ display: 'flex', flexDirection: 'column', lineHeight: 1.25, minWidth: 0 }}>
                      <span className="cell" style={{ fontWeight: 600 }}>{r.title}</span>
                      <span className="num cell" style={{ fontSize: 11, color: 'var(--text-secondary)', fontWeight: 400 }}>{rm.label} · {meta}</span>
                    </span>
                  </span>
                  <span className="num cell" style={{ fontWeight: 400 }}>{faDigits(n)} نفر</span>
                  <span className="num cell" style={{ fontWeight: 500 }}>{total ? `${total.value} ${total.unit}` : '—'}</span>
                  <span style={{ display: 'flex', flexDirection: 'column', gap: 5, minWidth: 0 }}>
                    <span className="num" style={{ fontSize: 12, fontWeight: 400, whiteSpace: 'nowrap' }}>{isDraft ? '—' : `${faDigits(acc)} / ${faDigits(n)}`}</span>
                    <span dir="ltr" style={{ display: 'block', height: 4, borderRadius: 2, background: 'var(--progress-track)', overflow: 'hidden' }}><span style={{ display: 'block', width: `${pct}%`, height: '100%', borderRadius: 2, background: pct === 100 ? 'var(--success-main)' : 'var(--primary-main)' }} /></span>
                  </span>
                  <span style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 3, minWidth: 0 }}>
                    <LockChip type={r.lockPolicy.type} style={{ height: 20, padding: '0 6px' }} />
                    <span className="num cell" style={{ maxWidth: '100%', fontSize: 10, color: 'var(--text-secondary)', fontWeight: 400 }}>{policySub(r)}</span>
                  </span>
                  <span><span className="lbl" style={{ height: 22, padding: '0 7px', fontSize: 11, background: sc.bg, color: sc.fg }}>{sl.text}</span></span>
                </Link>
              );
            })}
          </div>
          <div style={{ flex: 1 }} />
          <Pager page={page} pageSize={PAGE} total={rows.length} onPage={setPage} />
        </div>

        {/* Side stats */}
        <div style={{ width: 248, flex: 'none', display: 'flex', flexDirection: 'column', gap: 20 }}>
          {reports ? (
            <div className="card" style={{ boxSizing: 'border-box', padding: '18px 20px', display: 'flex', flexDirection: 'column', gap: 10 }}>
              <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)' }}>روند ارسال ماهانه</span>
              <span style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}><span className="num" style={{ fontSize: 28, lineHeight: 1.1 }}>{curS.value}</span><span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{curS.unit} تومان در {cur?.month ?? monthName(now().toISOString())}</span></span>
              <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span className="lbl" style={{ height: 20, padding: '0 6px', background: trendPct >= 0 ? 'var(--soft-success)' : 'var(--soft-error)', color: trendPct >= 0 ? 'var(--success-text)' : 'var(--error-text)' }}>{trendPct >= 0 ? '+' : '−'}{faDigits(Math.abs(trendPct).toFixed(1), true)}٪</span>
                <span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>نسبت به {prev?.month ?? '—'} · {faDigits(thisMonth.length)} بسته</span>
              </span>
              <div dir="ltr" style={{ display: 'flex', alignItems: 'flex-end', gap: 4, height: 36 }}>
                {last6.map((b, i) => (
                  <span key={b.month} title={`${b.month}: ${splitCompact(b.sent).value} ${splitCompact(b.sent).unit}`} style={{ flex: 1, height: Math.max(4, Math.round((b.sent / maxBar) * 36)), borderRadius: '3px 3px 0 0', background: i === last6.length - 1 ? 'var(--primary-main)' : 'var(--chart-4)' }} />
                ))}
              </div>
            </div>
          ) : <CardSkeleton h={150} />}
          <div className="card" style={{ boxSizing: 'border-box', padding: '18px 20px', display: 'flex', flexDirection: 'column', gap: 10 }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)' }}>میانگین نرخ تأیید کارکنان</span>
            <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
              <div dir="ltr" style={{ width: 64, height: 64, position: 'relative', flex: 'none' }}>
                <svg viewBox="0 0 64 64" width={64} height={64} aria-hidden="true" style={{ display: 'block', transform: 'rotate(-90deg)' }}>
                  <circle cx="32" cy="32" r="27" fill="none" style={{ stroke: 'var(--progress-track)' }} strokeWidth="7" />
                  {acceptPct > 0 && <circle cx="32" cy="32" r="27" fill="none" style={{ stroke: 'var(--success-main)' }} strokeWidth="7" strokeLinecap="round" strokeDasharray={`${((C * acceptPct) / 100).toFixed(2)} ${C.toFixed(2)}`} />}
                </svg>
                <span className="num" dir="rtl" style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', fontSize: 15, fontWeight: 500 }}>{faDigits(acceptPct)}٪</span>
              </div>
              <span style={{ flex: 1, fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.6 }}>از {money(yearRecipients)} بستهٔ ارسال‌شده امسال، <span className="num" style={{ color: 'var(--text-primary)', fontWeight: 500 }}>{money(yearAccepted)}</span> مورد توسط کارکنان تأیید و دریافت شده است.</span>
            </div>
          </div>
          <div className="card" style={{ boxSizing: 'border-box', padding: '18px 20px', display: 'flex', flexDirection: 'column', gap: 8 }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)' }}>بازگشت خودکار</span>
            <span style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.6 }}>بسته‌هایی که تا <span className="num" style={{ color: 'var(--text-primary)', fontWeight: 500 }}>۳۰ روز</span> توسط کارمند تأیید نشوند، به حساب سازمان بازمی‌گردند.</span>
            <Link href={routes.org.contract} style={{ fontSize: 12, fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: 4 }}>تنظیمات قرارداد<Icon d={I.chevL} size={14} /></Link>
          </div>
        </div>
      </div>
    </>
  );
}
