/** Display metadata shared by the credit screens. */
import type { CreditSummary } from '@/types/domain';
import type { Tone } from './icons';

export const SCORE_BAND: Record<CreditSummary['scoreBand'], { label: string; tone: Tone }> = {
  poor: { label: 'ضعیف', tone: 'error' },
  fair: { label: 'متوسط', tone: 'warning' },
  good: { label: 'خوب', tone: 'info' },
  excellent: { label: 'عالی', tone: 'success' },
};

export const IMPACT: Record<CreditSummary['factors'][number]['impact'], { label: string; tone: Tone }> = {
  positive: { label: 'مثبت', tone: 'success' },
  neutral: { label: 'متوسط', tone: 'warning' },
  negative: { label: 'منفی', tone: 'error' },
};

export const SCORE_MIN = 300;
export const SCORE_MAX = 900;
export const scoreRatio = (s: number) => Math.min(1, Math.max(0, (s - SCORE_MIN) / (SCORE_MAX - SCORE_MIN)));

export const LOAN_MONTHS = [6, 12, 18] as const;
export const LOAN_MIN = 5_000_000;
