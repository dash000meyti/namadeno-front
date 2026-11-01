'use client';
/**
 * Treasury stock pieces shared by /op/funds (list + inspector) and /op/funds/[id] (stock tab):
 * the stock breakdown (held → allocated / reserved / committed / pending redeem → free), coverage against the target band,
 * the suggestion callout, and the stock-movement table + inspector.
 * Wording: «رزرو» (never «قفل»), «صدور» = buying units from a fund, «ابطال» = redeeming them.
 */
import Link from 'next/link';
import type { ReactNode } from 'react';
import { useOpOrganizations } from '@/api/op';
import type { StockMovement, TreasuryPosition } from '@/api/op-treasury-extra';
import {
  Allocation, Inspector, KV, KeyStats, Meter, Note, Pill, Section, Tile, Who, type Column,
} from '@/components/panel/kit';
import { ACTOR, MOVE_KIND, SIDE, STOCK_STATE, TI, amt, daysText, fundUi, unitsText } from '@/components/op/treasury/ui';
import { dayTime, dec } from '@/components/op/system/fmt';
import { faDigits, jDateTime } from '@/lib/format';
import { routes } from '@/lib/routes';

/** Funds Namadno builds its packages on — listed first and marked «اصلی». */
export const CORE_FUNDS = ['gold', 'fixed'];

/** Billions with a real minus sign: «۲۳۹٫۵», «−۱٫۲»; two decimals under one billion («۰٫۰۳»). */
export function sbn(n: number): string {
  const a = Math.abs(n);
  return (n < 0 ? '−' : '') + dec(a / 1e9, a < 1e9 ? 2 : 1);
}
/** Same, or a quiet dash for (almost) zero. */
export const bnOr = (n: number): ReactNode => (Math.abs(n) >= 1e6 ? sbn(n) : <span style={{ color: 'var(--text-disabled)' }}>—</span>);
/** Compact Toman with a real minus sign. */
export const samt = (n: number) => (n < 0 ? '−' : '') + amt(Math.abs(n));

/** Lower edge of the target band: max(minFreeValue, net daily demand × targetDays) — same rule as the treasury engine. */
/** Lower edge of the target band (from the API; 0 without a target). */
export function minTargetOf(p: Pick<TreasuryPosition, 'minTargetValue'>): number {
  return p.minTargetValue ?? 0;
}

/** Gold and fixed income first, then by held value; inactive funds last. */
export function sortPositions<T extends TreasuryPosition>(list: T[]): T[] {
  const rank = (p: T) => (p.state === 'inactive' ? 2 : CORE_FUNDS.includes(p.fundId) ? 0 : 1);
  return [...list].sort((a, b) => rank(a) - rank(b) || CORE_FUNDS.indexOf(a.fundId) - CORE_FUNDS.indexOf(b.fundId) || b.heldValue - a.heldValue);
}

export function FundTile({ fundId, inactive, size }: { fundId: string; inactive?: boolean; size?: 'sm' | 'md' | 'lg' | 'xl' }) {
  const u = fundUi(fundId);
  return <Tile d={u.d} tone={inactive ? 'neutral' : u.tone} size={size} />;
}

export function StatePill({ p }: { p: Pick<TreasuryPosition, 'state'> }) {
  const s = STOCK_STATE[p.state];
  return <Pill tone={s.tone} dot title={s.hint}>{s.label}</Pill>;
}

const COL = {
  holding: 'var(--chart-1)',
  reserved: 'var(--chart-4)',
  committed: 'var(--warning-main)',
  redeem: 'var(--info-main)',
  queue: 'var(--error-main)',
  free: 'var(--chart-2)',
};

/** Value cell of the waterfall: amount on top, units underneath. */
function Amt({ v, u, strong, tone }: { v: number; u: number; strong?: boolean; tone?: string }) {
  if (!v && !u) return <span style={{ color: 'var(--text-disabled)' }}>—</span>;
  return (
    <span style={{ display: 'inline-flex', flexDirection: 'column', alignItems: 'flex-end', lineHeight: 1.35 }}>
      <span className="num" style={{ fontWeight: strong ? 600 : 500, color: tone }}>{amt(v)} تومان</span>
      <small className="num mute" style={{ fontSize: 11.5, fontWeight: 400 }}>{unitsText(u)} واحد</small>
    </span>
  );
}

/** Waterfall label with its operator (−, +, =) in front, read right to left. */
export function OpLabel({ op, children, sub, strong }: { op?: '−' | '+' | '='; children: ReactNode; sub?: ReactNode; strong?: boolean }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'flex-start', gap: 6 }}>
      <span className="mute num" aria-hidden={op ? undefined : true} style={{ width: 10, textAlign: 'center', flex: 'none' }}>{op ?? ''}</span>
      <span style={{ display: 'flex', flexDirection: 'column' }}>
        <span style={strong ? { color: 'var(--text-primary)', fontWeight: 600 } : undefined}>{children}</span>
        {sub != null && <small className="mute" style={{ fontSize: 11.5 }}>{sub}</small>}
      </span>
    </span>
  );
}

/**
 * Where the held units are: one bar of shares + the waterfall held − allocated − committed − pending redeem = free.
 * `reserved` is part of `allocated` (users own it; it is set aside for savings, collateral, milestones …).
 * Nothing goes negative: what the free stock cannot cover waits in the queue («در صف تأمین»), so the waterfall ends with
 * «آزاد پس از صف» — or «نیاز به خرید» when the queue is larger than the free stock.
 */
export function PositionBreakdown({ p }: { p: TreasuryPosition }) {
  const free = Math.max(0, p.availableValue);
  const queued = p.queuedValue ?? 0;
  const inQueue = Math.min(queued, free);
  const need = p.needBuyValue ?? 0;
  const u = (v: number) => (p.nav ? v / p.nav : 0);
  const items = [
    { label: 'در اختیار کاربران', value: p.allocatedValue - p.reservedValue, color: COL.holding },
    { label: 'رزرو', value: p.reservedValue, color: COL.reserved },
    { label: 'تعهد بسته‌ها', value: p.committedValue, color: COL.committed },
    ...(p.pendingRedeemValue > 0 ? [{ label: 'در انتظار ابطال', value: p.pendingRedeemValue, color: COL.redeem }] : []),
    ...(inQueue > 0 ? [{ label: 'در صف تأمین', value: inQueue, color: COL.queue }] : []),
    ...(queued > 0 && free - inQueue <= 0 ? [] : [{ label: queued > 0 ? 'آزاد پس از صف' : 'آزاد', value: free - inQueue, color: COL.free }]),
  ];
  const row = (k: string, label: ReactNode, v: ReactNode): [ReactNode, ReactNode] => [<span key={k}>{label}</span>, v];
  return (
    <div className="nm-stack" style={{ gap: 14 }}>
      <Allocation compact items={items} />
      <KV rows={[
        [<OpLabel key="h" strong>موجودی خزانه</OpLabel>, <Amt key="h" v={p.heldValue} u={p.heldUnits} strong />],
        [<OpLabel key="a" op="−" sub={`شامل رزرو ${samt(p.reservedValue)}`}>تخصیص به کاربران</OpLabel>, <Amt key="a" v={p.allocatedValue} u={p.allocatedUnits} />],
        [<OpLabel key="c" op="−">تعهد بسته‌های ارسالی</OpLabel>, <Amt key="c" v={p.committedValue} u={p.committedUnits} />],
        ...(p.pendingRedeemUnits > 0 ? [[<OpLabel key="r" op="−">در انتظار ابطال</OpLabel>, <Amt key="r" v={p.pendingRedeemValue} u={p.pendingRedeemUnits} />] as [ReactNode, ReactNode]] : []),
        [<OpLabel key="f" op="=" strong>موجودی آزاد</OpLabel>, <Amt key="f" v={free} u={Math.max(0, p.availableUnits)} strong />],
        ...(queued > 0 ? [
          row('q', <OpLabel op="−" sub={`${faDigits(p.queuedCount)} مورد منتظر موجودی`}>در صف تأمین</OpLabel>, <Amt key="q" v={queued} u={u(queued)} />),
          need > 0
            ? row('n', <OpLabel op="=" strong sub="با تسویه‌ی صدور، صف خودکار تحویل می‌شود"><span style={{ color: 'var(--error-text)' }}>نیاز به خرید</span></OpLabel>, <Amt key="n" v={need} u={u(need)} strong tone="var(--error-text)" />)
            : row('n', <OpLabel op="=" strong>آزاد پس از صف</OpLabel>, <Amt key="n" v={free - queued} u={u(free - queued)} strong />),
        ] : []),
        ...(p.pendingBuyUnits > 0 ? [[<OpLabel key="b" op="+">صدور در راه</OpLabel>, <Amt key="b" v={p.pendingBuyValue} u={p.pendingBuyUnits} />] as [ReactNode, ReactNode]] : []),
      ]} />
    </div>
  );
}

/** Coverage days against the target band (min free value / target days / max free value) and the net daily drain. */
export function CoverageBlock({ p, minTarget = minTargetOf(p) }: { p: TreasuryPosition; minTarget?: number }) {
  const t = p.target;
  const s = STOCK_STATE[p.state];
  const ratio = t && p.coverageDays != null ? p.coverageDays / t.targetDays : p.coverageDays == null ? 1 : 0;
  return (
    <div className="nm-stack" style={{ gap: 12 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
        <span className="nm-big"><span className="num">{daysText(p.coverageDays)}</span></span>
        {t && <span className="mute" style={{ fontSize: 12.5 }}>هدف <span className="num">{faDigits(t.targetDays)}</span> روز</span>}
        <span style={{ marginRight: 'auto' }}><StatePill p={p} /></span>
      </div>
      {t && <Meter value={ratio} tone={s.tone === 'neutral' ? 'primary' : s.tone} label={`پوشش ${daysText(p.coverageDays)} از هدف ${faDigits(t.targetDays)} روز`} />}
      <KV rows={[
        ['حداقل موجودی آزاد', t ? <span key="m" className="num">{samt(minTarget)} تومان</span> : <span key="m" className="mute">بدون هدف</span>],
        ['سقف موجودی آزاد', t?.maxFreeValue ? <span key="x" className="num">{samt(t.maxFreeValue)} تومان</span> : <span key="x" className="mute">تعیین نشده</span>],
        ['مصرف خالص روزانه', p.demandPerDay > 0
          ? <span key="d" className="num">{samt(p.demandPerDay)} تومان</span>
          : <span key="d" className="mute">موجودی رشد می‌کند{p.demandPerDay < 0 ? ` (${samt(-p.demandPerDay)} در روز)` : ''}</span>],
      ]} />
      {p.state !== 'inactive' && <span className="mute" style={{ fontSize: 12 }}>{s.hint}. پوشش با احتساب صدورهای در راه است.</span>}
    </div>
  );
}

/** The engine's suggestion for a fund (now, or for a forecast horizon) with «ثبت سفارش پیشنهادی». */
export function SuggestionNote({ suggestion, onOrder, when, stack }: {
  suggestion: NonNullable<TreasuryPosition['suggestion']>; onOrder?: () => void; when?: string;
  /** Button under the text (narrow places like the inspector) instead of beside it. */
  stack?: boolean;
}) {
  const side = SIDE[suggestion.side];
  const btn = onOrder && <button type="button" className="nm-btn sm" onClick={onOrder}>ثبت سفارش پیشنهادی</button>;
  return (
    <Note tone={suggestion.side === 'buy' ? 'warn' : 'info'} icon={side.d} action={stack ? undefined : btn}>
      <b style={{ fontWeight: 600 }}>پیشنهاد{when ? ` ${when}` : ''}: {side.label} <span className="num">{amt(suggestion.amount)}</span> تومان</b>
      <span style={{ display: 'block' }}>{suggestion.reason}</span>
      {stack && btn && <span style={{ display: 'block', marginTop: 10 }}>{btn}</span>}
    </Note>
  );
}

// ───────────────────────── movements ─────────────────────────

const MOVE_ACTOR: Record<StockMovement['kind'], keyof typeof ACTOR> = {
  buy_settle: 'operator', redeem_settle: 'operator', allocate: 'org', user_buy: 'user', user_sell: 'user', reclaim: 'org', adjust: 'system',
};

/** Who moved the stock: the named user/organization when known, else the actor group. */
export function moveActor(m: StockMovement, orgName?: (id: string) => string | undefined): string {
  if (m.userName) return m.userName;
  if (m.orgId) return orgName?.(m.orgId) ?? ACTOR.org.one;
  return ACTOR[MOVE_ACTOR[m.kind]].label;
}

/** Organization id → name (organizations list is cached by the shell's ⌘K). */
export function useOrgNames() {
  const orgs = useOpOrganizations();
  return (id: string) => orgs.data?.find((o) => o.id === id)?.name;
}

/** Signed units, green when stock comes back to the free part. */
function SignedUnits({ u }: { u: number }) {
  return <span className="num" style={{ color: u > 0 ? 'var(--success-text)' : undefined, fontWeight: 500 }}>{u > 0 ? '+' : ''}{unitsText(u)}</span>;
}

export function movementColumns(opts: { fundName?: (id: string) => string; orgName?: (id: string) => string | undefined; showFund?: boolean }): Column<StockMovement>[] {
  const cols: Column<StockMovement>[] = [
    { key: 'kind', label: 'نوع', width: '118px', render: (m) => <Pill tone={MOVE_KIND[m.kind].tone}>{MOVE_KIND[m.kind].label}</Pill> },
  ];
  if (opts.showFund) {
    cols.push({ key: 'fund', label: 'صندوق', width: '112px', render: (m) => <span className="nm-ident"><FundTile fundId={m.fundId} size="sm" /><span className="el">{opts.fundName?.(m.fundId) ?? m.fundId}</span></span> });
  }
  cols.push(
    { key: 'title', label: 'شرح', width: 'minmax(0, 1.6fr)', col: true, render: (m) => <><span className="el" style={{ maxWidth: '100%' }}>{m.title}</span><span className="sm el" style={{ maxWidth: '100%' }}>{moveActor(m, opts.orgName)}</span></> },
    { key: 'units', label: 'واحد', width: '96px', align: 'end', render: (m) => <SignedUnits u={m.units} /> },
    { key: 'value', label: 'ارزش (تومان)', width: '104px', align: 'end', render: (m) => <span className="num">{amt(m.value)}</span> },
    { key: 'at', label: 'زمان', width: '96px', render: (m) => <span className="num mute">{dayTime(m.at)}</span> },
  );
  return cols;
}

export function MovementInspector({ m, fundName, orgName, onClose }: { m: StockMovement; fundName: string; orgName?: (id: string) => string | undefined; onClose: () => void }) {
  const k = MOVE_KIND[m.kind];
  const into = m.units > 0;
  const link = (href: string, label: string) => <Link key={href} href={href} className="nm-more">{label}</Link>;
  const rows: [ReactNode, ReactNode][] = [
    ['زمان', <span key="t" className="num">{jDateTime(m.at)}</span>],
    ['صندوق', link(routes.op.fund(m.fundId), fundName)],
    ['انجام‌دهنده', moveActor(m, orgName)],
  ];
  if (m.userId) rows.push(['کاربر', link(routes.op.user(m.userId), m.userName ?? 'پروفایل کاربر')]);
  if (m.orgId) rows.push(['سازمان', link(routes.op.organization(m.orgId), orgName?.(m.orgId) ?? 'صفحه‌ی سازمان')]);
  if (m.orderId) rows.push(['سفارش', link(`${routes.op.orders}?id=${encodeURIComponent(m.orderId)}`, m.orderId)]);
  if (m.packageId) rows.push(['بسته', <span key="p" className="num ltr">{m.packageId}</span>]);
  return (
    <Inspector open onClose={onClose} title="جابه‌جایی موجودی" label={`جابه‌جایی ${m.title}`}>
      <Who lead={<FundTile fundId={m.fundId} size="xl" />} title={m.title} sub={fundName} pills={<Pill tone={k.tone}>{k.label}</Pill>} />
      <KeyStats items={[
        ['واحد', <SignedUnits key="u" u={m.units} />],
        ['ارزش', <span key="v" className="num">{amt(m.value)} تومان</span>],
      ]} />
      <Note tone={into ? 'ok' : 'mute'} icon={TI.stock}>
        {into ? 'این واحدها به موجودی آزاد خزانه برگشت.' : m.kind === 'redeem_settle' ? 'این واحدها با ابطال از خزانه خارج شد.' : 'این واحدها از موجودی آزاد خزانه برداشته شد.'}
      </Note>
      <Section title="جزئیات"><KV rows={rows} /></Section>
    </Inspector>
  );
}
