'use client';
/**
 * Operator console — organizations & contracts. Kit list page: stats (status filters + live treasury totals) → list card
 * (status tabs, search, table with members' assets, open commitments and expected deposits, pager) → inspector with the
 * organization's treasury numbers (link to its cash), reserved assets and the contract editor (save in the inspector footer).
 * Credit products stay hidden while facilities are off (FEATURES.orgCredit).
 */
import { useMemo, useState } from 'react';
import Link from 'next/link';
import type { Fund, LockType, Organization } from '@/types/domain';
import { useOpFunds, useOpOrganizations, useOpProducts } from '@/api/op';
import { useOrgContracts, type OrgContractExt } from '@/api/op-core-extra';
import { useTreasurySummary, type OrgTreasuryRow } from '@/api/op-treasury-extra';
import {
  Ava, BigNum, Card, Dialog, Empty, FreeLocked, Ident, Inspector, KV, KeyStats, List, ListRow, Note, PageHeading, Pill, SearchField, Section,
  SkeletonRows, StatStrip, Table, TableFoot, Tabs, Tile, Toolbar, Who, usePaging, type Column, type Tone,
} from '@/components/panel/kit';
import { Icon } from '@/components/ui/Icon';
import { LockBar, LockTypeChip } from '@/components/ui/LockBar';
import { ContractEditor, VersionList, useContractDraft } from '@/components/op/core/ContractEditor';
import { ICON, ORG_STATUS, PRODUCT_META, fb, orgProducts, pctFa, splitPct, type ProductKey } from '@/components/op/core/ui';
import { amt } from '@/components/op/treasury/ui';
import { scaled } from '@/components/op/cash/money';
import { FEATURES } from '@/lib/features';
import { enDigits, faDigits, jDate, money } from '@/lib/format';
import { routes } from '@/lib/routes';

type Filter = 'all' | Organization['status'];
const PAGE = 8;
const ORG_TONE: Record<Organization['status'], Tone> = { active: 'success', onboarding: 'info', suspended: 'error' };
const PROD_TONE: Record<ProductKey, Tone> = { card: 'primary', loan: 'info', bnpl: 'success' };
const bn = (n: number) => `${fb(n)} میلیارد`;
const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);
const Dash = () => <span style={{ color: 'var(--text-disabled)' }}>—</span>;

export default function OpOrganizationsPage() {
  const orgsQ = useOpOrganizations();
  const contracts = useOrgContracts();
  const fundsQ = useOpFunds();
  const products = useOpProducts();
  const treasury = useTreasurySummary(30);
  const [filter, setFilter] = useState<Filter>('all');
  const [q, setQ] = useState('');
  const [selId, setSelId] = useState<string | null>(null);

  const all = useMemo(() => orgsQ.data ?? [], [orgsQ.data]);
  const cx = contracts.data ?? {};
  const tre = useMemo(() => new Map((treasury.data?.byOrg ?? []).map((r) => [r.orgId, r])), [treasury.data]);
  const treRows = treasury.data?.byOrg ?? [];
  const overdueOrgs = treRows.filter((r) => r.depositsOverdue > 0);
  const counts = useMemo(() => {
    const c: Record<Organization['status'], number> = { active: 0, onboarding: 0, suspended: 0 };
    all.forEach((o) => { c[o.status] += 1; });
    return c;
  }, [all]);
  const needle = q.trim();
  const filtered = useMemo(() => all.filter((o) => (filter === 'all' || o.status === filter)
    && (!needle || o.name.includes(needle) || o.contractNo.toLowerCase().includes(enDigits(needle).toLowerCase()))), [all, filter, needle]);
  const pg = usePaging(filtered, PAGE, `${filter}|${needle}`);
  const sel = all.find((o) => o.id === selId);
  const monthsOptions = products.data?.find((p) => p.kind === 'loan')?.monthsOptions ?? [3, 6, 12, 18];
  const covered = all.filter((o) => o.status === 'active').reduce((s, o) => s + o.employees, 0);
  const toggle = (f: Organization['status']) => setFilter((cur) => (cur === f ? 'all' : f));
  const clear = () => { setFilter('all'); setQ(''); };

  const columns: Column<Organization>[] = [
    { key: 'org', label: 'سازمان', width: 'minmax(0, 1.6fr)', render: (o) => <Ident lead={<Ava letter={o.logoLetter} id={o.id} sq />} title={o.name} sub={o.contractNo} subLtr /> },
    { key: 'st', label: 'وضعیت', width: '100px', render: (o) => <Pill tone={ORG_TONE[o.status]} dot>{ORG_STATUS[o.status].label}</Pill> },
    { key: 'emp', label: 'کارکنان', width: '72px', render: (o) => <span className="num">{faDigits(o.employees)}</span> },
    {
      key: 'aum', label: 'دارایی کارکنان / رزرو', width: '150px', col: true, render: (o) => {
        const r = tre.get(o.id);
        const e = cx[o.id];
        const value = r?.value ?? e?.aum ?? 0;
        const locked = r?.reservedValue ?? e?.locked ?? 0;
        if (value <= 0) return <Dash />;
        const sp = splitPct(value, locked);
        return (
          <>
            <span className="num">{bn(value)}</span>
            <span style={{ display: 'flex', alignItems: 'center', gap: 6, width: '100%' }}>
              <span style={{ width: 56, flex: 'none' }}><LockBar free={sp.free} locked={locked} height={4} /></span>
              <span className="sm">{pctFa(sp.lockedPct)} رزرو</span>
            </span>
          </>
        );
      },
    },
    {
      key: 'commit', label: 'تعهد باز', width: '116px', col: true, render: (o) => {
        const r = tre.get(o.id);
        if (!r || r.commitments <= 0) return <Dash />;
        return <><span className="num">{amt(r.commitments)}</span><span className="sm">{faDigits(r.pendingRecipients)} نفر در انتظار پذیرش</span></>;
      },
    },
    {
      key: 'dep', label: 'واریز در انتظار', width: '116px', col: true, render: (o) => {
        const r = tre.get(o.id);
        if (!r || r.depositsExpected <= 0) return <Dash />;
        return (
          <>
            <span className="num">{amt(r.depositsExpected)}</span>
            {r.depositsOverdue > 0
              ? <span className="sm" style={{ color: 'var(--error-text)' }}>دیرکرد {amt(r.depositsOverdue)}</span>
              : <span className="sm">در موعد</span>}
          </>
        );
      },
    },
    ...(!FEATURES.orgCredit ? [] : [{
      key: 'prod', label: 'محصولات', width: '96px', render: (o) => {
        const prods = orgProducts(o);
        if (!prods.length) return <span style={{ color: 'var(--text-disabled)' }}>—</span>;
        return <span style={{ display: 'flex', gap: 4 }}>{prods.map((k) => <span key={k} role="img" title={PRODUCT_META[k].name} aria-label={PRODUCT_META[k].name}><Tile d={PRODUCT_META[k].d} tone={PROD_TONE[k]} size="sm" /></span>)}</span>;
      },
    } satisfies Column<Organization>]),
    { key: 'end', label: 'تمدید', width: '92px', render: (o) => <span className="num sm">{o.status === 'onboarding' ? '—' : jDate(o.contractEnd)}</span> },
  ];

  return (
    <>
      <PageHeading title="سازمان‌ها و قراردادها" crumbs={[{ label: 'مشتریان' }]} sub="قرارداد، دارایی کارکنان، تعهدها و واریزهای هر سازمان">
        <Link href={routes.op.orgNew} className="nm-btn"><Icon d={ICON.plus} size={17} strokeWidth={2} />افزودن سازمان</Link>
      </PageHeading>

      <StatStrip loading={orgsQ.isLoading} items={[
        { label: 'قرارداد فعال', value: faDigits(counts.active), unit: 'سازمان', note: `${money(covered)} کارمند تحت پوشش`, onClick: () => toggle('active'), active: filter === 'active' },
        { label: 'در حال عقد', value: faDigits(counts.onboarding), unit: 'سازمان', note: 'در انتظار امضای نماینده', onClick: () => toggle('onboarding'), active: filter === 'onboarding' },
        { label: 'معلق', value: faDigits(counts.suspended), unit: 'سازمان', note: FEATURES.orgCredit ? 'ارسال بسته و تسهیلات متوقف است' : 'ارسال بسته متوقف است', onClick: () => toggle('suspended'), active: filter === 'suspended' },
        ...(treasury.data ? [
          {
            label: 'تعهد باز بسته‌ها', ...scaled(sum(treRows.map((r) => r.commitments))),
            note: `${money(sum(treRows.map((r) => r.pendingRecipients)))} نفر در انتظار پذیرش`,
          },
          {
            label: 'واریز در انتظار', ...scaled(sum(treRows.map((r) => r.depositsExpected))),
            note: overdueOrgs.length ? `${faDigits(overdueOrgs.length)} سازمان با دیرکرد · ${amt(sum(overdueOrgs.map((r) => r.depositsOverdue)))}` : 'همه در موعد',
            trend: overdueOrgs.length ? 'down' as const : undefined,
            href: overdueOrgs.length ? `${routes.op.cash}?status=overdue` : routes.op.cash,
          },
        ] : []),
      ]} />

      <Card flush>
        <Toolbar>
          <Tabs label="وضعیت قرارداد" value={filter} onChange={setFilter} items={[
            { key: 'all', label: 'همه', count: all.length },
            { key: 'active', label: ORG_STATUS.active.label, count: counts.active },
            { key: 'onboarding', label: ORG_STATUS.onboarding.label, count: counts.onboarding },
            { key: 'suspended', label: ORG_STATUS.suspended.label, count: counts.suspended },
          ]} />
          <span className="grow" />
          <SearchField id="org-search" value={q} onChange={setQ} placeholder="نام سازمان یا کد قرارداد" label="جستجوی سازمان" width={240} />
        </Toolbar>
        <Table
          columns={columns} rows={pg.rows} rowKey={(o) => o.id} rowLabel={(o) => o.name}
          onRowClick={(o) => setSelId((s) => (s === o.id ? null : o.id))} selectedKey={selId}
          loading={orgsQ.isLoading} error={orgsQ.isError ? orgsQ.error : undefined} onRetry={() => orgsQ.refetch()}
          empty={<Empty icon={ICON.search} title={needle ? 'سازمانی با این جستجو پیدا نشد' : 'سازمانی با این وضعیت نیست'} action={(needle || filter !== 'all') && <button type="button" className="nm-btn sm ghost" onClick={clear}>پاک کردن فیلترها</button>} />}
          minWidth={FEATURES.orgCredit ? 1000 : 900}
        />
        <TableFoot shown={pg.rows.length} total={filtered.length} unit="سازمان" page={pg.page} pages={pg.pages} onPage={pg.setPage} />
      </Card>

      {sel && <OrgInspector key={sel.id} org={sel} ext={cx[sel.id]} row={tre.get(sel.id)} funds={fundsQ.data} monthsOptions={monthsOptions} onClose={() => setSelId(null)} />}
    </>
  );
}

/** Waits for the contract data, then shows the contract inspector. */
function OrgInspector({ org, ext, row, funds, monthsOptions, onClose }: { org: Organization; ext?: OrgContractExt; row?: OrgTreasuryRow; funds?: Fund[]; monthsOptions: number[]; onClose: () => void }) {
  if (!ext || !funds) {
    return (
      <Inspector open onClose={onClose} title="قرارداد سازمان" label={`قرارداد ${org.name}`} href={routes.op.organization(org.id)}>
        <SkeletonRows n={6} />
      </Inspector>
    );
  }
  return <ContractInspector org={org} ext={ext} row={row} funds={funds} monthsOptions={monthsOptions} onClose={onClose} />;
}

function ContractInspector({ org, ext, row, funds, monthsOptions, onClose }: { org: Organization; ext: OrgContractExt; row?: OrgTreasuryRow; funds: Fund[]; monthsOptions: number[]; onClose: () => void }) {
  const c = useContractDraft(org, ext);
  const [history, setHistory] = useState(false);
  const sp = splitPct(ext.aum, ext.locked);
  const types = (Object.entries(ext.lockByType) as [LockType, number][]).filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]);

  return (
    <>
      <Inspector
        open onClose={onClose} title="قرارداد سازمان" label={`قرارداد ${org.name}`} href={routes.op.organization(org.id)}
        actions={<button type="button" className="nm-ib" aria-label="تاریخچه نسخه‌های قرارداد" title="تاریخچه نسخه‌ها" onClick={() => setHistory(true)}><Icon d={ICON.history} size={18} /></button>}
        footer={(
          <>
            {c.dirty && <button type="button" className="nm-btn ghost" onClick={c.reset} disabled={c.saving}>لغو تغییرات</button>}
            <button type="button" className="nm-btn" onClick={c.save} disabled={c.saving || !c.dirty}>{c.saving ? 'در حال ذخیره…' : 'ذخیره تغییرات'}</button>
          </>
        )}
      >
        <Who
          lead={<Ava letter={org.logoLetter} id={org.id} sq size="lg" />}
          title={org.name}
          sub={<><span className="ltr">{org.contractNo}</span> · تمدید <span className="num">{org.status === 'onboarding' ? '—' : jDate(org.contractEnd)}</span></>}
          pills={<><Pill tone={ORG_TONE[org.status]} dot>{ORG_STATUS[org.status].label}</Pill><Pill>نسخه {faDigits(ext.version)}</Pill>{c.dirty && <Pill tone="warning">ذخیره‌نشده</Pill>}</>}
        />
        <KeyStats items={[['کارکنان', faDigits(org.employees)], ['AUM', ext.aum > 0 ? bn(ext.aum) : '—'], ['رزروشده', ext.aum > 0 ? pctFa(sp.lockedPct) : '—']]} />

        {row && <TreasurySection org={org} row={row} />}

        {ext.aum > 0 && (
          <Section title="دارایی رزروشده کارکنان" action={<BigNum value={fb(ext.locked)} unit="میلیارد" />}>
            <FreeLocked free={sp.free} locked={ext.locked} fmt={bn} />
            {types.length > 0 && (
              <List>
                {types.map(([k, v]) => (
                  <ListRow key={k}
                    lead={<span style={{ width: 84, flex: 'none' }}><LockTypeChip type={k} /></span>}
                    title={<span className="num" style={{ fontWeight: 500 }}>{bn(v)}</span>}
                    trail={<span className="num mute" style={{ fontSize: 12.5 }}>{pctFa(ext.locked ? (v / ext.locked) * 100 : 0)}</span>}
                  />
                ))}
              </List>
            )}
          </Section>
        )}

        <ContractEditor c={c} funds={funds} monthsOptions={monthsOptions} />
      </Inspector>

      <Dialog open={history} onClose={() => setHistory(false)} width={540} title={`تاریخچه نسخه‌های قرارداد — ${org.name}`}
        footer={<button type="button" className="nm-btn ghost" onClick={() => setHistory(false)}>بستن</button>}>
        <VersionList ext={ext} />
      </Dialog>
    </>
  );
}

/** Live treasury numbers of the organization (members' assets, open commitments, deposits) with a link to its cash. */
function TreasurySection({ org, row: r }: { org: Organization; row: OrgTreasuryRow }) {
  const cash = `${routes.op.cash}?org=${encodeURIComponent(org.id)}`;
  return (
    <Section title="خزانه و تعهدات" action={<Link href={cash} className="nm-more">نقدینگی سازمان<Icon d={ICON.ext} size={14} /></Link>}>
      <KV rows={[
        ['سهم از موجودی صندوق‌ها', <span key="f" className="num">{amt(r.fundValue)} تومان</span>],
        ['تعهد بسته‌های باز', <span key="c" className="num">{r.commitments > 0 ? `${amt(r.commitments)} تومان · ${faDigits(r.pendingRecipients)} نفر` : '—'}</span>],
        ['واریز در انتظار', <span key="e" className="num">{r.depositsExpected > 0 ? `${amt(r.depositsExpected)} تومان` : '—'}</span>],
        ['دیرکرد واریز', <span key="o" className="num" style={r.depositsOverdue > 0 ? { color: 'var(--error-text)' } : undefined}>{r.depositsOverdue > 0 ? `${amt(r.depositsOverdue)} تومان` : 'ندارد'}</span>],
        ['دریافتی امسال', <span key="y" className="num">{amt(r.depositsReceivedYear)} تومان</span>],
      ]} />
      {r.depositsOverdue > 0 && (
        <Note tone="err" action={<Link href={cash} className="nm-btn sm ghost">پیگیری</Link>}>
          {amt(r.depositsOverdue)} تومان از واریزهای {org.name} از سررسید گذشته است.
        </Note>
      )}
    </Section>
  );
}
