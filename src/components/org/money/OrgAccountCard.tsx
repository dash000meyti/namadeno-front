'use client';
/**
 * «حساب ریالی سازمان» — the organization's rial account with Namadno, for the dashboard (every panel role).
 * Left: «آزاد» (big number), bar آزاد | کنار گذاشته (for packages in the queue) | بلاک‌شده, «بلاک‌شده برای بسته‌ها»,
 * «بسته در صف» and «فیش در انتظار تأیید», and a quiet note when packages wait in the queue — for their receipt approval
 * (`awaiting_payment`) or for Namadno's fund stock (`awaiting_stock`, paid; sent automatically) — they reach no one and block
 * nothing until then; no deadline.
 * Right: «آخرین فیش‌ها» (thumbnail, title, amount, date, state; a rejected one shows the reason and «فیش تازه») or «گردش حساب» (max 4).
 * «اعلام واریز» / «فیش تازه» open AnnounceDepositDialog. Data: useOrgAccount() (GET /org/account), useOrgPackages() (is a package still waiting).
 */
import { useState } from 'react';
import { useOrgPackages } from '@/api/org';
import { useOrgAccount, type OrgAccount, type OrgAccountEntry } from '@/api/org-money-extra';
import type { RialMove } from '@/api/op-treasury-extra';
import { BigNum, Card, Empty, ErrorBlock, KeyStats, List, ListRow, Note, Pill, Section, SkeletonCard, Tabs, Tile } from '@/components/panel/kit';
import { Icon } from '@/components/ui/Icon';
import { ReceiptThumb } from '@/components/ui/Receipt';
import { compactMoney, faDigits, jDayMonth, money } from '@/lib/format';
import { compactParts } from '@/components/org/people/shared';
import { AnnounceDepositDialog } from './AnnounceDepositDialog';
import { OM, ORG_MOVE, entryState } from './meta';

type View = 'entries' | 'moves';
const MAX = 4;
/** «۱٫۲ میلیارد تومان» */
const cm = (n: number) => `${compactMoney(n)} تومان`;
/** Fills of the bar (tokens only): blocked = the reserve hatch, set aside for queued packages = a light «آزاد». */
const HATCH_BLOCKED = 'repeating-linear-gradient(135deg,rgb(var(--grey-500-rgb) / .55) 0 3px,rgb(var(--grey-500-rgb) / .22) 3px 6px)';
const ASIDE = 'rgb(var(--primary-main-rgb) / .32)';

export function OrgAccountCard() {
  const acct = useOrgAccount();
  const [view, setView] = useState<View>('entries');
  const pkgs = useOrgPackages();
  const [dialog, setDialog] = useState<{ amount?: number; min?: number; packageId?: string; packageTitle?: string } | null>(null);

  if (acct.isError) {
    return (
      <Card title="حساب ریالی سازمان">
        <ErrorBlock flat error={acct.error} message="دریافت حساب ریالی سازمان ممکن نشد" onRetry={() => acct.refetch()} />
      </Card>
    );
  }
  if (!acct.data) return <SkeletonCard h={268} />;

  const a = acct.data;
  const freeParts = compactParts(a.free);
  const moves = a.moves.filter((m) => ORG_MOVE[m.kind]).slice(0, MAX);
  const entries = a.entries.slice(0, MAX);
  /** A rejected receipt can be replaced: a package's latest receipt while the package still waits, or a plain deposit. */
  const canRenew = (e: OrgAccountEntry) => {
    if (e.status !== 'rejected') return false;
    if (!e.packageId) return true;
    const newer = a.entries.some((x) => x.packageId === e.packageId && x.id !== e.id && x.at > e.at);
    const p = pkgs.data?.find((x) => x.id === e.packageId);
    return !newer && p?.status === 'awaiting_payment';
  };
  /** A waiting package whose receipt was rejected (offered in the note). */
  const renewPkg = a.entries.find((e) => e.packageId && canRenew(e));
  /** Why the queued packages wait (unknown until the packages load → both reasons). */
  const byReceipt = pkgs.data?.filter((x) => x.status === 'awaiting_payment').length ?? 0;
  const byStock = pkgs.data?.filter((x) => x.status === 'awaiting_stock').length ?? 0;
  const inQueue = byStock && !byReceipt ? 'در صف تأمین موجودی نمادنو است' : byReceipt && !byStock ? 'در صف تأیید فیش واریز است' : 'در صف است (تأیید فیش واریز یا تأمین موجودی نمادنو)';
  const renew = (e: OrgAccountEntry) => setDialog(e.packageId
    ? { amount: e.amount, min: pkgs.data?.find((x) => x.id === e.packageId)?.funding?.toDeposit, packageId: e.packageId, packageTitle: e.packageTitle }
    : { amount: e.amount });

  return (
    <>
      <Card
        title="حساب ریالی سازمان"
        sub="واریزهای سازمان و مبلغ بسته‌های ارسالی"
        actions={<button type="button" className="nm-btn sm" onClick={() => setDialog({})}><Icon d={OM.deposit} size={15} />اعلام واریز</button>}
      >
        <div className="nm-grid c2" style={{ gap: 32 }}>
          <div className="nm-stack" style={{ gap: 14 }}>
            <Section title="آزاد" action={<span className="mute" style={{ fontSize: 12, fontWeight: 400 }}>قابل استفاده برای بسته‌های تازه</span>}>
              <BigNum value={freeParts[0]} unit={freeParts[1]} />
            </Section>
            <AccountBar a={a} />
            <KeyStats items={[
              ['بلاک‌شده برای بسته‌ها', <span key="b" className="num">{cm(a.blocked)}</span>],
              ['بسته در صف', <span key="q" className="num">{a.queuedCount ? `${faDigits(a.queuedCount)} · ${cm(a.queuedTotal)}` : 'ندارد'}</span>],
              ['فیش در انتظار تأیید', <span key="p" className="num">{a.pendingCount ? `${cm(a.pending)} · ${faDigits(a.pendingCount)} فیش` : 'ندارد'}</span>],
            ]} />
            {a.queuedCount > 0 && (
              <Note
                tone={renewPkg ? 'warn' : 'info'} icon={OM.clock}
                action={renewPkg ? <button type="button" className="nm-btn sm ghost" onClick={() => renew(renewPkg)}>فیش تازه</button> : undefined}
              >
                {faDigits(a.queuedCount)} بسته {inQueue} و تا آن زمان به همکاران ارسال نمی‌شود
                {a.setAside > 0 ? <>؛ <span className="num">{money(a.setAside)}</span> تومان از آزاد برای آن‌ها کنار گذاشته شده</> : null}
                {renewPkg ? <>. فیش «{renewPkg.packageTitle ?? 'بسته'}» رد شده است.</> : '.'}
              </Note>
            )}
          </div>

          <Section
            title={view === 'entries' ? 'آخرین فیش‌ها' : 'گردش حساب'}
            action={<Tabs label="نمایش حساب ریالی" value={view} onChange={setView} items={[{ key: 'entries', label: 'فیش‌ها' }, { key: 'moves', label: 'گردش حساب' }]} />}
          >
            {view === 'entries'
              ? (entries.length
                ? <List>{entries.map((e) => <EntryRow key={e.id} e={e} onRenew={canRenew(e) ? () => renew(e) : undefined} />)}</List>
                : <Empty icon={OM.deposit} title="هنوز فیشی ثبت نشده است" sub="پس از واریز به حساب نمادنو، فیش آن را با «اعلام واریز» بارگذاری کنید." />)
              : (moves.length ? <List>{moves.map((m) => <MoveRow key={m.id} m={m} />)}</List> : <Empty icon={OM.reserve} title="هنوز گردشی ثبت نشده است" />)}
          </Section>
        </div>
      </Card>
      <AnnounceDepositDialog open={!!dialog} amount={dialog?.amount} minAmount={dialog?.min} packageId={dialog?.packageId} packageTitle={dialog?.packageTitle} onClose={() => setDialog(null)} />
    </>
  );
}

/** Bar آزاد (solid) | کنار گذاشته (light, packages in the queue) | بلاک‌شده (hatched) + legend. The bar is the balance. */
function AccountBar({ a }: { a: OrgAccount }) {
  const aside = a.setAside ?? 0;
  const parts = [
    { key: 'f', v: a.free, bg: 'var(--primary-main)' },
    { key: 's', v: aside, bg: ASIDE },
    { key: 'b', v: a.blocked, bg: HATCH_BLOCKED },
  ].filter((p) => p.v > 0);
  const said = `آزاد ${money(a.free)} تومان${aside > 0 ? ` · کنار گذاشته برای بسته‌های در صف ${money(aside)} تومان` : ''} · بلاک‌شده ${money(a.blocked)} تومان`;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, minWidth: 0 }}>
      <div className="lkbar" role="img" aria-label={said} style={{ height: 8 }}>
        {parts.map((p) => <span key={p.key} style={{ flex: p.v, minWidth: 3, borderRadius: 6, background: p.bg }} />)}
      </div>
      <div className="nm-legend">
        <span><i style={{ background: 'var(--primary-main)', borderRadius: '50%' }} />آزاد <b>{compactMoney(a.free)}</b></span>
        {aside > 0 && <span><i style={{ background: ASIDE, borderRadius: '50%' }} />کنار گذاشته برای بسته‌های در صف <b>{compactMoney(aside)}</b></span>}
        <span><i style={{ background: HATCH_BLOCKED }} />بلاک‌شده <b>{compactMoney(a.blocked)}</b></span>
      </div>
    </div>
  );
}

function EntryRow({ e, onRenew }: { e: OrgAccountEntry; onRenew?: () => void }) {
  const st = entryState(e);
  const rejected = e.status === 'rejected';
  const sub = rejected
    ? <span style={{ color: 'var(--error-text)' }}>رد شد{e.rejectReason ? `: ${e.rejectReason}` : ''}</span>
    : <span className="num">{jDayMonth(e.status === 'done' ? e.receivedAt ?? e.at : e.at)}{e.note ? ` · ${faDigits(e.note)}` : ''}</span>;
  return (
    <ListRow
      lead={<ReceiptThumb receipt={e.receipt} size={36} />}
      title={e.title}
      sub={sub}
      trail={(
        <>
          <span className="num" title={`${money(e.amount)} تومان`} style={{ fontWeight: 600 }}>{compactMoney(e.amount)}</span>
          <Pill tone={st.tone}>{st.label}</Pill>
          {onRenew && <button type="button" className="nm-btn sm line" onClick={onRenew}>فیش تازه</button>}
        </>
      )}
    />
  );
}

function MoveRow({ m }: { m: RialMove }) {
  const k = ORG_MOVE[m.kind]!;
  return (
    <ListRow
      lead={<Tile d={k.d} tone={k.tone} />}
      title={k.label}
      sub={<span className="num">{m.kind === 'payout' && m.userName ? m.userName : m.title} · {jDayMonth(m.at)}</span>}
      trail={<span className="num" title={`${money(m.amount)} تومان`} style={{ fontWeight: 600, color: k.sign === '+' ? 'var(--success-text)' : undefined }}>{k.sign}{compactMoney(m.amount)}</span>}
    />
  );
}
