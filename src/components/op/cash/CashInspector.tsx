'use client';
/** Inspector of one entry of Namadno's rial account (ledger row or expected organization deposit). */
import type { ReactNode } from 'react';
import Link from 'next/link';
import type { CashEntry } from '@/api/op-treasury-extra';
import { Ava, Inspector, KV, KeyStats, Note, Pill, Section, Tile, Who } from '@/components/panel/kit';
import { Icon } from '@/components/ui/Icon';
import { CASH_KIND, TI, amt, cashStatus } from '@/components/op/treasury/ui';
import { faDigits, jDate, jDateTime, money } from '@/lib/format';
import { now } from '@/lib/clock';
import { routes } from '@/lib/routes';
import { signed } from './money';

const DAY = 86_400_000;

/** Whole days between a due date and now: > 0 = overdue by n days, < 0 = due in n days. */
export function daysPast(iso?: string) {
  if (!iso) return 0;
  return Math.floor((now().getTime() - Date.parse(iso)) / DAY);
}

export function CashInspector({ entry: e, orgLetter, onConfirm, onClose }: { entry: CashEntry; orgLetter?: string; onConfirm: (e: CashEntry) => void; onClose: () => void }) {
  const k = CASH_KIND[e.kind];
  const st = cashStatus(e);
  const expected = e.status === 'expected';
  const late = expected && e.overdue ? Math.max(1, daysPast(e.dueAt ?? e.at)) : 0;
  const rows: [ReactNode, ReactNode][] = [
    ['نوع', k.label],
    ['مبلغ', <span key="a" className="num" style={e.amount > 0 ? { color: 'var(--success-text)' } : undefined}>{signed(e.amount)} تومان</span>],
  ];
  if (e.orgId) rows.push(['سازمان', <Link key="o" href={routes.op.organization(e.orgId)} className="nm-more">{e.orgName ?? e.orgId}</Link>]);
  if (e.packageId) rows.push(['بسته', <span key="p" className="ltr num">{e.packageId}</span>]);
  if (e.orderId) rows.push(['سفارش', <Link key="s" href={`${routes.op.orders}?id=${encodeURIComponent(e.orderId)}`} className="nm-more"><span className="ltr">{e.orderId}</span></Link>]);
  if (e.userId) rows.push(['کاربر', <Link key="u" href={routes.op.user(e.userId)} className="nm-more">پروفایل کاربر</Link>]);
  rows.push([expected ? 'ایجاد' : 'تاریخ', <span key="t" className="num">{jDateTime(e.at)}</span>]);
  if (e.dueAt) rows.push(['سررسید', <span key="d" className="num">{jDate(e.dueAt)}</span>]);
  if (e.receivedAt && !expected) rows.push(['دریافت', <span key="r" className="num">{jDateTime(e.receivedAt)}</span>]);
  if (e.ref) rows.push(['مرجع بانکی', <span key="f" className="ltr num">{e.ref}</span>]);
  if (e.by) rows.push(['ثبت‌کننده', e.by]);
  if (e.note) rows.push(['یادداشت', e.note]);
  if (e.balanceAfter != null) rows.push(['مانده پس از این ردیف', <span key="b" className="num">{money(e.balanceAfter)} تومان</span>]);

  return (
    <Inspector
      open onClose={onClose} title={expected ? 'واریز در انتظار' : 'ردیف گردش حساب'} label={`جزئیات ${e.title}`}
      href={e.orgId ? routes.op.organization(e.orgId) : undefined} hrefLabel="صفحه سازمان"
      footer={expected && e.kind === 'org_deposit' ? (
        <button type="button" className="nm-btn" onClick={() => onConfirm(e)}><Icon d={TI.check} size={16} strokeWidth={2.2} />ثبت دریافت</button>
      ) : undefined}
    >
      <Who
        lead={e.orgId ? <Ava letter={orgLetter ?? (e.orgName ?? '؟')[0]} id={e.orgId} sq size="lg" /> : <Tile d={e.amount >= 0 ? TI.deposit : TI.cash} tone={k.tone} size="lg" />}
        title={e.title}
        sub={e.orgName ?? k.label}
        pills={<><Pill tone={st.tone} dot>{st.label}</Pill><Pill tone={k.tone}>{k.label}</Pill></>}
      />
      <KeyStats items={[
        ['مبلغ', (e.amount > 0 ? '+' : '') + amt(e.amount)],
        expected ? ['سررسید', e.dueAt ? jDate(e.dueAt) : '—'] : ['تاریخ', jDate(e.at)],
        expected
          ? ['وضعیت', late ? `${faDigits(late)} روز دیرکرد` : st.label]
          : ['مانده پس از ردیف', e.balanceAfter != null ? amt(e.balanceAfter) : '—'],
      ]} />
      {late > 0 && <Note tone="err">{faDigits(late)} روز از سررسید این واریز گذشته است. پس از دریافت، «ثبت دریافت» را بزنید.</Note>}
      {expected && !late && <Note tone="info" icon={TI.clock}>این واریز بابت بسته‌ی ارسال‌شده‌ی سازمان انتظار می‌رود و پس از دریافت در گردش حساب ثبت می‌شود.</Note>}
      <Section title="جزئیات">
        <KV rows={rows} />
      </Section>
    </Inspector>
  );
}
