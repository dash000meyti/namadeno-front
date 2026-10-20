import type { MockDB } from '../db';
import type { LockType } from '@/types/domain';

/**
 * Extra mock data owned by the "org-people" area, stored under db.extra.orgPeople.
 *
 * Employees of the demo organization that do not have an app account in the mock
 * (everyone except سارا محمدی) only carry aggregate numbers in `Employee`. These
 * profiles add the breakdown the HR screens show (locks by type, allocation, loan,
 * card credit, credit score, e-mail …). Lock amounts always add up to the
 * employee's `lockedValue` so the free/locked split stays consistent.
 */
export interface OrgPeopleProfile {
  email: string;
  score: number;
  kycLevel: 1 | 2 | 3 | 0;
  /** allocation of the portfolio in percent: gold / fixed income / rial & other */
  split: [gold: number, fixed: number, rial: number];
  locks: [type: LockType, amount: number][];
  /** active asset-backed loan (0 = none) */
  loan: number;
  loanMonths: number;
  loanPaid: number;
  /** overdue installments of the loan */
  loanOverdue: number;
  cardLimit: number;
  cardUsed: number;
  bank: string;
  lastActiveMin: number;
  role: string;
}

export interface OrgPeopleExtra {
  profiles: Record<string, OrgPeopleProfile>;
  /** Extra facts the approval checks of a request show (project manager approval etc.). */
  requestMeta: Record<string, { months?: number; manager?: string; managerOk?: boolean; files?: number; store?: string }>;
}

const P = (p: Partial<OrgPeopleProfile> & Pick<OrgPeopleProfile, 'email' | 'score' | 'split'>): OrgPeopleProfile => ({
  kycLevel: 3, locks: [], loan: 0, loanMonths: 12, loanPaid: 0, loanOverdue: 0, cardLimit: 0, cardUsed: 0, bank: 'بانک ملت •••• ۱۲۳۴', lastActiveMin: 600, role: 'کارمند', ...p,
});

export function seed_orgPeople(db: MockDB) {
  const extra: OrgPeopleExtra = {
    profiles: {
      // سارا محمدی has a real app account; only the HR-side facts live here.
      'u-1001': P({ email: 's.mohammadi@arman.co', score: 742, split: [48, 32, 20], bank: 'بانک ملت •••• ۴۵۲۱', lastActiveMin: 95 }),
      'u-1002': P({ email: 'a.karimi@arman.co', score: 698, split: [50, 35, 15], locks: [['collateral', 30_000_000]], loan: 30_000_000, loanMonths: 12, loanPaid: 4, cardLimit: 25_000_000, cardUsed: 9_200_000, bank: 'بانک سامان •••• ۸۸۱۰', lastActiveMin: 1440, role: 'مدیر واحد' }),
      'u-1003': P({ email: 'm.ahmadi@arman.co', score: 761, split: [40, 45, 15], locks: [['collateral', 20_000_000], ['vesting', 20_000_000]], cardLimit: 15_000_000, cardUsed: 4_000_000, bank: 'بانک ملت •••• ۱۲۳۴', lastActiveMin: 40 }),
      'u-1004': P({ email: 'r.hosseini@arman.co', score: 802, split: [60, 30, 10], locks: [['collateral', 50_000_000], ['vesting', 2_000_000]], loan: 50_000_000, loanMonths: 18, loanPaid: 12, bank: 'بانک تجارت •••• ۳۰۱۲', lastActiveMin: 300, role: 'مدیر واحد' }),
      'u-1005': P({ email: 'n.mousavi@arman.co', score: 455, kycLevel: 2, split: [30, 55, 15], locks: [['collateral', 20_000_000]], loan: 20_000_000, loanMonths: 6, loanPaid: 1, loanOverdue: 2, bank: 'بانک صادرات •••• ۵۵۰۲', lastActiveMin: 9000 }),
      'u-1006': P({ email: 'a.jafari@arman.co', score: 715, split: [55, 35, 10], locks: [['vesting', 14_500_000], ['milestone', 4_000_000]], cardLimit: 20_000_000, cardUsed: 6_500_000, bank: 'بانک سامان •••• ۷۷۸۰', lastActiveMin: 180 }),
      'u-1007': P({ email: 'h.nouri@arman.co', score: 640, split: [45, 40, 15], locks: [['collateral', 12_000_000]], loan: 12_000_000, loanMonths: 6, loanPaid: 4, bank: 'بانک ملی •••• ۲۲۶۷', lastActiveMin: 720, role: 'سرپرست' }),
      'u-1008': P({ email: 'f.rahimi@arman.co', score: 668, kycLevel: 2, split: [35, 50, 15], lastActiveMin: 2880 }),
      'u-1009': P({ email: 'm.sadeghi@arman.co', score: 701, split: [50, 40, 10], locks: [['vesting', 15_000_000]], cardLimit: 10_000_000, cardUsed: 1_800_000, lastActiveMin: 60 }),
      'u-1010': P({ email: 'z.ghasemi@arman.co', score: 0, kycLevel: 0, split: [0, 0, 0], lastActiveMin: -1 }),
      'u-1011': P({ email: 'k.sharifi@arman.co', score: 0, kycLevel: 0, split: [0, 0, 0], lastActiveMin: -1 }),
      'u-1012': P({ email: 'n.akbari@arman.co', score: 726, split: [45, 45, 10], locks: [['vesting', 20_000_000]], cardLimit: 15_000_000, cardUsed: 3_100_000, lastActiveMin: 240 }),
    },
    requestMeta: {
      'RQ-2041': { months: 12 },
      'RQ-2040': { manager: 'بهرام تهرانی', managerOk: true, files: 2 },
      'RQ-2035': { months: 18 },
      'RQ-2037': { months: 6, store: 'دیجی‌کالا' },
    },
  };
  db.extra.orgPeople = extra;
}
