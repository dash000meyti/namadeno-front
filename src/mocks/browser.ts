import { setupWorker } from 'msw/browser';
import { handlers } from './handlers';

export const worker = setupWorker(...handlers);

/**
 * Starts the mock API. Prefers the Service Worker (requests show in the network tab).
 * Some browsers refuse to register it (embedded webviews, private modes, blocked SW);
 * then MSW's own "fallback mode" patches fetch/XHR in the page with the same handlers.
 * MSW picks fallback mode only when the Service Worker API is absent, so it is hidden
 * for the duration of that start() call and restored afterwards.
 */
export async function startMocking() {
  try {
    await worker.start({ onUnhandledRequest: 'bypass', quiet: true });
    keepAttached();
    return;
  } catch (e) {
    console.warn('[mock] Service Worker unavailable, using in-page fallback', e);
    try { worker.stop(); } catch { /* never fully started */ }
  }

  const sw = Object.getOwnPropertyDescriptor(Navigator.prototype, 'serviceWorker');
  if (sw) Reflect.deleteProperty(Navigator.prototype, 'serviceWorker');
  try {
    await setupWorker(...handlers).start({ onUnhandledRequest: 'bypass', quiet: true });
  } finally {
    if (sw) Object.defineProperty(Navigator.prototype, 'serviceWorker', sw);
  }
}

/**
 * The mock worker remembers which tabs it serves only in memory. When the browser stops an idle worker
 * (a background tab, a sleeping laptop) that list is lost and requests pass through to the dev server (404).
 * This re-sends MOCK_ACTIVATE and resolves once the worker confirms (MOCKING_ENABLED).
 */
export function reattach(timeout = 1500): Promise<boolean> {
  const sw = typeof navigator !== 'undefined' ? navigator.serviceWorker?.controller : null;
  if (!sw) return Promise.resolve(false);
  return new Promise((resolve) => {
    const onMessage = (e: MessageEvent) => { if (e.data?.type === 'MOCKING_ENABLED') done(true); };
    const done = (ok: boolean) => { navigator.serviceWorker.removeEventListener('message', onMessage); clearTimeout(timer); resolve(ok); };
    const timer = setTimeout(() => done(false), timeout);
    navigator.serviceWorker.addEventListener('message', onMessage);
    sw.postMessage('MOCK_ACTIVATE');
  });
}

/** Re-attach whenever the tab comes back, and let the API client heal a request that slipped through. */
function keepAttached() {
  window.__nmMockHeal = () => reattach();
  const again = () => { if (document.visibilityState === 'visible') void reattach(); };
  document.addEventListener('visibilitychange', again);
  window.addEventListener('focus', again);
  window.addEventListener('pageshow', again);
}
