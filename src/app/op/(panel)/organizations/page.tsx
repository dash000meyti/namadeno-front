'use client';
/**
 * Operator console — organizations & contracts. Kit list page: stats (status filters + organizations' free rial and the
 * blocked «ریال رزرو») → list card (status tabs, search, table with members' assets and the organization's rial account,
 * pager) → inspector with the organization's rial account (link to its cash), treasury numbers, reserved assets and the
 * contract editor (save in the inspector footer).
 * Credit products stay hidden while facilities are off (FEATURES.orgCredit).
 */
import type { ReactNode } from 'react';
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
import { ORG_RIAL, amt } from '@/components/op/treasury/ui';
import { scaled } from '@/components/op/cash/money';
import { RialSplit } from '@/components/op/cash/rial';
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
  const receiptOrgs = treRows.filter((r) => r.rial.pendingCount > 0);
  const queuedOrgs = treRows.filter((r) => r.rial.queuedCount > 0);
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
      key: 'rial', label: 'حساب ریالی', width: 'minmax(0, 1.2fr)', col: true, render: (o) => {
        const a = tre.get(o.id)?.rial;
        if (!a || (a.free <= 0 && a.blocked <= 0 && a.pending <= 0 && a.queuedCount <= 0)) return <Dash />;
        return (
          <>
            <span className="num el" style={{ maxWidth: '100%' }}>{ORG_RIAL.free.label} {amt(a.free)} · بلاک {amt(a.blocked)}</span>
            {a.pending > 0
              ? <span className="sm el" style={{ color: 'var(--warning-text)', maxWidth: '100%' }}>فیش در انتظار تأیید {amt(a.pending)}{a.queuedCount > 0 ? ` · ${faDigits(a.queuedCount)} بسته در صف` : ''}</span>
              : a.queuedCount > 0
                ? <span className="sm el" style={{ maxWidth: '100%' }}>{faDigits(a.queuedCount)} بسته در صف · فیش تازه لازم است</span>
                : <span className="sm">فیشی در انتظار نیست</span>}
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
      <PageHeading title="سازمان‌ها و قراردادها" crumbs={[{ label: 'مشتریان' }]} sub="قرارداد، دارایی کارکنان و حساب ریالی هر سازمان">
        <Link href={routes.op.orgNew} className="nm-btn"><Icon d={ICON.plus} size={17} strokeWidth={2} />افزودن سازمان</Link>
      </PageHeading>

      <StatStrip loading={orgsQ.isLoading} items={[
        { label: 'قرارداد فعال', value: faDigits(counts.active), unit: 'سازمان', note: `${money(covered)} کارمند تحت پوشش`, onClick: () => toggle('active'), active: filter === 'active' },
        { label: 'در حال عقد', value: faDigits(counts.onboarding), unit: 'سازمان', note: 'در انتظار امضای نماینده', onClick: () => toggle('onboarding'), active: filter === 'onboarding' },
        { label: 'معلق', value: faDigits(counts.suspended), unit: 'سازمان', note: FEATURES.orgCredit ? 'ارسال بسته و تسهیلات متوقف است' : 'ارسال بسته متوقف است', onClick: () => toggle('suspended'), active: filter === 'suspended' },
        ...(treasury.data ? [
          {
            label: 'حساب آزاد سازمان‌ها', ...scaled(sum(treRows.map((r) => r.rial.free))),
            note: `${faDigits(treRows.filter((r) => r.rial.free > 0).length)} سازمان · هنوز در بسته نیست`,
            href: routes.op.cash,
          },
          {
            label: 'ریال رزرو (بلاک)', ...scaled(sum(treRows.map((r) => r.rial.blocked))),
            note: receiptOrgs.length
              ? `فیش در انتظار تأیید ${faDigits(sum(receiptOrgs.map((r) => r.rial.pendingCount)))} · ${amt(sum(receiptOrgs.map((r) => r.rial.pending)))}`
              : queuedOrgs.length
                ? `${faDigits(sum(queuedOrgs.map((r) => r.rial.queuedCount)))} بسته در صف تأیید فیش`
                : `${money(sum(treRows.map((r) => r.pendingRecipients)))} نفر در انتظار پذیرش`,
            trend: receiptOrgs.length ? 'warn' as const : undefined,
            href: receiptOrgs.length ? `${routes.op.cash}?status=expected` : routes.op.cash,
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
          minWidth={FEATURES.orgCredit ? 1000 : 920}
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

/** The organization's rial account and live treasury numbers (members' stock, recipients, deposits) with a link to its cash. */
function TreasurySection({ org, row: r }: { org: Organization; row: OrgTreasuryRow }) {
  const cash = `${routes.op.cash}?org=${encodeURIComponent(org.id)}`;
  const a = r.rial;
  return (
    <>
      <Section title="حساب ریالی" action={<Link href={cash} className="nm-more">نقدینگی سازمان<Icon d={ICON.ext} size={14} /></Link>}>
        <RialSplit a={a} />
        <KV rows={[
          [ORG_RIAL.free.label, <span key="f" className="num">{amt(a.free)} تومان</span>],
          [ORG_RIAL.blocked.label, <span key="b" className="num">{a.blocked > 0 ? `${amt(a.blocked)} تومان` : '—'}</span>],
          ...(a.setAside > 0 ? [[ORG_RIAL.setAside.label, <span key="s" className="num">{amt(a.setAside)} تومان</span>] as [string, ReactNode]] : []),
          [ORG_RIAL.queued.label, <span key="q" className="num">{a.queuedCount > 0 ? `${faDigits(a.queuedCount)} بسته · ${amt(a.queuedTotal)} تومان` : '—'}</span>],
          [ORG_RIAL.pending.label, <span key="p" className="num">{a.pending > 0 ? `${amt(a.pending)} تومان · ${faDigits(a.pendingCount)} فیش` : '—'}</span>],
        ]} />
        {a.pendingCount > 0 ? (
          <Note tone="warn" icon={ICON.clock} action={<Link href={`${cash}&status=expected`} className="nm-btn sm ghost">بررسی فیش</Link>}>
            {faDigits(a.pendingCount)} فیش واریز {org.name} به مبلغ {amt(a.pending)} تومان در انتظار تأیید است.
            {a.queuedCount > 0 ? ' بسته‌های در صف پس از تأیید ارسال می‌شوند.' : ''}
          </Note>
        ) : a.queuedCount > 0 ? (
          <Note tone="info" icon={ICON.clock}>
            {faDigits(a.queuedCount)} بسته‌ی {org.name} در صف است و تا فیش تازه و تأیید آن به همکاران ارسال نمی‌شود.
          </Note>
        ) : null}
      </Section>
      <Section title="خزانه">
        <KV rows={[
          ['سهم از موجودی صندوق‌ها', <span key="f" className="num">{amt(r.fundValue)} تومان</span>],
          ['در انتظار پذیرش', <span key="c" className="num">{r.pendingRecipients > 0 ? `${faDigits(r.pendingRecipients)} نفر` : '—'}</span>],
          ['دریافتی امسال', <span key="y" className="num">{amt(r.depositsReceivedYear)} تومان</span>],
        ]} />
      </Section>
    </>
  );
}
