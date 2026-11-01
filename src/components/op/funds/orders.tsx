'use client';
/**
 * Orders of one fund (fund page «سفارش‌ها» tab): table columns and the order inspector with «ثبت تسویه» (Confirm) and
 * «لغو سفارش» (Dialog with an optional reason) — only for placed orders.
 */
import { useState } from 'react';
import { useCancelOrder, useSettleOrder, type TreasuryOrder, type TreasuryPosition } from '@/api/op-treasury-extra';
import {
  Confirm, Dialog, Field, Inspector, KV, KeyStats, Note, Pill, Section, Tile, Who, type Column,
} from '@/components/panel/kit';
import { Icon } from '@/components/ui/Icon';
import { useToast } from '@/components/ui/Toast';
import { SIDE, TI, amt, orderStatus, unitsText } from '@/components/op/treasury/ui';
import { dayTime, errMsg } from '@/components/op/system/fmt';
import { jDate, jDateTime, money } from '@/lib/format';
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
  { key: 'placed', label: 'ثبت', width: '120px', col: true, render: (o) => <><span className="num">{dayTime(o.placedAt)}</span><span className="sm el">{o.by}</span></> },
  {
    key: 'settle', label: 'تسویه', width: '104px', render: (o) => <span className="num mute">{o.status === 'settled' && o.settledAt ? jDate(o.settledAt) : o.status === 'cancelled' ? '—' : jDate(o.settleAt)}</span>,
  },
  { key: 'st', label: 'وضعیت', width: '118px', render: (o) => { const s = orderStatus(o); return <Pill tone={s.tone} dot>{s.label}</Pill>; } },
];

export function OrderInspector({ o, p, onClose }: { o: TreasuryOrder; p?: TreasuryPosition; onClose: () => void }) {
  const toast = useToast();
  const settle = useSettleOrder();
  const cancel = useCancelOrder();
  const [modal, setModal] = useState<'' | 'settle' | 'cancel'>('');
  const [reason, setReason] = useState('');
  const side = SIDE[o.side];
  const st = orderStatus(o);
  const open = o.status === 'placed';
  const buy = o.side === 'buy';

  const doSettle = () => settle.mutate({ id: o.id }, {
    onSuccess: (r) => { setModal(''); toast(`سفارش ${r.code} تسویه شد · ${unitsText(r.units)} واحد ${buy ? 'به موجودی اضافه' : 'از موجودی کم'} شد`); },
    onError: (e) => { setModal(''); toast(errMsg(e), 'error'); },
  });
  const doCancel = () => cancel.mutate({ id: o.id, reason: reason.trim() || undefined }, {
    onSuccess: (r) => { setModal(''); setReason(''); toast(`سفارش ${r.code} لغو شد`); },
    onError: (e) => toast(errMsg(e), 'error'),
  });

  const rows: [React.ReactNode, React.ReactNode][] = [
    ['نوع', side.long],
    ['NAV هنگام ثبت', <span key="n" className="num">{money(o.navAtOrder)} تومان</span>],
    ...(o.navAtSettle ? [['NAV تسویه', <span key="ns" className="num">{money(o.navAtSettle)} تومان</span>] as [React.ReactNode, React.ReactNode]] : []),
    ['کارمزد', <span key="f" className="num">{money(o.fee)} تومان</span>],
    ['ثبت', <span key="p" className="num">{jDateTime(o.placedAt)} · {o.by}</span>],
    [o.status === 'settled' ? 'تسویه شد' : 'سررسید تسویه', <span key="s" className="num">{jDateTime(o.settledAt ?? o.settleAt)}</span>],
    ...(o.cancelledAt ? [['لغو', <span key="c" className="num">{jDateTime(o.cancelledAt)}</span>] as [React.ReactNode, React.ReactNode]] : []),
    ['منبع', SOURCE[o.source]],
  ];

  return (
    <>
      <Inspector
        open onClose={onClose} title="جزئیات سفارش" label={`سفارش ${o.code}`}
        href={`${routes.op.orders}?id=${encodeURIComponent(o.code)}`} hrefLabel="در سفارش‌ها"
        footer={open ? (
          <>
            <button type="button" className="nm-btn line danger" onClick={() => setModal('cancel')} disabled={cancel.isPending || settle.isPending}>لغو سفارش</button>
            <button type="button" className="nm-btn" onClick={() => setModal('settle')} disabled={cancel.isPending || settle.isPending}><Icon d={TI.check} size={16} strokeWidth={2} />ثبت تسویه</button>
          </>
        ) : undefined}
      >
        <Who
          lead={<Tile d={side.d} tone={side.tone} size="xl" />}
          title={<span className="num ltr">{o.code}</span>}
          sub={`${side.long}${p ? ` · ${p.name}` : ''}`}
          pills={<><Pill tone={st.tone} dot>{st.label}</Pill>{o.source === 'suggestion' && <Pill tone="primary">پیشنهاد خزانه</Pill>}</>}
        />
        <KeyStats items={[
          ['مبلغ', <span key="a" className="num">{amt(o.amount)}</span>],
          ['واحد', <span key="u" className="num">{unitsText(o.units)}</span>],
          ['تسویه', <span key="s" className="num">{jDate(o.settledAt ?? o.settleAt)}</span>],
        ]} />
        {open && o.dueNow && <Note tone="warn" icon={TI.clock}>موعد تسویه رسیده است. پس از تأیید صندوق، تسویه را ثبت کنید تا موجودی خزانه به‌روز شود.</Note>}
        {open && !o.dueNow && <Note tone="info" icon={TI.clock}>تسویه طبق برنامه در {jDate(o.settleAt)} انجام می‌شود.</Note>}
        {o.status === 'cancelled' && <Note tone="mute">{o.cancelReason ? `دلیل لغو: ${o.cancelReason}` : 'این سفارش بدون ثبت دلیل لغو شد.'}</Note>}
        <Section title="جزئیات"><KV rows={rows} /></Section>
        {o.note && <Section title="یادداشت"><span style={{ fontSize: 13, lineHeight: 1.8 }}>{o.note}</span></Section>}
      </Inspector>

      <Confirm
        open={modal === 'settle'} onClose={() => setModal('')} busy={settle.isPending} onConfirm={doSettle}
        title={`ثبت تسویه‌ی ${o.code}`} confirmLabel="ثبت تسویه"
        body={(
          <span className="mute" style={{ lineHeight: 1.8 }}>
            {buy
              ? `واحدهای این سفارش با NAV روز${p ? ` (${money(p.nav)} تومان)` : ''} به موجودی آزاد خزانه اضافه می‌شود و مبلغ ${money(o.amount)} تومان از حساب ریالی کسر می‌شود.`
              : `${unitsText(o.units)} واحد از موجودی خزانه کم می‌شود و مبلغ ابطال به حساب ریالی واریز می‌شود.`}
            {!o.dueNow && ` سررسید این سفارش ${jDate(o.settleAt)} است.`}
          </span>
        )}
      />
      <Dialog
        open={modal === 'cancel'} onClose={() => setModal('')} width={460} title={`لغو سفارش ${o.code}`}
        sub={`${side.label} ${amt(o.amount)} تومان${buy ? ' · نقد کنار گذاشته‌شده برای این سفارش آزاد می‌شود' : ' · واحدها به موجودی آزاد برمی‌گردد'}`}
        icon={<Tile d={TI.alert} tone="error" size="lg" />}
        footer={(
          <>
            <button type="button" className="nm-btn ghost" onClick={() => setModal('')}>انصراف</button>
            <button type="button" className="nm-btn danger" onClick={doCancel} disabled={cancel.isPending}>{cancel.isPending ? 'در حال لغو…' : 'لغو سفارش'}</button>
          </>
        )}
      >
        <Field label="دلیل لغو" htmlFor="ord-cancel-reason" help="اختیاری؛ در سابقه‌ی سفارش ثبت می‌شود">
          <span className="nm-in" style={{ width: '100%' }}>
            <input id="ord-cancel-reason" type="text" value={reason} onChange={(e) => setReason(e.target.value)} maxLength={140} placeholder="مثلاً: NAV تازه اعلام شد" />
          </span>
        </Field>
      </Dialog>
    </>
  );
}
