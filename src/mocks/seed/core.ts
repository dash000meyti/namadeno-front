/**
 * Canonical demo data — user «سارا محمدی» at «هلدینگ آرمان».
 * Numbers follow the product's free/locked model:
 *   total 202,500,000 = free 130,900,000 + locked 71,600,000 (Toman)
 */
import type {
  AppNotification, BankAccount, Card, CreditSummary, Fund, Holding, InboxPackage, InstallmentPurchase, Loan, Lock,
  MilestoneStep, Ticket, Transaction, UserProfile,
} from '@/types/domain';
import { daysFromNow, jalaliToIso, minutesAgo } from '@/lib/clock';
import type { UserData } from '../db';

// ───────────── Funds ─────────────
function navHistory(end: number, days: number, vol: number, drift: number, seed: number) {
  // deterministic pseudo-random walk ending at `end`
  let x = seed;
  const rnd = () => { x = (x * 9301 + 49297) % 233280; return x / 233280; };
  const pts: number[] = [];
  let v = end;
  for (let i = 0; i < days; i++) { pts.push(v); v = v / (1 + drift + (rnd() - 0.5) * vol); }
  pts.reverse();
  return pts.map((p, i) => ({ t: daysFromNow(-(days - 1 - i)), v: Math.round(p) }));
}

export const FUNDS: Fund[] = [
  { id: 'gold', kind: 'gold', name: 'صندوق طلا', symbol: 'طلانو', shortName: 'طلا', category: 'commodity', description: 'پشتوانه شمش و سکه، محافظ در برابر تورم', nav: 3015000, navChangePct1d: 1.2, return1y: 42, risk: 'medium', aum: 259_000_000_000, investors: 8410, status: 'active', settlement: 'T+1', feePct: 0.1, history: navHistory(3015000, 365, 0.022, 0.0009, 7) },
  { id: 'fixed', kind: 'fixed', name: 'صندوق درآمد ثابت', symbol: 'ثابت‌نو', shortName: 'درآمد ثابت', category: 'fixed_income', description: 'سود روزشمار، کم‌نوسان', nav: 151800, navChangePct1d: 0.08, return1y: 31, effectiveYield: 31, risk: 'low', aum: 184_000_000_000, investors: 9120, status: 'active', settlement: 'T+1', feePct: 0.05, history: navHistory(151800, 365, 0.0008, 0.00074, 11) },
  { id: 'equity', kind: 'equity', name: 'صندوق سهامی شاخصی', symbol: 'شاخص‌نو', shortName: 'سهام', category: 'equity', description: 'سبدی از بزرگ‌ترین شرکت‌های کشور', nav: 127500, navChangePct1d: -0.6, return1y: 28, risk: 'high', aum: 61_000_000_000, investors: 2310, status: 'active', settlement: 'T+2', feePct: 0.15, history: navHistory(127500, 365, 0.03, 0.0007, 13) },
  { id: 'mixed', kind: 'mixed', name: 'صندوق مختلط', symbol: 'مختلط‌نو', shortName: 'مختلط', category: 'mixed', description: 'ترکیب سهام و اوراق با درآمد ثابت', nav: 141400, navChangePct1d: 0.3, return1y: 24, risk: 'medium', aum: 38_000_000_000, investors: 1640, status: 'active', settlement: 'T+2', feePct: 0.12, history: navHistory(141400, 365, 0.012, 0.0006, 17) },
  { id: 'silver', kind: 'silver', name: 'صندوق نقره', symbol: 'نقره‌نو', shortName: 'نقره', category: 'commodity', description: 'پشتوانه گواهی سپرده نقره', nav: 250000, navChangePct1d: 0.9, return1y: 36, risk: 'high', aum: 12_000_000_000, investors: 820, status: 'active', settlement: 'T+1', feePct: 0.1, history: navHistory(250000, 365, 0.025, 0.0008, 19) },
  { id: 'saffron', kind: 'saffron', name: 'صندوق زعفران', symbol: 'زعفران‌نو', shortName: 'زعفران', category: 'commodity', description: 'پشتوانه گواهی سپرده زعفران', nav: 98200, navChangePct1d: 0.2, return1y: 19, risk: 'medium', aum: 7_400_000_000, investors: 410, status: 'active', settlement: 'T+1', feePct: 0.1 },
  { id: 'leverage', kind: 'leverage', name: 'صندوق اهرمی', symbol: 'اهرم‌نو', shortName: 'اهرم', category: 'equity', description: 'بازدهی تقویت‌شده سهام، نوسان بالا', nav: 86900, navChangePct1d: -1.4, return1y: -4, risk: 'very_high', aum: 9_100_000_000, investors: 530, status: 'active', settlement: 'T+2', feePct: 0.2 },
  { id: 'project', kind: 'project', name: 'صندوق پروژه', symbol: 'پروژه‌نو', shortName: 'پروژه', category: 'fixed_income', description: 'تأمین مالی پروژه‌های عمرانی، سود دوره‌ای', nav: 104000, navChangePct1d: 0.05, return1y: 26, risk: 'low', aum: 15_300_000_000, investors: 690, status: 'active', settlement: 'T+1', feePct: 0.05 },
  { id: 'energy', kind: 'energy', name: 'صندوق انرژی', symbol: 'انرژی‌نو', shortName: 'انرژی', category: 'commodity', description: 'گواهی‌های انرژی', nav: 0, navChangePct1d: 0, return1y: 0, risk: 'high', aum: 0, investors: 0, status: 'coming_soon', settlement: 'T+1', feePct: 0.1 },
];

const NAV = Object.fromEntries(FUNDS.map((f) => [f.id, f.nav]));

// ───────────── Locks ─────────────
export const MS_STEPS: MilestoneStep[] = [
  { id: 'ms-1', title: 'تحلیل نیازمندی‌ها', sharePct: 20, status: 'released', releasedAt: jalaliToIso(1405, 6, 15), dueDate: jalaliToIso(1405, 6, 15), requiresApproval: true },
  { id: 'ms-2', title: 'طراحی رابط کاربری', sharePct: 20, status: 'released', releasedAt: jalaliToIso(1405, 7, 5), dueDate: jalaliToIso(1405, 7, 5), requiresApproval: true },
  { id: 'ms-3', title: 'پیاده‌سازی نسخه اول', sharePct: 30, status: 'pending_approval', dueDate: jalaliToIso(1405, 8, 20), requiresApproval: true },
  { id: 'ms-4', title: 'تست و تحویل', sharePct: 20, status: 'future', dueDate: jalaliToIso(1405, 9, 20), requiresApproval: true },
  // time-based support: released automatically at its due date
  { id: 'ms-5', title: 'پشتیبانی یک‌ماهه', sharePct: 10, status: 'future', dueDate: jalaliToIso(1405, 10, 20), requiresApproval: false },
];

const LOCKS: Record<string, Lock[]> = {
  rial: [
    { id: 'lk-rial-card', type: 'collateral', holdingKind: 'rial', amount: 4_000_000, title: 'رزرو تسویه اعتبار کارت', condition: 'آزاد با تسویه صورت‌حساب آبان', createdAt: jalaliToIso(1405, 7, 1), sourceId: 'card-1' },
  ],
  gold: [
    { id: 'lk-gold-loan', type: 'collateral', holdingKind: 'gold', amount: 30_000_000, title: 'پشتوانه‌ی وام', condition: 'آزاد با تسویه وام', createdAt: jalaliToIso(1405, 7, 20), sourceId: 'loan-1', paidCount: 4, totalCount: 12 },
    { id: 'lk-gold-ms', type: 'milestone', holdingKind: 'gold', amount: 12_000_000, title: 'قرارداد پروژه پرتال منابع انسانی', condition: 'با تأیید هر مرحله توسط سازمان آزاد می‌شود', createdAt: jalaliToIso(1405, 6, 1), sourceId: 'pkg-ms-portal', contractTotal: 20_000_000, steps: MS_STEPS },
  ],
  fixed: [
    { id: 'lk-fixed-vest', type: 'vesting', holdingKind: 'fixed', amount: 20_000_000, title: 'پاداش تیر ۱۴۰۵', condition: 'آزاد در ۱۴۰۵/۱۰/۱۵', createdAt: jalaliToIso(1405, 4, 2), releaseAt: jalaliToIso(1405, 10, 15), sourceId: 'pkg-tir' },
  ],
  mixed: [
    { id: 'lk-mixed-inst', type: 'installment', holdingKind: 'mixed', amount: 3_500_000, title: 'خرید اقساطی دیجی‌کالا', condition: 'با پرداخت هر قسط، بخشی آزاد می‌شود', createdAt: jalaliToIso(1405, 6, 10), sourceId: 'inst-1', paidCount: 2, totalCount: 6 },
  ],
  silver: [
    { id: 'lk-silver-vest', type: 'vesting', holdingKind: 'silver', amount: 2_100_000, title: 'هدیه عضویت', condition: 'آزاد در ۱۴۰۵/۱۲/۰۱', createdAt: jalaliToIso(1405, 5, 1), releaseAt: jalaliToIso(1405, 12, 1) },
  ],
  equity: [],
};

function holding(kind: 'rial' | 'gold' | 'fixed' | 'equity' | 'mixed' | 'silver', value: number, change: number, changePct: number): Holding {
  const names: Record<string, string> = { rial: 'کیف پول ریالی', gold: 'صندوق طلا', fixed: 'صندوق درآمد ثابت', equity: 'صندوق سهامی شاخصی', mixed: 'صندوق مختلط', silver: 'صندوق نقره' };
  const locks = LOCKS[kind] ?? [];
  const locked = locks.reduce((s, l) => s + l.amount, 0);
  return {
    kind,
    fundId: kind === 'rial' ? undefined : kind,
    name: names[kind],
    units: kind === 'rial' ? undefined : value / NAV[kind],
    value, free: value - locked, locked, change, changePct, locks,
  };
}

export const SARA_HOLDINGS = (): Holding[] => [
  holding('rial', 24_400_000, 4_000_000, 19.61),
  holding('gold', 98_000_000, 1_162_000, 1.2),
  holding('fixed', 64_000_000, 51_000, 0.08),
  holding('equity', 8_200_000, -49_500, -0.6),
  holding('mixed', 5_800_000, 17_350, 0.3),
  holding('silver', 2_100_000, 18_700, 0.9),
];

// ───────────── Profile ─────────────
export const SARA: UserProfile = {
  id: 'u-1001', firstName: 'سارا', lastName: 'محمدی', fullName: 'سارا محمدی', mobile: '09121234567', nationalId: '0012345678',
  birthDate: '1370/05/12', employeeCode: '1048', orgId: 'org-arman', orgName: 'هلدینگ آرمان', jobTitle: 'کارشناس ارشد فنی',
  kycLevel: 1, creditScore: 742, joinedAt: jalaliToIso(1404, 3, 14), avatarLetter: 'س', status: 'active',
};

// ───────────── Inbox ─────────────
export const SARA_INBOX: InboxPackage[] = [
  { id: 'in-mehr', packageId: 'pkg-mehr', title: 'پاداش مهر ۱۴۰۵', reason: 'bonus', orgId: 'org-arman', orgName: 'هلدینگ آرمان', amount: 20_000_000, message: 'با سپاس از تلاش‌های شما در پروژه‌های فصل دوم.', sentAt: jalaliToIso(1405, 7, 14), expiresAt: jalaliToIso(1405, 8, 30), allocationMode: 'free', cashAllowed: true, lockPolicy: { type: 'vesting', releaseAt: jalaliToIso(1405, 10, 15) }, status: 'pending' },
  { id: 'in-welfare-aban', packageId: 'pkg-welfare-aban', title: 'مزایای رفاهی', reason: 'welfare', orgId: 'org-arman', orgName: 'هلدینگ آرمان', amount: 5_000_000, sentAt: jalaliToIso(1405, 7, 10), allocationMode: 'fixed', fixedSplit: { gold: 0, fixed: 100 }, cashAllowed: false, lockPolicy: { type: 'none' }, status: 'pending' },
  // already accepted (archive)
  { id: 'in-ms', packageId: 'pkg-ms-portal', title: 'قرارداد پروژه پرتال منابع انسانی', reason: 'project_contract', orgId: 'org-arman', orgName: 'هلدینگ آرمان', amount: 20_000_000, sentAt: jalaliToIso(1405, 6, 1), allocationMode: 'fixed', fixedSplit: { gold: 100, fixed: 0 }, cashAllowed: false, lockPolicy: { type: 'milestone', steps: MS_STEPS.map(({ title, sharePct, dueDate, requiresApproval }) => ({ title, sharePct, dueDate, requiresApproval })) }, status: 'accepted', acceptedAt: jalaliToIso(1405, 6, 1), acceptedSplit: { gold: 100, fixed: 0 } },
  { id: 'in-shahrivar', packageId: 'pkg-shahrivar', title: 'پاداش شهریور ۱۴۰۵', reason: 'bonus', orgId: 'org-arman', orgName: 'هلدینگ آرمان', amount: 15_000_000, sentAt: jalaliToIso(1405, 6, 14), allocationMode: 'free', cashAllowed: true, lockPolicy: { type: 'none' }, status: 'accepted', acceptedAt: jalaliToIso(1405, 6, 14), acceptedSplit: { gold: 60, fixed: 40 } },
  { id: 'in-welfare-mordad', packageId: 'pkg-welfare-mordad', title: 'مزایای رفاهی مرداد', reason: 'welfare', orgId: 'org-arman', orgName: 'هلدینگ آرمان', amount: 5_000_000, sentAt: jalaliToIso(1405, 5, 10), allocationMode: 'fixed', fixedSplit: { gold: 0, fixed: 100 }, cashAllowed: false, lockPolicy: { type: 'none' }, status: 'accepted', acceptedAt: jalaliToIso(1405, 5, 10), acceptedSplit: { gold: 0, fixed: 100 } },
  { id: 'in-tir', packageId: 'pkg-tir', title: 'پاداش تیر ۱۴۰۵', reason: 'bonus', orgId: 'org-arman', orgName: 'هلدینگ آرمان', amount: 20_000_000, sentAt: jalaliToIso(1405, 4, 2), allocationMode: 'fixed', fixedSplit: { gold: 0, fixed: 100 }, cashAllowed: false, lockPolicy: { type: 'vesting', releaseAt: jalaliToIso(1405, 10, 15) }, status: 'accepted', acceptedAt: jalaliToIso(1405, 4, 2), acceptedSplit: { gold: 0, fixed: 100 } },
  { id: 'in-eid', packageId: 'pkg-eid', title: 'عیدی ۱۴۰۵', reason: 'eid', orgId: 'org-arman', orgName: 'هلدینگ آرمان', amount: 8_000_000, sentAt: jalaliToIso(1405, 1, 5), allocationMode: 'fixed', fixedSplit: { gold: 100, fixed: 0 }, cashAllowed: false, lockPolicy: { type: 'none' }, status: 'accepted', acceptedAt: jalaliToIso(1405, 1, 5), acceptedSplit: { gold: 100, fixed: 0 } },
  { id: 'in-welfare-farvardin', packageId: 'pkg-welfare-farvardin', title: 'مزایای رفاهی فروردین', reason: 'welfare', orgId: 'org-arman', orgName: 'هلدینگ آرمان', amount: 5_000_000, sentAt: jalaliToIso(1405, 1, 5), allocationMode: 'fixed', fixedSplit: { gold: 0, fixed: 100 }, cashAllowed: false, lockPolicy: { type: 'none' }, status: 'accepted', acceptedAt: jalaliToIso(1405, 1, 5), acceptedSplit: { gold: 0, fixed: 100 } },
];

// ───────────── Transactions ─────────────
type TxSeed = Omit<Transaction, 'trackingCode' | 'status'> & { status?: Transaction['status'] };
/** Tehran time of day for each seed transaction (jalaliToIso gives 12:00); later rows of the same day are earlier. */
const TX_TIME: Record<string, string> = {
  'tx-01': '18:42', 'tx-02': '15:10', 'tx-03': '09:24', 'tx-04': '20:05', 'tx-05': '11:37', 'tx-06': '10:15',
  'tx-07': '13:48', 'tx-08': '16:02', 'tx-09': '08:55', 'tx-10': '19:20', 'tx-11': '12:30', 'tx-12': '17:45',
  'tx-13': '10:05', 'tx-14': '14:22', 'tx-15': '09:40', 'tx-16': '21:10', 'tx-17': '18:05', 'tx-18': '11:12',
};
const atTime = (iso: string, hm?: string) => {
  if (!hm) return iso;
  const [h, m] = hm.split(':').map(Number);
  return new Date(new Date(iso).getTime() + (h * 60 + m - 720) * 60000).toISOString();
};
const tx = (t: TxSeed, i: number): Transaction => ({ status: 'success', trackingCode: 'NM-' + (0x7f21a + i * 977).toString(16).toUpperCase().slice(-5), ...t, at: atTime(t.at, TX_TIME[t.id]) });

export const SARA_TX: Transaction[] = [
  { id: 'tx-01', category: 'card', title: 'خرید با کارت — فروشگاه آنلاین', subtitle: 'کارت نمادنو', at: jalaliToIso(1405, 8, 3), amount: -2_340_000 },
  { id: 'tx-02', category: 'fund', title: 'سود درآمد ثابت', subtitle: 'صندوق درآمد ثابت', at: jalaliToIso(1405, 8, 2), amount: 52_000, holdingKind: 'fixed' },
  { id: 'tx-03', category: 'lock', title: 'آزادسازی پشتوانه با پرداخت قسط', subtitle: 'صندوق مختلط', at: jalaliToIso(1405, 8, 2), amount: 875_000, holdingKind: 'mixed', lockType: 'installment', lockEvent: 'released' },
  { id: 'tx-04', category: 'rial', title: 'برداشت به حساب بانکی', subtitle: 'کیف پول ریالی', at: jalaliToIso(1405, 8, 1), amount: -5_000_000, holdingKind: 'rial', status: 'pending' },
  { id: 'tx-05', category: 'card', title: 'خرید با کارت — سوپرمارکت', subtitle: 'کارت نمادنو', at: jalaliToIso(1405, 8, 1), amount: -860_000 },
  { id: 'tx-06', category: 'inbox', title: 'دریافت پاداش مهر — هلدینگ آرمان', subtitle: 'تأیید دریافت', at: jalaliToIso(1405, 7, 28), amount: 20_000_000 },
  { id: 'tx-07', category: 'trade', title: 'خرید صندوق طلا', subtitle: 'طلانو', at: jalaliToIso(1405, 7, 26), amount: -10_000_000, units: 3.32, holdingKind: 'gold' },
  { id: 'tx-08', category: 'lock', title: 'رزرو پشتوانه‌ی وام — صندوق طلا', subtitle: 'آزاد با تسویه وام', at: jalaliToIso(1405, 7, 20), amount: 30_000_000, holdingKind: 'gold', lockType: 'collateral', lockEvent: 'locked' },
  { id: 'tx-09', category: 'loan', title: 'قسط وام — ۴ از ۱۲', subtitle: 'از کیف پول ریالی', at: jalaliToIso(1405, 7, 15), amount: -2_850_000, holdingKind: 'rial' },
  { id: 'tx-10', category: 'lock', title: 'آزادسازی مرحله ۲ قرارداد پروژه', subtitle: 'مرحله ۲ از ۵', at: jalaliToIso(1405, 7, 5), amount: 4_000_000, holdingKind: 'gold', lockType: 'milestone', lockEvent: 'released' },
  { id: 'tx-11', category: 'fund', title: 'سود درآمد ثابت', subtitle: 'صندوق درآمد ثابت', at: jalaliToIso(1405, 7, 1), amount: 48_000, holdingKind: 'fixed' },
  { id: 'tx-12', category: 'lock', title: 'آزادسازی مرحله ۱ قرارداد پروژه', subtitle: 'مرحله ۱ از ۵', at: jalaliToIso(1405, 6, 15), amount: 4_000_000, holdingKind: 'gold', lockType: 'milestone', lockEvent: 'released' },
  { id: 'tx-13', category: 'inbox', title: 'دریافت پاداش شهریور', subtitle: 'هلدینگ آرمان', at: jalaliToIso(1405, 6, 14), amount: 15_000_000 },
  { id: 'tx-14', category: 'inbox', title: 'دریافت قرارداد پروژه', subtitle: 'صندوق طلا · دریافت مرحله‌ای', at: jalaliToIso(1405, 6, 1), amount: 20_000_000, holdingKind: 'gold', lockType: 'milestone', lockEvent: 'locked' },
  { id: 'tx-15', category: 'inbox', title: 'مزایای رفاهی مرداد', subtitle: 'صندوق درآمد ثابت', at: jalaliToIso(1405, 5, 10), amount: 5_000_000, holdingKind: 'fixed' },
  { id: 'tx-16', category: 'lock', title: 'پس‌انداز پاداش تیر', subtitle: 'آزاد در ۱۴۰۵/۱۰/۱۵', at: jalaliToIso(1405, 4, 2), amount: 20_000_000, holdingKind: 'fixed', lockType: 'vesting', lockEvent: 'locked' },
  { id: 'tx-17', category: 'installment', title: 'خرید اقساطی — دیجی‌کالا', subtitle: '۶ قسط · پشتوانه‌ی صندوق مختلط', at: jalaliToIso(1405, 6, 10), amount: -5_250_000 },
  { id: 'tx-18', category: 'rial', title: 'واریز از کارت بانکی', subtitle: 'شاپرک · کیف پول ریالی', at: jalaliToIso(1405, 6, 5), amount: 10_000_000, holdingKind: 'rial' },
].map((t, i) => tx(t as TxSeed, i));

// ───────────── Notifications ─────────────
export const SARA_NOTIFS: AppNotification[] = [
  { id: 'nt-1', title: 'بسته جدید: پاداش مهر ۱۴۰۵', body: '۲۰٬۰۰۰٬۰۰۰ تومان از هلدینگ آرمان · منتظر تأیید شما', at: minutesAgo(10), read: false, tone: 'primary', icon: 'inbox', href: '/app/inbox' },
  { id: 'nt-2', title: 'مرحله ۳ قرارداد پروژه در انتظار تأیید سازمان است', body: '«پیاده‌سازی نسخه اول» (۳۰٪) · با تأیید هلدینگ آرمان ۶٬۰۰۰٬۰۰۰ تومان آزاد می‌شود', at: minutesAgo(60), read: false, tone: 'warning', icon: 'flag', href: '/app/assets/gold' },
  { id: 'nt-3', title: 'قسط وام ۱۵ آبان سررسید می‌شود', body: 'مبلغ قسط ۲٬۸۵۰٬۰۰۰ تومان · قسط ۵ از ۱۲', at: daysFromNow(0, '09:00'), read: false, tone: 'warning', icon: 'calendar', href: '/app/credit' },
  { id: 'nt-4', title: 'سود روزانه درآمد ثابت واریز شد', body: '+۵۱٬۰۰۰ تومان به صندوق درآمد ثابت', at: daysFromNow(0, '08:30'), read: false, tone: 'secondary', icon: 'percent', href: '/app/assets/fixed' },
  { id: 'nt-5', title: '۲۰٬۰۰۰٬۰۰۰ تومان پاداش تیر در ۱۴۰۵/۱۰/۱۵ آزاد می‌شود', body: 'پس‌انداز سازمانی در صندوق درآمد ثابت · تا آن روز برای شما بازده می‌گیرد', at: daysFromNow(-1, '18:00'), read: true, tone: 'warning', icon: 'clock', href: '/app/assets/fixed' },
  { id: 'nt-6', title: '۴٬۰۰۰٬۰۰۰ تومان از قرارداد پروژه آزاد شد', body: 'مرحله ۲ «طراحی رابط کاربری» تأیید شد · صندوق طلا · ۲ از ۵ مرحله', at: jalaliToIso(1405, 7, 5), read: true, tone: 'success', icon: 'unlock', href: '/app/history' },
  { id: 'nt-7', title: 'امتیاز اعتباری به ۷۴۲ رسید', body: 'سطح «عالی» · ۱۸ امتیاز بیشتر از ماه قبل', at: jalaliToIso(1405, 7, 14), read: true, tone: 'success', icon: 'trend', href: '/app/credit/score' },
];

// ───────────── Credit / loan / card ─────────────
export const SARA_CREDIT: CreditSummary = {
  score: 742, scoreBand: 'excellent', scoreChange: 18,
  creditLimit: 35_000_000, creditUsed: 12_400_000,
  loanMax: 52_360_000, loanMaxPct: 40, activeLoanId: 'loan-1',
  factors: [
    { title: 'بازپرداخت به‌موقع اقساط', impact: 'positive', note: '۴ قسط بدون تأخیر' },
    { title: 'دارایی آزاد', impact: 'positive', note: '۱۳۰٫۹ میلیون تومان' },
    { title: 'سابقه همکاری با سازمان', impact: 'positive', note: 'بیش از ۱ سال' },
    { title: 'استفاده از اعتبار کارت', impact: 'neutral', note: '۳۵٪ سقف' },
  ],
};

export const SARA_LOAN: Loan = {
  id: 'loan-1', principal: 30_000_000, months: 12, ratePct: 18, monthlyPayment: 2_850_000, startedAt: jalaliToIso(1405, 3, 15),
  collateral: { holdingKind: 'gold', amount: 30_000_000, lockId: 'lk-gold-loan' },
  status: 'active',
  installments: Array.from({ length: 12 }, (_, i) => {
    const m = 4 + i; // first installment 1405/04/15
    const y = m > 12 ? 1406 : 1405;
    const mm = m > 12 ? m - 12 : m;
    return { n: i + 1, dueDate: jalaliToIso(y, mm, 15), amount: 2_850_000, status: i < 4 ? 'paid' : i === 4 ? 'due' : 'upcoming', paidAt: i < 4 ? jalaliToIso(y, mm, 14) : undefined } as const;
  }),
};

export const SARA_CARD: Card = {
  id: 'card-1', holderName: 'سارا محمدی', maskedPan: '6037 •••• •••• 4218', expiry: '1408/07', status: 'active',
  balance: 22_600_000, creditLimit: 35_000_000, creditUsed: 12_400_000, statementDue: jalaliToIso(1405, 8, 30), statementAmount: 12_400_000,
  settings: { online: true, pos: true, atm: false, contactless: true, dailyLimit: 20_000_000, notifyEach: true },
};

export const SARA_INSTALLMENTS: InstallmentPurchase[] = [
  { id: 'inst-1', storeId: 'st-digikala', storeName: 'دیجی‌کالا', title: 'لپ‌تاپ ۱۴ اینچ', price: 31_500_000, months: 6, monthly: 5_250_000, paidCount: 2, purchaseCode: 'BN-58219', createdAt: jalaliToIso(1405, 6, 10), lockId: 'lk-mixed-inst' },
];

export const SARA_BANKS: BankAccount[] = [
  { id: 'ba-1', bankName: 'بانک ملت', iban: 'IR120120000000003456784521', ownerName: 'سارا محمدی', isDefault: true, verified: true },
  { id: 'ba-2', bankName: 'بانک سامان', iban: 'IR560560000000001122339087', ownerName: 'سارا محمدی', isDefault: false, verified: true },
];

export const SARA_TICKETS: Ticket[] = [
  { id: 'SP-4120', subject: 'تأخیر در واریز برداشت', status: 'open', createdAt: jalaliToIso(1405, 8, 1), messages: [
    { id: 'm1', from: 'user', text: 'سلام، برداشت ۵ میلیونی من از دیروز هنوز به حسابم نرسیده.', at: jalaliToIso(1405, 8, 1) },
    { id: 'm2', from: 'agent', text: 'سلام سارا جان، درخواست شما در چرخه پایا ثبت شده و تا پایان روز کاری بعد واریز می‌شود.', at: jalaliToIso(1405, 8, 1) },
  ] },
  { id: 'SP-3987', subject: 'گزارش سود صندوق درآمد ثابت', status: 'closed', createdAt: jalaliToIso(1405, 7, 12), messages: [
    { id: 'm1', from: 'user', text: 'گزارش سود سه ماه اخیر را می‌خواستم.', at: jalaliToIso(1405, 7, 12) },
    { id: 'm2', from: 'agent', text: 'گزارش برای شما آماده شد.', at: jalaliToIso(1405, 7, 13), attachment: { name: 'گزارش-سود-تابستان-۱۴۰۵.pdf', size: '۲۴۰ کیلوبایت' } },
  ] },
  { id: 'SP-3851', subject: 'تغییر حساب بانکی پیش‌فرض', status: 'closed', createdAt: jalaliToIso(1405, 6, 2), messages: [
    { id: 'm1', from: 'user', text: 'می‌خواهم حساب سامان را پیش‌فرض کنم.', at: jalaliToIso(1405, 6, 2) },
    { id: 'm2', from: 'agent', text: 'انجام شد. از این پس برداشت‌ها به بانک سامان واریز می‌شود.', at: jalaliToIso(1405, 6, 2) },
  ] },
];

export function buildSara(): UserData {
  return {
    profile: { ...SARA },
    holdings: SARA_HOLDINGS(),
    inbox: SARA_INBOX.map((x) => ({ ...x })),
    transactions: SARA_TX.map((x) => ({ ...x })),
    notifications: SARA_NOTIFS.map((x) => ({ ...x })),
    bankAccounts: SARA_BANKS.map((x) => ({ ...x })),
    credit: { ...SARA_CREDIT },
    loans: [JSON.parse(JSON.stringify(SARA_LOAN))],
    card: JSON.parse(JSON.stringify(SARA_CARD)),
    installments: SARA_INSTALLMENTS.map((x) => ({ ...x })),
    tickets: JSON.parse(JSON.stringify(SARA_TICKETS)),
    passwordSet: true,
  };
}
