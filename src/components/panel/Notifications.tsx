'use client';
/**
 * «اعلان‌ها» — the notifications page shared by the organization panel and the operator console (one product):
 * heading («خواندن همه») → one card with tabs (همه / نیاز به اقدام / به‌روزرسانی‌ها) and two lists. A row marks itself
 * read and opens its target. Each panel brings its own data and the tile (icon, tone) and pill of a row.
 */
import type { ReactNode } from 'react';
import { useState } from 'react';
import { Card, Empty, ErrorBlock, List, ListRow, PageHeading, Section, SkeletonRows, Tabs, Tile, Toolbar, type Tone } from '@/components/panel/kit';
import { Icon } from '@/components/ui/Icon';
import { faDigits, relTime } from '@/lib/format';
import { now } from '@/lib/clock';

export interface PanelNotice {
  id: string;
  kind: 'action' | 'update';
  title: string;
  body: string;
  createdAt: string;
  href?: string;
  read: boolean;
}

type TabKey = 'all' | 'action' | 'update';
export const NOTICE_ICON = {
  action: 'M12 3l10 18H2zM12 10v5M12 18h.01',
  update: 'M12 3l1.9 5.6L19.5 10l-5.6 1.9L12 17.5l-1.9-5.6L4.5 10l5.6-1.4zM19 15l.8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8z',
  check: 'M5 12.5l4.5 4.5L19 7',
  chev: 'M14 6l-6 6 6 6',
  bell: 'M6 16V11a6 6 0 1 1 12 0v5l1.5 2h-15zM10 20a2 2 0 0 0 4 0',
};

export function NotificationsView<N extends PanelNotice>({
  items, loading, error, onRetry, onOpen, onReadAll, readAllBusy, sub, updatesLabel = 'به‌روزرسانی‌های سامانه', emptyAction, tileOf, pillOf,
}: {
  items: N[];
  loading: boolean;
  error?: unknown;
  onRetry: () => void;
  onOpen: (n: N) => void;
  onReadAll: () => void;
  readAllBusy?: boolean;
  sub: string;
  updatesLabel?: string;
  emptyAction: { title: string; sub: string };
  /** Icon path and tone of a row's tile (default: warning triangle / info sparkle). */
  tileOf?: (n: N) => { d: string; tone: Tone };
  /** An optional pill at the end of a row (e.g. «فوری»). */
  pillOf?: (n: N) => ReactNode;
}) {
  const [tab, setTab] = useState<TabKey>('all');
  const action = items.filter((n) => n.kind === 'action');
  const updates = items.filter((n) => n.kind === 'update');
  const unread = items.filter((n) => !n.read).length;
  const unreadOf = (list: N[]) => list.filter((n) => !n.read).length;
  const tile = (n: N) => tileOf?.(n) ?? (n.kind === 'action' ? { d: NOTICE_ICON.action, tone: 'warning' as Tone } : { d: NOTICE_ICON.update, tone: 'info' as Tone });

  const rows = (list: N[]) => (
    <List>
      {list.map((n) => {
        const t = tile(n);
        return (
          <ListRow
            key={n.id} onClick={() => onOpen(n)} label={n.title}
            lead={<Tile d={t.d} tone={t.tone} />}
            title={<span style={n.read ? { fontWeight: 500, color: 'var(--text-secondary)' } : undefined}>{n.title}</span>}
            sub={<span style={{ whiteSpace: 'normal' }}>{n.body} · <span className="num">{relTime(n.createdAt, now())}</span></span>}
            trail={(
              <>
                {pillOf?.(n)}
                {!n.read && <i className="nm-unread" aria-label="خوانده‌نشده" />}
                {n.href && <Icon d={NOTICE_ICON.chev} size={16} style={{ color: 'var(--text-disabled)' }} />}
              </>
            )}
          />
        );
      })}
    </List>
  );

  const actionBlock = action.length ? rows(action) : <Empty icon={NOTICE_ICON.check} tone="success" title={emptyAction.title} sub={emptyAction.sub} />;
  const updateBlock = updates.length ? rows(updates) : <Empty icon={NOTICE_ICON.bell} title="به‌روزرسانی تازه‌ای نیست" />;

  return (
    <>
      <PageHeading title="اعلان‌ها" sub={sub}>
        <button type="button" className="nm-btn ghost" onClick={onReadAll} disabled={!unread || readAllBusy}><Icon d={NOTICE_ICON.check} size={17} />خواندن همه</button>
      </PageHeading>

      <Card flush>
        <Toolbar>
          <Tabs label="نوع اعلان" value={tab} onChange={setTab} items={[
            { key: 'all', label: 'همه', count: unread || undefined, hot: true },
            { key: 'action', label: 'نیاز به اقدام', count: unreadOf(action) || undefined, hot: true },
            { key: 'update', label: updatesLabel, count: unreadOf(updates) || undefined },
          ]} />
        </Toolbar>
        <div style={{ padding: '6px 20px 14px', display: 'flex', flexDirection: 'column', gap: 18 }}>
          {loading ? <SkeletonRows n={5} />
            : error ? <ErrorBlock error={error} onRetry={onRetry} flat />
              : tab === 'all' ? (
                <>
                  <Section title={<>نیاز به اقدام{action.length ? <span className="num mute"> · {faDigits(action.length)}</span> : null}</>}>{actionBlock}</Section>
                  <Section title={updatesLabel}>{updateBlock}</Section>
                </>
              ) : tab === 'action' ? actionBlock : updateBlock}
        </div>
      </Card>
    </>
  );
}
