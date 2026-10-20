/**
 * Free/locked split — the product-wide component (user-approved «نوار دو‌بخشی + دو عدد»).
 * Free part solid, locked part hatched. Amounts in Toman.
 */
import { money } from '@/lib/format';
import { LOCK_META } from '@/lib/locks';
import type { LockType } from '@/types/domain';
import { Icon } from './Icon';

export function LockBar({ free, locked, height = 6 }: { free: number; locked: number; height?: number }) {
  const total = free + locked;
  const freePct = total ? Math.round((free / total) * 1000) / 10 : 100;
  return (
    <div className="lkbar" role="img" aria-label={`آزاد ${money(free)} · قفل ${money(locked)}`} style={{ height }}>
      {free > 0 && <span className="f" style={{ width: locked > 0 ? `${freePct}%` : '100%' }} />}
      {locked > 0 && <span className="l" style={{ flex: 1 }} />}
    </div>
  );
}

export function LockLegend({ free, locked }: { free: number; locked: number }) {
  if (!locked) return <div className="lkleg"><span><span className="lkdot" />همه آزاد</span></div>;
  return (
    <div className="lkleg">
      <span><span className="lkdot" />آزاد <b>{money(free)}</b></span>
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}><Icon name="lock" size={12} />قفل <b>{money(locked)}</b></span>
    </div>
  );
}

export function LockTypeChip({ type, long = false, style }: { type: LockType | 'none'; long?: boolean; style?: React.CSSProperties }) {
  const m = LOCK_META[type];
  return (
    <span className="lktype" style={{ background: m.bg, color: m.fg, ...style }} title={m.label}>
      <Icon d={m.d} size={12} />
      {long ? m.label : m.short}
    </span>
  );
}
