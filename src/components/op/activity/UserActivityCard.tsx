'use client';
/** Small «فعالیت‌ها» card on the operator's user profile: the last 3 events of the user + a link to the filtered log. */
import { useOpActivity } from '@/api/op-treasury-extra';
import { Card, List, ListRow, SkeletonRows, Tile } from '@/components/panel/kit';
import { amt } from '@/components/op/treasury/ui';
import { dayTime } from '@/components/op/system/fmt';
import { routes } from '@/lib/routes';
import { CAT_ICON } from './meta';

export function UserActivityCard({ userId }: { userId: string }) {
  const q = useOpActivity({ userId, limit: 3 });
  const items = q.data?.items ?? [];
  return (
    <Card title="فعالیت‌ها" count={q.data?.total || undefined} more={{ label: 'همه‌ی فعالیت‌ها', href: `${routes.op.activity}?user=${encodeURIComponent(userId)}` }}>
      {q.isLoading ? <SkeletonRows n={3} /> : items.length ? (
        <List>
          {items.map((e) => (
            <ListRow key={e.id} lead={<Tile d={CAT_ICON[e.category]} tone={e.tone} size="sm" />} title={e.title}
              sub={<><span className="num">{dayTime(e.at, true)}</span> · {e.actor.name}</>}
              trail={e.amount != null ? <span className="num" style={{ fontSize: 12.5 }}>{amt(e.amount)}</span> : undefined} />
          ))}
        </List>
      ) : <span className="mute" style={{ fontSize: 12.5 }}>{q.isError ? 'دریافت فعالیت‌ها ممکن نشد.' : 'فعالیتی ثبت نشده است.'}</span>}
    </Card>
  );
}
