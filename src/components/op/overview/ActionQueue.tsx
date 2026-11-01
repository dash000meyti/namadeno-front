'use client';
/**
 * «صف اقدام» of the command center: everything that needs the operator, most severe first (GET /op/actions) — the rial
 * treasuries first (`rial_need` «نیاز به تأمین ریال»: users' sales waiting for free rial; `rial_below`), then the fund
 * stock (`stock_need_buy` «نیاز به خرید»: items waiting in the queue for a fund's stock; `stock_below`, `stock_surplus`),
 * orders and deposit receipts to review. Nothing goes negative, so `stock_shortfall` / `rial_shortfall` are no longer produced.
 * Each row offers one quick action from `item.cta`: an order prefilled in the shared OrderDialog («ثبت صدور» of a fund in
 * need), «ثبت تسویه» behind a Confirm, «بررسی فیش» of an organization's deposit receipt in ReviewDepositDialog
 * (approve / reject), or — for items without `cta.action` (the rial ones, a need an open buy already covers) — a link to
 * the item's page (`href`, e.g. `/op/funds?state=need_buy`).
 */
import Link from 'next/link';
import { useState } from 'react';
import { useOpOrganizations, useOpRequests } from '@/api/op';
import {
  useCashEntries, useSettleOrder, useTreasuryActions, useTreasuryOrders, type ActionItem, type OrderAction,
} from '@/api/op-treasury-extra';
import { Card, Confirm, Dialog, Empty, ErrorBlock, KV, List, ListRow, Note, Pill, SkeletonRows, Tile } from '@/components/panel/kit';
import { Icon } from '@/components/ui/Icon';
import { useToast } from '@/components/ui/Toast';
import { OrderDialog } from '@/components/op/treasury/OrderDialog';
import { ReviewDepositDialog } from '@/components/op/cash/ReviewDepositDialog';
import { ACTION_KIND, SEVERITY, TI, unitsText } from '@/components/op/treasury/ui';
import { errMsg } from '@/components/op/system/fmt';
import { faDigits, jDate } from '@/lib/format';
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
    if (act?.type === 'review_deposit') return <button type="button" className="nm-btn sm ghost" aria-label={aria} onClick={() => setDeposit({ item: a, id: act.id })}>{a.cta.label}</button>;
    // link-only items (incl. the rial treasuries): open the item's page
    return <Link href={a.href} className="nm-btn sm ghost" aria-label={aria}>{a.cta.label}</Link>;
  };

  return (
    <Card title="صف اقدام" count={items.length || undefined} sub={sub}>
      {q.isLoading ? <SkeletonRows n={6} /> : q.isError ? <ErrorBlock flat error={q.error} message={errMsg(q.error)} onRetry={() => q.refetch()} /> : !items.length ? (
        <Empty icon={TI.check} tone="success" title="کاری در صف نیست" sub="ریال، موجودی صندوق‌ها، سفارش‌ها و واریزها در وضعیت عادی‌اند؛ موارد تازه این‌جا می‌آیند." />
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
      {deposit && <ReceiptReview key={deposit.id} item={deposit.item} id={deposit.id} onClose={() => setDeposit(null)} />}
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

/** «بررسی فیش» of a receipt from the queue: finds the entry, then the shared review dialog (approve / reject). */
function ReceiptReview({ item, id, onClose }: { item: ActionItem; id: string; onClose: () => void }) {
  const entries = useCashEntries({ kind: 'org_deposit' });
  const orgs = useOpOrganizations();
  const e = entries.data?.find((x) => x.id === id);
  if (e) return <ReviewDepositDialog entry={e} orgLetter={orgs.data?.find((o) => o.id === e.orgId)?.logoLetter} onClose={onClose} />;
  return (
    <Dialog open onClose={onClose} width={480} title="بررسی فیش واریز" sub={item.title}
      icon={<Tile d={TI.deposit} tone="warning" size="lg" />}
      footer={<button type="button" className="nm-btn ghost" onClick={onClose}>بستن</button>}
    >
      {entries.isLoading ? <SkeletonRows n={3} />
        : entries.isError ? <ErrorBlock flat error={entries.error} message={errMsg(entries.error)} onRetry={() => entries.refetch()} />
        : <Note tone="info" action={<Link href={item.href} className="nm-btn sm text" onClick={onClose}>نقدینگی</Link>}>این فیش دیگر در فهرست نیست؛ شاید پیش‌تر بررسی شده باشد.</Note>}
    </Dialog>
  );
}
