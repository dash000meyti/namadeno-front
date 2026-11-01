'use client';
/**
 * Treasury cards of one organization (operator organization page, «نمای کلی»):
 *   «حساب ریالی سازمان» — the organization's rial account with Namadno (آزاد / بلاک‌شده / فیش در انتظار, two-part bar,
 *                         the part waiting for a receipt, «ثبت واریز», recent rial movements)
 *   «فیش‌های واریز»     — receipts waiting for review («بررسی» opens ReviewDepositDialog here), rejected and approved ones,
 *                         received this year
 *   «دارایی کارکنان در خزانه» — members' assets in the pooled stock (free / reserved) and recipients still to accept
 *   «پیش رو»            — what is coming in the next 90 days
 * Links go to the cash page filtered by the organization.
 */
import { useState } from 'react';
import { useOrgTreasury, useRialMoves, type CashEntry, type ForecastEvent } from '@/api/op-treasury-extra';
import { Card, Empty, ErrorBlock, FreeLocked, KeyStats, List, ListRow, Note, Pill, Section, SkeletonCard, SkeletonRows, Tile } from '@/components/panel/kit';
import { Icon } from '@/components/ui/Icon';
import { ReceiptThumb } from '@/components/ui/Receipt';
import { EVENT_KIND, ORG_RIAL, TI, amt, cashStatus } from '@/components/op/treasury/ui';
import { faDigits, jDate, relTime } from '@/lib/format';
import { now } from '@/lib/clock';
import { routes } from '@/lib/routes';
import { RecordDepositDialog } from './DepositDialogs';
import { queueText } from './OrgRialInspector';
import { ReviewDepositDialog, depositPurpose } from './ReviewDepositDialog';
import { RialMoveRow, RialSplit } from './rial';

const EVENT_ICONS: Partial<Record<ForecastEvent['kind'], string>> = {
  vesting_release: TI.clock, milestone_due: TI.target, package_expiry: TI.order, planned_package: TI.plan, order_settle: TI.order,
};
const eventIcon = (k: ForecastEvent['kind']) => EVENT_ICONS[k] ?? TI.deposit;

export function OrgTreasuryCards({ orgId, orgName }: { orgId: string; orgName: string }) {
  const q = useOrgTreasury(orgId);
  const movesQ = useRialMoves({ orgId, limit: 6 });
  const [recordKey, setRecordKey] = useState(0);
  const [review, setReview] = useState<CashEntry | null>(null);
  const cash = `${routes.op.cash}?org=${encodeURIComponent(orgId)}`;
  if (q.isLoading) return <SkeletonCard h={280} />;
  if (q.isError || !q.data) return <ErrorBlock error={q.error} message={q.isError ? undefined : 'اطلاعات خزانه‌ی این سازمان پیدا نشد'} onRetry={() => q.refetch()} />;
  const { row: r, deposits, upcoming } = q.data;
  const a = r.rial;
  // receipts: pending first, then the latest reviewed ones (replaced receipts and deposits recorded without one are left out)
  const pendingDeps = deposits.filter((e) => e.status === 'expected');
  const rejectedDeps = deposits.filter((e) => e.status === 'rejected');
  const recent = [...pendingDeps, ...deposits.filter((e) => e.status === 'rejected' || (e.status === 'done' && !!e.receipt))].slice(0, 6);
  const nowD = now();
  const next = upcoming.slice(0, 6);
  const moves = movesQ.data ?? [];

  return (
    <>
      <div className="nm-grid side">
        <Card
          title="حساب ریالی سازمان" sub={`مانده ${amt(a.balance)} تومان`}
          actions={<button type="button" className="nm-btn sm ghost" onClick={() => setRecordKey((k) => k + 1)}><Icon d={TI.plus} size={15} strokeWidth={2} />ثبت واریز</button>}
          more={{ label: 'نقدینگی سازمان', href: cash }}
        >
          <KeyStats items={[
            [ORG_RIAL.free.label, amt(a.free)],
            [ORG_RIAL.blocked.label, a.blocked > 0 ? amt(a.blocked) : '—'],
            ['فیش در انتظار', a.pending > 0 ? amt(a.pending) : '—'],
          ]} />
          <RialSplit a={a} />
          {a.queuedCount > 0 && <Note tone="info" icon={TI.clock}>{queueText(a, orgName)}</Note>}
          <span className="mute" style={{ fontSize: 12, lineHeight: 1.7 }}>
            {ORG_RIAL.free.label}: {ORG_RIAL.free.sub} · {ORG_RIAL.blocked.label}: {ORG_RIAL.blocked.sub}
          </span>
          <Section title="گردش ریالی اخیر">
            {movesQ.isLoading ? <SkeletonRows n={3} /> : moves.length ? (
              <List>{moves.map((m) => <RialMoveRow key={m.id} m={m} />)}</List>
            ) : <Empty icon={TI.wallet} title="گردش ریالی برای این سازمان ثبت نشده است" />}
          </Section>
        </Card>

        <Card title="فیش‌های واریز" count={pendingDeps.length || undefined} sub={pendingDeps.length ? 'در انتظار تأیید' : undefined} more={{ label: 'همه', href: cash }}>
          <KeyStats items={[
            ['در انتظار تأیید', r.depositsExpected > 0 ? amt(r.depositsExpected) : '—'],
            ['ردشده', rejectedDeps.length ? `${faDigits(rejectedDeps.length)} فیش` : '—'],
            ['دریافتی امسال', amt(r.depositsReceivedYear)],
          ]} />
          {pendingDeps.length > 0 && (
            <Note tone="warn" icon={TI.clock}>
              {faDigits(pendingDeps.length)} فیش واریز {orgName} به مبلغ {amt(r.depositsExpected)} تومان در انتظار تأیید است.
            </Note>
          )}
          {recent.length ? (
            <List>
              {recent.map((e) => {
                const st = cashStatus(e);
                const title = depositPurpose(e);
                if (e.status === 'expected') {
                  return (
                    <ListRow
                      key={e.id}
                      lead={<ReceiptThumb receipt={e.receipt} size={40} />}
                      title={title}
                      sub={`ارسال ${relTime(e.at, nowD)}${e.note ? ` · ${e.note}` : ''}`}
                      trail={(
                        <>
                          <span className="num">{amt(e.amount)}</span>
                          <button type="button" className="nm-btn sm line" aria-label={`بررسی فیش ${title}`} onClick={() => setReview(e)}>بررسی</button>
                        </>
                      )}
                    />
                  );
                }
                return (
                  <ListRow
                    key={e.id} href={`${routes.op.cash}?org=${encodeURIComponent(orgId)}&id=${encodeURIComponent(e.id)}`} label={`${title} · ${st.label}`}
                    lead={<ReceiptThumb receipt={e.receipt} size={40} />}
                    title={title}
                    sub={e.status === 'rejected'
                      ? `رد ${jDate(e.rejectedAt ?? e.at)}${e.rejectReason ? ` · ${e.rejectReason}` : ''}`
                      : `تأیید ${jDate(e.receivedAt ?? e.at)}${e.ref ? ` · مرجع ${e.ref}` : ''}`}
                    trail={<><span className="num">{amt(e.amount)}</span><Pill tone={st.tone} dot>{st.label}</Pill></>}
                  />
                );
              })}
            </List>
          ) : <Empty icon={TI.deposit} title="هنوز فیش واریزی از این سازمان نرسیده است" />}
        </Card>
      </div>

      <div className="nm-grid side">
        <Card title="دارایی کارکنان در خزانه" sub="اکنون">
          <KeyStats items={[
            ['دارایی کارکنان', amt(r.value)],
            ['سهم از موجودی صندوق‌ها', amt(r.fundValue)],
            ['در انتظار پذیرش', r.pendingRecipients > 0 ? `${faDigits(r.pendingRecipients)} نفر` : '—'],
          ]} />
          {r.value > 0 && <FreeLocked free={Math.max(0, r.value - r.reservedValue)} locked={r.reservedValue} fmt={amt} unit="تومان" />}
          {r.pendingRecipients > 0 && (
            <span className="mute" style={{ fontSize: 12.5 }}>
              {faDigits(r.pendingRecipients)} نفر هنوز بسته را نپذیرفته‌اند؛ مبلغ آن‌ها در «ریال رزرو» بلاک مانده است.
            </span>
          )}
        </Card>

        <Card title="پیش رو" sub="۹۰ روز آینده" count={upcoming.length || undefined}>
          {next.length ? (
            <List>
              {next.map((e) => (
                <ListRow
                  key={e.id} href={e.href} label={e.href ? e.title : undefined}
                  lead={<Tile d={eventIcon(e.kind)} tone={EVENT_KIND[e.kind].tone} />}
                  title={e.title}
                  sub={`${EVENT_KIND[e.kind].label} · ${jDate(e.at)}${e.count ? ` · ${faDigits(e.count)} نفر` : ''}`}
                  trail={e.value ? <span className="num">{amt(e.value)}</span> : undefined}
                />
              ))}
            </List>
          ) : <Empty icon={TI.clock} title="رویدادی در ۹۰ روز آینده نیست" sub="آزادسازی پس‌انداز، سررسید مرحله‌ها و بسته‌های برنامه‌ریزی‌شده اینجا می‌آیند." />}
          {upcoming.length > next.length && <span className="mute" style={{ fontSize: 12 }}>و {faDigits(upcoming.length - next.length)} رویداد دیگر</span>}
        </Card>
      </div>

      {review && <ReviewDepositDialog key={`review-${review.id}`} entry={review} onClose={() => setReview(null)} />}
      {recordKey > 0 && (
        <RecordDepositDialog
          key={`record-${recordKey}`} orgs={[{ id: orgId, name: orgName }]} expected={deposits.filter((e) => e.status === 'expected')} orgId={orgId}
          onClose={() => setRecordKey(0)}
        />
      )}
    </>
  );
}
