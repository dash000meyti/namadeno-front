'use client';
/**
 * Orders of one fund (fund page «سفارش‌ها» tab): table columns and the order inspector (the shared one, linking to
 * /op/orders). Cash-first: every order is recorded when it is done, so the list is a ledger — nothing to settle or cancel.
 */
import type { TreasuryOrder, TreasuryPosition } from '@/api/op-treasury-extra';
import { Tile, type Column } from '@/components/panel/kit';
import { OrderInspector as SharedInspector } from '@/components/op/orders/OrderInspector';
import { SIDE, amt, orderAt, unitsText } from '@/components/op/treasury/ui';
import { dayTime } from '@/components/op/system/fmt';
import { money } from '@/lib/format';
import { routes } from '@/lib/routes';

const SOURCE: Record<TreasuryOrder['source'], string> = { manual: 'ثبت دستی', suggestion: 'پیشنهاد خزانه' };

export const orderColumns: Column<TreasuryOrder>[] = [
  {
    key: 'code', label: 'سفارش', width: 'minmax(0, 1.2fr)', render: (o) => (
      <span className="nm-ident">
        <Tile d={SIDE[o.side].d} tone={SIDE[o.side].tone} size="sm" />
        <span className="nm-col"><b className="num ltr" style={{ textAlign: 'right' }}>{o.code}</b><small>{SIDE[o.side].label} · {SOURCE[o.source]}</small></span>
      </span>
    ),
  },
  { key: 'amount', label: 'مبلغ (تومان)', width: '120px', align: 'end', render: (o) => <span className="num" style={{ fontWeight: 600 }}>{amt(o.amount)}</span> },
  { key: 'units', label: 'واحد', width: '96px', align: 'end', render: (o) => <span className="num">{unitsText(o.units)}</span> },
  { key: 'nav', label: 'NAV', width: '96px', align: 'end', render: (o) => <span className="num mute">{money(o.navAtSettle ?? o.navAtOrder)}</span> },
  { key: 'fee', label: 'کارمزد', width: '92px', align: 'end', render: (o) => <span className="num mute">{amt(o.fee)}</span> },
  { key: 'at', label: 'ثبت', width: '124px', col: true, render: (o) => <><span className="num">{dayTime(orderAt(o))}</span><span className="sm el">{o.by}</span></> },
];

export function OrderInspector({ o, p, onClose }: { o: TreasuryOrder; p?: TreasuryPosition; onClose: () => void }) {
  return (
    <SharedInspector order={o} position={p} onClose={onClose}
      href={`${routes.op.orders}?id=${encodeURIComponent(o.code)}`} hrefLabel="در سفارش‌ها" />
  );
}
