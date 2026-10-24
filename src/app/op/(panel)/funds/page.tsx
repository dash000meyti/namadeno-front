'use client';
/**
 * /op/funds — kit list page: stats → funds table (status tabs, search) → inspector for the selected fund
 * (NAV trend, free/locked AUM by lock type, details; edit, launch, pause/resume). NAV refresh and «صندوق جدید» in the heading.
 */
import { useMemo, useState } from 'react';
import { useOpFunds } from '@/api/op';
import { useRefreshNav, useUpdateFundX, type OpFund } from '@/api/op-system-extra';
import type { Fund } from '@/types/domain';
import {
  BigNum, Card, Confirm, Empty, FreeLocked, Ident, Inspector, KV, KeyStats, List, ListRow, Note,
  PageHeading, Pill, SearchField, Section, Spark, StatStrip, Table, TableFoot, Tabs, Tile, Toolbar, Who, usePaging,
  type Column, type Tone,
} from '@/components/panel/kit';
import { Icon } from '@/components/ui/Icon';
import { LockBar, LockTypeChip } from '@/components/ui/LockBar';
import { useToast } from '@/components/ui/Toast';
import { bn, dayTime, dec, errMsg, pctT, spct } from '@/components/op/system/fmt';
import { IC, type ToneKey } from '@/components/op/system/ui';
import { CATEGORY_LABEL, FUND_STATUS, FUND_UI, LOCK_ORDER, fundTitle, lockedOf } from '@/components/op/system/funds';
import { FundEditDialog, NavChart } from '@/components/op/system/FundUi';
import { faDigits, money } from '@/lib/format';
import { LOCK_META } from '@/lib/locks';
import { routes } from '@/lib/routes';

type Filt = 'all' | Fund['status'];
const PAGE = 10;
const TABS: { key: Filt; label: string }[] = [
  { key: 'all', label: 'همه' }, { key: 'active', label: 'فعال' }, { key: 'paused', label: 'غیرفعال موقت' }, { key: 'coming_soon', label: 'پیش‌نویس' },
];
const PAUSE_BODY = 'خرید و فروش واحدهای این صندوق برای همهٔ کاربران متوقف می‌شود. واحدهای فعلی، سود و NAV و قفل‌ها بدون تغییر باقی می‌مانند و هر زمان می‌توانید صندوق را دوباره فعال کنید.';

/** Legacy tone key → kit tone. */
const kt = (t: ToneKey): Tone => (t === 'default' ? 'neutral' : t);
const trendTone = (n: number): Tone => (Math.abs(n) < 0.05 ? 'neutral' : n > 0 ? 'success' : 'error');
const chg = (n: number) => (Math.abs(n) < 0.05 ? '۰٪' : spct(n));
const dash = <span style={{ color: 'var(--text-disabled)' }}>—</span>;

/** NAV change (percent) over the last `days` days of the price history. */
function navChange(f: Fund, days = 30): number | null {
  const h = f.history ?? [];
  if (h.length < 2) return null;
  const base = h[Math.max(0, h.length - 1 - days)].v;
  return base ? (h[h.length - 1].v / base - 1) * 100 : null;
}

/** A round axis floor under the lowest value, so day-to-day NAV moves stay visible. */

/** NAV line (kit LineChart). Big NAVs read in thousands. LTR wrapper keeps the y-axis labels left of the plot in the RTL page. */

function FundTile({ f, size }: { f: Fund; size?: 'md' | 'xl' }) {
  return <Tile d={FUND_UI[f.kind].d} tone={f.status === 'coming_soon' ? 'neutral' : kt(FUND_UI[f.kind].tone)} size={size} />;
}

export default function OpFundsPage() {
  const toast = useToast();
  const funds = useOpFunds();
  const refresh = useRefreshNav();
  const [filt, setFilt] = useState<Filt>('all');
  const [q, setQ] = useState('');
  const [sel, setSel] = useState<string | null>(null);
  const list = useMemo(() => (funds.data ?? []) as OpFund[], [funds.data]);

  const needle = q.trim();
  const rows = useMemo(() => list.filter((f) => (filt === 'all' || f.status === filt)
    && (!needle || [f.name, f.symbol, f.shortName, f.meta?.manager ?? ''].some((s) => s.includes(needle)))), [list, filt, needle]);
  const pg = usePaging(rows, PAGE, `${filt}|${needle}`);
  const selFund = list.find((f) => f.id === sel);

  const count = (s: Fund['status']) => list.filter((f) => f.status === s).length;
  const aum = list.reduce((s, f) => s + f.aum, 0);
  const locked = list.reduce((s, f) => s + lockedOf(f), 0);
  const lastNav = list.map((f) => f.meta?.lastNavAt ?? '').sort().pop();

  const onRefresh = () => refresh.mutate({}, {
    onSuccess: (r) => toast(`NAV ${faDigits(r.funds.length)} صندوق فعال از هسته معاملات به‌روزرسانی شد`),
    onError: (e) => toast(errMsg(e), 'error'),
  });
  const clear = () => { setFilt('all'); setQ(''); };

  const columns: Column<OpFund>[] = [
    {
      key: 'fund', label: 'صندوق', width: 'minmax(0, 1.6fr)',
      render: (f) => <Ident lead={<FundTile f={f} />} title={f.name} sub={`${f.symbol} · ${f.status === 'coming_soon' ? 'در انتظار مجوز' : CATEGORY_LABEL[f.category]}`} />,
    },
    { key: 'nav', label: 'NAV (تومان)', width: '116px', render: (f) => (f.nav ? <span className="num" style={{ fontWeight: 600 }}>{money(f.nav)}</span> : dash) },
    {
      key: 'trend', label: 'تغییر ۳۰ روز', width: '144px', render: (f) => {
        const ch = navChange(f);
        if (ch == null) return dash;
        return <><Spark values={(f.history ?? []).slice(-31).map((x) => x.v)} width={64} height={22} /><Pill tone={trendTone(ch)}>{chg(ch)}</Pill></>;
      },
    },
    { key: 'aum', label: 'AUM (میلیارد)', width: '104px', render: (f) => (f.aum ? <span className="num">{bn(f.aum)}</span> : dash) },
    { key: 'inv', label: 'دارندگان', width: '84px', render: (f) => (f.investors ? <span className="num">{money(f.investors)}</span> : dash) },
    {
      key: 'lock', label: 'قفل‌شده (میلیارد)', width: '128px', col: true, render: (f) => {
        if (!f.aum) return dash;
        const l = lockedOf(f);
        return (
          <>
            {l > 0 ? <span className="num">{bn(l)} <span className="sm">· {faDigits(Math.round((l / f.aum) * 100))}٪</span></span> : <span className="sm">همه آزاد</span>}
            <span style={{ width: 96 }}><LockBar free={f.aum - l} locked={l} height={4} /></span>
          </>
        );
      },
    },
    { key: 'st', label: 'وضعیت', width: '112px', render: (f) => <Pill tone={kt(FUND_STATUS[f.status].tone)} dot>{FUND_STATUS[f.status].label}</Pill> },
  ];

  return (
    <>
      <PageHeading title="صندوق‌ها" crumbs={[{ label: 'محصول' }]} sub="صندوق‌های قابل معامله در اپ نمادنو، NAV روزانه و سهم آزاد و قفل‌شده‌ی دارایی هر صندوق">
        <button type="button" className="nm-btn ghost" onClick={onRefresh} disabled={refresh.isPending}>
          <Icon d={IC.refresh} size={17} />{refresh.isPending ? 'در حال به‌روزرسانی…' : 'به‌روزرسانی NAV'}
        </button>
        <button type="button" className="nm-btn" onClick={() => toast('درخواست تعریف صندوق جدید ثبت شد؛ پس از مجوز سازمان بورس فعال می‌شود', 'info')}>
          <Icon d={IC.plus} size={17} strokeWidth={2} />صندوق جدید
        </button>
      </PageHeading>

      {!funds.isError && (
        <StatStrip loading={funds.isLoading} items={[
          { label: 'دارایی تحت مدیریت', value: bn(aum), unit: 'میلیارد تومان', note: 'ارزش روز واحدهای همه‌ی صندوق‌ها' },
          { label: 'صندوق‌های فعال', value: faDigits(count('active')), unit: 'صندوق', note: `از ${faDigits(list.length)} صندوق${count('coming_soon') ? ` · ${faDigits(count('coming_soon'))} پیش‌نویس` : ''}` },
          { label: 'ارزش قفل‌شده', value: bn(locked), unit: 'میلیارد تومان', note: `${pctT(aum ? (locked / aum) * 100 : 0)} از دارایی صندوق‌ها` },
          { label: 'آخرین به‌روزرسانی NAV', value: dayTime(lastNav), note: 'از هسته معاملات' },
        ]} />
      )}

      <Card flush>
        <Toolbar>
          <Tabs label="وضعیت صندوق" value={filt} onChange={setFilt} items={TABS.map((t) => ({ ...t, count: t.key === 'all' ? list.length : count(t.key) }))} />
          <span className="grow" />
          <SearchField value={q} onChange={setQ} placeholder="نام یا نماد صندوق" label="جستجوی صندوق" width={220} />
        </Toolbar>
        <Table
          columns={columns} rows={pg.rows} rowKey={(f) => f.id} rowLabel={(f) => f.name}
          onRowClick={(f) => setSel((s) => (s === f.id ? null : f.id))} selectedKey={sel}
          dimRow={(f) => f.status === 'coming_soon'}
          loading={funds.isLoading} error={funds.isError ? funds.error : undefined} onRetry={() => funds.refetch()}
          empty={<Empty icon={IC.search} title="صندوقی با این فیلترها پیدا نشد" action={<button type="button" className="nm-btn sm ghost" onClick={clear}>پاک کردن فیلترها</button>} />}
          minWidth={940}
        />
        <TableFoot shown={pg.rows.length} total={rows.length} unit="صندوق" page={pg.page} pages={pg.pages} onPage={pg.setPage} />
      </Card>

      {selFund && <FundInspector key={selFund.id} f={selFund} onClose={() => setSel(null)} />}
    </>
  );
}

function FundInspector({ f, onClose }: { f: OpFund; onClose: () => void }) {
  const toast = useToast();
  const update = useUpdateFundX();
  const [modal, setModal] = useState<'' | 'edit' | 'pause'>('');
  const st = FUND_STATUS[f.status];
  const draft = f.status === 'coming_soon';
  const paused = f.status === 'paused';
  const locked = lockedOf(f);
  const free = Math.max(0, f.aum - locked);
  const hist = (f.history ?? []).slice(-31);
  const ch = navChange(f);
  const big = f.nav >= 1e6;
  const lockRows = LOCK_ORDER.map((t) => ({ t, v: f.meta?.lockByType[t] ?? 0, holders: f.meta?.holdersByType[t] ?? 0 })).filter((r) => r.v > 0);

  const setStatus = (status: Fund['status']) => update.mutate({ id: f.id, status }, {
    onSuccess: () => { setModal(''); toast(status === 'paused' ? `${f.name} به‌صورت موقت غیرفعال شد؛ خرید و فروش متوقف است` : `${f.name} ${draft ? 'راه‌اندازی' : 'دوباره فعال'} شد`); },
    onError: (e) => { setModal(''); toast(errMsg(e), 'error'); },
  });

  const statusBtn = draft
    ? <button type="button" className="nm-btn" onClick={() => setStatus('active')} disabled={update.isPending}><Icon d={IC.play} size={15} />راه‌اندازی</button>
    : paused
      ? <button type="button" className="nm-btn line ok" onClick={() => setStatus('active')} disabled={update.isPending}><Icon d={IC.check} size={17} />فعال‌سازی مجدد</button>
      : <button type="button" className="nm-btn line danger" onClick={() => setModal('pause')} disabled={update.isPending}><Icon d={IC.pause} size={17} />غیرفعال‌سازی موقت</button>;

  return (
    <>
      <Inspector
        open onClose={onClose} title="جزئیات صندوق" label={`جزئیات ${f.name}`} href={routes.op.fund(f.id)}
        footer={<><button type="button" className="nm-btn ghost" onClick={() => setModal('edit')}><Icon d={IC.pen} size={17} />ویرایش</button>{statusBtn}</>}
      >
        <Who
          lead={<FundTile f={f} size="xl" />}
          title={fundTitle(f)}
          sub={draft ? 'در انتظار مجوز سازمان بورس' : f.description}
          pills={<><Pill tone={kt(st.tone)} dot>{st.label}</Pill><Pill>ETF {CATEGORY_LABEL[f.category]}</Pill></>}
        />
        <KeyStats items={[['NAV (تومان)', f.nav ? money(f.nav) : '—'], ['AUM', f.aum ? `${bn(f.aum)} میلیارد` : '—'], ['دارندگان', f.investors ? money(f.investors) : '—']]} />

        {draft ? (
          <Note tone="mute">انواع قفل مجاز پس از راه‌اندازی: وثیقه، قفل زمانی، مرحله‌ای، مسدودی</Note>
        ) : (
          <>
            <Section title={`روند NAV · ۳۰ روز · ${big ? 'هزار تومان' : 'تومان'}`} action={ch != null && <Pill tone={trendTone(ch)}>{chg(ch)}</Pill>}>
              {hist.length > 1
                ? <NavChart points={hist} height={150} label={`روند NAV ${f.name} در ۳۰ روز`} />
                : <span className="mute" style={{ fontSize: 12.5 }}>تاریخچه NAV برای این صندوق هنوز ثبت نشده است</span>}
            </Section>

            <Section title="دارایی تحت مدیریت" action={<BigNum value={bn(f.aum)} unit="میلیارد تومان" />}>
              <FreeLocked free={free} locked={locked} fmt={bn} unit="میلیارد" />
              {lockRows.length > 0 ? (
                <List>
                  {lockRows.map((r) => (
                    <ListRow key={r.t} lead={<LockTypeChip type={r.t} />} title={LOCK_META[r.t].label} sub={`${money(r.holders)} دارنده`}
                      trail={<span className="num">{bn(r.v)} میلیارد</span>} />
                  ))}
                </List>
              ) : <span className="mute" style={{ fontSize: 12.5 }}>همهٔ واحدهای این صندوق آزاد است</span>}
            </Section>
          </>
        )}

        <Section title="مشخصات">
          <KV rows={[
            ['مدیر صندوق', f.meta?.manager || '—'],
            ['تسویه', <span key="st" className="ltr">{f.settlement}</span>],
            ['کارمزد خرید / فروش', <span key="fee" className="num">{dec(f.feePct, 2)}٪ / {dec(f.meta?.sellFeePct ?? f.feePct, 2)}٪</span>],
            draft ? ['تاریخ راه‌اندازی', 'تعیین‌نشده'] : ['آخرین NAV', <span key="nav" className="num">{dayTime(f.meta?.lastNavAt)}</span>],
          ]} />
        </Section>
      </Inspector>

      {modal === 'edit' && <FundEditDialog f={f} onClose={() => setModal('')} />}
      <Confirm open={modal === 'pause'} onClose={() => setModal('')} danger busy={update.isPending} onConfirm={() => setStatus('paused')}
        title={`غیرفعال‌سازی موقت ${f.name}`} confirmLabel="غیرفعال‌سازی موقت" body={<span className="mute">{PAUSE_BODY}</span>} />
    </>
  );
}

/** Fund identity (name, symbol, type, manager, app description). Same dialog as the fund page. */
