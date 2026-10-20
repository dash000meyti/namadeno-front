'use client';

import { useEffect, useState } from 'react';
import { isMocking } from '@/lib/clock';

/**
 * Starts MSW (service worker, or in-page fallback) before rendering the app when mocking is enabled.
 * Every request to NEXT_PUBLIC_API_BASE_URL is then answered by src/mocks/handlers.
 * Set NEXT_PUBLIC_API_MOCKING=disabled to talk to the real backend.
 */
export function MockProvider({ children }: { children: React.ReactNode }) {
  const [ready, setReady] = useState(!isMocking());

  useEffect(() => {
    if (!isMocking()) return;
    let cancelled = false;
    import('./browser')
      .then(({ startMocking }) => startMocking())
      .catch((e) => console.error('[mock] failed to start MSW', e))
      .finally(() => { if (!cancelled) setReady(true); });
    return () => { cancelled = true; };
  }, []);

  if (!ready) {
    return (
      <div style={{ minHeight: '100dvh', display: 'grid', placeItems: 'center', background: 'var(--bg-canvas)' }}>
        <span className="wm" style={{ fontSize: 28, color: 'var(--text-secondary)', opacity: 0.6 }}>نمادنو</span>
      </div>
    );
  }
  return <>{children}</>;
}
