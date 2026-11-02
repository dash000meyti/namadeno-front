'use client';
/**
 * Inspector of one order to a fund («صدور» / «ابطال»). Cash-first: an order is recorded only when it is done — paid,
 * and its units in (or out of) Namadno's stock at once — so there is nothing left to do here: when it was recorded,
 * units, NAV, fee, the cash paid or received, the effect on the fund's stock and who recorded it.
 * Used by /op/orders (link to the fund page) and the fund page's «سفارش‌ها» tab (link to /op/orders).
 */
import type { ReactNode } from 'react';
import type { TreasuryOrder, TreasuryPosition } from '@/api/op-treasury-extra';
import { Inspector, KV, KeyStats, Note, Pill, Section, Tile, Who } from '@/components/panel/kit';
import { SIDE, STOCK_STATE, TI, amt, fundUi, orderAt, orderStatus, unitsText } from '@/components/op/treasury/ui';
import { jDateTime, money } from '@/lib/format';
import { routes } from '@/lib/routes';

const SOURCE: Record<TreasuryOrder['source'], string> = { manual: 'ثبت دستی', suggestion: 'پیشنهاد خزانه' };

export function OrderInspector({ order: o, position: p, onClose, href, hrefLabel }: {
  order: TreasuryOrder; position?: TreasuryPosition; onClose: () => void;
  /** Header link; defaults to the fund page. */
  href?: string; hrefLabel?: string;
}) {
  const side = SIDE[o.side];
  const st = orderStatus(o);
  const fundName = p?.name ?? o.fundId;
  const short = p?.shortName ?? o.fundId;
  const buy = o.side === 'buy';
  const done = o.status !== 'cancelled';
  const nav = o.navAtSettle ?? o.navAtOrder;
  const at = orderAt(o);
  // buy: the amount (fee included) is paid from Namadno's free rial · redeem: the redeemed value less the fee comes back
  const cash = buy ? o.amount : Math.max(0, Math.round(o.units * nav - o.fee));
  const unitsValue = buy ? o.amount - o.fee : o.amount;
  const plus = { color: 'var(--success-text)' };

  return (
    <Inspector
      open onClose={onClose} title="جزئیات سفارش" label={`سفارش ${o.code}`}
      href={href ?? routes.op.fund(o.fundId)} hrefLabel={hrefLabel ?? 'صفحه‌ی صندوق'}
    >
      <Who
        lead={<Tile d={fundUi(o.fundId).d} tone={fundUi(o.fundId).tone} size="lg" />}
        title={`${side.label} ${short}`}
        sub={<><span className="ltr num">{o.code}</span> · {fundName}</>}
        pills={<><Pill tone={st.tone} dot>{st.label}</Pill><Pill tone={side.tone} icon={side.d}>{side.label}</Pill>{o.source === 'suggestion' && <Pill>{SOURCE.suggestion}</Pill>}</>}
      />
      <KeyStats items={[
        ['مبلغ', amt(o.amount)],
        ['واحد', unitsText(o.units)],
        ['NAV', money(nav)],
      ]} />

      {done ? (
        <Note tone="ok" icon={TI.check}>
          <b style={{ fontWeight: 600 }}>ثبت‌شده در <span className="num">{jDateTime(at)}</span></b>
          <span style={{ display: 'block' }}>
            {buy
              ? 'مبلغ همان لحظه پرداخت شد و واحدها به موجودی خزانه اضافه شد.'
              : 'واحدها همان لحظه از موجودی خزانه کم و مبلغ به ریال آزاد نمادنو اضافه شد.'}
          </span>
        </Note>
      ) : <Note tone="mute">{o.cancelReason ? `این سفارش لغو شد · ${o.cancelReason}` : 'این سفارش لغو شد.'}</Note>}

      <Section title="جزئیات">
        <KV rows={[
          ['نوع سفارش', side.long],
          ['صندوق', fundName],
          ['مبلغ', <span key="a" className="num">{money(o.amount)} تومان</span>],
          ['تعداد واحد', <span key="u" className="num">{unitsText(o.units)}</span>],
          ['NAV هر واحد', <span key="n" className="num">{money(nav)} تومان</span>],
          ['کارمزد', <span key="f" className="num">{money(o.fee)} تومان</span>],
          [buy ? 'پرداخت از ریال آزاد نمادنو' : 'واریز به ریال آزاد نمادنو', <span key="c" className="num">{money(cash)} تومان</span>],
          ['زمان ثبت', <span key="t" className="num">{jDateTime(at)}</span>],
          ['توسط', `${o.by} · ${SOURCE[o.source]}`],
          ...(o.note ? [['یادداشت', o.note] as [string, ReactNode]] : []),
        ]} />
      </Section>

      {done && (
        <Section title="اثر بر موجودی" action={p && <Pill tone={STOCK_STATE[p.state].tone} dot>{STOCK_STATE[p.state].label}</Pill>}>
          <KV rows={[
            ['موجودی خزانه', <span key="u" className="num" style={buy ? plus : undefined}>{buy ? '+' : '−'}{unitsText(o.units)} واحد</span>],
            ['موجودی آزاد صندوق', <span key="v" className="num" style={buy ? plus : undefined}>{buy ? '+' : '−'}{amt(unitsValue)} تومان</span>],
            ['ریال آزاد نمادنو', <span key="m" className="num" style={buy ? undefined : plus}>{buy ? '−' : '+'}{amt(cash)} تومان</span>],
            ...(p ? [['موجودی آزاد اکنون', <span key="n" className="num">{amt(Math.max(0, p.availableValue))} تومان</span>] as [string, ReactNode]] : []),
          ]} />
          {buy && <span className="mute" style={{ fontSize: 12 }}>اگر موردی در صف تأمین این صندوق بود، با همین ثبت به ترتیب و خودکار تحویل شد.</span>}
        </Section>
      )}
    </Inspector>
  );
}
