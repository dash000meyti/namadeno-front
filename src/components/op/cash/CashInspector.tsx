'use client';
/**
 * Inspector of one entry of Namadno's bank account: a ledger row, or an organization's deposit receipt («فیش واریز»)
 * waiting for review, approved or rejected. Receipts show the uploaded file, the organization's description, who sent
 * it and the review state; «بررسی فیش» (footer) opens ReviewDepositDialog for a pending one.
 */
import type { ReactNode } from 'react';
import Link from 'next/link';
import type { CashEntry } from '@/api/op-treasury-extra';
import { Ava, Inspector, KV, KeyStats, Note, Pill, Section, Tile, Who } from '@/components/panel/kit';
import { Icon } from '@/components/ui/Icon';
import { ReceiptView } from '@/components/ui/Receipt';
import { CASH_KIND, TI, amt, cashStatus } from '@/components/op/treasury/ui';
import { jDate, jDateTime, money } from '@/lib/format';
import { routes } from '@/lib/routes';
import { signed } from './money';
import { depositPurpose, receiptTime } from './ReviewDepositDialog';

/** An organization deposit that came with (or waits on) an uploaded receipt. */
export const isReceipt = (e: CashEntry) => e.kind === 'org_deposit' && (!!e.receipt || e.status !== 'done');

export function CashInspector({ entry: e, orgLetter, onReview, onClose }: { entry: CashEntry; orgLetter?: string; onReview: (e: CashEntry) => void; onClose: () => void }) {
  const k = CASH_KIND[e.kind];
  const st = cashStatus(e);
  const receipt = isReceipt(e);
  const pending = e.status === 'expected';
  const when = receiptTime(e);
  const rows: [ReactNode, ReactNode][] = [
    ['نوع', k.label],
    ['مبلغ', <span key="a" className="num" style={e.amount > 0 ? { color: 'var(--success-text)' } : undefined}>{signed(e.amount)} تومان</span>],
  ];
  if (e.orgId) rows.push(['سازمان', <Link key="o" href={routes.op.organization(e.orgId)} className="nm-more">{e.orgName ?? e.orgId}</Link>]);
  if (receipt) rows.push(['بابت', depositPurpose(e)]);
  if (e.packageId) rows.push(['بسته', <span key="p" className="ltr num">{e.packageId}</span>]);
  if (e.orderId) rows.push(['سفارش', <Link key="s" href={`${routes.op.orders}?id=${encodeURIComponent(e.orderId)}`} className="nm-more"><span className="ltr">{e.orderId}</span></Link>]);
  if (e.userId) rows.push(['کاربر', <Link key="u" href={routes.op.user(e.userId)} className="nm-more">پروفایل کاربر</Link>]);
  if (e.note) rows.push([e.submittedBy ? 'توضیحات سازمان' : 'یادداشت', <span key="n" style={{ whiteSpace: 'pre-line' }}>{e.note}</span>]);
  if (e.submittedBy) rows.push(['ارسال‌کننده', e.submittedBy]);
  if (receipt) rows.push([when.label, <span key="t" className="num">{jDateTime(when.at)}</span>]);
  else rows.push(['تاریخ', <span key="t" className="num">{jDateTime(e.at)}</span>]);
  if (e.status === 'rejected' && e.rejectedAt) rows.push(['زمان رد', <span key="rj" className="num">{jDateTime(e.rejectedAt)}</span>]);
  if (e.ref) rows.push(['مرجع بانکی', <span key="f" className="ltr num">{e.ref}</span>]);
  if (e.by) rows.push([e.status === 'rejected' ? 'ردکننده' : receipt ? 'تأییدکننده' : 'ثبت‌کننده', e.by]);
  if (e.balanceAfter != null) rows.push(['مانده پس از این ردیف', <span key="b" className="num">{money(e.balanceAfter)} تومان</span>]);

  return (
    <Inspector
      open onClose={onClose} title={receipt ? 'فیش واریز سازمان' : 'ردیف گردش حساب'} label={`جزئیات ${e.title}`}
      href={e.orgId ? routes.op.organization(e.orgId) : undefined} hrefLabel="صفحه سازمان"
      footer={pending && e.kind === 'org_deposit' ? (
        <button type="button" className="nm-btn" onClick={() => onReview(e)}><Icon d={TI.check} size={16} strokeWidth={2.2} />بررسی فیش</button>
      ) : undefined}
    >
      <Who
        lead={e.orgId ? <Ava letter={orgLetter ?? (e.orgName ?? '؟')[0]} id={e.orgId} sq size="lg" /> : <Tile d={e.amount >= 0 ? TI.deposit : TI.cash} tone={k.tone} size="lg" />}
        title={receipt ? depositPurpose(e) : e.title}
        sub={e.orgName ?? k.label}
        pills={<><Pill tone={st.tone} dot>{st.label}</Pill><Pill tone={k.tone}>{k.label}</Pill></>}
      />
      <KeyStats items={[
        ['مبلغ', (e.amount > 0 && !receipt ? '+' : '') + amt(e.amount)],
        receipt ? [when.label, jDate(when.at)] : ['تاریخ', jDate(e.at)],
        receipt ? ['وضعیت', st.label] : ['مانده پس از ردیف', e.balanceAfter != null ? amt(e.balanceAfter) : '—'],
      ]} />
      {pending && (
        <Note tone="warn" icon={TI.clock}>
          این فیش در انتظار تأیید است. با تأیید، مبلغ به حساب آزاد {e.orgName ?? 'سازمان'} اضافه می‌شود{e.packageId ? ' و بسته برای همکاران ارسال می‌شود' : ''}.
        </Note>
      )}
      {e.status === 'rejected' && (
        <Note tone="err">فیش رد شد{e.rejectReason ? <>: {e.rejectReason}</> : '.'} سازمان می‌تواند فیش تازه بارگذاری کند.</Note>
      )}
      {receipt && (
        <Section title="فیش واریز">
          <ReceiptView receipt={e.receipt} maxHeight={320} />
        </Section>
      )}
      <Section title="جزئیات">
        <KV rows={rows} />
      </Section>
    </Inspector>
  );
}
