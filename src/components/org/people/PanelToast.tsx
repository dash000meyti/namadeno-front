'use client';
/**
 * Panel toast = the product toast (src/components/ui/Toast.tsx), shown bottom-left in the panels.
 * `flashToast()` stores a message that the next screen shows on mount (used after navigation).
 * `node` is kept for older call sites and is always null.
 */
import { useEffect } from 'react';
import { useToast } from '@/components/ui/Toast';

type Tone = 'success' | 'error' | 'info';
const KEY = 'nm-org-flash';

export function flashToast(msg: string, t: Tone = 'success') {
  try { sessionStorage.setItem(KEY, JSON.stringify({ msg, t })); } catch { /* storage unavailable */ }
}

export function usePanelToast() {
  const show = useToast();
  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(KEY);
      if (raw) { sessionStorage.removeItem(KEY); const v = JSON.parse(raw) as { msg: string; t: Tone }; show(v.msg, v.t); }
    } catch { /* ignore */ }
  }, [show]);
  return { show, node: null };
}
