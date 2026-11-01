'use client';
/**
 * Inspector of one order to a fund («صدور» / «ابطال»): details, effect on the fund's free stock, coverage and cash,
 * and — for open orders — «ثبت تسویه» (Confirm) and «لغو سفارش» (Dialog with an optional reason).
 */
import { useState, type ReactNode } from 'react';
import { useCancelOrder, useSettleOrder, type TreasuryOrder, type TreasuryPosition } from '@/api/op-treasury-extra';
import { Dialog, Field, Inspector, KV, KeyStats, Note, Pill, Section, Tile, Who } from '@/components/panel/kit';
import { Icon } from '@/components/ui/Icon';
import { useToast } from '@/components/ui/Toast';
import { errMsg } from '@/components/op/system/fmt';
import { STOCK_STATE, SIDE, TI, amt, daysText, fundUi, orderStatus, unitsText } from '@/components/op/treasury/ui';
import { jDate, jDateTime, money } from '@/lib/format';
import { routes } from '@/lib/routes';

const SOURCE: Record<TreasuryOrder['source'], string> = { manual: 'ثبت دستی', suggestion: 'پیشنهاد خزانه' };
/** «قبل ← بعد» in reading order (RTL). */
const Shift = ({ from, to }: { from: string; to: string }) => (
  <span className="num">{from} <span className="mute" aria-hidden="true">←</span><span className="sr-only"> به </span> {to}</span>
);

export function OrderInspector({ order: o, position: p, onClose }: { order: TreasuryOrder; position?: TreasuryPosition; onClose: () => void }) {
  const toast = useToast();
  const settle = useSettleOrder();
  const cancel = useCancelOrder();
  const [modal, setModal] = useState<'' | 'settle' | 'cancel'>('');
  const [reason, setReason] = useState('');
  const side = SIDE[o.side];
  const st = orderStatus(o);
  const fundName = p?.name ?? o.fundId;
  const short = p?.shortName ?? o.fundId;
  const placed = o.status === 'placed';
  const buy = o.side === 'buy';
  const nav = o.navAtSettle ?? o.navAtOrder;

  // Effect of an open order on the fund (identities of src/api/op-treasury-extra.ts):
  // buy → its value is pending (counted in coverage, not yet in free stock) · redeem → its units are already out of free stock.
  const value = p ? (buy ? o.amount - o.fee : o.units * p.nav) : 0;
  const net = p?.demandPerDay ?? 0;
  const covWithout = p && net > 0 ? Math.max(0, (p.availableValue + p.pendingBuyValue + (buy ? -value : value)) / net) : null;
  const proceedsEst = p ? Math.round(o.units * p.nav - o.fee) : 0;
  const proceeds = Math.round(o.units * nav - o.fee);

  const doSettle = () => settle.mutate({ id: o.id }, {
    onSuccess: (r) => {
      setModal('');
      toast(`سفارش ${r.code} تسویه شد · ${unitsText(r.units)} واحد ${r.side === 'buy' ? 'به موجودی خزانه اضافه شد' : 'ابطال شد'}`);
    },
    onError: (e) => toast(errMsg(e), 'error'),
  });
  const doCancel = () => cancel.mutate({ id: o.id, reason: reason.trim() || undefined }, {
    onSuccess: (r) => { setModal(''); setReason(''); toast(`سفارش ${r.code} لغو شد`); },
    onError: (e) => toast(errMsg(e), 'error'),
  });

  const when: [string, ReactNode][] = [['زمان ثبت', jDateTime(o.placedAt)]];
  if (o.status === 'settled' && o.settledAt) when.push(['زمان تسویه', jDateTime(o.settledAt)]);
  else if (o.status === 'cancelled' && o.cancelledAt) when.push(['زمان لغو', jDateTime(o.cancelledAt)]);
  else when.push(['سررسید تسویه', <>{jDate(o.settleAt)}{p && <span className="mute"> · <span className="ltr">{p.settlement}</span></span>}</>]);

  return (
    <>
      <Inspector
        open onClose={onClose} title="جزئیات سفارش" label={`سفارش ${o.code}`} href={routes.op.fund(o.fundId)} hrefLabel="صفحه صندوق"
        footer={placed ? (
          <>
            <button type="button" className="nm-btn line danger" onClick={() => setModal('cancel')} disabled={cancel.isPending}>لغو سفارش</button>
            <button type="button" className="nm-btn" onClick={() => setModal('settle')} disabled={settle.isPending}><Icon d={TI.check} size={16} strokeWidth={2.2} />ثبت تسویه</button>
          </>
        ) : undefined}
      >
        <Who
          lead={<Tile d={fundUi(o.fundId).d} tone={fundUi(o.fundId).tone} size="lg" />}
          title={`${side.label} ${short}`}
          sub={<><span className="ltr num">{o.code}</span> · {fundName}</>}
          pills={<><Pill tone={st.tone} dot>{st.label}</Pill><Pill tone={side.tone} icon={side.d}>{side.label}</Pill>{o.source === 'suggestion' && <Pill>{SOURCE.suggestion}</Pill>}</>}
        />
        <KeyStats items={[
          ['مبلغ', amt(o.amount)],
          [placed && buy ? 'واحد (تخمینی)' : 'واحد', unitsText(o.units)],
          [o.navAtSettle ? 'NAV تسویه' : 'NAV ثبت', money(nav)],
        ]} />

        {placed && o.dueNow && <Note tone="warn" icon={TI.clock}>سررسید تسویه رسیده است. پس از تأیید صندوق، تسویه را ثبت کنید.</Note>}
        {o.status === 'cancelled' && o.cancelReason && <Note tone="mute">دلیل لغو: {o.cancelReason}</Note>}

        <Section title="جزئیات">
          <KV rows={[
            ['نوع سفارش', side.long],
            ['صندوق', fundName],
            ['مبلغ', <span key="a" className="num">{money(o.amount)} تومان</span>],
            ['کارمزد', <span key="f" className="num">{money(o.fee)} تومان</span>],
            ['تعداد واحد', <span key="u" className="num">{unitsText(o.units)}{placed && buy ? ' (تخمینی تا تسویه)' : ''}</span>],
            ['NAV زمان ثبت', <span key="n" className="num">{money(o.navAtOrder)} تومان</span>],
            ...(o.navAtSettle ? [['NAV تسویه', <span key="ns" className="num">{money(o.navAtSettle)} تومان</span>] as [string, ReactNode]] : []),
            ...when.map(([k, v]) => [k, <span key={k} className="num">{v}</span>] as [string, ReactNode]),
            ['ثبت‌کننده', `${o.by} · ${SOURCE[o.source]}`],
            ...(o.note ? [['یادداشت', o.note] as [string, ReactNode]] : []),
          ]} />
        </Section>

        {placed && p && (
          <Section title="اثر بر موجودی" action={<Pill tone={STOCK_STATE[p.state].tone} dot>{STOCK_STATE[p.state].label}</Pill>}>
            <KV rows={buy ? [
              ['موجودی آزاد صندوق', <Shift key="v" from={amt(p.availableValue)} to={`${amt(p.availableValue + value)} تومان`} />],
              ['پوشش موجودی', <Shift key="c" from={daysText(covWithout)} to={daysText(p.coverageDays)} />],
              ['نقد کنار گذاشته‌شده', <span key="m" className="num">{money(o.amount)} تومان</span>],
            ] : [
              ['واحد کنار گذاشته‌شده', <span key="u" className="num">{unitsText(o.units)} واحد</span>],
              ['موجودی آزاد صندوق', <Shift key="v" from={amt(p.availableValue + value)} to={`${amt(p.availableValue)} تومان`} />],
              ['پوشش موجودی', <Shift key="c" from={daysText(covWithout)} to={daysText(p.coverageDays)} />],
              ['بازگشت نقد پس از تسویه', <span key="m" className="num">حدود {money(proceedsEst)} تومان</span>],
            ]} />
            <span className="mute" style={{ fontSize: 12 }}>
              {buy
                ? 'پوشش با احتساب سفارش‌های باز است؛ موجودی آزاد پس از تسویه افزایش می‌یابد.'
                : 'واحدهای این سفارش از موجودی آزاد کم شده‌اند و پس از تسویه از خزانه خارج می‌شوند.'}
            </span>
          </Section>
        )}

        {o.status === 'settled' && (
          <Section title="اثر تسویه">
            <KV rows={buy ? [
              ['موجودی خزانه', <span key="u" className="num" style={{ color: 'var(--success-text)' }}>+{unitsText(o.units)} واحد</span>],
              ['حساب ریالی', <span key="m" className="num">−{money(o.amount)} تومان</span>],
            ] : [
              ['موجودی خزانه', <span key="u" className="num">−{unitsText(o.units)} واحد</span>],
              ['حساب ریالی', <span key="m" className="num" style={{ color: 'var(--success-text)' }}>+{money(proceeds)} تومان</span>],
            ]} />
          </Section>
        )}
      </Inspector>

      <Dialog
        open={modal === 'settle'} onClose={() => setModal('')} width={480} title={`ثبت تسویه‌ی ${o.code}`}
        sub={`${side.long} · ${fundName}`} icon={<Tile d={TI.check} tone="success" size="lg" />}
        footer={(
          <>
            <button type="button" className="nm-btn ghost" onClick={() => setModal('')}>انصراف</button>
            <button type="button" className="nm-btn" onClick={doSettle} disabled={settle.isPending}>{settle.isPending ? 'در حال ثبت…' : 'ثبت تسویه'}</button>
          </>
        )}
      >
        <KV rows={[
          ['مبلغ', <span key="a" className="num">{money(o.amount)} تومان</span>],
          ['NAV امروز صندوق', <span key="n" className="num">{p ? `${money(p.nav)} تومان` : '—'}</span>],
          buy
            ? ['واحد اضافه‌شده به خزانه', <span key="u" className="num">{p ? unitsText((o.amount - o.fee) / p.nav) : unitsText(o.units)}</span>]
            : ['واریز به حساب ریالی', <span key="u" className="num">حدود {money(proceedsEst || proceeds)} تومان</span>],
        ]} />
        {!o.dueNow && <Note tone="info" icon={TI.clock}>سررسید این سفارش {jDate(o.settleAt)} است. فقط وقتی صندوق تسویه را اعلام کرده ثبت کنید.</Note>}
        <span className="mute" style={{ fontSize: 12.5 }}>تسویه با NAV امروز صندوق ثبت می‌شود و موجودی خزانه و حساب ریالی را به‌روز می‌کند.</span>
      </Dialog>

      <Dialog
        open={modal === 'cancel'} onClose={() => setModal('')} width={480} title={`لغو سفارش ${o.code}`}
        sub={`${side.long} · ${fundName} · ${money(o.amount)} تومان`} icon={<Tile d={TI.alert} tone="error" size="lg" />}
        footer={(
          <>
            <button type="button" className="nm-btn ghost" onClick={() => setModal('')}>انصراف</button>
            <button type="button" className="nm-btn danger" onClick={doCancel} disabled={cancel.isPending}>{cancel.isPending ? 'در حال لغو…' : 'لغو سفارش'}</button>
          </>
        )}
      >
        <Note tone="info">{buy ? 'مبلغ کنار گذاشته‌شده به نقد آزاد برمی‌گردد.' : 'واحدهای کنار گذاشته‌شده به موجودی آزاد صندوق برمی‌گردند.'}</Note>
        <Field label="دلیل لغو" htmlFor={`ord-cancel-${o.id}`} help="اختیاری · در سابقه‌ی سفارش ثبت می‌شود">
          <textarea id={`ord-cancel-${o.id}`} className="nm-ta" rows={3} value={reason} maxLength={200} onChange={(e) => setReason(e.target.value)} placeholder="مثلاً: صندوق سفارش را نپذیرفت" />
        </Field>
      </Dialog>
    </>
  );
}
