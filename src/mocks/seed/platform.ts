/** Organizations, employees, packages, requests, operator data, stores, FAQ and blog. */
import type {
  ApprovalRequest, BlogPost, CreditProduct, Employee, FaqItem, MilestoneStep, OrgPackage, Organization, PlatformRule, PlatformUser,
  RiskAlert, Store,
} from '@/types/domain';
import { daysFromNow, jalaliToIso, minutesAgo } from '@/lib/clock';
import { MS_STEPS } from './core';

// ───────────── Organizations ─────────────
type OrgRow = [id: string, name: string, contract: string, status: Organization['status'], employees: number, aumBillion: number, industry: string, endJ: [number, number, number], loanPct: number, cardPct: number, loanCap: number, months: number[], products: ('credit' | 'loan' | 'bnpl')[]];
const ORG_ROWS: OrgRow[] = [
  ['org-arman', 'هلدینگ آرمان', 'AR-1042', 'active', 384, 68.4, 'هلدینگ چندرشته‌ای', [1406, 1, 15], 40, 25, 50_000_000, [3, 6, 12], ['credit', 'loan', 'bnpl']],
  ['org-pars', 'صنایع پارس', 'PS-1087', 'active', 620, 54.1, 'صنعتی', [1405, 12, 1], 35, 20, 40_000_000, [6, 12], ['credit', 'loan']],
  ['org-novin', 'فناوری نوین', 'NV-1103', 'active', 210, 31.7, 'فناوری اطلاعات', [1406, 3, 20], 40, 25, 60_000_000, [3, 6, 12], ['credit', 'bnpl']],
  ['org-atieh', 'بیمه آتیه', 'AT-1120', 'onboarding', 450, 0, 'بیمه', [1406, 6, 1], 30, 15, 30_000_000, [6, 12], []],
  ['org-sepehr', 'گروه سپهر', 'SP-1066', 'active', 310, 22.9, 'خدمات مالی', [1405, 11, 10], 30, 20, 35_000_000, [3, 6], ['credit']],
  ['org-ideh', 'داروسازی ایده', 'ID-1051', 'suspended', 180, 9.6, 'دارویی', [1405, 8, 30], 25, 10, 20_000_000, [12], ['loan']],
  ['org-kaveh', 'پتروشیمی کاوه', 'KV-1092', 'active', 540, 20.4, 'پتروشیمی', [1406, 2, 1], 40, 20, 45_000_000, [3, 6, 12], ['credit', 'loan', 'bnpl']],
  ['org-ava', 'آوا پرداخت', 'AV-1110', 'active', 120, 18.2, 'فین‌تک', [1406, 4, 5], 35, 25, 40_000_000, [3, 6], ['credit', 'bnpl']],
  ['org-rad', 'خودروسازان راد', 'RD-1075', 'active', 890, 16.9, 'خودروسازی', [1405, 10, 20], 30, 15, 30_000_000, [6, 12], ['loan']],
  ['org-alborz', 'پخش البرز', 'AL-1098', 'active', 260, 12.3, 'پخش و توزیع', [1406, 1, 30], 30, 20, 25_000_000, [3, 6], ['credit']],
  ['org-mehr', 'گروه آموزشی مهر', 'MH-1115', 'onboarding', 95, 0, 'آموزش', [1406, 7, 1], 25, 15, 20_000_000, [6], []],
  ['org-aseman', 'هواپیمایی آسمان‌نو', 'AS-1081', 'active', 340, 10.8, 'حمل‌ونقل هوایی', [1405, 12, 25], 35, 20, 35_000_000, [3, 6, 12], ['credit', 'loan']],
];

export const ORGANIZATIONS: Organization[] = ORG_ROWS.map(([id, name, contract, status, employees, aum, industry, endJ, loanPct, , , months, products]) => ({
  id, name, legalName: 'شرکت ' + name + ' (سهامی خاص)', contractNo: contract, industry, employees,
  activeEmployees: status === 'onboarding' ? 0 : Math.round(employees * 0.86), status,
  contractStart: jalaliToIso(endJ[0] - 1, endJ[1], endJ[2]), contractEnd: jalaliToIso(endJ[0], endJ[1], endJ[2]),
  budgetYear: Math.round(aum * 1e9 * 0.35), budgetUsed: Math.round(aum * 1e9 * 0.21), logoLetter: name[0],
  settings: {
    allowedFunds: ['gold', 'fixed'], cashWithdrawalAllowed: true, lockPolicies: ['none', 'vesting', 'milestone'],
    loanEnabled: products.includes('loan'), loanMaxPct: loanPct, loanMonthsOptions: months,
    cardEnabled: products.includes('credit'), installmentEnabled: products.includes('bnpl'),
  },
  admins: id === 'org-arman'
    ? [
      { id: 'oa-200', name: 'مهسا تهرانی', role: 'مدیر', email: 'm.tehrani@arman.co', panelRole: 'admin' },
      { id: 'oa-201', name: 'نیما رضایی', role: 'کارشناس', email: 'nima.rezaei@arman.co', panelRole: 'specialist' },
      { id: 'oa-202', name: 'لیلا کاظمی', role: 'کارشناس', email: 'l.kazemi@arman.co', panelRole: 'specialist' },
      { id: 'oa-203', name: 'رضا حسینی', role: 'تأییدکننده', email: 'r.hosseini@arman.co', panelRole: 'approver' },
    ]
    : [{ id: 'oa-' + id, name: 'مدیر سازمان', role: 'مدیر', email: 'hr@' + id.slice(4) + '.ir', panelRole: 'admin' }],
}));

// ───────────── Employees of هلدینگ آرمان ─────────────
type EmpRow = [id: string, name: string, code: string, dept: string, title: string, status: Employee['status'], portfolio: number, locked: number, received: number, joinedJ: [number, number, number], mobile: string];
const EMP_ROWS: EmpRow[] = [
  ['u-1001', 'سارا محمدی', '1048', 'فنی', 'کارشناس ارشد فنی', 'active', 202_500_000, 71_600_000, 73_000_000, [1404, 3, 14], '09121234567'],
  ['u-1002', 'علی کریمی', '1024', 'فنی', 'مدیر فنی', 'active', 210_000_000, 30_000_000, 95_000_000, [1404, 2, 18], '09124401180'],
  ['u-1003', 'مریم احمدی', '1031', 'فروش', 'کارشناس فروش', 'active', 142_500_000, 40_000_000, 60_000_000, [1404, 3, 1], '09356652204'],
  ['u-1004', 'رضا حسینی', '1008', 'مالی', 'مدیر مالی', 'active', 268_000_000, 52_000_000, 120_000_000, [1403, 9, 10], '09121109321'],
  ['u-1005', 'نگار موسوی', '1047', 'عملیات', 'کارشناس عملیات', 'inactive', 98_000_000, 20_000_000, 40_000_000, [1404, 8, 2], '09192207745'],
  ['u-1006', 'امیر جعفری', '1015', 'منابع انسانی', 'کارشناس جذب', 'active', 176_000_000, 18_500_000, 70_000_000, [1404, 1, 20], '09123304512'],
  ['u-1007', 'حسین نوری', '1060', 'فروش', 'سرپرست فروش', 'active', 120_000_000, 12_000_000, 55_000_000, [1404, 10, 5], '09398812230'],
  ['u-1008', 'فاطمه رحیمی', '1066', 'پشتیبانی', 'کارشناس پشتیبانی', 'active', 64_000_000, 0, 30_000_000, [1405, 1, 25], '09127718840'],
  ['u-1009', 'محمد صادقی', '1071', 'فنی', 'برنامه‌نویس', 'active', 88_500_000, 15_000_000, 35_000_000, [1405, 2, 12], '09191123456'],
  ['u-1010', 'زهرا قاسمی', '1075', 'مالی', 'حسابدار', 'invited', 0, 0, 0, [1405, 7, 28], '09125567812'],
  ['u-1011', 'کاوه شریفی', '1079', 'عملیات', 'تحلیلگر داده', 'invited', 0, 0, 0, [1405, 8, 2], '09363349901'],
  ['u-1012', 'نازنین اکبری', '1052', 'فروش', 'کارشناس بازاریابی', 'active', 131_000_000, 20_000_000, 58_000_000, [1404, 5, 9], '09128890011'],
];

export const ARMAN_EMPLOYEES: Employee[] = EMP_ROWS.map(([id, fullName, code, department, jobTitle, status, portfolioValue, lockedValue, totalReceived, j, mobile], i) => ({
  id, fullName, nationalId: String(12345678 + i * 1111111).padStart(10, '0'), mobile, employeeCode: code, department, jobTitle, status,
  joinedAt: jalaliToIso(j[0], j[1], j[2]), totalReceived, portfolioValue, lockedValue,
  lastPackageAt: status === 'active' ? jalaliToIso(1405, 7, 14) : undefined, avatarLetter: fullName[0],
}));

// ───────────── Packages of هلدینگ آرمان ─────────────
const recipients = (ids: string[], amount: number, status: (i: number) => 'pending' | 'accepted' | 'expired') =>
  ids.map((id, i) => {
    const e = ARMAN_EMPLOYEES.find((x) => x.id === id)!;
    const s = status(i);
    return { employeeId: id, name: e.fullName, amount, status: s, acceptedAt: s === 'accepted' ? daysFromNow(-20 + i) : undefined };
  });
const ACTIVE_IDS = ARMAN_EMPLOYEES.filter((e) => e.status === 'active').map((e) => e.id);

const BRAND_STEPS: MilestoneStep[] = [
  { id: 'ms-1', title: 'مفهوم و طرح اولیه', sharePct: 30, status: 'released', releasedAt: jalaliToIso(1405, 7, 15), dueDate: jalaliToIso(1405, 7, 15), requiresApproval: true },
  { id: 'ms-2', title: 'طراحی نشان و لوگوتایپ', sharePct: 30, status: 'released', releasedAt: jalaliToIso(1405, 8, 5), dueDate: jalaliToIso(1405, 8, 5), requiresApproval: false },
  { id: 'ms-3', title: 'راهنمای کاربرد برند', sharePct: 40, status: 'pending_approval', dueDate: jalaliToIso(1405, 8, 12), requiresApproval: true },
];

export const ARMAN_PACKAGES: OrgPackage[] = [
  { id: 'pkg-mehr', title: 'پاداش مهر ۱۴۰۵', reason: 'bonus', createdAt: jalaliToIso(1405, 7, 12), sentAt: jalaliToIso(1405, 7, 14), status: 'sent', amountPerPerson: 20_000_000, total: 20_000_000 * ACTIVE_IDS.length, recipients: recipients(ACTIVE_IDS, 20_000_000, (i) => (i === 0 || i % 3 === 0 ? 'pending' : 'accepted')), allocationMode: 'free', cashAllowed: true, lockPolicy: { type: 'vesting', releaseAt: jalaliToIso(1405, 10, 15) }, message: 'با سپاس از تلاش‌های شما در پروژه‌های فصل دوم.', expiresAt: jalaliToIso(1405, 8, 30) },
  { id: 'pkg-welfare-aban', title: 'مزایای رفاهی', reason: 'welfare', createdAt: jalaliToIso(1405, 7, 9), sentAt: jalaliToIso(1405, 7, 10), status: 'sent', amountPerPerson: 5_000_000, total: 5_000_000 * ACTIVE_IDS.length, recipients: recipients(ACTIVE_IDS, 5_000_000, (i) => (i === 0 || i === 4 ? 'pending' : 'accepted')), allocationMode: 'fixed', fixedSplit: { gold: 0, fixed: 100 }, cashAllowed: false, lockPolicy: { type: 'none' } },
  { id: 'pkg-ms-portal', title: 'قرارداد پروژه پرتال منابع انسانی', reason: 'project_contract', createdAt: jalaliToIso(1405, 6, 1), sentAt: jalaliToIso(1405, 6, 1), status: 'sent', amountPerPerson: 20_000_000, total: 20_000_000, recipients: recipients(['u-1001'], 20_000_000, () => 'accepted'), allocationMode: 'fixed', fixedSplit: { gold: 100, fixed: 0 }, cashAllowed: false, lockPolicy: { type: 'milestone', steps: MS_STEPS.map(({ title, sharePct, dueDate, requiresApproval }) => ({ title, sharePct, dueDate, requiresApproval })) }, milestoneProgress: MS_STEPS.map((s) => ({ ...s })) },
  // second project contract: step 2 was released automatically at its due date; step 3 needs approval and its due date has passed
  // (the mock opens its approval request on the first API call — see processDueMilestones in handlers/org.ts)
  {
    id: 'pkg-ms-brand', title: 'قرارداد طراحی هویت بصری', reason: 'project_contract', createdAt: jalaliToIso(1405, 6, 20), sentAt: jalaliToIso(1405, 6, 20), status: 'sent',
    amountPerPerson: 10_000_000, total: 10_000_000,
    recipients: [{ employeeId: 'u-1006', name: 'امیر جعفری', amount: 10_000_000, status: 'accepted', acceptedAt: jalaliToIso(1405, 6, 22) }],
    allocationMode: 'fixed', fixedSplit: { gold: 100, fixed: 0 }, cashAllowed: false,
    lockPolicy: { type: 'milestone', steps: BRAND_STEPS.map(({ title, sharePct, dueDate, requiresApproval }) => ({ title, sharePct, dueDate, requiresApproval })) },
    milestoneProgress: BRAND_STEPS.map((s) => ({ ...s })),
  },
  { id: 'pkg-shahrivar', title: 'پاداش شهریور ۱۴۰۵', reason: 'bonus', createdAt: jalaliToIso(1405, 6, 12), sentAt: jalaliToIso(1405, 6, 14), status: 'completed', amountPerPerson: 15_000_000, total: 15_000_000 * ACTIVE_IDS.length, recipients: recipients(ACTIVE_IDS, 15_000_000, () => 'accepted'), allocationMode: 'free', cashAllowed: true, lockPolicy: { type: 'none' } },
  { id: 'pkg-tir', title: 'پاداش تیر ۱۴۰۵', reason: 'bonus', createdAt: jalaliToIso(1405, 4, 1), sentAt: jalaliToIso(1405, 4, 2), status: 'completed', amountPerPerson: 20_000_000, total: 20_000_000 * ACTIVE_IDS.length, recipients: recipients(ACTIVE_IDS, 20_000_000, () => 'accepted'), allocationMode: 'fixed', fixedSplit: { gold: 0, fixed: 100 }, cashAllowed: false, lockPolicy: { type: 'vesting', releaseAt: jalaliToIso(1405, 10, 15) } },
  { id: 'pkg-eid', title: 'عیدی ۱۴۰۵', reason: 'eid', createdAt: jalaliToIso(1405, 1, 3), sentAt: jalaliToIso(1405, 1, 5), status: 'completed', amountPerPerson: 8_000_000, total: 8_000_000 * ACTIVE_IDS.length, recipients: recipients(ACTIVE_IDS, 8_000_000, () => 'accepted'), allocationMode: 'fixed', fixedSplit: { gold: 100, fixed: 0 }, cashAllowed: false, lockPolicy: { type: 'none' } },
  { id: 'pkg-draft-yalda', title: 'هدیه یلدا', reason: 'other', createdAt: daysFromNow(-1), status: 'draft', amountPerPerson: 3_000_000, total: 3_000_000 * ACTIVE_IDS.length, recipients: recipients(ACTIVE_IDS, 3_000_000, () => 'pending'), allocationMode: 'fixed', fixedSplit: { gold: 50, fixed: 50 }, cashAllowed: false, lockPolicy: { type: 'none' } },
];

// ───────────── Requests (org + operator) ─────────────
export const REQUESTS: ApprovalRequest[] = [
  { id: 'RQ-2041', kind: 'loan', title: 'درخواست وام ۳۰٬۰۰۰٬۰۰۰ تومان · ۱۲ ماهه', requesterId: 'u-1003', requesterName: 'مریم احمدی', orgId: 'org-arman', orgName: 'هلدینگ آرمان', amount: 30_000_000, createdAt: minutesAgo(95), status: 'pending' },
  { id: 'RQ-2040', kind: 'milestone_release', title: 'آزادسازی مرحله ۳ «پیاده‌سازی نسخه اول»', requesterId: 'u-1001', requesterName: 'سارا محمدی', orgId: 'org-arman', orgName: 'هلدینگ آرمان', amount: 6_000_000, createdAt: minutesAgo(70), status: 'pending', note: 'تحویل نسخه اول در محیط تست انجام شده است.', packageId: 'pkg-ms-portal', stepId: 'ms-3', trigger: 'employee' },
  { id: 'RQ-2039', kind: 'credit_increase', title: 'افزایش سقف اعتبار کارت به ۵۰ میلیون', requesterId: 'u-1002', requesterName: 'علی کریمی', orgId: 'org-arman', orgName: 'هلدینگ آرمان', amount: 50_000_000, createdAt: daysFromNow(-1, '14:20'), status: 'pending' },
  { id: 'RQ-2038', kind: 'cash_withdrawal', title: 'برداشت نقدی از بسته پاداش', requesterId: 'u-1006', requesterName: 'امیر جعفری', orgId: 'org-arman', orgName: 'هلدینگ آرمان', amount: 8_000_000, createdAt: daysFromNow(-1, '10:05'), status: 'pending' },
  { id: 'RQ-2037', kind: 'installment', title: 'خرید اقساطی یخچال · ۶ قسط', requesterId: 'u-1007', requesterName: 'حسین نوری', orgId: 'org-arman', orgName: 'هلدینگ آرمان', amount: 42_000_000, createdAt: daysFromNow(-2, '16:40'), status: 'approved', decidedAt: daysFromNow(-1, '09:10'), decidedBy: 'نیما رضایی' },
  { id: 'RQ-2036', kind: 'profile_change', title: 'تغییر شماره موبایل', requesterId: 'u-1009', requesterName: 'محمد صادقی', orgId: 'org-arman', orgName: 'هلدینگ آرمان', createdAt: daysFromNow(-3, '11:00'), status: 'approved', decidedAt: daysFromNow(-3, '15:00'), decidedBy: 'لیلا کاظمی' },
  { id: 'RQ-2035', kind: 'loan', title: 'درخواست وام ۶۰٬۰۰۰٬۰۰۰ تومان · ۱۸ ماهه', requesterId: 'u-1005', requesterName: 'نگار موسوی', orgId: 'org-arman', orgName: 'هلدینگ آرمان', amount: 60_000_000, createdAt: daysFromNow(-5, '12:30'), status: 'rejected', decidedAt: daysFromNow(-4, '10:00'), decidedBy: 'نیما رضایی', note: 'بیش از سقف ۴۰٪ دارایی آزاد' },
  { id: 'RQ-3112', kind: 'loan', title: 'درخواست وام ۲۰٬۰۰۰٬۰۰۰ تومان · ۶ ماهه', requesterId: 'u-2201', requesterName: 'حامد یزدانی', orgId: 'org-novin', orgName: 'فناوری نوین', amount: 20_000_000, createdAt: daysFromNow(-1, '11:45'), status: 'pending' },
  { id: 'RQ-3108', kind: 'credit_increase', title: 'افزایش سقف اعتبار کارت', requesterId: 'u-3019', requesterName: 'نرگس طاهری', orgId: 'org-pars', orgName: 'صنایع پارس', amount: 40_000_000, createdAt: daysFromNow(-2, '09:30'), status: 'pending' },
];

// ───────────── Operator: platform users (beyond the demo user) ─────────────
type PURow = [id: string, name: string, orgId: string, code: string, rial: number, gold: number, fixed: number, locked: number, score: number, kyc: 1 | 2 | 3, status: PlatformUser['status'], risk: number, flags: string[], lastDays: number];
const PU_ROWS: PURow[] = [
  ['u-1002', 'علی کریمی', 'org-arman', '1012', 8_200_000, 52_000_000, 31_900_000, 30_000_000, 698, 2, 'active', 22, [], 1],
  ['u-1003', 'مریم احمدی', 'org-arman', '1033', 12_800_000, 70_000_000, 62_000_000, 40_000_000, 761, 3, 'active', 15, [], 0],
  ['u-2201', 'حامد یزدانی', 'org-novin', '2207', 18_200_000, 22_000_000, 18_000_000, 0, 0, 1, 'active', 40, ['kyc_pending'], 3],
  ['u-3019', 'نرگس طاهری', 'org-pars', '3019', 20_500_000, 110_000_000, 80_000_000, 25_000_000, 784, 3, 'active', 9, [], 0],
  ['u-5044', 'پویا شریفی', 'org-kaveh', '5044', 6_400_000, 0, 6_000_000, 0, 534, 1, 'invited', 35, ['kyc_pending', 'inactive'], 41],
  ['u-2138', 'الهام رستمی', 'org-novin', '2138', 3_000_000, 41_000_000, 32_000_000, 76_000_000, 455, 2, 'suspended', 82, ['legal_hold', 'card_blocked'], 6],
  ['u-4006', 'بهراد کیانی', 'org-sepehr', '4006', 34_900_000, 0, 0, 0, 0, 1, 'invited', 61, ['kyc_rejected'], 999],
  ['u-1004', 'رضا حسینی', 'org-arman', '1008', 40_000_000, 140_000_000, 88_000_000, 52_000_000, 802, 3, 'active', 6, [], 0],
];
export const PLATFORM_USERS: PlatformUser[] = PU_ROWS.map(([id, fullName, orgId, code, rial, gold, fixed, locked, score, kyc, status, risk, flags, lastDays]) => {
  const org = ORGANIZATIONS.find((o) => o.id === orgId)!;
  const total = rial + gold + fixed;
  const [firstName, ...rest] = fullName.split(' ');
  return {
    id, firstName, lastName: rest.join(' '), fullName, mobile: '0912' + id.replace(/\D/g, '').padStart(7, '0').slice(-7), nationalId: '00' + id.replace(/\D/g, '').padStart(8, '1'),
    employeeCode: code, orgId, orgName: org.name, kycLevel: kyc, creditScore: score, joinedAt: jalaliToIso(1404, 6, 1), avatarLetter: fullName[0], status,
    portfolioValue: total, freeValue: total - locked, lockedValue: locked, riskScore: risk, lastActiveAt: daysFromNow(-lastDays), flags,
  };
});

// ───────────── Operator: products, rules, risk ─────────────
export const PRODUCTS: CreditProduct[] = [
  { id: 'prd-loan', kind: 'loan', name: 'وام با پشتوانه دارایی', status: 'active', rateMin: 16, rateMax: 23, maxPctOfAssets: 40, monthsOptions: [3, 6, 12, 18], activeContracts: 1840, outstanding: 41_200_000_000, defaultRatePct: 0.8 },
  { id: 'prd-card', kind: 'card_credit', name: 'اعتبار کارت نمادنو', status: 'active', rateMin: 0, rateMax: 4, maxPctOfAssets: 25, monthsOptions: [1], activeContracts: 6210, outstanding: 28_600_000_000, defaultRatePct: 0.4 },
  { id: 'prd-bnpl', kind: 'installment', name: 'خرید اقساطی (BNPL)', status: 'active', rateMin: 2, rateMax: 6, maxPctOfAssets: 30, monthsOptions: [3, 6, 9, 12], activeContracts: 2930, outstanding: 17_900_000_000, defaultRatePct: 1.1 },
];

export const RULES: PlatformRule[] = [
  { id: 'r-lock-collateral', group: 'locks', title: 'پشتوانه‌ی وام و اعتبار', description: 'هنگام دریافت وام یا اعتبار کارت، معادل مبلغ از دارایی آزاد به‌عنوان پشتوانه رزرو می‌شود.', enabled: true },
  { id: 'r-lock-vesting', group: 'locks', title: 'پس‌انداز سازمانی (Vesting)', description: 'سازمان می‌تواند بسته را تا تاریخ مشخص برای همکار پس‌انداز کند.', enabled: true, value: 365, unit: 'روز حداکثر' },
  { id: 'r-lock-milestone', group: 'locks', title: 'دریافت مرحله‌ای', description: 'سازمان مبلغ قرارداد را رزرو می‌کند و با تأیید هر مرحله، سهم همان مرحله آزاد می‌شود.', enabled: true, value: 10, unit: 'مرحله حداکثر' },
  { id: 'r-lock-installment', group: 'locks', title: 'پشتوانه‌ی خرید اقساطی', description: 'با پرداخت هر قسط بخشی از پشتوانه آزاد می‌شود.', enabled: true },
  { id: 'r-lock-legal', group: 'locks', title: 'مسدودی قانونی', description: 'فقط بهره‌بردار با شماره دستور مرجع می‌تواند اعمال یا رفع کند.', enabled: true },
  { id: 'r-limit-withdraw-daily', group: 'limits', title: 'سقف برداشت روزانه', description: 'حداکثر برداشت از کیف پول ریالی در یک روز.', enabled: true, value: 100_000_000, unit: 'تومان' },
  { id: 'r-limit-trade', group: 'limits', title: 'سقف خرید/فروش روزانه صندوق', description: 'برای هر کاربر در هر صندوق.', enabled: true, value: 500_000_000, unit: 'تومان' },
  { id: 'r-credit-loan-pct', group: 'credit', title: 'سقف وام نسبت به دارایی آزاد', description: 'پس‌انداز سازمانی و دریافت مرحله‌ای در ظرفیت پشتوانه حساب نمی‌شوند.', enabled: true, value: 40, unit: 'درصد' },
  { id: 'r-credit-card-pct', group: 'credit', title: 'سقف اعتبار کارت نسبت به دارایی', description: 'اعتبار کارت با رزرو بخشی از کیف پول ریالی.', enabled: true, value: 25, unit: 'درصد' },
  { id: 'r-kyc-credit', group: 'kyc', title: 'الزام احراز هویت سطح ۲ برای سرویس‌های اعتباری', description: 'شاهکار + استعلام ثبت احوال.', enabled: true, value: 2, unit: 'سطح' },
  { id: 'r-kyc-trade', group: 'kyc', title: 'الزام سجام برای خرید و فروش صندوق', description: 'سطح ۳ احراز هویت.', enabled: true, value: 3, unit: 'سطح' },
  { id: 'r-risk-roundtrip', group: 'risk', title: 'تبدیل رفت‌وبرگشتی', description: 'بیش از ۳ تبدیل متقابل ریال/صندوق در یک ساعت', enabled: true, value: 3, unit: 'بار در ساعت' },
  { id: 'r-risk-withdraw', group: 'risk', title: 'برداشت غیرعادی', description: 'برداشت بیش از ۵۰٪ دارایی آزاد در ۲۴ ساعت', enabled: true, value: 50, unit: 'درصد' },
];

export const RISK_ALERTS: RiskAlert[] = [
  { id: 'AL-3318', title: 'برداشت غیرعادی', userId: 'u-2138', userName: 'الهام رستمی', orgName: 'فناوری نوین', score: 82, severity: 'high', status: 'open', createdAt: minutesAgo(45), ruleId: 'r-risk-withdraw', amount: 38_000_000 },
  { id: 'AL-3317', title: 'تبدیل رفت‌وبرگشتی ریال/طلا', userId: 'u-4006', userName: 'بهراد کیانی', orgName: 'گروه سپهر', score: 71, severity: 'medium', status: 'investigating', createdAt: minutesAgo(180), ruleId: 'r-risk-roundtrip', amount: 19_000_000 },
  { id: 'AL-3311', title: 'ورود از دستگاه جدید + تغییر شبا', userId: 'u-5044', userName: 'پویا شریفی', orgName: 'پتروشیمی کاوه', score: 64, severity: 'medium', status: 'open', createdAt: daysFromNow(-1, '22:10') },
  { id: 'AL-3302', title: 'دستور مسدودی مرجع قضایی', userId: 'u-2138', userName: 'الهام رستمی', orgName: 'فناوری نوین', score: 95, severity: 'critical', status: 'investigating', createdAt: jalaliToIso(1405, 7, 2), note: 'دستور مرجع قضایی ۱۴۰۵/۰۷/۰۲' },
  { id: 'AL-3290', title: 'تأخیر بیش از ۶۰ روز در قسط', userId: 'u-1005', userName: 'نگار موسوی', orgName: 'هلدینگ آرمان', score: 58, severity: 'low', status: 'resolved', createdAt: jalaliToIso(1405, 6, 20) },
  { id: 'AL-3275', title: 'استفاده هم‌زمان از چند دستگاه', userId: 'u-1009', userName: 'محمد صادقی', orgName: 'هلدینگ آرمان', score: 33, severity: 'low', status: 'dismissed', createdAt: jalaliToIso(1405, 6, 2) },
];

// ───────────── Stores (installment) ─────────────
export const STORES: Store[] = [
  { id: 'st-digikala', name: 'دیجی‌کالا', category: 'دیجیتال و لوازم خانگی', logoLetter: 'د', maxMonths: 12, feePct: 2, products: [
    { id: 'p-laptop', title: 'لپ‌تاپ ۱۴ اینچ', price: 31_500_000 },
    { id: 'p-phone', title: 'گوشی هوشمند ۲۵۶ گیگ', price: 24_800_000 },
    { id: 'p-fridge', title: 'یخچال ساید بای ساید', price: 42_000_000 },
  ] },
  { id: 'st-alef', name: 'فروشگاه الف', category: 'پوشاک و کفش', logoLetter: 'الف', maxMonths: 6, feePct: 1.5, products: [
    { id: 'p-coat', title: 'کاپشن زمستانی', price: 6_900_000 },
    { id: 'p-shoes', title: 'کفش ورزشی', price: 4_200_000 },
  ] },
  { id: 'st-snapp', name: 'اسنپ‌تریپ', category: 'سفر و گردشگری', logoLetter: 'ا', maxMonths: 6, feePct: 2.5 },
  { id: 'st-emalls', name: 'ایمالز', category: 'مقایسه و خرید آنلاین', logoLetter: 'ا', maxMonths: 9, feePct: 2 },
  { id: 'st-tehranmall', name: 'تهران مال', category: 'مرکز خرید', logoLetter: 'ت', maxMonths: 12, feePct: 1.8 },
];

// ───────────── FAQ ─────────────
export const FAQ: FaqItem[] = [
  { id: 'f6', q: 'آیا برای استفاده از نمادنو باید عضو یک سازمان باشم؟', a: 'خیر. هر کسی با شماره موبایلی که به نام خودش است، در چند دقیقه حساب نمادنو باز می‌کند، دارایی می‌خرد و از خدمات اعتباری استفاده می‌کند. اگر سازمان شما همراه نمادنو باشد، پاداش و مزایایتان هم مستقیم به همین حساب می‌رسد.' },
  { id: 'f7', q: 'افتتاح حساب نمادنو چه چیزی لازم دارد؟', a: 'کد ملی و شماره موبایلی که به نام خودتان است. احراز هویت کاملاً آنلاین و داخل اپ انجام می‌شود: برای خدمات اعتباری، هویت پایه (ثبت احوال) و برای خرید و فروش دارایی، احراز سجام کافی است.' },
  { id: 'f1', q: 'دارایی آزاد و رزروشده یعنی چه؟', a: 'دارایی آزاد را هر وقت بخواهید به ریال تبدیل می‌کنید یا برداشت می‌کنید. دارایی رزروشده هم کاملاً مال شماست و سود و رشد ارزشش برای شماست؛ فقط تا رسیدن زمان آزادسازی (تسویه وام، رسیدن تاریخ یا تأیید مرحله توسط سازمان) برای همان هدف کنار گذاشته شده و پس از آن مثل بخش آزاد قابل فروش و برداشت است. «قابل برداشت» همیشه فقط از بخش آزاد محاسبه می‌شود.' },
  { id: 'f4', q: 'چطور بدون فروش دارایی، وام بگیرم؟', a: 'تا ۴۰٪ دارایی آزادتان را می‌توانید وام بگیرید. معادل وام، بخشی از دارایی آزاد به‌عنوان پشتوانه رزرو می‌شود و همچنان برای شما رشد می‌کند؛ با پرداخت هر قسط، سهمی از پشتوانه آزاد می‌شود. پس‌انداز سازمانی و دریافت مرحله‌ای در ظرفیت پشتوانه حساب نمی‌شوند.' },
  { id: 'f8', q: 'هزینه‌ی خرید و فروش دارایی چقدر است؟', a: 'کارمزد هر دارایی در صفحه‌ی همان دارایی و پیش از تأیید نهایی هر تراکنش نمایش داده می‌شود. هزینه‌ی پنهان یا کارمزد نگهداری از سوی نمادنو وجود ندارد.' },
  { id: 'f3', q: 'چطور از یک دارایی به دارایی دیگر بروم؟', a: 'هر دارایی فقط به کیف پول ریالی تبدیل می‌شود و ریال به هر دارایی. برای جابه‌جایی، مثلاً طلا را به ریال بفروشید و با همان ریال درآمد ثابت بخرید.' },
  { id: 'f5', q: 'برداشت چه زمانی به حساب من می‌رسد؟', a: 'برداشت‌ها در چرخه‌ی پایا تسویه می‌شوند و معمولاً تا پایان روز کاری بعد به حسابی که به نام خودتان است واریز می‌شوند.' },
  { id: 'f2', q: 'پس‌انداز سازمانی یعنی چه؟', a: 'سازمان می‌تواند پاداش را به‌صورت پس‌انداز و با تاریخ آزادسازی بفرستد. این دارایی از همان روز اول مال شماست و سود و رشد ارزشش برای شماست؛ تا تاریخ مشخص‌شده برایتان پس‌انداز می‌ماند و در همان روز خودکار آزاد می‌شود.' },
];

// ───────────── Blog ─────────────
export const BLOG: BlogPost[] = [
  { slug: 'free-vs-locked-assets', title: 'دارایی آزاد و رزروشده؛ هرآنچه باید بدانید', excerpt: 'چرا بخشی از دارایی شما رزرو است و چه زمانی آزاد می‌شود؟ پنج نوع رزرو در نمادنو را بشناسید.', category: 'آموزش', author: 'تیم محصول نمادنو', publishedAt: jalaliToIso(1405, 8, 10), readMinutes: 6, cover: 'security', body: [
    'در نمادنو هر کیف پول و هر دارایی دو بخش دارد: آزاد و رزروشده. بخش آزاد را می‌توانید هر زمان به ریال بفروشید یا برداشت کنید.',
    'بخش رزروشده همچنان متعلق به شماست و سود یا تغییر ارزش آن به حساب شما می‌آید؛ فقط تا رسیدن زمان یا شرط آزادسازی برای هدف مشخصی کنار گذاشته شده و پس از آن مثل بخش آزاد قابل فروش و برداشت است.',
    'پنج نوع رزرو داریم: پشتوانه‌ی وام و اعتبار، پس‌انداز سازمانی، پشتوانه‌ی خرید اقساطی، دریافت مرحله‌ای قراردادها و مسدودی قانونی.',
  ] },
  { slug: 'gold-fund-inflation', title: 'طلا؛ سپری در برابر تورم', excerpt: 'دارایی طلا چطور کار می‌کند و چرا برای حفظ ارزش پاداش‌ها گزینه مناسبی است.', category: 'سرمایه‌گذاری', author: 'واحد تحلیل', publishedAt: jalaliToIso(1405, 7, 28), readMinutes: 5, cover: 'gold', body: [
    'طلای نمادنو با پشتوانه شمش و سکه، ارزش پس‌انداز شما را به قیمت جهانی طلا و نرخ ارز گره می‌زند.',
    'خرید و فروش آن از طریق کیف پول ریالی و بدون ثبت‌نام جداگانه انجام می‌شود.',
  ] },
  { slug: 'fixed-income-daily-profit', title: 'سود روزشمار درآمد ثابت', excerpt: 'سود درآمد ثابت هر روز در ارزش روز آن محاسبه می‌شود؛ یعنی چه و چه مزیتی دارد؟', category: 'سرمایه‌گذاری', author: 'واحد تحلیل', publishedAt: jalaliToIso(1405, 7, 15), readMinutes: 4, cover: 'fixed', body: [
    'در دارایی درآمد ثابت، سود به‌صورت روزانه در ارزش روز هر سهم لحاظ می‌شود.',
    'نوسان آن پایین است و برای بخش امن سبد مناسب است.',
  ] },
  { slug: 'asset-backed-loan', title: 'وام با پشتوانه دارایی؛ بدون ضامن', excerpt: 'تا ۴۰٪ دارایی آزاد خود وام بگیرید؛ دارایی‌تان پشتوانه‌ی وام می‌شود و سودش ادامه دارد.', category: 'اعتبار', author: 'تیم اعتبار', publishedAt: jalaliToIso(1405, 7, 2), readMinutes: 5, cover: 'credit', body: [
    'وام نمادنو بر پایه دارایی آزاد شماست و نیازی به ضامن یا کسر از حقوق ندارد.',
    'معادل مبلغ وام از دارایی آزاد به‌عنوان پشتوانه رزرو می‌شود و با تسویه آخرین قسط آزاد می‌شود.',
  ] },
  { slug: 'hr-benefits-as-assets', title: 'پاداش همکاران؛ به‌جای ریال، دارایی', excerpt: 'سازمان‌ها چطور با نمادنو مزایای همکاران را به دارایی ماندگار تبدیل می‌کنند.', category: 'سازمان‌ها', author: 'تیم فروش سازمانی', publishedAt: jalaliToIso(1405, 6, 20), readMinutes: 7, cover: 'org', body: [
    'منابع انسانی به‌جای پرداخت ریالی، بسته دارایی می‌فرستد و می‌تواند آن را به‌صورت پس‌انداز سازمانی یا دریافت مرحله‌ای تعریف کند.',
    'همکاران در اپ نمادنو بسته را تأیید و بین دارایی‌ها تخصیص می‌دهند.',
  ] },
  { slug: 'security-at-namadno', title: 'امنیت حساب در نمادنو', excerpt: 'احراز هویت سه‌سطحی، رمز پویا و نظارت ریسک؛ از دارایی شما چطور محافظت می‌کنیم.', category: 'امنیت', author: 'تیم امنیت', publishedAt: jalaliToIso(1405, 6, 5), readMinutes: 4, cover: 'security', body: [
    'احراز هویت در سه سطح انجام می‌شود: شاهکار، استعلام ثبت احوال و سجام.',
    'تراکنش‌های حساس با رمز پویا تأیید می‌شوند و سامانه ریسک الگوهای غیرعادی را رصد می‌کند.',
  ] },
];
