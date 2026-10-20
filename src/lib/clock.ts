/**
 * The mock dataset is written around a fixed "today" (15 Aban 1405 · 10:30 Tehran)
 * so dates in the seed data (due dates, vesting dates, "10 minutes ago") stay meaningful.
 * With the real backend (mocking disabled) the real clock is used.
 */
export const MOCK_NOW_ISO = '2026-11-06T07:00:00.000Z'; // 1405/08/15 10:30 Asia/Tehran

export const isMocking = () => process.env.NEXT_PUBLIC_API_MOCKING !== 'disabled';

export function now(): Date {
  return isMocking() ? new Date(MOCK_NOW_ISO) : new Date();
}

/** ISO string for `days` from now (negative = past). Optional hour/minute in Tehran time. */
export function daysFromNow(days: number, hhmm?: string): string {
  const d = new Date(new Date(MOCK_NOW_ISO).getTime() + days * 86400000);
  if (hhmm) {
    const [h, m] = hhmm.split(':').map(Number);
    // Tehran = UTC+3:30
    d.setUTCHours(h - 3, m - 30, 0, 0);
  }
  return d.toISOString();
}

export function minutesAgo(min: number): string {
  return new Date(new Date(MOCK_NOW_ISO).getTime() - min * 60000).toISOString();
}

/** Jalali (y, m, d) → ISO at 12:00 Tehran. Valid for 1404–1406 (Farvardin 1 = Mar 21). */
export function jalaliToIso(y: number, m: number, d: number): string {
  const nowruz: Record<number, string> = { 1403: '2024-03-20', 1404: '2025-03-21', 1405: '2026-03-21', 1406: '2027-03-21' };
  const base = new Date(nowruz[y] + 'T08:30:00.000Z');
  const dayOfYear = m <= 6 ? (m - 1) * 31 + (d - 1) : 186 + (m - 7) * 30 + (d - 1);
  return new Date(base.getTime() + dayOfYear * 86400000).toISOString();
}
