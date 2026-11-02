'use client';
/**
 * Operator console — notifications («اعلان‌ها», opened from the bell). The shared NotificationsView (same page as the
 * organization panel's): «نیاز به اقدام» = the action queue as it is now (need to buy, receipts to review,
 * risk alerts, incidents …; most severe first) and «به‌روزرسانی‌ها» = what changed in the treasury and with customers in
 * the last 7 days plus news of the console. A row marks itself read (per operator) and opens its target.
 */
import { useRouter } from 'next/navigation';
import { useMarkOpNotificationsRead, useOpNotifications, type OpNotification } from '@/api/op-treasury-extra';
import { NotificationsView, NOTICE_ICON } from '@/components/panel/Notifications';
import { Pill, type Tone } from '@/components/panel/kit';
import { useToast } from '@/components/ui/Toast';
import { errMsg } from '@/components/op/system/fmt';
import { ACTION_KIND, SEVERITY, TI } from '@/components/op/treasury/ui';

/** Tile of an update by its category (console news = sparkle). */
const UPDATE_TILE: Record<NonNullable<OpNotification['category']>, { d: string; tone: Tone }> = {
  treasury: { d: TI.order, tone: 'primary' },
  cash: { d: TI.deposit, tone: 'success' },
  package: { d: TI.team, tone: 'secondary' },
  trade: { d: TI.buy, tone: 'info' },
  reserve: { d: TI.reserve, tone: 'neutral' },
  account: { d: TI.user, tone: 'warning' },
  contract: { d: TI.org, tone: 'secondary' },
  request: { d: TI.clock, tone: 'warning' },
  console: { d: NOTICE_ICON.update, tone: 'info' },
};

export default function OpNotificationsPage() {
  const router = useRouter();
  const toast = useToast();
  const q = useOpNotifications();
  const mark = useMarkOpNotificationsRead();

  const open = (n: OpNotification) => {
    if (!n.read) mark.mutate({ ids: [n.id] });
    if (n.href) router.push(n.href);
  };
  const readAll = () => mark.mutate({}, { onSuccess: () => toast('همه‌ی اعلان‌ها خوانده شد'), onError: (e) => toast(errMsg(e), 'error') });
  const tileOf = (n: OpNotification) => (n.kind === 'action'
    ? (n.actionKind ? ACTION_KIND[n.actionKind] : { d: NOTICE_ICON.action, tone: 'warning' as Tone })
    : UPDATE_TILE[n.category ?? 'console']);
  const pillOf = (n: OpNotification) => (n.kind === 'action' && n.severity && n.severity !== 'info'
    ? <Pill tone={SEVERITY[n.severity].tone}>{SEVERITY[n.severity].label}</Pill>
    : null);

  return (
    <NotificationsView
      items={q.data?.items ?? []} loading={q.isLoading} error={q.isError ? q.error : undefined} onRetry={() => q.refetch()}
      onOpen={open} onReadAll={readAll} readAllBusy={mark.isPending}
      sub="کارهایی که منتظر تیم بهره‌بردار است و تازه‌های خزانه، مشتریان و کنسول"
      updatesLabel="به‌روزرسانی‌ها"
      emptyAction={{ title: 'کاری منتظر شما نیست', sub: 'نیاز به خرید، فیش‌های واریز و هشدارها اینجا می‌آید.' }}
      tileOf={tileOf} pillOf={pillOf}
    />
  );
}
