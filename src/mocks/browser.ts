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
