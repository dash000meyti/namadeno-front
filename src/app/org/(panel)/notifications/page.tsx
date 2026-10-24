'use client';
/**
 * Organization — notifications («اعلان‌ها», opened from the bell). Kit page: heading → one card with tabs and two lists:
 * «نیاز به اقدام» (derived from current data: steps waiting for approval, unsent drafts, colleagues not activated …)
 * and «به‌روزرسانی‌های سامانه». A row marks itself read and opens its target.
 */
import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useMarkOrgNotificationsRead, useOrgNotifications, type OrgNotification } from '@/api/org-people-extra';
import { Card, Empty, ErrorBlock, List, ListRow, PageHeading, Section, SkeletonRows, Tabs, Tile, Toolbar } from '@/components/panel/kit';
import { Icon } from '@/components/ui/Icon';
import { useToast } from '@/components/ui/Toast';
import { errMsg } from '@/components/org/people/shared';
import { faDigits, relTime } from '@/lib/format';
import { now } from '@/lib/clock';

type TabKey = 'all' | 'action' | 'update';
const I = {
  action: 'M12 3l10 18H2zM12 10v5M12 18h.01',
  update: 'M12 3l1.9 5.6L19.5 10l-5.6 1.9L12 17.5l-1.9-5.6L4.5 10l5.6-1.4zM19 15l.8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8z',
  check: 'M5 12.5l4.5 4.5L19 7',
  chev: 'M14 6l-6 6 6 6',
  bell: 'M6 16V11a6 6 0 1 1 12 0v5l1.5 2h-15zM10 20a2 2 0 0 0 4 0',
};

export default function OrgNotificationsPage() {
  const router = useRouter();
  const toast = useToast();
  const q = useOrgNotifications();
  const mark = useMarkOrgNotificationsRead();
  const [tab, setTab] = useState<TabKey>('all');

  const items = useMemo(() => q.data?.items ?? [], [q.data]);
  const action = items.filter((n) => n.kind === 'action');
  const updates = items.filter((n) => n.kind === 'update');
  const unread = items.filter((n) => !n.read).length;
  const unreadOf = (list: OrgNotification[]) => list.filter((n) => !n.read).length;

  const open = (n: OrgNotification) => {
    if (!n.read) mark.mutate({ ids: [n.id] });
    if (n.href) router.push(n.href);
  };
  const readAll = () => mark.mutate({}, { onSuccess: () => toast('همه‌ی اعلان‌ها خوانده شد'), onError: (e) => toast(errMsg(e), 'error') });

  const rows = (list: OrgNotification[]) => (
    <List>
      {list.map((n) => (
        <ListRow
          key={n.id} onClick={() => open(n)} label={n.title}
          lead={<Tile d={n.kind === 'action' ? I.action : I.update} tone={n.kind === 'action' ? 'warning' : 'info'} />}
          title={<span style={n.read ? { fontWeight: 500, color: 'var(--text-secondary)' } : undefined}>{n.title}</span>}
          sub={<span style={{ whiteSpace: 'normal' }}>{n.body} · <span className="num">{relTime(n.createdAt, now())}</span></span>}
          trail={(
            <>
              {!n.read && <i className="nm-unread" aria-label="خوانده‌نشده" />}
              {n.href && <Icon d={I.chev} size={16} style={{ color: 'var(--text-disabled)' }} />}
            </>
          )}
        />
      ))}
    </List>
  );

  const actionBlock = action.length
    ? rows(action)
    : <Empty icon={I.check} tone="success" title="کاری منتظر شما نیست" sub="درخواست‌ها و کارهای تازه اینجا نمایش داده می‌شود." />;
  const updateBlock = updates.length ? rows(updates) : <Empty icon={I.bell} title="به‌روزرسانی تازه‌ای نیست" />;

  return (
    <>
      <PageHeading title="اعلان‌ها" sub="کارهایی که منتظر شماست و تازه‌های سامانه">
        <button type="button" className="nm-btn ghost" onClick={readAll} disabled={!unread || mark.isPending}><Icon d={I.check} size={17} />خواندن همه</button>
      </PageHeading>

      <Card flush>
        <Toolbar>
          <Tabs label="نوع اعلان" value={tab} onChange={setTab} items={[
            { key: 'all', label: 'همه', count: unread || undefined, hot: true },
            { key: 'action', label: 'نیاز به اقدام', count: unreadOf(action) || undefined, hot: true },
            { key: 'update', label: 'به‌روزرسانی‌های سامانه', count: unreadOf(updates) || undefined },
          ]} />
        </Toolbar>
        <div style={{ padding: '6px 20px 14px', display: 'flex', flexDirection: 'column', gap: 18 }}>
          {q.isLoading ? <SkeletonRows n={5} />
            : q.isError ? <ErrorBlock error={q.error} onRetry={() => q.refetch()} flat />
              : tab === 'all' ? (
                <>
                  <Section title={<>نیاز به اقدام{action.length ? <span className="num mute"> · {faDigits(action.length)}</span> : null}</>}>{actionBlock}</Section>
                  <Section title="به‌روزرسانی‌های سامانه">{updateBlock}</Section>
                </>
              ) : tab === 'action' ? actionBlock : updateBlock}
        </div>
      </Card>
    </>
  );
}
