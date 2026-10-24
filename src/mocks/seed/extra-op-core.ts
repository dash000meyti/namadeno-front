import type { MockDB } from '../db';
import type { AssetKind, Holding, Lock, LockType, Transaction } from '@/types/domain';
import type { ContractVersion, Facility, HrUser, OrgContractExt, UserLog, UserNote } from '@/api/op-core-extra';
import { daysFromNow, jalaliToIso, minutesAgo } from '@/lib/clock';

/** Platform user (no full app account) — the operator-side breakdown of their wallet. */
export interface PlatformUserMeta {
  holdings: Holding[];
  facilities: Facility[];
  transactions: Transaction[];
  department?: string;
  devices: { count: number; newDevice: boolean; city: string };
}

export interface OpCoreExtra {
  orgs: Record<string, OrgContractExt>;
  users: Record<string, PlatformUserMeta>;
  notes: Record<string, UserNote[]>;
  logs: Record<string, UserLog[]>;
  /** Unaccepted packages on organizations that are not modelled in detail (overview KPI). */
  basePendingPackages: number;
}

// ───────────── Organizations ─────────────
// aum (B), locked (B), policies [vesting, milestone, collateral, installment], contract version, growth %, card %, per-person cap, vesting max months, milestone max steps, cash, funds [gold, fixed]
type OrgX = [number, number, [number, number, number, number], number, number, number, number, number, number, number, [number, number]];
const ORG_X: Record<string, OrgX> = {
  'org-arman': [68.4, 17.8, [1, 1, 1, 1], 6, 12, 25, 50_000_000, 3, 5, 1, [1, 1]],
  'org-pars': [54.1, 14.6, [1, 0, 1, 0], 5, 8.5, 20, 40_000_000, 6, 5, 1, [1, 1]],
  'org-novin': [31.7, 9.2, [1, 1, 1, 1], 4, 15, 25, 60_000_000, 3, 5, 0, [1, 1]],
  'org-atieh': [0, 0, [1, 0, 1, 0], 4, 0, 15, 30_000_000, 6, 5, 0, [1, 0]],
  'org-sepehr': [22.9, 4.1, [1, 0, 1, 0], 4, -1.4, 20, 35_000_000, 3, 5, 1, [1, 1]],
  'org-ideh': [9.6, 3.4, [1, 0, 1, 0], 5, -3.2, 10, 20_000_000, 12, 5, 0, [0, 1]],
  'org-kaveh': [20.4, 5.6, [1, 1, 1, 1], 5, 6.2, 20, 45_000_000, 3, 5, 1, [1, 1]],
  'org-ava': [18.2, 4.9, [1, 0, 1, 1], 4, 9.1, 25, 40_000_000, 3, 5, 1, [1, 1]],
  'org-rad': [16.9, 3.8, [1, 0, 1, 0], 6, 3.4, 15, 30_000_000, 6, 5, 1, [1, 1]],
  'org-alborz': [12.3, 2.6, [1, 0, 1, 0], 4, 4.0, 20, 25_000_000, 3, 5, 1, [1, 1]],
  'org-mehr': [0, 0, [1, 1, 0, 0], 4, 0, 15, 20_000_000, 6, 5, 0, [0, 1]],
  'org-aseman': [10.8, 2.7, [1, 0, 1, 0], 5, 2.7, 20, 35_000_000, 3, 5, 1, [1, 1]],
};

const NOTES: [string, [number, number, number], string][] = [
  ['افزودن گزینه بازپرداخت ۱۸ ماه', [1405, 7, 2], 'علی نادری'],
  ['سقف اعتبار هر نفر ۴۰ → ۵۰ میلیون', [1405, 4, 18], 'علی نادری'],
  ['فعال‌سازی خرید اقساطی', [1404, 12, 10], 'سمیرا توکلی'],
  ['افزودن صندوق درآمد ثابت به صندوق‌های مجاز', [1404, 8, 3], 'مهدی رحیمی'],
  ['حداکثر مدت پس‌انداز ۶ → ۳ ماه', [1404, 5, 11], 'علی نادری'],
  ['عقد قرارداد اولیه', [1404, 1, 15], 'علی نادری'],
];

const ARMAN_AUM = [52.1, 53.4, 54.0, 56.2, 57.1, 58.9, 60.4, 61.0, 63.2, 64.8, 66.1, 68.4];
const SHARE: Record<'vesting' | 'milestone' | 'collateral' | 'installment', number> = { vesting: 0.46, milestone: 0.17, collateral: 0.33, installment: 0.04 };
const MANAGERS = ['سمیرا توکلی', 'مهدی رحیمی', 'علی نادری'];

function versions(n: number): ContractVersion[] {
  const out: ContractVersion[] = [];
  for (let v = n; v >= 1; v--) {
    const k = n - v;
    const nt = v === 1 ? NOTES[5] : NOTES[Math.min(k + (6 - n), 4)];
    out.push({ v, note: v === 1 ? 'عقد قرارداد اولیه' : nt[0], at: jalaliToIso(nt[1][0], nt[1][1], nt[1][2]), by: nt[2] });
  }
  return out;
}

// ───────────── Platform users ─────────────
type LockSeed = [type: LockType, kind: AssetKind, amount: number, title: string, condition: string, created: [number, number, number], extra?: Partial<Lock>];
type FacSeed = Omit<Facility, 'id'>;
interface PUSeed { split: Partial<Record<AssetKind, number>>; locks: LockSeed[]; facilities: FacSeed[]; devices: [number, boolean]; city: string }

const PU_SEED: Record<string, PUSeed> = {
  'u-1002': {
    split: { rial: 8_200_000, gold: 52_000_000, fixed: 31_900_000 },
    locks: [
      ['collateral', 'gold', 20_000_000, 'پشتوانه‌ی وام', 'آزاد با تسویه وام (۱۲ قسط، ۸ مانده)', [1405, 3, 10], { sourceId: 'ln-1002', paidCount: 4, totalCount: 12 }],
      ['vesting', 'fixed', 10_000_000, 'پاداش شهریور ۱۴۰۵', 'آزاد در ۱۴۰۵/۰۹/۳۰', [1405, 6, 14], { releaseAt: jalaliToIso(1405, 9, 30), sourceId: 'pkg-shahrivar' }],
    ],
    facilities: [
      { kind: 'loan', title: 'وام با پشتوانه دارایی', status: 'current', amount: 20_000_000, used: 13_300_000, months: 12, paidCount: 4, totalCount: 12, nextDue: { at: jalaliToIso(1405, 8, 20), amount: 1_900_000 }, collateral: { holdingKind: 'gold', amount: 20_000_000 } },
      { kind: 'card', title: 'کارت نمادنو', status: 'current', amount: 18_000_000, used: 4_100_000 },
    ],
    devices: [1, false], city: 'تهران',
  },
  'u-1003': {
    split: { rial: 12_800_000, gold: 70_000_000, fixed: 62_000_000 },
    locks: [
      ['collateral', 'fixed', 25_000_000, 'پشتوانه‌ی وام', 'آزاد با تسویه وام (۱۸ قسط، ۱۱ مانده)', [1405, 1, 20], { sourceId: 'ln-1003', paidCount: 7, totalCount: 18 }],
      ['milestone', 'gold', 15_000_000, 'قرارداد پروژه سامانه فروش · کل ۲۰ م', 'با تأیید هر مرحله توسط سازمان آزاد می‌شود', [1405, 5, 1], {
        sourceId: 'pkg-ms-sales', contractTotal: 20_000_000,
        steps: [
          { id: 'mss-1', title: 'تحلیل', sharePct: 25, status: 'released', releasedAt: jalaliToIso(1405, 6, 1), dueDate: jalaliToIso(1405, 6, 1) },
          { id: 'mss-2', title: 'طراحی', sharePct: 25, status: 'pending_approval', dueDate: jalaliToIso(1405, 8, 25) },
          { id: 'mss-3', title: 'پیاده‌سازی', sharePct: 30, status: 'future', dueDate: jalaliToIso(1405, 10, 1) },
          { id: 'mss-4', title: 'تحویل', sharePct: 20, status: 'future', dueDate: jalaliToIso(1405, 11, 1) },
        ],
      }],
    ],
    facilities: [
      { kind: 'loan', title: 'وام با پشتوانه دارایی', status: 'current', amount: 25_000_000, used: 15_300_000, months: 18, paidCount: 7, totalCount: 18, nextDue: { at: jalaliToIso(1405, 8, 20), amount: 1_650_000 }, collateral: { holdingKind: 'fixed', amount: 25_000_000 } },
      { kind: 'card', title: 'کارت نمادنو', status: 'current', amount: 30_000_000, used: 9_800_000 },
    ],
    devices: [2, false], city: 'تهران',
  },
  'u-2201': { split: { rial: 18_200_000, gold: 22_000_000, fixed: 18_000_000 }, locks: [], facilities: [], devices: [1, false], city: 'کرج' },
  'u-3019': {
    split: { rial: 20_500_000, gold: 110_000_000, fixed: 80_000_000 },
    locks: [['installment', 'gold', 25_000_000, 'خرید اقساطی یخچال — ۳ قسط مانده', 'با پرداخت هر قسط، بخشی آزاد می‌شود', [1405, 5, 2], { sourceId: 'inst-3019', paidCount: 3, totalCount: 6 }]],
    facilities: [{ kind: 'bnpl', title: 'خرید اقساطی یخچال', status: 'current', amount: 50_000_000, used: 25_000_000, months: 6, paidCount: 3, totalCount: 6, nextDue: { at: jalaliToIso(1405, 8, 25), amount: 8_400_000 }, collateral: { holdingKind: 'gold', amount: 25_000_000 } }],
    devices: [2, false], city: 'اصفهان',
  },
  'u-5044': { split: { rial: 6_400_000, fixed: 6_000_000 }, locks: [], facilities: [], devices: [2, true], city: 'بوشهر' },
  'u-2138': {
    split: { rial: 3_000_000, gold: 41_000_000, fixed: 32_000_000 },
    locks: [
      ['legal', 'gold', 41_000_000, 'مرجع قضایی — شماره ۱۴۰۵۰۰۷۷۱۲۰۳', 'تا رفع دستور مرجع · دستور مرجع قضایی', [1405, 7, 2], { reference: '140500771203' }],
      ['legal', 'fixed', 32_000_000, 'مرجع قضایی — شماره ۱۴۰۵۰۰۷۷۱۲۰۳', 'تا رفع دستور مرجع · دستور مرجع قضایی', [1405, 7, 2], { reference: '140500771203' }],
      ['collateral', 'rial', 3_000_000, 'رزرو تسویه اعتبار کارت', 'آزاد با تسویه صورت‌حساب', [1405, 6, 1], { sourceId: 'card-2138' }],
    ],
    facilities: [{ kind: 'card', title: 'کارت نمادنو (مسدود)', status: 'blocked', amount: 10_000_000, used: 7_200_000 }],
    devices: [3, true], city: 'تهران',
  },
  'u-4006': { split: { rial: 34_900_000 }, locks: [], facilities: [], devices: [1, false], city: 'شیراز' },
  'u-1004': {
    split: { rial: 40_000_000, gold: 140_000_000, fixed: 88_000_000 },
    locks: [
      ['collateral', 'gold', 30_000_000, 'پشتوانه‌ی وام', 'آزاد با تسویه وام (۱۲ قسط، ۶ مانده)', [1405, 2, 1], { sourceId: 'ln-1004', paidCount: 6, totalCount: 12 }],
      ['vesting', 'fixed', 22_000_000, 'پاداش تیر ۱۴۰۵', 'آزاد در ۱۴۰۵/۱۰/۱۵', [1405, 4, 2], { releaseAt: jalaliToIso(1405, 10, 15), sourceId: 'pkg-tir' }],
    ],
    facilities: [
      { kind: 'loan', title: 'وام با پشتوانه دارایی', status: 'current', amount: 30_000_000, used: 15_400_000, months: 12, paidCount: 6, totalCount: 12, nextDue: { at: jalaliToIso(1405, 8, 15), amount: 2_850_000 }, collateral: { holdingKind: 'gold', amount: 30_000_000 } },
      { kind: 'card', title: 'کارت نمادنو', status: 'current', amount: 40_000_000, used: 12_500_000 },
    ],
    devices: [1, false], city: 'تهران',
  },
};

const NAMES: Partial<Record<AssetKind, string>> = { rial: 'کیف پول ریالی', gold: 'صندوق طلا', fixed: 'صندوق درآمد ثابت' };

export function seed_opCore(db: MockDB) {
  const orgs: Record<string, OrgContractExt> = {};
  db.organizations.forEach((o, i) => {
    const x = ORG_X[o.id];
    if (!x) return;
    const [aumB, lockedB, pol, ver, growth, cardPct, perCap, vest, msMax, cash, funds] = x;
    const keys = (['vesting', 'milestone', 'collateral', 'installment'] as const).filter((_, j) => pol[j]);
    const tot = keys.reduce((s, k) => s + SHARE[k], 0) || 1;
    const lockByType: Partial<Record<LockType, number>> = o.id === 'org-arman'
      ? { vesting: 8.2e9, collateral: 5.9e9, milestone: 3.1e9, installment: 0.6e9 }
      : Object.fromEntries(keys.map((k) => [k, Math.round((lockedB * 1e9 * SHARE[k]) / tot)]));
    const gold = o.id === 'org-arman' ? 53 : 44 + ((i * 7) % 14);
    const rial = o.id === 'org-arman' ? 13 : 9 + (i % 5);
    const activeLoans = o.id === 'org-arman' ? 128 : o.settings.loanEnabled ? Math.round(o.employees * 0.33) : 0;
    const hrUsers: HrUser[] = o.id === 'org-arman'
      ? [
        { id: 'hr-200', name: 'مهسا تهرانی', email: 'm.tehrani@arman.co', role: 'مدیر', lastLoginAt: daysFromNow(-2, '11:05'), twoFA: true, status: 'active' },
        { id: 'hr-201', name: 'نیما رضایی', email: 'nima.rezaei@arman.co', role: 'کارشناس', lastLoginAt: daysFromNow(0, '09:12'), twoFA: true, status: 'active' },
        { id: 'hr-202', name: 'لیلا کاظمی', email: 'l.kazemi@arman.co', role: 'کارشناس', lastLoginAt: daysFromNow(-3, '13:20'), twoFA: true, status: 'active' },
        { id: 'hr-204', name: 'رضا حسینی', email: 'r.hosseini@arman.co', role: 'تأییدکننده', lastLoginAt: daysFromNow(-1, '16:40'), twoFA: true, status: 'active' },
        { id: 'hr-203', name: 'کاوه شریفی', email: 'k.sharifi@arman.ir', role: 'کارشناس', twoFA: false, status: 'invited' },
      ]
      : o.admins.map((a, j) => ({ id: 'hr-' + o.id + '-' + j, name: a.name, email: a.email, role: a.role, lastLoginAt: o.status === 'onboarding' ? undefined : daysFromNow(-(i % 4), '10:00'), twoFA: o.status !== 'onboarding', status: o.status === 'onboarding' ? 'invited' : 'active' }));
    orgs[o.id] = {
      aum: Math.round(aumB * 1e9), locked: Math.round(lockedB * 1e9), lockByType, growthPct: growth,
      aumHistory: ARMAN_AUM.map((v) => Math.round((aumB * 1e9 * v) / 68.4)),
      aumMix: { gold, fixed: 100 - gold - rial, rial },
      credit: o.id === 'org-arman'
        ? { activeLoans: 128, outstanding: 3.8e9, cardHolders: 260, overdue: 4 }
        : { activeLoans, outstanding: activeLoans * 30_000_000, cardHolders: o.settings.cardEnabled ? Math.round(o.employees * 0.68) : 0, overdue: Math.round(activeLoans * 0.03) },
      newEmployeesMonth: o.id === 'org-arman' ? 12 : Math.round(o.employees * 0.03),
      cardPct, perPersonCap: perCap, vestingMaxMonths: vest, milestoneMaxSteps: msMax,
      allowCollateral: !!pol[2], allowInstallmentLock: !!pol[3], financeApproval: o.id === 'org-arman' || i % 2 === 0,
      version: ver, versions: versions(ver),
      nationalId: String(10100000000 + i * 7919123).slice(0, 11),
      representative: { name: o.admins[0]?.name ?? '', phone: '021-' + String(44550000 + i * 1111) },
      accountManager: o.id === 'org-arman' ? 'سمیرا توکلی' : MANAGERS[i % 3],
      city: 'تهران',
      hrEmail: o.id === 'org-arman' ? 'hr@arman-holding.ir' : o.admins[0]?.email ?? '',
      hrUsers,
      createdAt: o.contractStart,
    };
    // contract terms that live on Organization.settings
    o.settings.cashWithdrawalAllowed = !!cash;
    o.settings.allowedFunds = (['gold', 'fixed'] as const).filter((_, j) => funds[j]);
    o.settings.lockPolicies = ['none', ...(pol[0] ? (['vesting'] as const) : []), ...(pol[1] ? (['milestone'] as const) : [])];
  });

  const users: Record<string, PlatformUserMeta> = {};
  const nav = (kind: AssetKind) => db.funds.find((f) => f.id === kind)?.nav ?? 1;
  for (const pu of db.platformUsers) {
    const s = PU_SEED[pu.id];
    if (!s) continue;
    const holdings: Holding[] = (Object.entries(s.split) as [AssetKind, number][]).map(([kind, value]) => {
      const locks: Lock[] = s.locks.filter((l) => l[1] === kind).map(([type, holdingKind, amount, title, condition, c, extra], j) => ({
        id: `lk-${pu.id}-${kind}-${j}`, type, holdingKind, amount, title, condition, createdAt: jalaliToIso(c[0], c[1], c[2]), ...extra,
      }));
      const locked = Math.min(value, locks.reduce((a, l) => a + l.amount, 0));
      return {
        kind, fundId: kind === 'rial' ? undefined : kind, name: NAMES[kind] ?? kind, units: kind === 'rial' ? undefined : value / nav(kind),
        value, free: value - locked, locked, change: 0, changePct: 0, locks,
      };
    });
    const total = holdings.reduce((a, h) => a + h.value, 0);
    const lockedSum = holdings.reduce((a, h) => a + h.locked, 0);
    pu.portfolioValue = total; pu.lockedValue = lockedSum; pu.freeValue = total - lockedSum;
    const tx: Transaction[] = [];
    const mk = (i: number, t: Omit<Transaction, 'id' | 'trackingCode' | 'status'> & { status?: Transaction['status'] }): Transaction => ({ id: `tx-${pu.id}-${i}`, trackingCode: 'NM-' + (0x3a1f0 + i * 733 + Number(pu.id.replace(/\D/g, ''))).toString(16).toUpperCase().slice(-5), status: 'success', ...t });
    if (s.split.gold) tx.push(mk(1, { category: 'trade', title: 'خرید صندوق طلا', subtitle: 'طلانو', at: jalaliToIso(1405, 7, 26), amount: -5_000_000, holdingKind: 'gold', units: 5_000_000 / nav('gold') }));
    if (s.facilities.some((f) => f.kind === 'card')) tx.push(mk(2, { category: 'card', title: 'خرید با کارت — فروشگاه آنلاین', subtitle: 'کارت نمادنو', at: jalaliToIso(1405, 8, 2), amount: -1_280_000 }));
    if (s.split.fixed) tx.push(mk(3, { category: 'fund', title: 'سود درآمد ثابت', subtitle: 'صندوق درآمد ثابت', at: jalaliToIso(1405, 8, 1), amount: Math.round(s.split.fixed * 0.31 / 12), holdingKind: 'fixed' }));
    tx.push(mk(4, { category: 'inbox', title: 'دریافت پاداش مهر — ' + pu.orgName, subtitle: 'تأیید دریافت', at: jalaliToIso(1405, 7, 20), amount: 15_000_000 }));
    if (s.split.rial) tx.push(mk(5, { category: 'rial', title: 'برداشت به حساب بانکی', subtitle: 'کیف پول ریالی', at: jalaliToIso(1405, 7, 8), amount: -2_000_000, holdingKind: 'rial' }));
    tx.sort((a, b) => b.at.localeCompare(a.at));
    users[pu.id] = {
      holdings,
      facilities: s.facilities.map((f, j) => ({ id: `fac-${pu.id}-${j}`, ...f })),
      transactions: tx,
      department: db.employees[pu.orgId]?.find((e) => e.id === pu.id)?.department,
      devices: { count: s.devices[0], newDevice: s.devices[1], city: s.city },
    };
  }

  const ext: OpCoreExtra = {
    orgs,
    users,
    notes: {
      'u-1001': [{ id: 'nt-op-1', text: 'درخواست افزایش سقف کارت در بررسی — سقف از دارایی آزاد محاسبه می‌شود، نه کل.', tag: 'credit', by: 'علی نادری', at: jalaliToIso(1405, 7, 12) }],
      'u-2138': [{ id: 'nt-op-2', text: 'دستور مسدودی مرجع قضایی ثبت شد؛ کارت تا اطلاع ثانوی مسدود است.', tag: 'security', by: 'مهسا بهرامی', at: jalaliToIso(1405, 7, 2) }],
    },
    logs: {
      'u-1001': [{ id: 'lg-1', text: 'ورود موفق از دستگاه جدید (iPhone) — تأیید دومرحله‌ای', by: 'سیستم', at: minutesAgo(78), tone: 'warning' }],
    },
    basePendingPackages: 1202,
  };
  db.extra.opCore = ext;
}
