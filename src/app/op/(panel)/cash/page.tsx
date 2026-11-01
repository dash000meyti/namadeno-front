'use client';
/**
 * Operator console — cash («نقدینگی»): Namadno's rial account. Organization deposits come in, buy orders go out, and the
 * same account holds the users' rial wallets. Kit page: heading («ثبت واریز») → stats (balance, available, tied in
 * orders, user wallets, expected deposits) → balance trend (30/90 days) + how the balance splits → expected organization
 * deposits (status tabs, «ثبت دریافت») → account ledger (direction tabs, kind + organization filters, search, pager).
 * Any row opens the inspector.
 * Deep links: ?org=<orgId> filters both lists · ?id=<entry id> opens the inspector · ?status=overdue · ?kind=<CashEntryKind>.
 */
import { Suspense, useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useOpOrganizations } from '@/api/op';
import { useCashEntries, useCashSummary, type CashEntry, type CashEntryKind } from '@/api/op-treasury-extra';
import {
  Allocation, Ava, Card, Empty, ErrorBlock, Ident, KV, Legend, LineChart, Note, PageHeading, Pill, SearchField, Select,
  SkeletonCard, StatStrip, Table, TableFoot, Tabs, Toolbar, usePaging, type Column,
} from '@/components/panel/kit';
import { Icon } from '@/components/ui/Icon';
import { useToast } from '@/components/ui/Toast';
import { CASH_KIND, TI, amt, cashStatus } from '@/components/op/treasury/ui';
import { CashInspector, daysPast } from '@/components/op/cash/CashInspector';
import { ConfirmDepositDialog, RecordDepositDialog } from '@/components/op/cash/DepositDialogs';
import { scaled, signed } from '@/components/op/cash/money';
import { dec, downloadCsv, raw } from '@/components/op/system/fmt';
import { faDigits, jDate, jDayMonth, money, time } from '@/lib/format';
import { routes } from '@/lib/routes';

type DepTab = 'expected' | 'overdue';
type Dir = 'all' | 'in' | 'out';
const KINDS = Object.keys(CASH_KIND) as CashEntryKind[];
const HEAD = { title: 'نقدینگی', crumbs: [{ label: 'خزانه' }], sub: 'حساب ریالی نمادنو: واریز سازمان‌ها، سفارش‌های صدور و ابطال، و کیف پول کاربران' };
const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);

export default function OpCashPage() {
  return (
    <Suspense fallback={<><PageHeading {...HEAD} /><StatStrip loading items={[]} /><SkeletonCard h={300} /></>}>
      <CashInner />
    </Suspense>
  );
}

function CashInner() {
  const toast = useToast();
  const sp = useSearchParams();
  const router = useRouter();
  const linkId = sp.get('id');
  const linkOrg = sp.get('org');
  const linkStatus = sp.get('status');
  const linkKind = sp.get('kind') as CashEntryKind | null;

  const [range, setRange] = useState<30 | 90>(30);
  const [org, setOrg] = useState<string>(linkOrg ?? 'all');
  const [depTab, setDepTab] = useState<DepTab>(linkStatus === 'overdue' ? 'overdue' : 'expected');
  const [kind, setKind] = useState<CashEntryKind | 'all'>(linkKind && KINDS.includes(linkKind) ? linkKind : 'all');
  const [dir, setDir] = useState<Dir>('all');
  const [q, setQ] = useState('');
  const [sel, setSel] = useState<CashEntry | null>(null);
  const [selId, setSelId] = useState<string | null>(linkId);
  const [confirmFor, setConfirmFor] = useState<CashEntry | null>(null);
  const [recordKey, setRecordKey] = useState(0);

  const sumQ = useCashSummary(30);
  const chartQ = useCashSummary(range);
  const orgsQ = useOpOrganizations();
  const expQ = useCashEntries({ kind: 'org_deposit', status: 'expected' });
  const ledgerQ = useCashEntries({ kind, status: 'done', orgId: org === 'all' ? undefined : org });

  const orgs = useMemo(() => orgsQ.data ?? [], [orgsQ.data]);
  const orgById = useMemo(() => new Map(orgs.map((o) => [o.id, o])), [orgs]);
  const expected = useMemo(() => expQ.data ?? [], [expQ.data]);
  const ledger = useMemo(() => ledgerQ.data ?? [], [ledgerQ.data]);

  // links while the page stays open (action queue, activity, organization pages)
  useEffect(() => { if (linkId) setSelId(linkId); }, [linkId]);
  useEffect(() => { if (linkOrg) setOrg(linkOrg); }, [linkOrg]);
  useEffect(() => { if (linkStatus === 'overdue') setDepTab('overdue'); }, [linkStatus]);
  // resolve a linked entry once its list has loaded
  useEffect(() => {
    if (!selId) return;
    const hit = expected.find((e) => e.id === selId) ?? ledger.find((e) => e.id === selId);
    if (hit) { setSel(hit); setSelId(null); }
  }, [selId, expected, ledger]);

  // the inspector follows fresh data (e.g. after «ثبت دریافت» the entry moves from expected to the ledger)
  const live = sel ? (ledger.find((e) => e.id === sel.id) ?? expected.find((e) => e.id === sel.id) ?? sel) : null;

  // ── expected deposits ──
  const expOrg = expected.filter((e) => org === 'all' || e.orgId === org);
  const overdue = expOrg.filter((e) => e.overdue);
  const depRows = depTab === 'overdue' ? overdue : expOrg;
  const depPg = usePaging(depRows, 6, `${depTab}|${org}`);

  // ── ledger ──
  const needle = q.trim();
  const ledgerRows = useMemo(() => ledger.filter((e) => (dir === 'all' || (dir === 'in' ? e.amount > 0 : e.amount < 0))
    && (!needle || e.title.includes(needle) || (e.orgName ?? '').includes(needle) || (e.ref ?? '').includes(needle) || (e.by ?? '').includes(needle))), [ledger, dir, needle]);
  const ledPg = usePaging(ledgerRows, 12, `${dir}|${kind}|${org}|${needle}`);
  const inSum = sum(ledgerRows.filter((e) => e.amount > 0).map((e) => e.amount));
  const outSum = sum(ledgerRows.filter((e) => e.amount < 0).map((e) => e.amount));

  const orgOptions = useMemo(() => [{ key: 'all', label: 'همه سازمان‌ها' }, ...orgs.map((o) => ({ key: o.id, label: o.name }))], [orgs]);
  const pick = (e: CashEntry) => setSel((s) => (s?.id === e.id ? null : e));
  const closeInspector = () => {
    setSel(null);
    if (linkId) router.replace(org !== 'all' ? `${routes.op.cash}?org=${org}` : routes.op.cash, { scroll: false });
  };
  const confirmed = (e: CashEntry) => { if (sel?.id === e.id) setSel(e); };
  const orgName = org !== 'all' ? orgById.get(org)?.name : undefined;

  const exportCsv = () => {
    if (!ledgerRows.length) return;
    downloadCsv(`namadno-cash${org !== 'all' ? '-' + org : ''}`, [
      ['تاریخ', 'ساعت', 'نوع', 'شرح', 'سازمان', 'مبلغ (تومان)', 'مانده (تومان)', 'مرجع', 'ثبت‌کننده'],
      ...ledgerRows.map((e) => [jDate(e.at), time(e.at), CASH_KIND[e.kind].label, e.title, e.orgName ?? '', raw(e.amount), e.balanceAfter != null ? raw(e.balanceAfter) : '', e.ref ?? '', e.by ?? '']),
    ]);
    toast(`فایل ${faDigits(ledgerRows.length)} ردیف گردش حساب آماده شد`);
  };

  // ── chart ──
  const hist = chartQ.data?.history ?? [];
  const bal = hist.map((h) => h.balance / 1e9);
  const avl = hist.map((h) => h.available / 1e9);
  const lo = Math.min(0, ...avl, ...bal);
  const yMin = lo < 0 ? -Math.ceil(-lo / 10) * 10 : 0;
  const s = sumQ.data;
  const h30 = s?.history ?? [];
  const change = h30.length > 1 ? h30[h30.length - 1].balance - h30[0].balance : 0;

  const depCols: Column<CashEntry>[] = [
    {
      key: 'org', label: 'سازمان', width: 'minmax(0, 1.5fr)',
      render: (e) => <Ident lead={<Ava letter={orgById.get(e.orgId ?? '')?.logoLetter ?? (e.orgName ?? '؟')[0]} id={e.orgId ?? e.id} sq />} title={e.orgName ?? '—'} sub={e.title} />,
    },
    { key: 'amount', label: 'مبلغ (تومان)', width: '136px', render: (e) => <span className="num">{money(e.amount)}</span> },
    {
      key: 'due', label: 'سررسید', width: '120px', col: true, render: (e) => {
        const d = daysPast(e.dueAt ?? e.at);
        return (
          <>
            <span className="num">{e.dueAt ? jDate(e.dueAt) : '—'}</span>
            <span className="sm" style={e.overdue ? { color: 'var(--error-text)' } : undefined}>
              {e.overdue ? `${faDigits(Math.max(1, d))} روز گذشته` : d === 0 ? 'امروز' : `${faDigits(Math.abs(d))} روز مانده`}
            </span>
          </>
        );
      },
    },
    { key: 'at', label: 'ایجاد', width: '92px', render: (e) => <span className="num sm">{jDate(e.at)}</span> },
    { key: 'st', label: 'وضعیت', width: '92px', render: (e) => { const c = cashStatus(e); return <Pill tone={c.tone} dot>{c.label}</Pill>; } },
    {
      key: 'act', label: <span className="sr-only">اقدام</span>, width: '104px', align: 'end',
      render: (e) => (
        <button type="button" className="nm-btn sm line ok" aria-label={`ثبت دریافت واریز ${e.orgName ?? ''}`} onClick={(ev) => { ev.stopPropagation(); setConfirmFor(e); }}>
          ثبت دریافت
        </button>
      ),
    },
  ];

  const ledCols: Column<CashEntry>[] = [
    { key: 'at', label: 'تاریخ', width: '96px', col: true, render: (e) => <><span className="num">{jDate(e.at)}</span><span className="sm num">{time(e.at)}</span></> },
    { key: 'kind', label: 'نوع', width: '120px', render: (e) => <Pill tone={CASH_KIND[e.kind].tone}>{CASH_KIND[e.kind].label}</Pill> },
    {
      key: 'title', label: 'شرح', width: 'minmax(0, 1.6fr)', col: true,
      render: (e) => {
        const meta = [e.orgName, e.ref && `مرجع ${e.ref}`, e.by].filter(Boolean).join(' · ');
        return <><span className="el" style={{ maxWidth: '100%' }}>{e.title}</span>{meta && <span className="sm el" style={{ maxWidth: '100%' }}>{meta}</span>}</>;
      },
    },
    {
      key: 'amount', label: 'مبلغ (تومان)', width: '150px', align: 'end',
      render: (e) => <span className="num" style={e.amount > 0 ? { color: 'var(--success-text)', fontWeight: 600 } : { fontWeight: 600 }}>{signed(e.amount)}</span>,
    },
    { key: 'bal', label: 'مانده (تومان)', width: '150px', align: 'end', render: (e) => <span className="num mute">{e.balanceAfter != null ? money(e.balanceAfter) : '—'}</span> },
  ];

  return (
    <>
      <PageHeading {...HEAD}>
        <button type="button" className="nm-btn ghost" onClick={exportCsv} disabled={!ledgerRows.length}><Icon d={TI.download} size={17} />خروجی گردش</button>
        <button type="button" className="nm-btn" onClick={() => setRecordKey((k) => k + 1)}><Icon d={TI.plus} size={17} strokeWidth={2} />ثبت واریز</button>
      </PageHeading>

      {sumQ.isError ? <ErrorBlock error={sumQ.error} onRetry={() => sumQ.refetch()} /> : (
        <StatStrip loading={!s} items={s ? [
          {
            label: 'مانده حساب', ...scaled(s.balance),
            note: change ? `${change > 0 ? '+' : '−'}${amt(Math.abs(change))} در ۳۰ روز` : 'بدون تغییر در ۳۰ روز', trend: change > 0 ? 'up' : undefined,
          },
          {
            label: 'نقد آزاد', ...scaled(s.available),
            note: s.available < 0 ? 'کمتر از تعهدها؛ صدور تازه ممکن نیست' : 'قابل استفاده برای صدور', trend: s.available < 0 ? 'down' : undefined,
          },
          { label: 'در سفارش‌های باز', ...scaled(s.tiedInOrders), note: 'کنار گذاشته تا تسویه‌ی صدور', href: `${routes.op.orders}?status=placed` },
          { label: 'کیف پول کاربران', ...scaled(s.userWallets), note: 'مال کاربران؛ جزو نقد آزاد نیست' },
          {
            label: 'واریز در انتظار', ...scaled(s.expectedDeposits),
            note: s.overdueCount
              ? `${faDigits(s.overdueCount)} دیرکرد · ${amt(s.overdueAmount)} تومان`
              : `${faDigits(s.expectedCount)} واریز سازمان`,
            trend: s.overdueCount ? 'down' : undefined,
            onClick: () => setDepTab((t) => (t === 'overdue' ? 'expected' : 'overdue')), active: depTab === 'overdue',
          },
        ] : []} />
      )}

      <div className="nm-grid side">
        <Card
          title="مانده حساب" sub="میلیارد تومان"
          actions={<Tabs label="بازه‌ی نمودار" value={range} onChange={setRange} items={[{ key: 30, label: '۳۰ روز' }, { key: 90, label: '۹۰ روز' }]} />}
        >
          {chartQ.isError ? <ErrorBlock error={chartQ.error} flat onRetry={() => chartQ.refetch()} />
            : !chartQ.data ? <SkeletonCard h={240} />
            : (
              <>
                <LineChart
                  labels={hist.map((h) => jDayMonth(h.t))} min={yMin} fmt={(n) => dec(n, 0)} height={260}
                  label={`مانده حساب ${faDigits(range)} روز اخیر: از ${amt(hist[0]?.balance ?? 0)} به ${amt(hist[hist.length - 1]?.balance ?? 0)} تومان`}
                  series={[
                    { name: 'مانده حساب (میلیارد تومان)', color: 'var(--chart-1)', values: bal, area: true },
                    { name: 'نقد آزاد (میلیارد تومان)', color: 'var(--chart-3)', values: avl, dashed: true },
                  ]}
                />
                <Legend items={[
                  { label: 'مانده حساب', color: 'var(--chart-1)', value: amt(s?.balance ?? 0) },
                  { label: 'نقد آزاد', color: 'var(--chart-3)', value: amt(s?.available ?? 0) },
                ]} />
              </>
            )}
        </Card>

        <Card title="ترکیب مانده" sub="امروز">
          {!s ? <SkeletonCard h={240} /> : (
            <>
              <Allocation compact items={[
                { label: 'نقد آزاد', value: Math.max(0, s.available), color: 'var(--chart-3)' },
                { label: 'سفارش‌های باز', value: s.tiedInOrders, color: 'var(--primary-main)' },
                { label: 'کیف پول کاربران', value: s.userWallets, color: 'var(--grey-500)' },
                { label: 'تعهد ریالی بسته‌ها', value: s.committedRial, color: 'var(--warning-main)' },
              ]} />
              <KV rows={[
                ['مانده حساب', <span key="b" className="num">{money(s.balance)}</span>],
                ['سفارش‌های صدور باز', <span key="t" className="num mute">−{money(s.tiedInOrders)}</span>],
                ['کیف پول کاربران', <span key="w" className="num mute">−{money(s.userWallets)}</span>],
                ['بخش ریالی بسته‌های در انتظار پذیرش', <span key="c" className="num mute">−{money(s.committedRial)}</span>],
                [<b key="k">نقد آزاد</b>, <b key="a" className="num" style={s.available < 0 ? { color: 'var(--error-text)' } : undefined}>{money(s.available)}</b>],
              ]} />
              {s.available < 0
                ? <Note tone="err">نقد آزاد منفی است؛ تا دریافت واریزها یا تسویه‌ی ابطال، صدور تازه ثبت نمی‌شود.</Note>
                : <span className="mute" style={{ fontSize: 12 }}>همه‌ی مبالغ به تومان. نقد آزاد سقف سفارش‌های صدور تازه است.</span>}
            </>
          )}
        </Card>
      </div>

      <Card flush title="واریز سازمان‌ها" count={expOrg.length || undefined} sub={orgName ? orgName : 'بابت بسته‌های ارسال‌شده'}>
        <Toolbar>
          <Tabs label="وضعیت واریز" value={depTab} onChange={setDepTab} items={[
            { key: 'expected', label: 'در انتظار', count: expOrg.length },
            { key: 'overdue', label: 'دیرکرد', count: overdue.length, hot: true },
          ]} />
          <span className="grow" />
          <Select label="سازمان" prefix="سازمان" icon={TI.org} value={org} onChange={setOrg} align="end" options={orgOptions} />
        </Toolbar>
        <Table
          columns={depCols} rows={depPg.rows} rowKey={(e) => e.id} rowLabel={(e) => `${e.orgName ?? ''} · ${e.title}`}
          onRowClick={pick} selectedKey={live?.id ?? null}
          loading={expQ.isLoading} error={expQ.isError ? expQ.error : undefined} onRetry={() => expQ.refetch()}
          empty={<Empty icon={TI.deposit} tone="success" title={depTab === 'overdue' ? 'واریز معوقی نیست' : 'واریز در انتظاری نیست'} sub={orgName ? `برای ${orgName}` : 'همه‌ی واریزهای سازمان‌ها دریافت شده است.'} />}
          minWidth={760}
        />
        <TableFoot shown={depPg.rows.length} total={depRows.length} unit="واریز" page={depPg.page} pages={depPg.pages} onPage={depPg.setPage}>
          {depRows.length > 0 && <span className="num">جمع <b style={{ color: 'var(--text-primary)', fontWeight: 600 }}>{amt(sum(depRows.map((e) => e.amount)))}</b> تومان</span>}
        </TableFoot>
      </Card>

      <Card flush title="گردش حساب" sub={orgName}>
        <Toolbar>
          <Tabs label="جهت گردش" value={dir} onChange={setDir} items={[
            { key: 'all', label: 'همه', count: ledger.length },
            { key: 'in', label: 'ورودی', count: ledger.filter((e) => e.amount > 0).length },
            { key: 'out', label: 'خروجی', count: ledger.filter((e) => e.amount < 0).length },
          ]} />
          <span className="grow" />
          <Select label="نوع ردیف" prefix="نوع" value={kind} onChange={setKind} align="end"
            options={[{ key: 'all', label: 'همه' }, ...KINDS.map((k) => ({ key: k, label: CASH_KIND[k].label }))]} />
          <Select label="سازمان" prefix="سازمان" icon={TI.org} value={org} onChange={setOrg} align="end" options={orgOptions} />
          <SearchField value={q} onChange={setQ} placeholder="شرح، سازمان یا مرجع" label="جستجوی گردش حساب" width={200} />
        </Toolbar>
        <Table
          columns={ledCols} rows={ledPg.rows} rowKey={(e) => e.id} rowLabel={(e) => `${e.title} · ${signed(e.amount)} تومان`}
          onRowClick={pick} selectedKey={live?.id ?? null}
          loading={ledgerQ.isLoading} error={ledgerQ.isError ? ledgerQ.error : undefined} onRetry={() => ledgerQ.refetch()}
          empty={(
            <Empty
              icon={TI.cash} title="ردیفی با این فیلترها نیست"
              action={(needle || dir !== 'all' || kind !== 'all' || org !== 'all') ? <button type="button" className="nm-btn sm ghost" onClick={() => { setQ(''); setDir('all'); setKind('all'); setOrg('all'); }}>پاک کردن فیلترها</button> : undefined}
            />
          )}
          minWidth={820}
        />
        <TableFoot shown={ledPg.rows.length} total={ledgerRows.length} unit="ردیف" page={ledPg.page} pages={ledPg.pages} onPage={ledPg.setPage}>
          {ledgerRows.length > 0 && (
            <span className="num">
              ورودی <b style={{ color: 'var(--success-text)', fontWeight: 600 }}>+{amt(inSum)}</b> · خروجی <b style={{ color: 'var(--text-primary)', fontWeight: 600 }}>{amt(outSum)}</b> تومان
            </span>
          )}
        </TableFoot>
      </Card>

      {live && <CashInspector key={`insp-${live.id}`} entry={live} orgLetter={orgById.get(live.orgId ?? '')?.logoLetter} onConfirm={setConfirmFor} onClose={closeInspector} />}
      {confirmFor && <ConfirmDepositDialog key={`confirm-${confirmFor.id}`} entry={confirmFor} onClose={() => setConfirmFor(null)} onDone={confirmed} />}
      {recordKey > 0 && (
        <RecordDepositDialog
          key={`record-${recordKey}`} orgs={orgs} expected={expected} orgId={org !== 'all' ? org : undefined}
          onClose={() => setRecordKey(0)} onDone={(e) => setSel(e)}
        />
      )}
    </>
  );
}
