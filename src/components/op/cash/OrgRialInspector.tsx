'use client';
/**
 * Inspector of one organization's rial account with Namadno (cash page, «حساب ریالی سازمان‌ها»):
 * آزاد / بلاک‌شده / فیش در انتظار, the account bar, its packages in the queue (waiting for receipt approval), its deposit receipts («فیش‌های
 * واریز»: pending ones with «بررسی», then rejected and approved ones), recent rial movements and «ثبت واریز» in the
 * footer. Dialogs stay with the page.
 */
import type { CashEntry, OrgRialAccount, RialMove } from '@/api/op-treasury-extra';
import { useCashEntries, useRialMoves } from '@/api/op-treasury-extra';
import { Ava, Empty, Inspector, KeyStats, List, ListRow, Note, Pill, Section, SkeletonRows, Who } from '@/components/panel/kit';
import { Icon } from '@/components/ui/Icon';
import { ReceiptThumb } from '@/components/ui/Receipt';
import { ORG_STATUS } from '@/components/op/core/ui';
import { ORG_RIAL, TI, amt, cashStatus } from '@/components/op/treasury/ui';
import { faDigits, jDate, money, relTime } from '@/lib/format';
import { now } from '@/lib/clock';
import { routes } from '@/lib/routes';
import { RialMoveRow, RialSplit } from './rial';
import { depositPurpose } from './ReviewDepositDialog';

/**
 * «{n} بسته‌ی {org} … در صف است …» — packages waiting for their receipt approval: nothing is delivered or blocked
 * until then; what «آزاد» covered is set aside for them.
 */
export function queueText(a: Pick<OrgRialAccount, 'queuedCount' | 'queuedTotal' | 'setAside' | 'pending'>, orgName: string) {
  const head = `${faDigits(a.queuedCount)} بسته‌ی ${orgName} به مبلغ ${amt(a.queuedTotal)} تومان در صف است`;
  const aside = a.setAside > 0 ? ` (${amt(a.setAside)} تومان از آزاد برایش کنار گذاشته شده)` : '';
  return a.pending > 0
    ? `${head}${aside}؛ با تأیید فیش برای همکاران ارسال می‌شود.`
    : `${head}${aside}؛ تا فیش تازه و تأیید آن ارسال نمی‌شود.`;
}

export function OrgRialInspector({ account: a, orgLetter, onClose, onReview, onRecord, onEntry, onMove }: {
  account: OrgRialAccount;
  orgLetter?: string;
  onClose: () => void;
  /** «بررسی» of a receipt waiting for review. */
  onReview: (e: CashEntry) => void;
  /** «ثبت واریز» for this organization. */
  onRecord: (orgId: string) => void;
  /** Opens an approved / rejected receipt in the page inspector. */
  onEntry: (e: CashEntry) => void;
  onMove: (m: RialMove) => void;
}) {
  const depQ = useCashEntries({ kind: 'org_deposit', orgId: a.orgId });
  const movesQ = useRialMoves({ orgId: a.orgId, limit: 6 });
  const deps = depQ.data ?? [];
  const pending = deps.filter((e) => e.status === 'expected');
  const rejected = deps.filter((e) => e.status === 'rejected').slice(0, 2);
  const approved = deps.filter((e) => e.status === 'done' && !!e.receipt).slice(0, 3);
  const moves = movesQ.data ?? [];
  const nowD = now();

  return (
    <Inspector
      open onClose={onClose} title="حساب ریالی سازمان" label={`حساب ریالی ${a.orgName}`}
      href={routes.op.organization(a.orgId)} hrefLabel="صفحه سازمان"
      footer={<button type="button" className="nm-btn" onClick={() => onRecord(a.orgId)}><Icon d={TI.plus} size={16} strokeWidth={2} />ثبت واریز</button>}
    >
      <Who
        lead={<Ava letter={orgLetter ?? a.orgName[0]} id={a.orgId} sq size="lg" />}
        title={a.orgName}
        sub={<>مانده‌ی حساب <span className="num">{money(a.balance)}</span> تومان</>}
        pills={(
          <>
            <Pill tone={a.status === 'active' ? 'success' : a.status === 'suspended' ? 'error' : 'info'} dot>{ORG_STATUS[a.status].label}</Pill>
            {a.pendingCount > 0 && <Pill tone={ORG_RIAL.pending.tone}>{faDigits(a.pendingCount)} فیش در انتظار تأیید</Pill>}
          </>
        )}
      />
      <KeyStats items={[
        [ORG_RIAL.free.label, amt(a.free)],
        [ORG_RIAL.blocked.label, a.blocked > 0 ? amt(a.blocked) : '—'],
        ['فیش در انتظار', a.pending > 0 ? amt(a.pending) : '—'],
      ]} />
      <RialSplit a={a} />
      {a.queuedCount > 0 && <Note tone="info" icon={TI.clock}>{queueText(a, a.orgName)}</Note>}
      <span className="mute" style={{ fontSize: 12, lineHeight: 1.7 }}>{ORG_RIAL.free.label}: {ORG_RIAL.free.sub} · {ORG_RIAL.blocked.label}: {ORG_RIAL.blocked.sub}</span>

      <Section title="فیش‌های واریز" action={pending.length > 0 ? <Pill tone="warning">{faDigits(pending.length)} در انتظار تأیید</Pill> : undefined}>
        {depQ.isLoading ? <SkeletonRows n={3} /> : pending.length + rejected.length + approved.length ? (
          <List>
            {pending.map((e) => (
              <ListRow
                key={e.id}
                lead={<ReceiptThumb receipt={e.receipt} size={40} />}
                title={depositPurpose(e)}
                sub={`ارسال ${relTime(e.at, nowD)}${e.note ? ` · ${e.note}` : ''}`}
                trail={(
                  <>
                    <span className="num">{amt(e.amount)}</span>
                    <button type="button" className="nm-btn sm line" aria-label={`بررسی فیش ${depositPurpose(e)}`} onClick={() => onReview(e)}>بررسی</button>
                  </>
                )}
              />
            ))}
            {[...rejected, ...approved].map((e) => {
              const st = cashStatus(e);
              return (
                <ListRow
                  key={e.id} onClick={() => onEntry(e)} label={`${depositPurpose(e)} · ${st.label}`}
                  lead={<ReceiptThumb receipt={e.receipt} size={40} />}
                  title={depositPurpose(e)}
                  sub={e.status === 'rejected'
                    ? `رد ${jDate(e.rejectedAt ?? e.at)}${e.rejectReason ? ` · ${e.rejectReason}` : ''}`
                    : `تأیید ${jDate(e.receivedAt ?? e.at)}${e.by ? ` · ${e.by}` : ''}`}
                  trail={<><span className="num">{amt(e.amount)}</span><Pill tone={st.tone} dot>{st.label}</Pill></>}
                />
              );
            })}
          </List>
        ) : <Empty icon={TI.deposit} title="هنوز فیش واریزی از این سازمان نرسیده است" />}
      </Section>

      <Section title="گردش ریالی اخیر">
        {movesQ.isLoading ? <SkeletonRows n={3} /> : moves.length ? (
          <List>{moves.map((m) => <RialMoveRow key={m.id} m={m} onClick={() => onMove(m)} />)}</List>
        ) : <Empty icon={TI.wallet} title="گردش ریالی ثبت نشده است" />}
      </Section>
    </Inspector>
  );
}
