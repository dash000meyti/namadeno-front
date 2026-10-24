'use client';
/**
 * Operator console — organizations & contracts. Kit list page: stats (status filters) → list card (status tabs, search,
 * table, pager) → inspector with the organization's locked assets and the contract editor (save in the inspector footer).
 */
import { useMemo, useState } from 'react';
import Link from 'next/link';
import type { Fund, LockType, Organization } from '@/types/domain';
import { useOpFunds, useOpOrganizations, useOpProducts } from '@/api/op';
import { useOrgContracts, type OrgContractExt } from '@/api/op-core-extra';
import {
  Ava, BigNum, Card, Dialog, Empty, FreeLocked, Ident, Inspector, KeyStats, List, ListRow, PageHeading, Pill, SearchField, Section,
  SkeletonRows, StatStrip, Table, TableFoot, Tabs, Tile, Toolbar, Who, usePaging, type Column, type Tone,
} from '@/components/panel/kit';
import { Icon } from '@/components/ui/Icon';
import { LockBar, LockTypeChip } from '@/components/ui/LockBar';
import { ContractEditor, VersionList, useContractDraft } from '@/components/op/core/ContractEditor';
import { ICON, ORG_STATUS, PRODUCT_META, fb, orgProducts, pctFa, splitPct, type ProductKey } from '@/components/op/core/ui';
import { enDigits, faDigits, jDate, money } from '@/lib/format';
import { routes } from '@/lib/routes';

type Filter = 'all' | Organization['status'];
const PAGE = 8;
const ORG_TONE: Record<Organization['status'], Tone> = { active: 'success', onboarding: 'info', suspended: 'error' };
const PROD_TONE: Record<ProductKey, Tone> = { card: 'primary', loan: 'info', bnpl: 'success' };
const bn = (n: number) => `${fb(n)} میلیارد`;

export default function OpOrganizationsPage() {
  const orgsQ = useOpOrganizations();
  const contracts = useOrgContracts();
  const fundsQ = useOpFunds();
  const products = useOpProducts();
  const [filter, setFilter] = useState<Filter>('all');
  const [q, setQ] = useState('');
  const [selId, setSelId] = useState<string | null>(null);

  const all = useMemo(() => orgsQ.data ?? [], [orgsQ.data]);
  const cx = contracts.data ?? {};
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
      key: 'aum', label: 'AUM / قفل', width: '150px', col: true, render: (o) => {
        const e = cx[o.id];
        if (!e || e.aum <= 0) return <span style={{ color: 'var(--text-disabled)' }}>—</span>;
        const sp = splitPct(e.aum, e.locked);
        return (
          <>
            <span className="num">{bn(e.aum)}</span>
            <span style={{ display: 'flex', alignItems: 'center', gap: 6, width: '100%' }}>
              <span style={{ width: 56, flex: 'none' }}><LockBar free={sp.free} locked={e.locked} height={4} /></span>
              <span className="sm">{pctFa(sp.lockedPct)} قفل</span>
            </span>
          </>
        );
      },
    },
    {
      key: 'prod', label: 'محصولات', width: '96px', render: (o) => {
        const prods = orgProducts(o);
        if (!prods.length) return <span style={{ color: 'var(--text-disabled)' }}>—</span>;
        return <span style={{ display: 'flex', gap: 4 }}>{prods.map((k) => <span key={k} role="img" title={PRODUCT_META[k].name} aria-label={PRODUCT_META[k].name}><Tile d={PRODUCT_META[k].d} tone={PROD_TONE[k]} size="sm" /></span>)}</span>;
      },
    },
    { key: 'end', label: 'تمدید', width: '92px', render: (o) => <span className="num sm">{o.status === 'onboarding' ? '—' : jDate(o.contractEnd)}</span> },
  ];

  return (
    <>
      <PageHeading title="سازمان‌ها و قراردادها" crumbs={[{ label: 'عملیات' }]} sub="قرارداد، محدودیت‌ها و دارایی کارکنان هر سازمان">
        <Link href={routes.op.orgNew} className="nm-btn"><Icon d={ICON.plus} size={17} strokeWidth={2} />افزودن سازمان</Link>
      </PageHeading>

      <StatStrip loading={orgsQ.isLoading} items={[
        { label: 'قرارداد فعال', value: faDigits(counts.active), unit: 'سازمان', note: `${money(covered)} کارمند تحت پوشش`, onClick: () => toggle('active'), active: filter === 'active' },
        { label: 'در حال عقد', value: faDigits(counts.onboarding), unit: 'سازمان', note: 'در انتظار امضای نماینده', onClick: () => toggle('onboarding'), active: filter === 'onboarding' },
        { label: 'معلق', value: faDigits(counts.suspended), unit: 'سازمان', note: 'ارسال بسته و تسهیلات متوقف است', onClick: () => toggle('suspended'), active: filter === 'suspended' },
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
          minWidth={760}
        />
        <TableFoot shown={pg.rows.length} total={filtered.length} unit="سازمان" page={pg.page} pages={pg.pages} onPage={pg.setPage} />
      </Card>

      {sel && <OrgInspector key={sel.id} org={sel} ext={cx[sel.id]} funds={fundsQ.data} monthsOptions={monthsOptions} onClose={() => setSelId(null)} />}
    </>
  );
}

/** Waits for the contract data, then shows the contract inspector. */
function OrgInspector({ org, ext, funds, monthsOptions, onClose }: { org: Organization; ext?: OrgContractExt; funds?: Fund[]; monthsOptions: number[]; onClose: () => void }) {
  if (!ext || !funds) {
    return (
      <Inspector open onClose={onClose} title="قرارداد سازمان" label={`قرارداد ${org.name}`} href={routes.op.organization(org.id)}>
        <SkeletonRows n={6} />
      </Inspector>
    );
  }
  return <ContractInspector org={org} ext={ext} funds={funds} monthsOptions={monthsOptions} onClose={onClose} />;
}

function ContractInspector({ org, ext, funds, monthsOptions, onClose }: { org: Organization; ext: OrgContractExt; funds: Fund[]; monthsOptions: number[]; onClose: () => void }) {
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
        <KeyStats items={[['کارکنان', faDigits(org.employees)], ['AUM', ext.aum > 0 ? bn(ext.aum) : '—'], ['قفل‌شده', ext.aum > 0 ? pctFa(sp.lockedPct) : '—']]} />

        {ext.aum > 0 && (
          <Section title="دارایی قفل‌شده کارکنان" action={<BigNum value={fb(ext.locked)} unit="میلیارد" />}>
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
