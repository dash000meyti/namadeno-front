'use client';
/**
 * Organization — facilities & credit. Kit overview page: key numbers → six-month repayment chart + the contract's
 * credit rules → active loans (status tabs, search, table, pager); a loan row opens the inspector.
 */
import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import {
  Ava, Bars, Card, Empty, ErrorBlock, Ident, Inspector, KV, KeyStats, Legend, List, ListRow, Meter, PageHeading, Pill,
  SearchField, Section, Skel, SkeletonCard, StatStrip, Table, TableFoot, Tabs, Toolbar, Who, usePaging, type Column, type Series, type Stat, type Tone,
} from '@/components/panel/kit';
import { Icon } from '@/components/ui/Icon';
import { LockTypeChip } from '@/components/ui/LockBar';
import { useOrgCredit } from '@/api/org';
import { useOrgPeopleCredit, type CreditLoanRow } from '@/api/org-people-extra';
import { routes } from '@/lib/routes';
import { FEATURES } from '@/lib/features';
import { ASSET_META } from '@/lib/locks';
import { compactMoney, faDigits, jDate, jDayMonth, money, pct, time } from '@/lib/format';
import { I, compactParts, errMsg } from '@/components/org/people/shared';

type LTab = 'all' | 'ok' | 'late';
const PER_PAGE = 8;
const STATUS: Record<CreditLoanRow['status'], { label: string; tone: Tone }> = { ok: { label: 'جاری', tone: 'success' }, late: { label: 'معوق', tone: 'error' }, due: { label: 'سررسید نزدیک', tone: 'warning' } };
const SERIES: Series[] = [{ name: 'وام', color: 'var(--chart-1)' }, { name: 'خرید اقساطی', color: 'var(--chart-2)' }];
/** Toman → million with one decimal («۱۲٫۴»). */
const mil = (n: number) => faDigits(String(Math.round(n / 1e5) / 10), true);
const loanKey = (l: CreditLoanRow) => `${l.employeeId}-${l.startedAt}`;
const assetName = (k: string) => ASSET_META[k]?.name ?? k;

/** While `FEATURES.orgCredit` is off the section shows a coming-soon notice (the page below stays as is). */
export default function OrgCreditRoute() {
  if (!FEATURES.orgCredit) {
    return (
      <>
        <PageHeading title="تسهیلات و اعتبار" crumbs={[{ label: 'عملیات' }]} />
        <Card><Empty icon={SOON_ICON} title="به‌زودی" sub="بخش تسهیلات و اعتبار در حال آماده شدن است." /></Card>
      </>
    );
  }
  return <OrgCreditPage />;
}
const SOON_ICON = 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18M12 7v5l3 2';

function OrgCreditPage() {
  const credit = useOrgCredit();
  const people = useOrgPeopleCredit();
  const [ltab, setLtab] = useState<LTab>('all');
  const [search, setSearch] = useState('');
  const [sel, setSel] = useState<string | null>(null);
  const [updated, setUpdated] = useState<Date | null>(null);
  useEffect(() => { if (people.data) setUpdated(new Date()); }, [people.data]);

  const s = credit.data?.settings;
  const d = people.data;
  const loans = useMemo(() => d?.loans ?? [], [d]);
  const needle = search.trim();
  const shown = useMemo(() => loans.filter((l) => {
    if (ltab === 'ok' && l.status !== 'ok') return false;
    if (ltab === 'late' && l.status === 'ok') return false;
    return !needle || l.name.includes(needle) || l.department.includes(needle);
  }), [loans, ltab, needle]);
  const pg = usePaging(shown, PER_PAGE, `${ltab}|${needle}`);
  const remaining = loans.reduce((x, l) => x + l.remaining, 0);
  const collateral = loans.reduce((x, l) => x + l.collateralAmount, 0);
  const okN = loans.filter((l) => l.status === 'ok').length;
  const selected = sel ? loans.find((l) => loanKey(l) === sel) : undefined;

  const stats: Stat[] = d ? (() => {
    const [rv, ru] = compactParts(remaining);
    return [
      { label: 'وام‌های فعال', value: faDigits(loans.length), unit: 'وام', note: `+${faDigits(d.newLoansThisMonth)} این ماه`, trend: d.newLoansThisMonth ? 'up' : undefined },
      { label: 'مانده تسهیلات', value: rv, unit: ru, note: `از ${compactMoney(d.principalTotal)} پرداخت‌شده` },
      { label: 'اعتبار کارت فعال', value: faDigits(d.cards.count), unit: 'نفر', note: `سقف تخصیص‌یافته ${compactMoney(d.cards.limitTotal)}` },
      { label: 'اقساط معوق', value: faDigits(d.overdue.count), unit: 'قسط', note: d.overdue.count ? `${faDigits(d.overdue.employees)} کارمند · ${money(d.overdue.amount)} تومان` : 'بدون قسط معوق', trend: d.overdue.count ? 'down' : 'up' },
    ];
  })() : [];

  const columns: Column<CreditLoanRow>[] = [
    { key: 'who', label: 'کارمند', width: 'minmax(0, 1.4fr)', render: (l) => <Ident lead={<Ava letter={l.name[0]} id={l.employeeId} />} title={l.name} sub={l.department} /> },
    { key: 'principal', label: 'مبلغ وام', width: '116px', render: (l) => <span className="num">{money(l.principal)}</span> },
    { key: 'remaining', label: 'مانده', width: '116px', col: true, render: (l) => <><span className="num">{money(l.remaining)}</span><Meter value={l.paidPct / 100} width={72} thin label={`${pct(l.paidPct)} پرداخت شده`} /></> },
    {
      key: 'next', label: 'قسط بعدی', width: '148px', col: true, render: (l) => (
        <>
          <span className="num">{money(l.nextAmount)}</span>
          <span className="sm el" style={{ maxWidth: '100%', color: l.status === 'late' ? 'var(--error-text)' : undefined }}>{l.nextDate ? jDayMonth(l.nextDate) : '—'}{l.overdueCount ? ` · ${faDigits(l.overdueCount)} قسط معوق` : ''}</span>
        </>
      ),
    },
    { key: 'coll', label: 'رزرو پشتوانه', width: '128px', col: true, render: (l) => <><span className="num">{money(l.collateralAmount)}</span><span className="sm">{ASSET_META[l.collateralKind]?.short ?? ''}</span></> },
    { key: 'st', label: 'وضعیت', width: '112px', render: (l) => <Pill tone={STATUS[l.status].tone} dot>{STATUS[l.status].label}</Pill> },
  ];

  const heading = (
    <PageHeading title="تسهیلات و اعتبار" crumbs={[{ label: 'عملیات' }]} sub="وام‌ها، اعتبار کارت و اقساط کارکنان">
      <span className="mute" style={{ fontSize: 12 }}>{updated ? `به‌روز شده ${time(updated)}` : 'در حال به‌روزرسانی…'}</span>
      <Link href={`${routes.org.requests}?type=loan`} className="nm-btn ghost">
        <Icon d={I.inbox} size={17} />درخواست‌های وام
        {!!d?.pendingLoanRequests && <span className="nm-count" style={{ height: 18 }}>{faDigits(d.pendingLoanRequests)}</span>}
      </Link>
    </PageHeading>
  );

  if (people.isError) return <>{heading}<ErrorBlock error={people.error} message={errMsg(people.error)} onRetry={() => { people.refetch(); credit.refetch(); }} /></>;

  return (
    <>
      {heading}

      <StatStrip loading={!d} items={stats} />

      <div className="nm-grid side">
        {!d ? <SkeletonCard h={276} /> : (
          <Card title="اقساط ماهانه" sub="۶ ماه آینده · میلیون تومان" actions={<Legend items={SERIES.map((x) => ({ label: x.name, color: x.color }))} />}>
            <Bars label="نمودار اقساط ماهانه شش ماه آینده" data={d.schedule.map((b) => ({ label: b.month, values: [b.loan, b.installment] }))} series={SERIES} showValues fmt={mil} height={200} />
          </Card>
        )}
        <Card title="قوانین قرارداد شما" sub="فقط‌خواندنی" more={{ label: 'قرارداد', href: routes.org.contract }}>
          {credit.isError ? <ErrorBlock flat error={credit.error} message={errMsg(credit.error)} onRetry={() => credit.refetch()} />
            : !s ? <div style={{ display: 'flex', flexDirection: 'column', gap: 18, padding: '6px 0' }}>{[0, 1, 2, 3].map((i) => <Skel key={i} h={14} />)}</div> : (
              <KV rows={[
                ['سقف وام', <span key="l" className="num">{s.loanEnabled ? `${pct(s.loanMaxPct)} دارایی` : 'غیرفعال'}</span>],
                ['دوره‌های بازپرداخت', <span key="m" className="num">{s.loanMonthsOptions.map((m) => faDigits(m)).join(' / ')} ماه</span>],
                ['اعتبار کارت', s.cardEnabled ? 'تا ۲۵٪ دارایی' : 'غیرفعال'],
                ['حداقل امتیاز اعتباری', <span key="s" className="num">۶۰۰</span>],
              ]} />
            )}
        </Card>
      </div>

      <Card flush title="وام‌های فعال" sub={`${faDigits(loans.length)} وام · مانده ${compactMoney(remaining)} · رزرو پشتوانه ${compactMoney(collateral)} تومان`} more={{ label: 'گزارش تسهیلات', href: routes.org.reports }}>
        <Toolbar>
          <Tabs label="وضعیت وام" value={ltab} onChange={setLtab} items={[
            { key: 'all', label: 'همه', count: loans.length },
            { key: 'ok', label: 'جاری', count: okN },
            { key: 'late', label: 'معوق / نزدیک', count: loans.length - okN, hot: true },
          ]} />
          <span className="grow" />
          <SearchField value={search} onChange={setSearch} placeholder="نام یا واحد" label="جستجوی وام" width={200} />
        </Toolbar>
        <Table
          columns={columns} rows={pg.rows} rowKey={loanKey} rowLabel={(l) => `وام ${l.name}`}
          onRowClick={(l) => setSel((x) => (x === loanKey(l) ? null : loanKey(l)))} selectedKey={sel}
          loading={people.isLoading}
          empty={needle
            ? <Empty icon={I.search} title="وامی با این جستجو پیدا نشد" action={<button type="button" className="nm-btn sm ghost" onClick={() => setSearch('')}>پاک کردن جستجو</button>} />
            : <Empty icon={I.percent} title={ltab === 'late' ? 'وام معوق یا با سررسید نزدیک وجود ندارد' : 'وام فعالی وجود ندارد'} />}
          minWidth={820}
        />
        <TableFoot shown={pg.rows.length} total={shown.length} unit="وام" page={pg.page} pages={pg.pages} onPage={pg.setPage} />
      </Card>

      {selected && <LoanInspector key={loanKey(selected)} l={selected} onClose={() => setSel(null)} />}
    </>
  );
}

function LoanInspector({ l, onClose }: { l: CreditLoanRow; onClose: () => void }) {
  const st = STATUS[l.status];
  return (
    <Inspector open onClose={onClose} title="جزئیات وام" label={`جزئیات وام ${l.name}`} href={routes.org.employee(l.employeeId)} hrefLabel="پروفایل کارمند">
      <Who lead={<Ava letter={l.name[0]} id={l.employeeId} size="lg" />} title={l.name} sub={`واحد ${l.department}`} pills={<Pill tone={st.tone} dot>{st.label}</Pill>} />
      <KeyStats items={[['مبلغ وام', money(l.principal)], ['مانده', money(l.remaining)], ['قسط بعدی', money(l.nextAmount)]]} />

      <Section title="بازپرداخت" action={<span className="num">{pct(l.paidPct)} پرداخت شده</span>}>
        <Meter value={l.paidPct / 100} tone={l.status === 'late' ? 'error' : 'primary'} label={`${pct(l.paidPct)} پرداخت شده`} />
        <KV rows={[
          ['شروع وام', <span key="s" className="num">{jDate(l.startedAt)}</span>],
          ['سررسید قسط بعدی', <span key="n" className="num">{l.nextDate ? jDayMonth(l.nextDate, true) : '—'}</span>],
          ['اقساط معوق', <span key="o" className="num" style={l.overdueCount ? { color: 'var(--error-text)' } : undefined}>{l.overdueCount ? `${faDigits(l.overdueCount)} قسط` : 'ندارد'}</span>],
        ]} />
      </Section>

      <Section title="پشتوانه‌ی وام">
        <List>
          <ListRow lead={<LockTypeChip type="collateral" />} title={assetName(l.collateralKind)} sub="آزاد با تسویه‌ی وام" trail={<span className="num">{money(l.collateralAmount)}</span>} />
        </List>
      </Section>
    </Inspector>
  );
}
