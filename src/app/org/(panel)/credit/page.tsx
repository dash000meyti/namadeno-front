'use client';
/** Facilities & credit of the organization's employees (design: org-credit). */
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { PageHeading } from '@/components/panel/PanelShell';
import { Icon } from '@/components/ui/Icon';
import { ErrorState, Skeleton } from '@/components/app/Screen';
import { useOrgCredit, useOrgMe } from '@/api/org';
import { useOrgPeopleCredit, type CreditLoanRow } from '@/api/org-people-extra';
import { routes } from '@/lib/routes';
import { ASSET_META } from '@/lib/locks';
import { compactMoney, faDigits, jDayMonth, money, pct, time } from '@/lib/format';
import { Chip, I, LockChip, avOf, compactParts, errMsg, tone, type ToneName } from '@/components/org/people/shared';
import './page.css';

type LTab = 'all' | 'ok' | 'late';
const COLS = '1fr 110px 110px 150px 170px 96px';
const STATUS: Record<CreditLoanRow['status'], { label: string; t: ToneName }> = { ok: { label: 'جاری', t: 'success' }, late: { label: 'معوق', t: 'error' }, due: { label: 'سررسید نزدیک', t: 'warning' } };

export default function OrgCreditPage() {
  const me = useOrgMe();
  const credit = useOrgCredit();
  const people = useOrgPeopleCredit();
  const [ltab, setLtab] = useState<LTab>('all');
  const [updated, setUpdated] = useState<Date | null>(null);
  useEffect(() => { if (people.data) setUpdated(new Date()); }, [people.data]);

  const s = credit.data?.settings;
  const d = people.data;
  const loans = d?.loans ?? [];
  const shown = ltab === 'all' ? loans : loans.filter((l) => (ltab === 'late' ? l.status !== 'ok' : l.status === 'ok'));
  const remaining = loans.reduce((x, l) => x + l.remaining, 0);
  const collateral = loans.reduce((x, l) => x + l.collateralAmount, 0);

  const kpis = d ? (() => {
    const [rv, ru] = compactParts(remaining);
    return [
      { title: 'وام‌های فعال', value: faDigits(loans.length), unit: 'وام', note: `+${faDigits(d.newLoansThisMonth)} این ماه`, nc: 'var(--success-text)', d: I.percent, t: tone('primary') },
      { title: 'مانده تسهیلات', value: rv, unit: ru, note: `از ${compactMoney(d.principalTotal)} پرداخت‌شده`, nc: 'var(--text-secondary)', d: I.coin, t: tone('info') },
      { title: 'اعتبار کارت فعال', value: faDigits(d.cards.count), unit: 'نفر', note: `سقف تخصیص‌یافته ${compactMoney(d.cards.limitTotal)}`, nc: 'var(--text-secondary)', d: I.credit, t: tone('success') },
      { title: 'اقساط معوق', value: faDigits(d.overdue.count), unit: 'قسط', note: d.overdue.count ? `${faDigits(d.overdue.employees)} کارمند · ${money(d.overdue.amount)} تومان` : 'بدون قسط معوق', nc: d.overdue.count ? 'var(--error-text)' : 'var(--success-text)', d: I.warn, t: tone(d.overdue.count ? 'error' : 'success') },
    ];
  })() : [];

  const maxBar = Math.max(1, ...(d?.schedule ?? []).map((b) => b.loan + b.installment)) * 1.15;
  const rules = s ? [
    { label: 'سقف وام', value: s.loanEnabled ? `${pct(s.loanMaxPct)} دارایی` : 'غیرفعال', d: I.percent, t: tone('primary') },
    { label: 'دوره‌های بازپرداخت', value: s.loanMonthsOptions.map((m) => faDigits(m)).join(' / ') + ' ماه', d: I.calendar, t: tone('info') },
    { label: 'اعتبار کارت', value: s.cardEnabled ? 'تا ۲۵٪ دارایی' : 'غیرفعال', d: I.credit, t: tone('success') },
    { label: 'حداقل امتیاز اعتباری', value: '۶۰۰', d: I.shield, t: tone('warning') },
  ] : [];

  return (
    <div className="pg-ocredit" style={{ display: 'flex', flexDirection: 'column', gap: 20, flex: '1 0 auto' }}>
      <PageHeading title="تسهیلات و اعتبار" crumbs={[{ label: me.data?.organization.name ?? 'سازمان', href: routes.org.dashboard }, { label: 'منابع انسانی', href: routes.org.dashboard }, { label: 'تسهیلات و اعتبار' }]}>
        <span style={{ fontSize: 12, color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>{updated ? `به‌روزرسانی: امروز ${time(updated)}` : 'در حال به‌روزرسانی…'}</span>
        <Link href={routes.org.requests + '?type=loan'} className="btn" style={{ border: '1px solid var(--outline-border)', background: 'transparent', color: 'var(--text-primary)' }}>
          <Icon d={I.inbox} size={18} />درخواست‌های وام
          {!!d?.pendingLoanRequests && <span className="lbl" style={{ height: 20, padding: '0 6px', fontSize: 11, background: 'var(--soft-error)', color: 'var(--error-text)' }}>{faDigits(d.pendingLoanRequests)}</span>}
        </Link>
      </PageHeading>

      {(people.isError || credit.isError) && <ErrorState message={errMsg(people.error ?? credit.error)} onRetry={() => { people.refetch(); credit.refetch(); }} />}

      {/* KPI row */}
      <div style={{ minHeight: 96, flex: 'none', display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 20 }}>
        {!kpis.length && [0, 1, 2, 3].map((i) => <Skeleton key={i} h={96} />)}
        {kpis.map((k) => (
          <div key={k.title} className="card" style={{ boxSizing: 'border-box', padding: '14px 18px', display: 'flex', alignItems: 'center', gap: 14, minWidth: 0 }}>
            <span style={{ width: 44, height: 44, borderRadius: 12, background: k.t[0], color: k.t[1], display: 'grid', placeItems: 'center', flex: 'none' }}><Icon d={k.d} size={22} /></span>
            <span style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 4, lineHeight: 1.2 }}>
              <span style={{ fontSize: 12, color: 'var(--text-secondary)', fontWeight: 600, whiteSpace: 'nowrap' }}>{k.title}</span>
              <span style={{ display: 'flex', alignItems: 'baseline', gap: 5, whiteSpace: 'nowrap' }}><span className="num" style={{ fontSize: 24, lineHeight: 1.1 }}>{k.value}</span><span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{k.unit}</span></span>
              <span className="cell" style={{ fontSize: 11, color: k.nc }}>{k.note}</span>
            </span>
          </div>
        ))}
      </div>

      {/* Row 2: installments chart + contract rules */}
      <div style={{ minHeight: 190, flex: 'none', display: 'flex', gap: 20 }}>
        <div className="card" style={{ flex: 1, minWidth: 0, boxSizing: 'border-box', padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={{ minHeight: 24, display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <h6 style={{ margin: 0, fontSize: 15, fontWeight: 700, lineHeight: 1.2 }}>اقساط ماهانه — ۶ ماه آینده</h6>
            <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>جمع بازپرداخت کارکنان · میلیون تومان</span>
            <span style={{ marginRight: 'auto', display: 'flex', alignItems: 'center', gap: 12, fontSize: 11, color: 'var(--text-secondary)' }}>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}><span style={{ width: 8, height: 8, borderRadius: 2, background: 'var(--chart-1)' }} />وام</span>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}><span style={{ width: 8, height: 8, borderRadius: 2, background: 'var(--chart-2)' }} />خرید اقساطی</span>
            </span>
          </div>
          <div dir="ltr" role="img" aria-label="نمودار اقساط ماهانه شش ماه آینده" style={{ flex: 1, minHeight: 120, position: 'relative', display: 'flex', alignItems: 'stretch', gap: 16, padding: '0 8px' }}>
            <div style={{ position: 'absolute', inset: '18px 8px 22px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', pointerEvents: 'none' }}>
              {[0, 1, 2, 3].map((i) => <span key={i} style={{ height: 1, background: 'var(--chart-grid)' }} />)}
            </div>
            {(d?.schedule ?? []).map((b) => {
              const h1 = Math.round((b.loan / maxBar) * 100);
              const h2 = Math.round((b.installment / maxBar) * 100);
              return (
                <div key={b.month} dir="rtl" title={`${b.month}: وام ${money(b.loan)} · اقساطی ${money(b.installment)} تومان`} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, minWidth: 0, position: 'relative' }}>
                  <span className="num" style={{ height: 14, fontSize: 11, fontWeight: 500, lineHeight: '14px', whiteSpace: 'nowrap' }}>{faDigits(String(Math.round((b.loan + b.installment) / 1e5) / 10), true)}</span>
                  <div style={{ flex: 1, width: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', alignItems: 'center' }}>
                    <span style={{ width: 36, height: `${h2}%`, background: 'var(--chart-2)', borderRadius: '6px 6px 0 0', display: 'block' }} />
                    <span style={{ width: 36, height: `${h1}%`, background: 'var(--chart-1)', borderRadius: h2 > 0 ? 0 : '6px 6px 0 0', display: 'block' }} />
                  </div>
                  <span style={{ height: 16, fontSize: 11, lineHeight: '16px', color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>{b.month}</span>
                </div>
              );
            })}
          </div>
        </div>

        <div className="card" style={{ width: 300, flex: 'none', boxSizing: 'border-box', padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={{ height: 24, display: 'flex', alignItems: 'center', gap: 8 }}>
            <h6 style={{ margin: 0, fontSize: 15, fontWeight: 700, lineHeight: 1.2 }}>قوانین قرارداد شما</h6>
            <span className="lbl" style={{ height: 20, padding: '0 6px', fontSize: 11, background: 'var(--soft-default)', color: 'var(--default-text)' }}>فقط‌خواندنی</span>
            <Link href={routes.org.contract} className="ibtn" aria-label="تنظیمات قرارداد" style={{ marginRight: 'auto', width: 28, height: 28 }}><Icon d={I.chevL} size={16} /></Link>
          </div>
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
            {!s && [0, 1, 2, 3].map((i) => <Skeleton key={i} h={26} r={6} style={{ marginBottom: 4, boxShadow: 'none' }} />)}
            {rules.map((u) => (
              <Link key={u.label} href={routes.org.contract} className="row-a" style={{ height: 30, display: 'flex', alignItems: 'center', gap: 8, borderBottom: '1px dashed var(--divider)', fontSize: 12, borderRadius: 4 }}>
                <span style={{ width: 22, height: 22, borderRadius: 6, background: u.t[0], color: u.t[1], display: 'grid', placeItems: 'center', flex: 'none' }}><Icon d={u.d} size={13} /></span>
                <span style={{ flex: 1, color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>{u.label}</span>
                <span className="num" style={{ fontWeight: 500, whiteSpace: 'nowrap' }}>{u.value}</span>
              </Link>
            ))}
          </div>
          <Link href={routes.org.contract} style={{ fontSize: 12, fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: 4 }}>مشاهده تنظیمات قرارداد<Icon d={I.chevL} size={14} /></Link>
        </div>
      </div>

      {/* Row 3: active loans */}
      <div className="card" style={{ flex: '1 0 auto', minHeight: 200, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <div style={{ minHeight: 44, flex: 'none', boxSizing: 'border-box', padding: '0 16px', display: 'flex', alignItems: 'center', gap: 10, borderBottom: '1px solid var(--divider)', flexWrap: 'wrap' }}>
          <h6 style={{ margin: 0, fontSize: 15, fontWeight: 700, lineHeight: 1.2 }}>وام‌های فعال</h6>
          <span className="num" style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{faDigits(loans.length)} وام · مانده {compactMoney(remaining)} · قفل وثیقه {compactMoney(collateral)} تومان</span>
          {([['all', 'همه'], ['ok', 'جاری'], ['late', 'معوق / نزدیک']] as const).map(([k, label]) => {
            const on = ltab === k;
            return <button key={k} onClick={() => setLtab(k)} aria-pressed={on} style={{ height: 28, padding: '0 10px', borderRadius: 8, border: 0, background: on ? 'var(--action-selected)' : 'transparent', color: on ? 'var(--text-primary)' : 'var(--text-secondary)', fontFamily: 'inherit', fontSize: 12, fontWeight: on ? 700 : 500, cursor: 'pointer' }}>{label}</button>;
          })}
          <Link href={routes.org.reports} style={{ marginRight: 'auto', fontSize: 12, fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: 4 }}>گزارش تسهیلات<Icon d={I.chevL} size={14} /></Link>
        </div>
        <div className="th" style={{ height: 32, flex: 'none', display: 'grid', gridTemplateColumns: COLS, alignItems: 'center', gap: 8, padding: '0 16px' }}>
          <span className="cell">کارمند</span><span className="cell">مبلغ وام</span><span className="cell">مانده</span><span className="cell">قسط بعدی</span><span className="cell">قفل وثیقه</span><span className="cell">وضعیت</span>
        </div>
        {people.isLoading && [0, 1, 2, 3].map((i) => <div key={i} style={{ height: 34, borderBottom: '1px dashed var(--divider)', opacity: 0.5 }} />)}
        {!people.isLoading && !shown.length && <div style={{ padding: 32, textAlign: 'center', fontSize: 13, color: 'var(--text-secondary)' }}>{ltab === 'late' ? 'وام معوق یا با سررسید نزدیک وجود ندارد.' : 'وام فعالی وجود ندارد.'}</div>}
        {shown.map((l) => {
          const [avBg, avFg] = avOf(l.employeeId);
          const st = STATUS[l.status];
          return (
            <Link key={l.employeeId + l.startedAt} href={routes.org.employee(l.employeeId)} className="row-a" style={{ minHeight: 34, flex: 'none', display: 'grid', gridTemplateColumns: COLS, alignItems: 'center', gap: 8, padding: '0 16px', borderBottom: '1px dashed var(--divider)', fontSize: 12 }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}><span style={{ width: 24, height: 24, borderRadius: '50%', background: avBg, color: avFg, display: 'grid', placeItems: 'center', fontSize: 11, fontWeight: 700, flex: 'none' }}>{l.name[0]}</span><span className="cell" style={{ fontWeight: 600, fontSize: 13 }}>{l.name}</span><span className="cell" style={{ color: 'var(--text-secondary)', fontSize: 11 }}>{l.department}</span></span>
              <span className="num cell" style={{ fontWeight: 500 }}>{money(l.principal)}</span>
              <span style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}><span className="num cell" style={{ fontWeight: 500 }}>{money(l.remaining)}</span><span dir="ltr" style={{ width: 28, height: 4, borderRadius: 2, background: 'var(--progress-track)', overflow: 'hidden', flex: 'none' }}><span style={{ display: 'block', width: `${l.paidPct}%`, height: '100%', background: 'var(--primary-main)' }} /></span></span>
              <span className="cell"><span className="num" style={{ fontWeight: 500 }}>{money(l.nextAmount)}</span><span style={{ color: l.status === 'late' ? 'var(--error-text)' : 'var(--text-secondary)' }}> · {l.nextDate ? jDayMonth(l.nextDate) : '—'}{l.overdueCount ? ` · ${faDigits(l.overdueCount)} قسط معوق` : ''}</span></span>
              <span style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}><LockChip type="collateral" style={{ height: 20, padding: '0 6px' }} /><span className="num cell">{money(l.collateralAmount)} {ASSET_META[l.collateralKind]?.short ?? ''}</span></span>
              <span><Chip t={st.t}>{st.label}</Chip></span>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
