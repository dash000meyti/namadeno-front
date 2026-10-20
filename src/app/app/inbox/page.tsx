'use client';
/**
 * «دریافتی‌ها» — pending packages (design: app-inbox + app-inbox-fixed).
 * The opened package (?open=<inboxId>, default first pending) is expanded:
 * free allocation → 4 option cards with steppers; fixed allocation → read-only composer.
 */
import { Suspense } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useAcceptInbox, useFunds, useInbox } from '@/api/app';
import { AppHeader, HeaderIconButton } from '@/components/app/AppHeader';
import { BottomNav } from '@/components/app/BottomNav';
import { ErrorState, Scr, Skeleton } from '@/components/app/Screen';
import { useToast } from '@/components/ui/Toast';
import { Icon } from '@/components/ui/Icon';
import { CollapsedPackage, FixedPackage, FreePackage } from '@/components/app/core/inbox';
import { EmptyCard, InboxTabs, errMsg } from '@/components/app/core/ui';
import { P } from '@/components/app/core/meta';
import { routes } from '@/lib/routes';
import type { AllocationSplit } from '@/types/domain';

export default function InboxPage() {
  return (
    <>
      <Suspense fallback={<Scr gap={12}><Skeleton h={44} r={8} /><Skeleton h={420} /></Scr>}>
        <InboxContent />
      </Suspense>
      <AppHeader title="دریافتی‌ها" actions={<HeaderIconButton first icon="clock" href={routes.app.inboxArchive} label="تاریخچه دریافتی‌ها" />} />
      <BottomNav active="inbox" />
    </>
  );
}

function InboxContent() {
  const router = useRouter();
  const toast = useToast();
  const sp = useSearchParams();
  const openParam = sp.get('open');
  const pending = useInbox('pending');
  const accepted = useInbox('accepted');
  const funds = useFunds();
  const accept = useAcceptInbox();

  const list = pending.data ?? [];
  const openId = openParam && list.some((p) => p.id === openParam) ? openParam : list[0]?.id;
  const openIdx = list.findIndex((p) => p.id === openId);
  const alreadyAccepted = openParam && !list.some((p) => p.id === openParam) ? accepted.data?.find((p) => p.id === openParam) : undefined;

  const doAccept = (id: string, split?: AllocationSplit) => {
    accept.mutate({ id, split }, {
      onSuccess: () => router.push(routes.app.inboxDone(id)),
      onError: (e) => toast(errMsg(e), 'error'),
    });
  };
  const errFor = (id: string) => (accept.isError && accept.variables?.id === id ? accept.error : undefined);

  return (
    <Scr gap={12}>
      <InboxTabs active="new" pending={pending.data?.length} accepted={accepted.data?.length} />

      {alreadyAccepted && (
        <Link href={routes.app.inboxDone(alreadyAccepted.id)} className="card" style={{ boxSizing: 'border-box', padding: '10px 14px', display: 'flex', alignItems: 'center', gap: 10, color: 'var(--text-primary)', textDecoration: 'none', fontSize: 13 }}>
          <Icon d={P.checkCircle} size={18} style={{ color: 'var(--success-text)' }} />
          <span style={{ flex: 1, minWidth: 0 }}>«{alreadyAccepted.title}» قبلاً تأیید شده است.</span>
          <Icon d={P.chevLeft} size={16} style={{ color: 'var(--text-disabled)' }} />
        </Link>
      )}

      {pending.isLoading ? (
        <>
          <Skeleton h={420} />
          <Skeleton h={64} />
        </>
      ) : pending.isError ? (
        <ErrorState message="دریافت بسته‌ها ممکن نشد" onRetry={() => pending.refetch()} />
      ) : list.length === 0 ? (
        <EmptyCard
          d={P.inbox}
          tone="primary"
          title="دریافتی جدیدی ندارید"
          text="بسته‌هایی که سازمان برای شما می‌فرستد، اینجا برای تأیید و انتخاب نحوه تخصیص نمایش داده می‌شوند."
          action={<Link href={routes.app.inboxArchive} className="btn" style={{ marginTop: 4, display: 'inline-flex', alignItems: 'center', background: 'var(--soft-primary)', color: 'var(--primary-text)', textDecoration: 'none' }}>دریافتی‌های تأیید‌شده</Link>}
        />
      ) : (
        list.map((p, i) => {
          if (p.id !== openId) return <CollapsedPackage key={p.id} pkg={p} above={i < openIdx} />;
          const busy = accept.isPending && accept.variables?.id === p.id;
          return p.allocationMode === 'free' ? (
            <FreePackage key={p.id} pkg={p} busy={busy} error={errFor(p.id)} onAccept={(s) => doAccept(p.id, s)} />
          ) : (
            <FixedPackage key={p.id} pkg={p} funds={funds.data} busy={busy} error={errFor(p.id)} onAccept={() => doAccept(p.id)} />
          );
        })
      )}
    </Scr>
  );
}
