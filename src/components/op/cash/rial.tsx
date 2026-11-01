'use client';
/**
 * Rial treasuries on the operator screens («ریال» and «ریال رزرو»):
 *   RialSplit       — an organization's rial account as a bar: آزاد (paid, unused) · کنار گذاشته (queued packages) · بلاک‌شده (sent packages)
 *   RialMoveRow     — one rial movement as a list row (inspector, organization and user pages)
 *   RialMoveInspector — one rial movement with its links (organization, user, fund, orders)
 * Vocabulary (labels, tones, icons) comes from src/components/op/treasury/ui.ts (ORG_RIAL, RIAL_MOVE).
 */
import type { ReactNode } from 'react';
import Link from 'next/link';
import type { OrgRialBalance, RialMove, RialMoveKind } from '@/api/op-treasury-extra';
import { Ava, Inspector, KV, KeyStats, ListRow, Note, Pill, Section, Tile, Who } from '@/components/panel/kit';
import { Icon } from '@/components/ui/Icon';
import { ORG_RIAL, RIAL_MOVE, TI, amt } from '@/components/op/treasury/ui';
import { jDate, jDateTime, money, time } from '@/lib/format';
import { routes } from '@/lib/routes';

/** What a movement does, in one sentence (inspector). */
export const RIAL_MOVE_HINT: Record<RialMoveKind, string> = {
  org_deposit: 'واریز سازمان (فیش تأییدشده یا واریز ثبت‌شده) به حساب ریالی آن آمد. اگر فیش برای بسته‌ای در صف بود، همان بسته ارسال شد؛ باقی در حساب آزاد سازمان می‌ماند.',
  reserve: 'با ارسال بسته، مبلغ آن از حساب آزاد سازمان به «ریال رزرو» می‌رود و تا دریافت گیرندگان بلاک می‌ماند.',
  payout: 'گیرنده بسته را پذیرفت؛ مبلغ از «ریال رزرو» به کیف پول ریالی او رفت.',
  release: 'بسته لغو شد یا مهلتش تمام شد؛ مبلغ بلاک‌شده به حساب آزاد سازمان برگشت.',
  reclaim: 'سازمان سهم مرحله‌ای را بازپس گرفت؛ مبلغ به حساب آزاد سازمان برگشت.',
  user_buy: 'کاربر از موجودی نمادنو واحد صندوق خرید؛ مبلغ از کیف پول او به «ریال» آمد.',
  user_sell: 'کاربر واحد صندوق را به نمادنو فروخت؛ مبلغ از «ریال» به کیف پول او رفت.',
  user_deposit: 'کاربر به کیف پول ریالی خود واریز کرد.',
  user_withdrawal: 'کاربر از کیف پول ریالی خود به حساب بانکی‌اش برداشت کرد.',
  order_buy: 'سفارش صدور: مبلغ از «ریال» به صندوق پرداخت شد و واحدها به موجودی خزانه آمد.',
  order_redeem: 'ابطال واحد: مبلغ از صندوق به «ریال» برگشت.',
  fee: 'کارمزد بانکی از «ریال» کسر شد.',
  adjustment: 'اصلاح دستی حساب بانکی.',
};

/** Direction of a movement for a user's wallet: + into the wallet, − out of it, 0 = not the wallet. */
export function walletSign(m: RialMove): 1 | -1 | 0 {
  if (m.kind === 'payout' || m.kind === 'user_sell' || m.kind === 'user_deposit') return 1;
  if (m.kind === 'user_buy' || m.kind === 'user_withdrawal') return -1;
  return 0;
}

/**
 * Bar of an organization's rial account (= its balance): آزاد (solid), کنار گذاشته (kept from «آزاد» for packages in the
 * queue, only when there is some) and بلاک‌شده (sent packages, in «ریال رزرو»), with the amounts.
 */
export function RialSplit({ a, fmt = amt, height = 8 }: { a: Pick<OrgRialBalance, 'free' | 'blocked' | 'setAside'>; fmt?: (n: number) => string; height?: number }) {
  const aside = a.setAside ?? 0;
  const total = a.free + aside + a.blocked;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, minWidth: 0 }}>
      <div
        role="img" aria-label={`${ORG_RIAL.free.label} ${fmt(a.free)}${aside > 0 ? ` · ${ORG_RIAL.setAside.label} ${fmt(aside)}` : ''} · ${ORG_RIAL.blocked.label} ${fmt(a.blocked)} تومان`}
        style={{ display: 'flex', gap: 2, height, borderRadius: 6, overflow: 'hidden', background: 'var(--fill)' }}
      >
        {total > 0 && a.free > 0 && <i style={{ flex: a.free, background: 'var(--success-main)', minWidth: 3 }} />}
        {total > 0 && aside > 0 && <i style={{ flex: aside, background: 'var(--info-main)', minWidth: 3 }} />}
        {total > 0 && a.blocked > 0 && <i style={{ flex: a.blocked, background: 'var(--secondary-main)', minWidth: 3 }} />}
      </div>
      <div className="nm-legend">
        <span><i style={{ background: 'var(--success-main)' }} />{ORG_RIAL.free.label} <b>{fmt(a.free)}</b></span>
        {aside > 0 && <span title={ORG_RIAL.setAside.sub}><i style={{ background: 'var(--info-main)' }} />{ORG_RIAL.setAside.label} <b>{fmt(aside)}</b></span>}
        <span><i style={{ background: 'var(--secondary-main)' }} />{ORG_RIAL.blocked.label} <b>{fmt(a.blocked)}</b></span>
      </div>
    </div>
  );
}

/** «از ← به» — the two ends of a movement on one line. */
export function MoveEnds({ m }: { m: Pick<RialMove, 'from' | 'to'> }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, minWidth: 0, maxWidth: '100%' }}>
      <span className="el">{m.from}</span>
      <Icon d={TI.chevL} size={12} />
      <span className="el">{m.to}</span>
    </span>
  );
}

/** One rial movement as a list row. `sign` shows the amount as + / − (e.g. for a user's wallet). */
export function RialMoveRow({ m, sign = 0, onClick }: { m: RialMove; sign?: 1 | -1 | 0; onClick?: () => void }) {
  const k = RIAL_MOVE[m.kind];
  return (
    <ListRow
      onClick={onClick} label={onClick ? `${k.label} · ${m.title}` : undefined}
      lead={<Tile d={k.d} tone={k.tone} />}
      title={m.title}
      sub={`${k.label} · ${jDate(m.at)} · ${m.from} ← ${m.to}`}
      trail={(
        <span className="num" style={sign > 0 ? { color: 'var(--success-text)', fontWeight: 600 } : { fontWeight: 600 }}>
          {sign > 0 ? '+' : sign < 0 ? '−' : ''}{amt(m.amount)}
        </span>
      )}
    />
  );
}

export function RialMoveInspector({ m, orgLetter, onClose }: { m: RialMove; orgLetter?: string; onClose: () => void }) {
  const k = RIAL_MOVE[m.kind];
  const rows: [ReactNode, ReactNode][] = [
    ['نوع', k.label],
    ['از', m.from],
    ['به', m.to],
    ['مبلغ', <span key="a" className="num">{money(m.amount)} تومان</span>],
    ['زمان', <span key="t" className="num">{jDateTime(m.at)}</span>],
  ];
  if (m.orgId) rows.push(['سازمان', <Link key="o" href={routes.op.organization(m.orgId)} className="nm-more">{m.orgName ?? m.orgId}</Link>]);
  if (m.userId) rows.push(['کاربر', <Link key="u" href={routes.op.user(m.userId)} className="nm-more">{m.userName ?? 'پروفایل کاربر'}</Link>]);
  if (m.fundId) rows.push(['صندوق', <Link key="f" href={routes.op.fund(m.fundId)} className="nm-more">صفحه‌ی صندوق</Link>]);
  if (m.fundId && (m.kind === 'order_buy' || m.kind === 'order_redeem')) {
    rows.push(['سفارش', <Link key="s" href={`${routes.op.orders}?fund=${encodeURIComponent(m.fundId)}`} className="nm-more">سفارش‌های این صندوق</Link>]);
  }
  if (m.packageId) {
    rows.push(['بسته', m.orgId
      ? <Link key="p" href={routes.op.organization(m.orgId)} className="nm-more"><span className="ltr num">{m.packageId}</span></Link>
      : <span key="p" className="ltr num">{m.packageId}</span>]);
  }
  if (m.ref) rows.push(['مرجع بانکی', <span key="r" className="ltr num">{m.ref}</span>]);

  return (
    <Inspector
      open onClose={onClose} title="گردش ریالی" label={`جزئیات ${m.title}`}
      href={m.orgId ? routes.op.organization(m.orgId) : m.userId ? routes.op.user(m.userId) : undefined}
      hrefLabel={m.orgId ? 'صفحه سازمان' : 'پروفایل کاربر'}
    >
      <Who
        lead={m.orgId && m.kind !== 'payout' ? <Ava letter={orgLetter ?? (m.orgName ?? '؟')[0]} id={m.orgId} sq size="lg" /> : <Tile d={k.d} tone={k.tone} size="lg" />}
        title={m.title}
        sub={<MoveEnds m={m} />}
        pills={<Pill tone={k.tone}>{k.label}</Pill>}
      />
      <KeyStats items={[['مبلغ', amt(m.amount)], ['تاریخ', jDate(m.at)], ['ساعت', time(m.at)]]} />
      <Note tone="mute" icon={k.d}>{RIAL_MOVE_HINT[m.kind]}</Note>
      <Section title="جزئیات">
        <KV rows={rows} />
      </Section>
    </Inspector>
  );
}
