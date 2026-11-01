/**
 * Presentation helpers of the operator activity log (/op/activity and the activity card on the user profile).
 * Vocabulary (actor kinds, categories) comes from src/components/op/treasury/ui.ts.
 */
import type { ActivityCategory, ActivityEvent, ActorKind } from '@/api/op-treasury-extra';
import { Ava, Tile } from '@/components/panel/kit';
import { ACTOR, TI } from '@/components/op/treasury/ui';
import { HOURGLASS } from '@/lib/locks';
import { routes } from '@/lib/routes';

const INBOX = 'M3 13l2.5-7h13L21 13v5a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2zM3 13h5l1.5 2.5h5L16 13h5';
const DOC = 'M7 3h7l5 5v13H7zM14 3v5h5M10 13h6M10 17h6';

export const CAT_ICON: Record<ActivityCategory, string> = {
  package: INBOX,
  trade: 'M7 4v16M3 8l4-4 4 4M17 20V4M13 16l4 4 4-4',
  cash: TI.cash,
  reserve: HOURGLASS,
  account: TI.user,
  contract: DOC,
  treasury: TI.stock,
  request: 'M9 4h6v3H9zM7 5.5H5V21h14V5.5h-2M9 12h6M9 16h4',
};

export const ACTOR_KINDS: ActorKind[] = ['user', 'org', 'operator', 'system'];
/** Chart colour per actor kind. */
export const ACTOR_COL: Record<ActorKind, string> = { user: 'var(--chart-3)', org: 'var(--chart-2)', operator: 'var(--chart-1)', system: 'var(--chart-4)' };

const first = (s?: string) => (s ?? '').trim().charAt(0) || '؟';

/** Avatar (people, organizations) or tile (Namadno team, system) of who did it. */
export function actorLead(e: ActivityEvent, size?: 'sm' | 'md' | 'lg') {
  const a = e.actor;
  if (a.kind === 'user') return <Ava letter={first(a.name)} id={a.id ?? a.name} size={size} />;
  if (a.kind === 'org') return <Ava letter={first(e.orgName ?? a.name)} id={a.id ?? e.orgId ?? a.name} size={size} sq />;
  return <Tile d={ACTOR[a.kind].d} tone={ACTOR[a.kind].tone} size={size} />;
}

/** Second line under the actor's name. */
export function actorSub(e: ActivityEvent): string {
  const a = e.actor;
  if (a.kind === 'user') return e.orgName ? `کاربر · ${e.orgName}` : 'کاربر';
  if (a.kind === 'org') return e.orgName ? `سازمان · ${e.orgName}` : 'سازمان';
  if (a.kind === 'operator') return 'تیم نمادنو';
  return 'خودکار';
}

/** Profile link of the actor (users and organizations). */
export function actorHref(e: ActivityEvent): string | undefined {
  const a = e.actor;
  if (a.kind === 'user' && a.id) return routes.op.user(a.id);
  const org = a.kind === 'org' ? a.id ?? e.orgId : undefined;
  return org ? routes.op.organization(org) : undefined;
}

/** Related ids → label, icon and link. */
export const REF_META: Record<string, { label: string; d: string; href: (id: string, e: ActivityEvent) => string | undefined }> = {
  user: { label: 'کاربر', d: TI.user, href: (id) => routes.op.user(id) },
  order: { label: 'سفارش', d: TI.order, href: (id) => `${routes.op.orders}?id=${encodeURIComponent(id)}` },
  cash: { label: 'تراکنش نقدینگی', d: TI.cash, href: (id) => `${routes.op.cash}?id=${encodeURIComponent(id)}` },
  request: { label: 'درخواست', d: CAT_ICON.request, href: (id) => `${routes.op.requests}?id=${encodeURIComponent(id)}` },
  alert: { label: 'هشدار ریسک', d: TI.alert, href: (id) => `${routes.op.risk}?id=${encodeURIComponent(id)}` },
  package: { label: 'بسته', d: INBOX, href: (_, e) => (e.orgId ? routes.op.organization(e.orgId) : undefined) },
};
