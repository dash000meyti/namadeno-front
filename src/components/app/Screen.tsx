/**
 * Scroll area of an app screen (design: `.scr`, below the 60px header, above the 84px nav).
 * `gap`/`padding` match the per-screen values in the design.
 */
export function Scr({ children, gap = 14, style, className, noNav }: { children: React.ReactNode; gap?: number; style?: React.CSSProperties; className?: string; noNav?: boolean }) {
  return (
    <div className={'scr' + (className ? ' ' + className : '')} style={{ gap, ...(noNav ? { paddingBottom: 24 } : null), ...style }}>
      {children}
    </div>
  );
}

/** Loading placeholder block in the glass style. */
export function Skeleton({ h = 72, r = 16, style }: { h?: number; r?: number; style?: React.CSSProperties }) {
  return <div aria-hidden="true" className="card" style={{ height: h, borderRadius: r, opacity: 0.55, ...style }} />;
}

/** Inline error with retry. */
export function ErrorState({ message, onRetry }: { message?: string; onRetry?: () => void }) {
  return (
    <div role="alert" className="card" style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 10, alignItems: 'center', textAlign: 'center' }}>
      <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>{message ?? 'خطا در دریافت اطلاعات'}</span>
      {onRetry && <button className="btn" onClick={onRetry} style={{ height: 36, background: 'var(--soft-primary)', color: 'var(--primary-text)' }}>تلاش دوباره</button>}
    </div>
  );
}
