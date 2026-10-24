'use client';
/** «اعلان‌ها» (design: app-notifications) — all / unread tabs, today / earlier groups, mark read on click, read-all. */
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useNotifications, useReadAllNotifications, useReadNotification } from '@/api/app';
import { AppHeader, HeaderIconButton } from '@/components/app/AppHeader';
import { BottomNav } from '@/components/app/BottomNav';
import { ErrorState, Scr, Skeleton } from '@/components/app/Screen';
import { Icon, ICONS, type IconName } from '@/components/ui/Icon';
import { useToast } from '@/components/ui/Toast';
import { P, TONE, type Tone } from '@/components/app/core/meta';
import { EmptyCard, errMsg } from '@/components/app/core/ui';
import { faDigits, jDate, relTime } from '@/lib/format';
import { now } from '@/lib/clock';
import { LOCK_META } from '@/lib/locks';
import { routes } from '@/lib/routes';
import type { AppNotification } from '@/types/domain';

export default function NotificationsPage() {
  const router = useRouter();
  const toast = useToast();
  const q = useNotifications();
  const readOne = useReadNotification();
  const readAll = useReadAllNotifications();
  const [tab, setTab] = useState<'all' | 'unread'>('all');

  const items = q.data ?? [];
  const unreadCount = items.filter((n) => !n.read).length;
  const shown = tab === 'unread' ? items.filter((n) => !n.read) : items;
  const today = jDate(now());
  const groups = [
    { title: 'امروز', items: shown.filter((n) => jDate(n.at) === today) },
    { title: 'قبل‌تر', items: shown.filter((n) => jDate(n.at) !== today) },
  ].filter((g) => g.items.length > 0);

  const open = (n: AppNotification) => {
    if (!n.read) readOne.mutate(n.id);
    if (n.href) router.push(n.href);
  };
  const markAll = () => readAll.mutate(undefined, {
    onSuccess: () => toast('همه اعلان‌ها خوانده‌شده شد'),
    onError: (e) => toast(errMsg(e), 'error'),
  });

  return (
    <>
      <Scr>
        <div role="tablist" aria-label="فیلتر اعلان‌ها" style={{ height: 44, boxSizing: 'border-box', padding: 4, borderRadius: 10, background: 'var(--bg-neutral)', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 4 }}>
          {([['all', 'همه'], ['unread', 'خوانده‌نشده']] as const).map(([k, label]) => {
            const sel = tab === k;
            return (
              <button key={k} role="tab" aria-selected={sel} onClick={() => setTab(k)} style={{ border: 0, borderRadius: 8, background: sel ? 'var(--seg-active)' : 'transparent', boxShadow: sel ? 'var(--shadow-z1)' : 'none', color: sel ? 'var(--text-primary)' : 'var(--text-secondary)', fontFamily: 'inherit', fontSize: 13, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, padding: 0 }}>
                {label}
                {k === 'unread' && unreadCount > 0 && <span className="lbl" style={{ height: 20, padding: '0 6px', background: 'var(--soft-error)', color: 'var(--error-text)' }}>{faDigits(unreadCount)}</span>}
              </button>
            );
          })}
        </div>

        {q.isLoading ? (
          <>
            <Skeleton h={44} />
            <Skeleton h={76} />
            <Skeleton h={76} />
            <Skeleton h={76} />
          </>
        ) : q.isError ? (
          <ErrorState message="دریافت اعلان‌ها ممکن نشد" onRetry={() => q.refetch()} />
        ) : (
          <>
            <div style={{ height: 44, display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>{unreadCount > 0 ? `${faDigits(unreadCount)} اعلان خوانده‌نشده` : `${faDigits(items.length)} اعلان`}</span>
              {unreadCount > 0 ? (
                <button onClick={markAll} disabled={readAll.isPending} style={{ marginRight: 'auto', height: 44, border: 0, background: 'transparent', padding: '0 4px', fontFamily: 'inherit', fontSize: 13, fontWeight: 700, color: 'var(--primary-text)', cursor: readAll.isPending ? 'progress' : 'pointer', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                  <Icon d="M2 12.5l4.5 4.5L15 8.5M9 15.5l1.5 1.5L21 6.5" size={18} />همه را خوانده‌شده کن
                </button>
              ) : (
                <span className="lbl" style={{ marginRight: 'auto', background: 'var(--soft-success)', color: 'var(--success-text)' }}>همه خوانده شد</span>
              )}
            </div>

            {groups.map((g) => (
              <div key={g.title} style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-secondary)' }}>{g.title}</span>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {g.items.map((n) => <NotificationCard key={n.id} n={n} onOpen={() => open(n)} />)}
                </div>
              </div>
            ))}

            {groups.length === 0 && (
              <EmptyCard
                d="M6 16V11a6 6 0 0 1 12 0v5l1.5 2h-15zM10 21h4M9.5 11.5l2 2 3.5-3.5"
                title={tab === 'unread' ? 'اعلان خوانده‌نشده‌ای ندارید' : 'اعلانی ندارید'}
                text="اعلان‌های جدید بسته‌ها، اقساط و سود صندوق‌ها اینجا نمایش داده می‌شوند."
                action={tab === 'unread' ? <button className="btn" onClick={() => setTab('all')} style={{ marginTop: 4, background: 'var(--soft-primary)', color: 'var(--primary-text)' }}>نمایش همه اعلان‌ها</button> : undefined}
              />
            )}
          </>
        )}
      </Scr>

      <AppHeader
        title="اعلان‌ها"
        back={routes.app.home}
        hideDefaultActions
        actions={
          <>
            <HeaderIconButton first d={P.sliders} href={routes.app.profile} label="تنظیمات اعلان‌ها" color="var(--text-primary)" />
            <HeaderIconButton icon="help" href={routes.app.support} label="راهنما و پشتیبانی" color="var(--text-primary)" />
          </>
        }
      />
      <BottomNav active="assets" />
    </>
  );
}

function NotificationCard({ n, onOpen }: { n: AppNotification; onOpen: () => void }) {
  const [bg, fg] = TONE[(n.tone in TONE ? n.tone : 'default') as Tone];
  // released reserves read as a check, not an open padlock (padlock stays for legal holds)
  const d = n.icon === 'unlock' ? LOCK_META.none.d : n.icon in ICONS ? ICONS[n.icon as IconName] : P.info;
  const unread = !n.read;
  return (
    <button onClick={onOpen} className="card" style={{ width: '100%', minHeight: 76, boxSizing: 'border-box', padding: 14, display: 'flex', alignItems: 'flex-start', gap: 12, color: 'var(--text-primary)', textDecoration: 'none', fontFamily: 'inherit', textAlign: 'right', cursor: 'pointer' }}>
      <span style={{ width: 40, height: 40, borderRadius: '50%', background: bg, color: fg, display: 'grid', placeItems: 'center', flex: 'none' }}><Icon d={d} size={20} /></span>
      <span style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 3 }}>
        <span style={{ fontSize: 14, fontWeight: unread ? 700 : 500, lineHeight: 1.5 }}>{n.title}</span>
        <span className="num" style={{ fontSize: 12, fontWeight: 400, color: 'var(--text-secondary)', lineHeight: 1.5 }}>{n.body}</span>
        <span style={{ fontSize: 11, color: 'var(--text-secondary)', lineHeight: 1.4 }}>{relTime(n.at, now())}</span>
      </span>
      {unread && <span aria-label="خوانده‌نشده" style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--primary-main)', marginTop: 8, flex: 'none' }} />}
    </button>
  );
}
