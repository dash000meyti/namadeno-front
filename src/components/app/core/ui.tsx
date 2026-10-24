'use client';
/** Small building blocks shared by the app-core screens (design-faithful markup). */
import { useEffect } from 'react';
import Link from 'next/link';
import { Icon } from '@/components/ui/Icon';
import { ApiRequestError } from '@/api/client';
import { HOURGLASS } from '@/lib/locks';
import { routes } from '@/lib/routes';
import { P } from './meta';

/** User-facing message of any API/mutation error. */
export function errMsg(e: unknown, fallback = 'خطا در ارتباط با سرور'): string {
  if (e instanceof ApiRequestError) return e.message || fallback;
  if (e && typeof e === 'object' && 'message' in e && typeof (e as { message: unknown }).message === 'string') return (e as { message: string }).message || fallback;
  return fallback;
}

export const isKycError = (e: unknown) => e instanceof ApiRequestError && e.code === 'kyc_required';

/** Inline error box; for `kyc_required` it links to /app/kyc. */
export function ErrorNote({ error, style }: { error: unknown; style?: React.CSSProperties }) {
  if (!error) return null;
  return (
    <div role="alert" style={{ boxSizing: 'border-box', padding: '10px 12px', borderRadius: 12, background: 'var(--soft-error)', color: 'var(--error-text)', display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5, fontWeight: 600, lineHeight: 1.6, ...style }}>
      <Icon d={P.info} size={16} />
      <span style={{ flex: 1, minWidth: 0 }}>{errMsg(error)}</span>
      {isKycError(error) && (
        <Link href={routes.app.kyc} style={{ fontWeight: 700, whiteSpace: 'nowrap' }}>احراز هویت</Link>
      )}
    </div>
  );
}

/**
 * Bottom sheet in the design's `.ovl` + `.glass.sheet` style (profile, signup terms):
 * grab line, 44px header with a 17px title and close button.
 */
export function GlassSheet({ open, onClose, title, children }: { open: boolean; onClose: () => void; title: string; children: React.ReactNode }) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <>
      <div className="ovl" aria-hidden="true" onClick={onClose} />
      <div className="glass sheet" role="dialog" aria-modal="true" aria-label={title}>
        <span aria-hidden="true" style={{ width: 36, height: 4, borderRadius: 4, background: 'var(--outline-border)', alignSelf: 'center' }} />
        <div style={{ height: 44, display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 17, fontWeight: 700 }}>{title}</span>
          <button className="ibtn" aria-label="بستن" onClick={onClose} style={{ marginRight: 'auto', marginLeft: -10, color: 'var(--text-secondary)' }}>
            <Icon d={P.close} size={22} />
          </button>
        </div>
        {children}
      </div>
    </>
  );
}

/** Design switch (`.sw`): 40×24 track. */
export function Switch({ on, onToggle, label }: { on: boolean; onToggle: () => void; label: string }) {
  return (
    <button className="sw" role="switch" aria-checked={on} aria-label={label} onClick={onToggle}>
      <span style={{ width: 40, height: 24, boxSizing: 'border-box', padding: 2, borderRadius: 999, background: on ? 'var(--primary-main)' : 'var(--switch-off)', display: 'flex', justifyContent: on ? 'flex-end' : 'flex-start', transition: 'background .2s' }}>
        <span style={{ width: 20, height: 20, borderRadius: '50%', background: '#FFFFFF', boxShadow: 'var(--shadow-z1)' }} />
      </span>
    </button>
  );
}

/** Two-way segmented tabs (design: inbox «جدید / تأیید‌شده»). */
export function InboxTabs({ active, pending, accepted }: { active: 'new' | 'accepted'; pending?: number; accepted?: number }) {
  const fa = (n?: number) => (n === undefined ? '' : ` (${String(n).replace(/[0-9]/g, (d) => '۰۱۲۳۴۵۶۷۸۹'[+d])})`);
  const on = { height: 36, borderRadius: 6, background: 'var(--seg-active)', boxShadow: 'var(--shadow-z1)', color: 'var(--text-primary)', fontSize: 14, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', textDecoration: 'none' } as const;
  const off = { height: 36, borderRadius: 6, color: 'var(--text-secondary)', fontSize: 14, fontWeight: 600, display: 'flex', alignItems: 'center', justifyContent: 'center', textDecoration: 'none' } as const;
  return (
    <div role="tablist" aria-label="دریافتی‌ها" style={{ height: 44, boxSizing: 'border-box', padding: 4, borderRadius: 8, background: 'var(--bg-neutral)', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 4, flex: 'none' }}>
      {active === 'new' ? (
        <span role="tab" aria-selected="true" style={on}>جدید{fa(pending)}</span>
      ) : (
        <Link role="tab" aria-selected="false" href={routes.app.inbox()} style={off}>جدید{fa(pending)}</Link>
      )}
      {active === 'accepted' ? (
        <span role="tab" aria-selected="true" style={on}>تأیید‌شده{fa(accepted)}</span>
      ) : (
        <Link role="tab" aria-selected="false" href={routes.app.inboxArchive} style={off}>تأیید‌شده{fa(accepted)}</Link>
      )}
    </div>
  );
}

/** Free/reserved card block used by the inbox screens: bar + legend lines. */
export function FreeLockedBlock({ free, locked, freeNote, lockNote, allFreeNote = 'قابل فروش و برداشت', fmt }: {
  free: number; locked: number; freeNote?: string; lockNote?: string; allFreeNote?: string; fmt: (n: number) => string;
}) {
  const total = free + locked;
  const freePct = total ? Math.round((free / total) * 1000) / 10 : 100;
  if (locked <= 0) {
    return (
      <>
        <div className="lkbar" role="img" aria-label={`همه آزاد ${fmt(free)}`}><span className="f" style={{ flex: 1 }} /></div>
        <div className="lkleg"><span><span className="lkdot" />همه آزاد <b>{fmt(free)}</b></span><span style={{ marginRight: 'auto', overflow: 'hidden', textOverflow: 'ellipsis' }}>{allFreeNote}</span></div>
      </>
    );
  }
  return (
    <>
      <div className="lkbar" role="img" aria-label={`آزاد ${fmt(free)} · رزرو ${fmt(locked)}`}>
        {free > 0 && <span className="f" style={{ width: `${freePct}%` }} />}
        <span className="l" style={{ flex: 1 }} />
      </div>
      <div className="lkleg"><span><span className="lkdot" />آزاد <b>{fmt(free)}</b></span>{freeNote && <span style={{ marginRight: 'auto', overflow: 'hidden', textOverflow: 'ellipsis' }}>{freeNote}</span>}</div>
      <div className="lkleg"><span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}><Icon d={HOURGLASS} size={12} />رزرو <b>{fmt(locked)}</b></span>{lockNote && <span className="num" style={{ marginRight: 'auto', fontWeight: 400, overflow: 'hidden', textOverflow: 'ellipsis' }}>{lockNote}</span>}</div>
    </>
  );
}

/** Empty-state card (design: notifications empty state). */
export function EmptyCard({ d, tone = 'success', title, text, action }: { d: string; tone?: 'success' | 'primary'; title: string; text: string; action?: React.ReactNode }) {
  return (
    <div className="card" style={{ boxSizing: 'border-box', padding: '32px 20px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, textAlign: 'center' }}>
      <span style={{ width: 64, height: 64, borderRadius: '50%', background: tone === 'success' ? 'var(--soft-success)' : 'var(--soft-primary)', color: tone === 'success' ? 'var(--success-text)' : 'var(--primary-text)', display: 'grid', placeItems: 'center' }}>
        <Icon d={d} size={28} />
      </span>
      <span style={{ fontSize: 16, fontWeight: 700 }}>{title}</span>
      <span style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.6 }}>{text}</span>
      {action}
    </div>
  );
}
