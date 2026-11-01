'use client';
/**
 * «خزانه و تعهدات» of one organization (operator organization page): members' assets in the pooled stock (free /
 * reserved), commitments to recipients who have not accepted yet, deposits (expected / overdue / received this year)
 * with the latest ones, and what is coming in the next 90 days. Links go to the cash page filtered by the organization.
 */
import { useOrgTreasury, type ForecastEvent } from '@/api/op-treasury-extra';
import { Card, Empty, ErrorBlock, FreeLocked, KeyStats, List, ListRow, Note, Pill, Section, SkeletonCard, Tile } from '@/components/panel/kit';
import { EVENT_KIND, TI, amt, cashStatus } from '@/components/op/treasury/ui';
import { faDigits, jDate } from '@/lib/format';
import { routes } from '@/lib/routes';

const EVENT_ICON: Record<ForecastEvent['kind'], string> = {
  vesting_release: TI.clock, milestone_due: TI.target, package_expiry: TI.order, planned_package: TI.plan, order_settle: TI.order, deposit_due: TI.deposit,
};

export function OrgTreasuryCards({ orgId, orgName }: { orgId: string; orgName: string }) {
  const q = useOrgTreasury(orgId);
  const cash = `${routes.op.cash}?org=${encodeURIComponent(orgId)}`;
  if (q.isLoading) return <SkeletonCard h={280} />;
  if (q.isError || !q.data) return <ErrorBlock error={q.error} message={q.isError ? undefined : 'اطلاعات خزانه‌ی این سازمان پیدا نشد'} onRetry={() => q.refetch()} />;
  const { row: r, deposits, upcoming } = q.data;
  const recent = deposits.slice(0, 5);
  const next = upcoming.slice(0, 6);

  return (
    <div className="nm-grid side">
      <Card title="خزانه و تعهدات" sub="اکنون" more={{ label: 'نقدینگی سازمان', href: cash }}>
        <KeyStats items={[
          ['دارایی کارکنان', amt(r.value)],
          ['سهم از موجودی صندوق‌ها', amt(r.fundValue)],
          ['تعهد بسته‌های باز', r.commitments > 0 ? amt(r.commitments) : '—'],
        ]} />
        {r.value > 0 && <FreeLocked free={Math.max(0, r.value - r.reservedValue)} locked={r.reservedValue} fmt={amt} unit="تومان" />}
        {r.commitments > 0 && (
          <span className="mute" style={{ fontSize: 12.5 }}>
            {faDigits(r.pendingRecipients)} نفر هنوز بسته را نپذیرفته‌اند؛ سهم آن‌ها از موجودی آزاد خزانه کنار گذاشته شده است.
          </span>
        )}

        <Section title="واریزها">
          <KeyStats items={[
            ['در انتظار', r.depositsExpected > 0 ? amt(r.depositsExpected) : '—'],
            ['دیرکرد', r.depositsOverdue > 0 ? amt(r.depositsOverdue) : 'ندارد'],
            ['دریافتی امسال', amt(r.depositsReceivedYear)],
          ]} />
          {r.depositsOverdue > 0 && <Note tone="err">{amt(r.depositsOverdue)} تومان از واریزهای {orgName} از سررسید گذشته است.</Note>}
          {recent.length ? (
            <List>
              {recent.map((e) => {
                const st = cashStatus(e);
                const expected = e.status === 'expected';
                return (
                  <ListRow
                    key={e.id} href={`${routes.op.cash}?org=${encodeURIComponent(orgId)}&id=${encodeURIComponent(e.id)}`} label={`${e.title} · ${st.label}`}
                    lead={<Tile d={TI.deposit} tone={st.tone} />}
                    title={e.title}
                    sub={expected
                      ? `سررسید ${e.dueAt ? jDate(e.dueAt) : '—'}`
                      : `دریافت ${jDate(e.receivedAt ?? e.at)}${e.ref ? ` · مرجع ${e.ref}` : ''}`}
                    trail={<><span className="num">{amt(e.amount)}</span><Pill tone={st.tone} dot>{st.label}</Pill></>}
                  />
                );
              })}
            </List>
          ) : <Empty icon={TI.deposit} title="هنوز واریزی برای این سازمان ثبت نشده است" />}
        </Section>
      </Card>

      <Card title="پیش رو" sub="۹۰ روز آینده" count={upcoming.length || undefined}>
        {next.length ? (
          <List>
            {next.map((e) => (
              <ListRow
                key={e.id} href={e.href} label={e.href ? e.title : undefined}
                lead={<Tile d={EVENT_ICON[e.kind]} tone={EVENT_KIND[e.kind].tone} />}
                title={e.title}
                sub={`${EVENT_KIND[e.kind].label} · ${jDate(e.at)}${e.count ? ` · ${faDigits(e.count)} نفر` : ''}`}
                trail={e.value ? <span className="num">{amt(e.value)}</span> : undefined}
              />
            ))}
          </List>
        ) : <Empty icon={TI.clock} title="رویدادی در ۹۰ روز آینده نیست" sub="آزادسازی پس‌انداز، سررسید مرحله‌ها و واریزها اینجا می‌آیند." />}
        {upcoming.length > next.length && <span className="mute" style={{ fontSize: 12 }}>و {faDigits(upcoming.length - next.length)} رویداد دیگر</span>}
      </Card>
    </div>
  );
}
