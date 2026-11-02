'use client';
/**
 * «ثبت صدور» / «ثبت ابطال» — one dialog for every place that orders units from a fund (stock page, fund detail, orders
 * page, suggestions, the command center's action queue). Cash-first: the order is recorded only when it is done — at
 * «ثبت» the amount is paid and the units are in (or out of) the stock at once, and the queue «صف تأمین» is served right
 * after. Shows a live quote (units, NAV, fee) and Namadno's free rial and free stock after it, with the server's warnings.
 */
import { useEffect, useState } from 'react';
import { useOrderQuote, usePlaceOrder, useTreasuryPositions, type OrderSide, type TreasuryOrder } from '@/api/op-treasury-extra';
import { Chips, Dialog, Field, KV, Note, NumberInput, Select, Tile } from '@/components/panel/kit';
import { useToast } from '@/components/ui/Toast';
import { errMsg } from '@/components/op/system/fmt';
import { money } from '@/lib/format';
import { SIDE, amt, fundUi, unitsText } from './ui';

export interface OrderDialogProps {
  open: boolean;
  onClose: () => void;
  /** Prefill (e.g. from a suggestion). */
  fundId?: string;
  side?: OrderSide;
  amount?: number;
  source?: 'manual' | 'suggestion';
  recommendationId?: string;
  /** Why this order is suggested (shown as a note when the dialog is prefilled from a suggestion). */
  reason?: string;
  onPlaced?: (o: TreasuryOrder) => void;
}

/** Mount with a `key` that changes per prefill so the form starts fresh. */
export function OrderDialog({ open, onClose, fundId, side = 'buy', amount, source = 'manual', recommendationId, reason, onPlaced }: OrderDialogProps) {
  const toast = useToast();
  const positions = useTreasuryPositions();
  const place = usePlaceOrder();
  const active = (positions.data ?? []).filter((p) => p.status === 'active');
  const [fund, setFund] = useState(fundId ?? '');
  const [s, setS] = useState<OrderSide>(side);
  const [value, setValue] = useState<number>(amount ?? NaN);
  const [note, setNote] = useState('');
  const [debounced, setDebounced] = useState<number>(amount ?? 0);
  const [err, setErr] = useState('');

  // default fund: the first active one (gold) once positions load
  useEffect(() => { if (!fund && active[0]) setFund(active[0].fundId); }, [fund, active]);
  useEffect(() => { const t = setTimeout(() => setDebounced(Number.isFinite(value) ? value : 0), 300); return () => clearTimeout(t); }, [value]);

  const pos = active.find((p) => p.fundId === fund);
  const quote = useOrderQuote({ fundId: fund || undefined, side: s, amount: debounced });
  const q = quote.data;
  // the live suggestion chip helps a manual order; an order prefilled from a suggestion already carries its amount and reason
  const suggestion = source === 'manual' && pos?.suggestion && pos.suggestion.side === s ? pos.suggestion : undefined;
  const ok = !!fund && Number.isFinite(value) && value >= 10_000_000;

  const submit = () => {
    setErr('');
    if (!ok) { setErr('مبلغ سفارش حداقل ۱۰ میلیون تومان است.'); return; }
    place.mutate({ fundId: fund, side: s, amount: value, note: note.trim() || undefined, source, recommendationId }, {
      onSuccess: (o) => {
        toast(o.side === 'buy'
          ? `صدور ${o.code} ثبت شد؛ ${unitsText(o.units)} واحد به موجودی اضافه شد`
          : `ابطال ${o.code} ثبت شد؛ ${unitsText(o.units)} واحد از موجودی کم شد`);
        onPlaced?.(o);
        onClose();
      },
      onError: (e) => setErr(errMsg(e)),
    });
  };

  return (
    <Dialog
      open={open} onClose={onClose} width={560} title={`ثبت ${SIDE[s].label}`}
      sub={s === 'buy'
        ? 'با ثبت، مبلغ پرداخت و واحدها همان لحظه به موجودی اضافه می‌شود؛ موارد صف تأمین خودکار تحویل می‌شوند.'
        : 'با ثبت، واحدها همان لحظه از موجودی کم و مبلغ به ریال آزاد نمادنو اضافه می‌شود؛ فروش‌های در صف واریز خودکار پرداخت می‌شوند.'}
      icon={<Tile d={SIDE[s].d} tone={SIDE[s].tone} size="lg" />}
      footer={(
        <>
          <button type="button" className="nm-btn ghost" onClick={onClose}>انصراف</button>
          <button type="button" className="nm-btn" onClick={submit} disabled={place.isPending || !ok}>
            {place.isPending ? 'در حال ثبت…' : `ثبت ${SIDE[s].label}`}
          </button>
        </>
      )}
    >
      <div className="nm-grid c2" style={{ gap: 12 }}>
        <Field label="صندوق">
          <Select label="صندوق" value={fund} onChange={(v) => { setFund(v); setErr(''); }}
            options={active.map((p) => ({ key: p.fundId, label: p.name }))} />
        </Field>
        <Field label="نوع سفارش">
          <Chips label="نوع سفارش" value={s} onChange={(v) => { setS(v); setErr(''); }}
            options={(['buy', 'redeem'] as const).map((k) => ({ key: k, label: SIDE[k].long }))} />
        </Field>
      </div>
      <Field label="مبلغ" htmlFor="ord-amount" help={suggestion ? undefined : 'حداقل ۱۰ میلیون تومان'}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <NumberInput id="ord-amount" label="مبلغ سفارش" value={value} onChange={(v) => { setValue(v); setErr(''); }} suffix="تومان" width={180} />
          {suggestion && (
            <button type="button" className="nm-chip" aria-pressed={value === suggestion.amount} onClick={() => setValue(suggestion.amount)}>
              مقدار پیشنهادی: {amt(suggestion.amount)}
            </button>
          )}
        </div>
      </Field>
      {(suggestion || (reason && fund === fundId && s === side)) && <Note tone="info" icon={fundUi(fund).d}>{suggestion?.reason ?? reason}</Note>}

      {q && ok && (
        <KV rows={[
          ['مبلغ', <span key="m" className="num">{money(q.amount)} تومان</span>],
          ['تعداد واحد', <span key="u" className="num">{unitsText(q.units)}</span>],
          ['قیمت هر واحد (NAV)', <span key="n" className="num">{money(q.nav)} تومان</span>],
          ['کارمزد', <span key="f" className="num">{money(q.fee)} تومان</span>],
          ['ریال آزاد نمادنو پس از ثبت', <span key="c" className="num" style={q.cashAvailableAfter < 0 ? { color: 'var(--error-text)' } : undefined}>{money(q.cashAvailableAfter)} تومان</span>],
          ['موجودی آزاد پس از ثبت', <span key="a" className="num">{amt(q.availableValueAfter)} تومان</span>],
        ]} />
      )}
      {q && ok && q.warnings.map((w) => <Note key={w} tone="warn">{w}</Note>)}

      <Field label="یادداشت" htmlFor="ord-note" help="اختیاری">
        <span className="nm-in" style={{ width: '100%' }}>
          <input id="ord-note" type="text" value={note} onChange={(e) => setNote(e.target.value)} maxLength={140} placeholder="مثلاً: تأمین تقاضای بسته‌های یلدا" />
        </span>
      </Field>
      {err && <Note tone="err">{err}</Note>}
    </Dialog>
  );
}
