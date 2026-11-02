'use client';
/**
 * «صف تأمین» pieces shared by /op/funds (the «نیاز به خرید» card and its inspector, the rial inspector) and
 * /op/funds/[id] (stock tab). Nothing goes negative: what a fund's stock — or Namadno's free rial — cannot cover waits
 * in the queue and is fulfilled automatically, oldest first, as soon as it is covered (a «صدور» is recorded — orders are
 * done at once — or rial is raised by a «ابطال»). Every item is promised by `eta` (fund settlement + one working day).
 * Data: GET /op/treasury/queue.
 */
import Link from 'next/link';
import type { ReactNode } from 'react';
import { useStockQueue, type OrderSide, type QueueItem, type TreasuryPosition } from '@/api/op-treasury-extra';
import {
  Card, Empty, Inspector, KV, KeyStats, List, ListRow, Note, Pill, Section, Table, TableFoot, Tile, Who, usePaging, type Column,
} from '@/components/panel/kit';
import { ACTOR, QUEUE_KIND, RIAL_UI, TI, amt } from '@/components/op/treasury/ui';
import { dayTime } from '@/components/op/system/fmt';
import { faDigits, jDateTime, jDayMonth } from '@/lib/format';
import { now } from '@/lib/clock';
import { routes } from '@/lib/routes';

/** An order to prefill in the shared OrderDialog. */
export interface OrderAsk { fundId?: string; side?: OrderSide; amount?: number; source?: 'manual' | 'suggestion'; reason?: string }

/** «ثبت صدور» for a fund in need: the engine's suggestion (clears the queue and reaches the minimum target), else a manual buy. */
export function buyAsk(p: TreasuryPosition): OrderAsk {
  const s = p.suggestion;
  return s?.side === 'buy'
    ? { fundId: p.fundId, side: 'buy', amount: s.amount, source: 'suggestion', reason: s.reason }
    : { fundId: p.fundId, side: 'buy', source: 'manual' };
}

/** Who an item waits for: the organization (packages) or the user; aggregated orders get their count. */
export function queueWho(i: QueueItem): string {
  const who = i.kind === 'package' ? i.orgName ?? ACTOR.org.one : [i.userName ?? ACTOR.user.one, i.kind === 'accept' ? i.orgName : undefined].filter(Boolean).join(' · ');
  return i.count && i.count > 1 ? `${who} · ${faDigits(i.count)} سفارش` : who;
}

const QUEUE_NOTE: Record<QueueItem['kind'], string> = {
  package: 'بسته پرداخت شده و هنوز به همکاران نرسیده است؛ با رسیدن موجودی این صندوق خودکار ارسال می‌شود.',
  buy: 'مبلغ از کیف پول کاربر پرداخت شده است؛ واحدها با رسیدن موجودی خودکار به حساب او می‌رسد.',
  accept: 'گیرنده بسته را پذیرفته است؛ سهم این صندوق با رسیدن موجودی خودکار به حساب او می‌رسد.',
  sell: 'کاربر واحدهایش را به نمادنو فروخته است؛ مبلغ با تأمین ریال آزاد نمادنو خودکار به کیف پول او واریز می‌شود.',
};

/** The promised time; past promises in the error colour. */
export function QueueEta({ at }: { at?: string }) {
  if (!at) return <span style={{ color: 'var(--text-disabled)' }}>—</span>;
  const late = Date.parse(at) < now().getTime();
  return <span className="num" style={late ? { color: 'var(--error-text)' } : undefined} title={late ? 'موعد تحویل گذشته است' : undefined}>{jDateTime(at)}</span>;
}

/** Earliest promise among the items (for a fund, or 'rial'). */
export const earliestEta = (items: QueueItem[] | undefined, fundId: string) =>
  (items ?? []).filter((i) => i.fundId === fundId).reduce<string | undefined>((a, i) => (!a || i.eta < a ? i.eta : a), undefined);

export function queueColumns(): Column<QueueItem>[] {
  return [
    { key: 'kind', label: 'نوع', width: '150px', render: (i) => <Pill tone={QUEUE_KIND[i.kind].tone}>{QUEUE_KIND[i.kind].label}</Pill> },
    {
      key: 'title', label: 'شرح', width: 'minmax(0, 1.6fr)', col: true,
      render: (i) => <><span className="el" style={{ maxWidth: '100%' }}>{i.title}</span><span className="sm el" style={{ maxWidth: '100%' }}>{queueWho(i)}</span></>,
    },
    { key: 'value', label: 'مبلغ (تومان)', width: '104px', align: 'end', render: (i) => <span className="num">{amt(i.value)}</span> },
    { key: 'at', label: 'ثبت', width: '96px', render: (i) => <span className="num mute">{dayTime(i.at)}</span> },
    { key: 'eta', label: 'تحویل تا', width: '124px', render: (i) => <QueueEta at={i.eta} /> },
  ];
}

const itemHref = (i: QueueItem) => (i.kind === 'package' && i.orgId ? routes.op.organization(i.orgId) : i.userId ? routes.op.user(i.userId) : undefined);

/** Compact list of waiting items (inspectors), oldest first. */
export function QueueList({ items, loading, empty = 'موردی در صف نیست' }: { items?: QueueItem[]; loading?: boolean; empty?: string }) {
  if (loading) return <span className="mute" style={{ fontSize: 12.5 }}>در حال بارگذاری…</span>;
  if (!items?.length) return <span className="mute" style={{ fontSize: 12.5 }}>{empty}</span>;
  return (
    <List>
      {items.map((i) => {
        const k = QUEUE_KIND[i.kind];
        return (
          <ListRow key={i.id} href={itemHref(i)}
            label={`${k.label}: ${i.title}، ${amt(i.value)} تومان، تحویل تا ${jDateTime(i.eta)}`}
            lead={<Tile d={k.d} tone={k.tone} size="sm" />}
            title={i.title}
            sub={<>{queueWho(i)} · تا <QueueEta at={i.eta} /></>}
            trail={<span className="num">{amt(i.value)}</span>}
          />
        );
      })}
    </List>
  );
}

/** What a fund in need must buy, by when, and «ثبت صدور» (prefilled with the suggestion). */
export function NeedNote({ p, onOrder, stack }: {
  p: TreasuryPosition; onOrder?: (o: OrderAsk) => void;
  /** Button under the text (narrow places like the inspector) instead of beside it. */
  stack?: boolean;
}) {
  const need = p.needBuyValue;
  if (need <= 0) {
    return <Note tone="info" icon={TI.clock}>موجودی آزاد صف را پوشش می‌دهد؛ موارد به ترتیب و خودکار تحویل می‌شوند.</Note>;
  }
  const s = p.suggestion?.side === 'buy' ? p.suggestion : undefined;
  const btn = onOrder && <button type="button" className="nm-btn sm" onClick={() => onOrder(buyAsk(p))}>ثبت صدور</button>;
  return (
    <Note tone="err" icon={TI.alert} action={stack ? undefined : btn}>
      <b style={{ fontWeight: 600 }}>نیاز به خرید <span className="num">{amt(need)}</span> تومان{p.needBy ? <> · تحویل تا <QueueEta at={p.needBy} /></> : null}</b>
      <span style={{ display: 'block' }}>
        {faDigits(p.queuedCount)} مورد منتظر موجودی این صندوق است.
        {s ? ` صدور پیشنهادی ${amt(s.amount)} تومان صف را تأمین می‌کند${s.amount > need ? ' و موجودی را به حداقل هدف می‌رساند' : ''}.` : ''}
        {' '}با ثبت صدور، موارد همان لحظه به ترتیب و خودکار تحویل می‌شوند.
      </span>
      {stack && btn && <span style={{ display: 'block', marginTop: 10 }}>{btn}</span>}
    </Note>
  );
}

/** «صف تأمین» of one fund (fund page, stock tab): the need, then the waiting items; row → QueueItemInspector. */
export function QueueCard({ p, onOrder, selectedId, onSelect }: {
  p: TreasuryPosition; onOrder?: (o: OrderAsk) => void; selectedId: string | null; onSelect: (i: QueueItem | null) => void;
}) {
  const q = useStockQueue(p.fundId);
  const items = q.data ?? [];
  const pg = usePaging(items, 8);
  return (
    <Card flush title="صف تأمین" count={items.length || p.queuedCount || undefined}
      sub={`${amt(p.queuedValue)} تومان در انتظار موجودی این صندوق`}
      actions={p.needBuyValue > 0 ? <Pill tone="error" dot>نیاز به خرید</Pill> : undefined}>
      <div className="nm-card-b" style={{ paddingTop: 4 }}><NeedNote p={p} onOrder={onOrder} /></div>
      <Table
        columns={queueColumns()} rows={pg.rows} rowKey={(i) => i.id} rowLabel={(i) => i.title}
        onRowClick={(i) => onSelect(selectedId === i.id ? null : i)} selectedKey={selectedId}
        loading={q.isLoading} error={q.isError ? q.error : undefined} onRetry={() => q.refetch()}
        empty={<Empty icon={TI.check} tone="success" title="موردی در صف این صندوق نیست" />}
        minWidth={680}
      />
      <TableFoot shown={pg.rows.length} total={items.length} unit="مورد" page={pg.page} pages={pg.pages} onPage={pg.setPage}>
        <span className="mute">به ترتیب ثبت تحویل می‌شود · موعد = تسویه‌ی صندوق + یک روز کاری</span>
      </TableFoot>
    </Card>
  );
}

/** One waiting item. */
export function QueueItemInspector({ i, fundName, onClose }: { i: QueueItem; fundName?: string; onClose: () => void }) {
  const k = QUEUE_KIND[i.kind];
  const link = (href: string, label: string) => <Link key={href} href={href} className="nm-more">{label}</Link>;
  const rows: [ReactNode, ReactNode][] = [
    ['نوع', k.label],
    i.fundId === 'rial' ? ['منتظر', RIAL_UI.rial.name + ' آزاد نمادنو'] : ['صندوق', link(routes.op.fund(i.fundId), fundName ?? i.fundId)],
    ['ثبت در صف', <span key="a" className="num">{jDateTime(i.at)}</span>],
    ['تحویل تا', <QueueEta key="e" at={i.eta} />],
  ];
  if (i.orgId) rows.push(['سازمان', link(routes.op.organization(i.orgId), i.orgName ?? 'صفحه‌ی سازمان')]);
  if (i.userId) rows.push(['کاربر', link(routes.op.user(i.userId), i.userName ?? 'پروفایل کاربر')]);
  if (i.count && i.count > 1) rows.push(['سفارش‌ها', <span key="c" className="num">{faDigits(i.count)} سفارش</span>]);
  return (
    <Inspector open onClose={onClose} title="مورد در صف تأمین" label={`صف تأمین: ${i.title}`}>
      <Who lead={<Tile d={k.d} tone={k.tone} size="xl" />} title={i.title} sub={queueWho(i)} pills={<Pill tone={k.tone}>{k.label}</Pill>} />
      <KeyStats items={[
        ['مبلغ', <span key="v" className="num">{amt(i.value)} تومان</span>],
        ['تحویل تا', <span key="e" className="num">{jDayMonth(i.eta)}</span>],
      ]} />
      <Note tone="mute" icon={TI.clock}>{QUEUE_NOTE[i.kind]} موارد صف به ترتیب ثبت تحویل می‌شوند.</Note>
      <Section title="جزئیات"><KV rows={rows} /></Section>
    </Inspector>
  );
}
