import Link from 'next/link';
import { Icon } from '@/components/ui/Icon';
import { Motif } from '@/components/ui/Motif';

/** Landing/inner-page section wrapper: optional eyebrow, two-tone title (title + muted second line) and lead. */
export function Section({
  id, eyebrow, title, mute, lead, center, tight, lined, className, headExtra, children, labelledBy,
}: {
  id?: string;
  eyebrow?: string;
  title?: React.ReactNode;
  /** Muted second line of the title (Namadno Luxe two-tone heading). */
  mute?: React.ReactNode;
  lined?: boolean;
  lead?: React.ReactNode;
  center?: boolean;
  tight?: boolean;
  className?: string;
  headExtra?: React.ReactNode;
  labelledBy?: string;
  children?: React.ReactNode;
}) {
  const hid = labelledBy ?? (id ? `${id}-title` : undefined);
  return (
    <section id={id} aria-labelledby={title ? hid : undefined} className={'s-sec' + (tight ? ' tight' : '') + (lined ? ' lined' : '') + (className ? ' ' + className : '')}>
      <div className="s-wrap">
        {(eyebrow || title || lead) && (
          <div className={'s-sec-head' + (center ? ' center' : '')}>
            {eyebrow && <span className="s-eyebrow"><span className="dot" />{eyebrow}</span>}
            {title && <h2 id={hid} className="s-h2">{title}{mute && <><br /><span className="s-mute2">{mute}</span></>}</h2>}
            {lead && <p className="s-lead">{lead}</p>}
            {headExtra}
          </div>
        )}
        {children}
      </div>
    </section>
  );
}

export interface Crumb { label: string; href?: string }

/** Hero block of an inner page (breadcrumbs + eyebrow + two-tone h1 + lead) over the guilloché motif. */
export function PageHero({ crumbs = [], eyebrow, title, mute, lead, children }: { crumbs?: Crumb[]; eyebrow?: string; title: React.ReactNode; mute?: React.ReactNode; lead?: React.ReactNode; children?: React.ReactNode }) {
  const all: Crumb[] = [{ label: 'خانه', href: '/' }, ...crumbs];
  return (
    <header className="s-phero">
      <Motif variant="grid" />
      <div className="s-wrap">
        <div className="s-phero-in">
          <nav aria-label="مسیر صفحه" className="s-crumbs">
            {all.map((c, i) => (
              <span key={c.label + i} style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                {i > 0 && <Icon name="forward" />}
                {c.href && i < all.length - 1 ? <Link href={c.href}>{c.label}</Link> : <span aria-current={i === all.length - 1 ? 'page' : undefined}>{c.label}</span>}
              </span>
            ))}
          </nav>
          {eyebrow && <span className="s-eyebrow"><span className="dot" />{eyebrow}</span>}
          <h1 className="s-h1 page">{title}{mute && <><br /><span className="s-grad">{mute}</span></>}</h1>
          {lead && <p className="s-lead">{lead}</p>}
          {children}
        </div>
      </div>
    </header>
  );
}

/** Loading placeholder (glass card skeleton). */
export function SkeletonCard({ h = 180, r = 20 }: { h?: number; r?: number }) {
  return <div aria-hidden="true" className="card s-skl" style={{ height: h, borderRadius: r }} />;
}

/** Inline error with retry. */
export function SiteError({ message, onRetry }: { message?: string; onRetry?: () => void }) {
  return (
    <div role="alert" className="alert soft c-error" style={{ alignItems: 'center' }}>
      <Icon name="risk" />
      <span style={{ flex: 1 }}>{message || 'خطا در دریافت اطلاعات. لطفاً دوباره تلاش کنید.'}</span>
      {onRetry && <button type="button" className="btn sm soft c-error" onClick={onRetry}>تلاش دوباره</button>}
    </div>
  );
}
