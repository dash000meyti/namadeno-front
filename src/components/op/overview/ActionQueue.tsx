'use client';
/**
 * «صف اقدام» of the command center: everything that needs the operator, most severe first (GET /op/actions) — the rial
 * treasuries first (`rial_need` «نیاز به تأمین ریال»: users' sales waiting for free rial; `rial_below`), then the fund
 * stock (`stock_need_buy` «نیاز به خرید»: items waiting in the queue for a fund's stock; `stock_below`, `stock_surplus`),
 * and deposit receipts to review. Nothing goes negative, so `stock_shortfall` / `rial_shortfall` are no longer produced;
 * orders are recorded only when done, so there is no order to settle (`order_settle` is no longer produced).
 * Each row offers one quick action from `item.cta`: an order prefilled in the shared OrderDialog («ثبت صدور» of a fund in
 * need), «بررسی فیش» of an organization's deposit receipt in ReviewDepositDialog (approve / reject), or — for items
 * without `cta.action` (e.g. the rial ones) — a link to the item's page (`href`, e.g. `/op/funds?state=need_buy`).
 */
import Link from 'next/link';
import { useState } from 'react';
import { useOpOrganizations, useOpRequests } from '@/api/op';
import { useCashEntries, useTreasuryActions, type ActionItem, type OrderAction } from '@/api/op-treasury-extra';
import { Card, Dialog, Empty, ErrorBlock, List, ListRow, Note, Pill, SkeletonRows, Tile } from '@/components/panel/kit';
import { Icon } from '@/components/ui/Icon';
import { OrderDialog } from '@/components/op/treasury/OrderDialog';
import { ReviewDepositDialog } from '@/components/op/cash/ReviewDepositDialog';
import { ACTION_KIND, SEVERITY, TI } from '@/components/op/treasury/ui';
import { errMsg } from '@/components/op/system/fmt';
import { faDigits } from '@/lib/format';
import { routes } from '@/lib/routes';
import { FEATURES } from '@/lib/features';

/** Rows shown before «نمایش همه». */
const SHOWN = 7;

export function ActionQueue() {
  const q = useTreasuryActions();
  const reqs = useOpRequests();
  const [all, setAll] = useState(false);
  const [order, setOrder] = useState<{ item: ActionItem; o: OrderAction } | null>(null);
  const [deposit, setDeposit] = useState<{ item: ActionItem; id: string } | null>(null);

  const items = q.data ?? [];
  const shown = all ? items : items.slice(0, SHOWN);
  const critical = items.filter((a) => a.severity === 'critical').length;
  const warning = items.filter((a) => a.severity === 'warning').length;
  // operator requests are credit products only — «به‌زودی» while facilities are off
  const pendingReqs = FEATURES.orgCredit ? (reqs.data ?? []).filter((r) => r.status === 'pending').length : 0;
  const sub = items.length ? [critical && `${faDigits(critical)} فوری`, warning && `${faDigits(warning)} مهم`].filter(Boolean).join(' · ') || 'بدون مورد فوری' : undefined;

  const cta = (a: ActionItem) => {
    const act = a.cta.action;
    const aria = `${a.cta.label} — ${a.title}`;
    if (act?.type === 'order') return <button type="button" className="nm-btn sm ghost" aria-label={aria} onClick={() => setOrder({ item: a, o: act })}>{a.cta.label}</button>;
    if (act?.type === 'review_deposit') return <button type="button" className="nm-btn sm ghost" aria-label={aria} onClick={() => setDeposit({ item: a, id: act.id })}>{a.cta.label}</button>;
    // link-only items (incl. the rial treasuries; a legacy `settle_order` is no longer produced): open the item's page
    return <Link href={a.href} className="nm-btn sm ghost" aria-label={aria}>{a.cta.label}</Link>;
  };

  return (
    <Card title="صف اقدام" count={items.length || undefined} sub={sub}>
      {q.isLoading ? <SkeletonRows n={6} /> : q.isError ? <ErrorBlock flat error={q.error} message={errMsg(q.error)} onRetry={() => q.refetch()} /> : !items.length ? (
        <Empty icon={TI.check} tone="success" title="کاری در صف نیست" sub="ریال، موجودی صندوق‌ها و فیش‌های واریز در وضعیت عادی‌اند؛ موارد تازه این‌جا می‌آیند." />
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
      {deposit && <ReceiptReview key={deposit.id} item={deposit.item} id={deposit.id} onClose={() => setDeposit(null)} />}
    </Card>
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
