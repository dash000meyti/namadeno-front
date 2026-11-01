'use client';
/**
 * «صف اقدام» of the command center: everything that needs the operator, most severe first (GET /op/actions).
 * Each row offers one quick action from `item.cta`: an order prefilled in the shared OrderDialog, «ثبت تسویه» behind a
 * Confirm, «ثبت دریافت» of an organization deposit in a small dialog, or a link to the item's page.
 */
import Link from 'next/link';
import { useState } from 'react';
import type { ReactNode } from 'react';
import { useOpRequests } from '@/api/op';
import {
  useCashEntries, useConfirmDeposit, useSettleOrder, useTreasuryActions, useTreasuryOrders, type ActionItem, type OrderAction,
} from '@/api/op-treasury-extra';
import { Card, Confirm, Dialog, Empty, ErrorBlock, Field, KV, List, ListRow, Note, Pill, SkeletonRows, Tile } from '@/components/panel/kit';
import { Icon } from '@/components/ui/Icon';
import { useToast } from '@/components/ui/Toast';
import { OrderDialog } from '@/components/op/treasury/OrderDialog';
import { ACTION_KIND, SEVERITY, TI, unitsText } from '@/components/op/treasury/ui';
import { errMsg } from '@/components/op/system/fmt';
import { faDigits, jDate, money } from '@/lib/format';
import { routes } from '@/lib/routes';

/** Rows shown before «نمایش همه». */
const SHOWN = 7;

export function ActionQueue() {
  const q = useTreasuryActions();
  const reqs = useOpRequests();
  const [all, setAll] = useState(false);
  const [order, setOrder] = useState<{ item: ActionItem; o: OrderAction } | null>(null);
  const [settle, setSettle] = useState<{ item: ActionItem; id: string } | null>(null);
  const [deposit, setDeposit] = useState<{ item: ActionItem; id: string } | null>(null);

  const items = q.data ?? [];
  const shown = all ? items : items.slice(0, SHOWN);
  const critical = items.filter((a) => a.severity === 'critical').length;
  const warning = items.filter((a) => a.severity === 'warning').length;
  const pendingReqs = (reqs.data ?? []).filter((r) => r.status === 'pending').length;
  const sub = items.length ? [critical && `${faDigits(critical)} فوری`, warning && `${faDigits(warning)} مهم`].filter(Boolean).join(' · ') || 'بدون مورد فوری' : undefined;

  const cta = (a: ActionItem) => {
    const act = a.cta.action;
    const aria = `${a.cta.label} — ${a.title}`;
    if (act?.type === 'order') return <button type="button" className="nm-btn sm ghost" aria-label={aria} onClick={() => setOrder({ item: a, o: act })}>{a.cta.label}</button>;
    if (act?.type === 'settle_order') return <button type="button" className="nm-btn sm ghost" aria-label={aria} onClick={() => setSettle({ item: a, id: act.id })}>{a.cta.label}</button>;
    if (act?.type === 'confirm_deposit') return <button type="button" className="nm-btn sm ghost" aria-label={aria} onClick={() => setDeposit({ item: a, id: act.id })}>{a.cta.label}</button>;
    return <Link href={a.href} className="nm-btn sm ghost" aria-label={aria}>{a.cta.label}</Link>;
  };

  return (
    <Card title="صف اقدام" count={items.length || undefined} sub={sub}>
      {q.isLoading ? <SkeletonRows n={6} /> : q.isError ? <ErrorBlock flat error={q.error} message={errMsg(q.error)} onRetry={() => q.refetch()} /> : !items.length ? (
        <Empty icon={TI.check} tone="success" title="کاری در صف نیست" sub="موجودی، سفارش‌ها و واریزها در وضعیت عادی‌اند؛ موارد تازه این‌جا می‌آیند." />
      ) : (
        <List>
          {shown.map((a) => {
            const k = ACTION_KIND[a.kind];
            const sev = SEVERITY[a.severity];
            return (
              <ListRow key={a.id}
                lead={<Tile d={k.d} tone={k.tone} />}
                title={<Link href={a.href} style={{ color: 'inherit' }}>{a.title}</Link>}
                sub={a.sub}
                trail={<><Pill tone={sev.tone}>{sev.label}</Pill>{cta(a)}</>}
              />
            );
          })}
        </List>
      )}

      {(items.length > SHOWN || pendingReqs > 0) && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginTop: 'auto' }}>
          {items.length > SHOWN && (
            <button type="button" className="nm-btn sm text" aria-expanded={all} onClick={() => setAll((v) => !v)}>
              {all ? 'نمایش کمتر' : `نمایش همه‌ی ${faDigits(items.length)} مورد`}
            </button>
          )}
          {pendingReqs > 0 && (
            <Link href={routes.op.requests} className="nm-more" style={{ marginRight: 'auto' }}>
              {faDigits(pendingReqs)} درخواست در انتظار بررسی<Icon d={TI.chevL} size={14} />
            </Link>
          )}
        </div>
      )}

      {order && (
        <OrderDialog key={order.item.id} open onClose={() => setOrder(null)}
          fundId={order.o.fundId} side={order.o.side} amount={order.o.amount} source="suggestion" reason={order.item.sub} />
      )}
      {settle && <SettleConfirm key={settle.id} item={settle.item} id={settle.id} onClose={() => setSettle(null)} />}
      {deposit && <DepositDialog key={deposit.id} item={deposit.item} id={deposit.id} onClose={() => setDeposit(null)} />}
    </Card>
  );
}

/** «ثبت تسویه» of a due order. */
function SettleConfirm({ item, id, onClose }: { item: ActionItem; id: string; onClose: () => void }) {
  const toast = useToast();
  const orders = useTreasuryOrders();
  const settle = useSettleOrder();
  const o = orders.data?.find((x) => x.id === id || x.code === id);
  const effect = !o ? 'با ثبت تسویه، موجودی خزانه و نقدینگی به‌روز می‌شود.'
    : o.side === 'buy' ? `با ثبت تسویه، ${unitsText(o.units)} واحد به موجودی خزانه اضافه می‌شود.`
    : 'با ثبت تسویه، واحدها از موجودی خزانه کم و مبلغ ابطال به حساب نمادنو واریز می‌شود.';
  const run = () => settle.mutate({ id }, {
    onSuccess: (r) => { toast(`سفارش ${r.code} تسویه شد؛ موجودی خزانه به‌روز شد`); onClose(); },
    onError: (e) => toast(errMsg(e), 'error'),
  });
  return (
    <Confirm open title={item.title} confirmLabel={settle.isPending ? 'در حال ثبت…' : 'ثبت تسویه'} busy={settle.isPending} onConfirm={run} onClose={onClose}
      body={(
        <>
          <span>{item.sub}</span>
          {o && <KV rows={[['تاریخ سررسید', <span key="d" className="num">{jDate(o.settleAt)}</span>], ['ثبت‌کننده', o.by]]} />}
          <Note tone="info">{effect}</Note>
        </>
      )} />
  );
}

/** «ثبت دریافت» of an expected organization deposit, with an optional bank reference. */
function DepositDialog({ item, id, onClose }: { item: ActionItem; id: string; onClose: () => void }) {
  const toast = useToast();
  const entries = useCashEntries();
  const confirm = useConfirmDeposit();
  const [ref, setRef] = useState('');
  const [err, setErr] = useState('');
  const e = entries.data?.find((x) => x.id === id);
  const amount = e?.amount ?? item.amount;
  const due = e?.dueAt ?? item.at;
  const submit = () => {
    setErr('');
    confirm.mutate({ id, ref: ref.trim() || undefined }, {
      onSuccess: (r) => { toast(`واریز ${money(r.amount)} تومان ${r.orgName ?? ''} ثبت شد`.replace(/\s+/g, ' ').trim()); onClose(); },
      onError: (x) => setErr(errMsg(x)),
    });
  };
  return (
    <Dialog open onClose={onClose} width={480} title="ثبت دریافت واریز" sub={e?.orgName ?? item.title}
      icon={<Tile d={TI.deposit} tone="success" size="lg" />}
      footer={(
        <>
          <button type="button" className="nm-btn ghost" onClick={onClose}>انصراف</button>
          <button type="button" className="nm-btn" onClick={submit} disabled={confirm.isPending}>{confirm.isPending ? 'در حال ثبت…' : 'ثبت دریافت'}</button>
        </>
      )}
    >
      <KV rows={[
        ['بابت', e?.title ?? item.sub],
        ...(amount != null ? [['مبلغ', <span key="a" className="num">{money(amount)} تومان</span>] as [string, ReactNode]] : []),
        ...(due ? [['سررسید', <span key="d" className="num">{jDate(due)}</span>] as [string, ReactNode]] : []),
      ]} />
      <Field label="شماره‌ی مرجع بانکی" htmlFor="dep-ref" help="اختیاری؛ در دفتر نقدینگی کنار این واریز ثبت می‌شود.">
        <span className="nm-in" style={{ width: '100%' }}>
          <input id="dep-ref" dir="ltr" value={ref} onChange={(x) => setRef(x.target.value)} maxLength={40} placeholder={faDigits('140508150123')} />
        </span>
      </Field>
      {err && <Note tone="err">{err}</Note>}
    </Dialog>
  );
}
