'use client';
/**
 * Organization — notifications («اعلان‌ها», opened from the bell). The shared NotificationsView (same page in the
 * operator console): «نیاز به اقدام» (derived from current data: steps waiting for approval, unsent drafts, colleagues not
 * activated, rejected receipts …) and «به‌روزرسانی‌های سامانه». A row marks itself read and opens its target.
 */
import { useRouter } from 'next/navigation';
import { useMarkOrgNotificationsRead, useOrgNotifications, type OrgNotification } from '@/api/org-people-extra';
import { NotificationsView } from '@/components/panel/Notifications';
import { useToast } from '@/components/ui/Toast';
import { errMsg } from '@/components/org/people/shared';

export default function OrgNotificationsPage() {
  const router = useRouter();
  const toast = useToast();
  const q = useOrgNotifications();
  const mark = useMarkOrgNotificationsRead();

  const open = (n: OrgNotification) => {
    if (!n.read) mark.mutate({ ids: [n.id] });
    if (n.href) router.push(n.href);
  };
  const readAll = () => mark.mutate({}, { onSuccess: () => toast('همه‌ی اعلان‌ها خوانده شد'), onError: (e) => toast(errMsg(e), 'error') });

  return (
    <NotificationsView
      items={q.data?.items ?? []} loading={q.isLoading} error={q.isError ? q.error : undefined} onRetry={() => q.refetch()}
      onOpen={open} onReadAll={readAll} readAllBusy={mark.isPending}
      sub="کارهایی که منتظر شماست و تازه‌های سامانه"
      emptyAction={{ title: 'کاری منتظر شما نیست', sub: 'درخواست‌ها و کارهای تازه اینجا نمایش داده می‌شود.' }}
    />
  );
}
