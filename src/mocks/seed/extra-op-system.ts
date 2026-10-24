/**
 * Extra mock data owned by the "op-system" area (operator console: funds, products, rules,
 * requests, risk, reports, settings). Extends existing collections with optional fields
 * (fund.meta, product.meta, alert.signals, more rules/requests/alerts) and stores
 * console-only data under db.extra.op*.
 */
import type { ApprovalRequest, LockType, PlatformRule, RiskAlert } from '@/types/domain';
import type { MockDB } from '../db';
import { daysFromNow, jalaliToIso, minutesAgo } from '@/lib/clock';

type LockMap = Record<LockType, number>;
const lm = (p: Partial<LockMap>): LockMap => ({ collateral: 0, vesting: 0, installment: 0, milestone: 0, legal: 0, ...p });

/** Deterministic NAV walk ending at `end` (for funds seeded without history). */
function walk(end: number, days: number, vol: number, drift: number, seed: number) {
  let x = seed;
  const rnd = () => { x = (x * 9301 + 49297) % 233280; return x / 233280; };
  const pts: number[] = [];
  let v = end;
  for (let i = 0; i < days; i++) { pts.push(v); v = v / (1 + drift + (rnd() - 0.5) * vol); }
  pts.reverse();
  return pts.map((p, i) => ({ t: daysFromNow(-(days - 1 - i)), v: Math.round(p) }));
}

const FUND_META: Record<string, { lock: Partial<LockMap>; holders: Partial<LockMap>; orders: [number, number, number, number]; delta: number; manager?: string; minBuy?: number; ltv?: number }> = {
  gold: { lock: { collateral: 41.2e9, milestone: 18.6e9, vesting: 9.4e9, legal: 3.3e9 }, holders: { collateral: 612, milestone: 38, vesting: 214, legal: 21 }, orders: [1842, 12.4e9, 410, 4.1e9], delta: 310 },
  fixed: { lock: { vesting: 31.5e9, collateral: 16.4e9, installment: 2.1e9, legal: 1.2e9 }, holders: { vesting: 402, collateral: 318, installment: 96, legal: 9 }, orders: [1210, 6.8e9, 388, 2.2e9], delta: 260, minBuy: 100_000 },
  equity: { lock: { collateral: 6.1e9, vesting: 3.2e9 }, holders: { collateral: 141, vesting: 66 }, orders: [512, 1.9e9, 290, 1.1e9], delta: 84, ltv: 50 },
  mixed: { lock: { installment: 3.5e9, collateral: 2.4e9 }, holders: { installment: 71, collateral: 58 }, orders: [266, 0.8e9, 102, 0.3e9], delta: 41, ltv: 60 },
  silver: { lock: { collateral: 1.1e9 }, holders: { collateral: 24 }, orders: [148, 0.6e9, 61, 0.2e9], delta: 37 },
  saffron: { lock: { vesting: 0.4e9 }, holders: { vesting: 12 }, orders: [52, 0.1e9, 18, 0.05e9], delta: 11 },
  leverage: { lock: {}, holders: {}, orders: [96, 0.4e9, 88, 0.5e9], delta: -6, ltv: 0 },
  project: { lock: { vesting: 2.2e9 }, holders: { vesting: 44 }, orders: [74, 0.3e9, 20, 0.1e9], delta: 19 },
  energy: { lock: {}, holders: {}, orders: [0, 0, 0, 0], delta: 0 },
};

const NEW_RULES: PlatformRule[] = [
  { id: 'r-pkg-min-amount', group: 'limits', title: 'حداقل مبلغ بسته', description: 'کمتر از این مبلغ ارسال نمی‌شود', enabled: true, value: 1_000_000, unit: 'تومان' },
  { id: 'r-pkg-max-vesting', group: 'locks', title: 'حداکثر مدت پس‌انداز بسته', description: 'سقف مدت پس‌انداز بسته‌های سازمانی', enabled: true, value: 12, unit: 'ماه' },
  { id: 'r-pkg-cfo-approval', group: 'limits', title: 'نیاز به تأیید نهایی تأییدکننده‌ی سازمان', description: 'برای بسته‌های بالای ۵۰۰ میلیون', enabled: true },
  { id: 'r-withdraw-manual', group: 'limits', title: 'نیاز به تأیید دستی', description: 'برداشت‌های بالای ۲۰۰ میلیون تومان', enabled: true },
  { id: 'r-credit-min-score', group: 'credit', title: 'حداقل امتیاز اعتباری', description: 'برای وام و خرید اقساطی · بازه ۳۰۰ تا ۹۰۰', enabled: true, value: 600, unit: 'امتیاز' },
  { id: 'r-credit-max-ltv', group: 'credit', title: 'حداکثر نسبت پشتوانه', description: 'سهم قابل رزرو از بخش آزاد هر صندوق', enabled: true, value: 70, unit: '٪' },
  { id: 'r-credit-overdue', group: 'credit', title: 'اقساط معوق مجاز', description: 'پس از آن پشتوانه نقد می‌شود', enabled: true, value: 2, unit: 'قسط' },
  { id: 'r-credit-auto-lock', group: 'credit', title: 'رزرو خودکار پشتوانه', description: 'هم‌زمان با تأیید وام یا خرید اقساطی', enabled: true },
  { id: 'r-kyc-l1-docs', group: 'kyc', title: 'سطح ۱ — مشاهده', description: 'مدارک لازم', enabled: true, value: '1,0,0' },
  { id: 'r-kyc-l2-docs', group: 'kyc', title: 'سطح ۲ — برداشت', description: 'مدارک لازم', enabled: true, value: '1,1,0' },
  { id: 'r-kyc-l2-withdraw-cap', group: 'kyc', title: 'سقف برداشت بدون تأیید دستی', description: 'سطح ۲ · در هر روز', enabled: true, value: 10_000_000, unit: 'تومان' },
  { id: 'r-lock-collateral-ltv', group: 'locks', title: 'حداکثر نسبت پشتوانه', description: 'پشتوانه‌ی وام و اعتبار', enabled: true, value: 70, unit: '٪ آزاد' },
  { id: 'r-lock-installment-share', group: 'locks', title: 'حداکثر سهم از آزاد', description: 'پشتوانه‌ی خرید اقساطی', enabled: true, value: 50, unit: '٪' },
  { id: 'r-lock-milestone-months', group: 'locks', title: 'حداکثر مدت قرارداد', description: 'دریافت مرحله‌ای', enabled: true, value: 24, unit: 'ماه' },
  { id: 'r-lock-legal-ref', group: 'locks', title: 'شماره مرجع الزامی', description: 'مسدودی قانونی', enabled: true },
  { id: 'r-lock-legal-2nd', group: 'locks', title: 'رفع با تأیید نفر دوم', description: 'مسدودی قانونی', enabled: true },
  { id: 'r-lock-collateral-by', group: 'locks', title: 'ایجادکننده رزرو پشتوانه', description: 'system,org,operator', enabled: true, value: 'system' },
  { id: 'r-lock-vesting-by', group: 'locks', title: 'ایجادکننده پس‌انداز سازمانی', description: 'system,org,operator', enabled: true, value: 'org' },
  { id: 'r-lock-installment-by', group: 'locks', title: 'ایجادکننده رزرو اقساطی', description: 'system,org,operator', enabled: true, value: 'system' },
  { id: 'r-lock-milestone-by', group: 'locks', title: 'ایجادکننده دریافت مرحله‌ای', description: 'system,org,operator', enabled: true, value: 'org' },
  { id: 'r-lock-legal-by', group: 'locks', title: 'ایجادکننده مسدودی قانونی', description: 'system,org,operator', enabled: true, value: 'operator' },
  { id: 'r-lock-total-cap', group: 'locks', title: 'سقف مجموع رزرو هر کاربر', description: 'درصد از کل دارایی', enabled: true, value: 80, unit: '٪ کل دارایی' },
  { id: 'r-lock-notify-release', group: 'locks', title: 'اعلان آزاد شدن رزرو به کاربر', description: 'پوش و اعلان درون‌برنامه', enabled: true },
  { id: 'r-risk-newdevice', group: 'risk', title: 'برداشت پس از دستگاه جدید', description: 'برداشت کلان تا ۲۴ ساعت پس از ورود جدید', enabled: true, value: 24, unit: 'ساعت' },
  { id: 'r-risk-night', group: 'risk', title: 'خرید شب‌هنگام خارج از شبکه', description: 'بین ۰۰ تا ۰۵ · پذیرندهٔ ناشناس', enabled: true },
];

const EXTRA_REQUESTS: ApprovalRequest[] = [
  { id: 'RQ-3120', kind: 'cash_withdrawal', title: 'برداشت نقدی به حساب جدید', requesterId: 'u-2138', requesterName: 'الهام رستمی', orgId: 'org-novin', orgName: 'فناوری نوین', amount: 74_000_000, createdAt: minutesAgo(170), status: 'pending' },
  { id: 'RQ-3117', kind: 'profile_change', title: 'ارتقای احراز هویت به سطح ۲', requesterId: 'u-2201', requesterName: 'حامد یزدانی', orgId: 'org-novin', orgName: 'فناوری نوین', createdAt: daysFromNow(-1, '17:30'), status: 'pending' },
  { id: 'RQ-3116', kind: 'profile_change', title: 'احراز هویت — تطابق چهره', requesterId: 'u-5044', requesterName: 'پویا شریفی', orgId: 'org-kaveh', orgName: 'پتروشیمی کاوه', createdAt: daysFromNow(-1, '11:25'), status: 'pending' },
  { id: 'RQ-3109', kind: 'installment', title: 'خرید اقساطی لپ‌تاپ · ۱۰ قسط', requesterId: 'u-3019', requesterName: 'نرگس طاهری', orgId: 'org-pars', orgName: 'صنایع پارس', amount: 48_000_000, createdAt: minutesAgo(98), status: 'pending' },
  { id: 'RQ-3095', kind: 'profile_change', title: 'احراز هویت سطح ۱', requesterId: 'u-4006', requesterName: 'بهراد کیانی', orgId: 'org-sepehr', orgName: 'گروه سپهر', createdAt: daysFromNow(-3, '09:40'), status: 'rejected', decidedAt: daysFromNow(-3, '13:15'), decidedBy: 'مهدی رحیمی', note: 'کد پرسنلی در لیست سازمان نیست' },
];

type MetaRow = [slaMin: number, risk: number, details: [string, string][], factors: [string, 'success' | 'warning' | 'error'][], checks: boolean[]];
const REQUEST_META: Record<string, MetaRow> = {
  'RQ-2041': [42, 22, [['مدت', '۱۲ ماه'], ['قسط ماهانه', '۲٬۹۰۰٬۰۰۰'], ['رزرو پشتوانه پس از تأیید', '۳۰٬۰۰۰٬۰۰۰ درآمد ثابت'], ['سقف قرارداد', '۴۰٪ دارایی آزاد (۵۷٫۹ میلیون)']], [['وام فعال دیگری ندارد', 'success'], ['اقساط قبلی به‌موقع پرداخت شده', 'success']], [true, true, true, false, false]],
  'RQ-2040': [135, 12, [['قرارداد', 'پرتال منابع انسانی'], ['مرحله', '۳ از ۵ · ۳۰٪'], ['نوع رزرو', 'دریافت مرحله‌ای']], [['سازمان تحویل را تأیید کرده است', 'success']], [true, false, false]],
  'RQ-2039': [230, 18, [['سقف فعلی', '۲۵٬۰۰۰٬۰۰۰'], ['سقف درخواستی', '۵۰٬۰۰۰٬۰۰۰'], ['رزرو از کیف ریالی', '۲۵٪ سقف']], [['بازپرداخت کارت همیشه به‌موقع', 'success']], [true, true, false, false]],
  'RQ-2038': [310, 12, [['مقصد', 'بانک ملت · IR•• •••• ۸۸۱۰'], ['منبع', 'کیف پول ریالی'], ['سیکل پایا', '۱۳:۴۵ امروز'], ['برداشت ۲۴ ساعت اخیر', '۰']], [['شبای ثبت‌شده و تأییدشده', 'success']], [true, true, false, false]],
  'RQ-3112': [450, 41, [['مدت', '۶ ماه'], ['قسط ماهانه', '۳٬۶۰۰٬۰۰۰'], ['رزرو پشتوانه پس از تأیید', '۲۰٬۰۰۰٬۰۰۰ کیف ریالی']], [['احراز هویت سطح ۱ — نیاز به ارتقا', 'warning'], ['اولین درخواست تسهیلات', 'warning']], [false, true, true, true, false]],
  'RQ-3108': [620, 9, [['سقف فعلی', '۲۰٬۰۰۰٬۰۰۰'], ['سقف درخواستی', '۴۰٬۰۰۰٬۰۰۰']], [['امتیاز اعتباری عالی', 'success']], [true, true, true, false]],
  'RQ-3120': [65, 78, [['مقصد', 'بانک سامان · IR•• •••• ۰۲۴۹ (جدید)'], ['منبع', 'کیف پول ریالی + فروش طلا'], ['سیکل پایا', '۱۳:۴۵ امروز'], ['برداشت ۲۴ ساعت اخیر', '۳ بار · ۳۱ میلیون']], [['مسدودی قانونی فعال روی صندوق طلا', 'error'], ['شبای مقصد ۲ ساعت پیش اضافه شده', 'error'], ['فروش طلا درخواست شده؛ بخش آزاد طلا صفر است', 'warning']], [false, false, false, false]],
  'RQ-3117': [230, 41, [['مدرک', 'کارت ملی هوشمند'], ['تطابق چهره', '۸۸٪'], ['استعلام شاهکار', 'موفق'], ['کد پرسنلی', '۲۲۰۷']], [['تصویر پشت کارت با نور کم', 'warning'], ['شماره موبایل جدید (۳ روز)', 'warning']], [false, false, false, false]],
  'RQ-3116': [520, 55, [['مدرک', 'کارت ملی قدیمی + شناسنامه'], ['تطابق چهره', '۷۹٪'], ['استعلام شاهکار', 'ناموفق'], ['کد پرسنلی', '۵۰۴۴']], [['تطابق چهره زیر آستانه', 'error'], ['شاهکار: موبایل به نام دیگری', 'warning']], [false, false, false, false]],
  'RQ-3109': [135, 24, [['فروشگاه', 'فروشگاه الف'], ['کالا', 'لپ‌تاپ'], ['تعداد اقساط', '۱۰ قسط · ۵٬۱۰۰٬۰۰۰'], ['رزرو اقساطی پس از تأیید', '۲۰٬۰۰۰٬۰۰۰ درآمد ثابت']], [['خرید اقساطی فعال دیگری دارد', 'warning'], ['امتیاز اعتباری عالی', 'success']], [true, false, false, false]],
};

const ALERT_SIGNALS: Record<string, string[]> = {
  'AL-3318': ['big', 'velocity', 'newdev'], 'AL-3317': ['velocity', 'mule'], 'AL-3311': ['newdev'], 'AL-3302': [], 'AL-3290': [], 'AL-3275': ['newdev', 'night'],
};
const EXTRA_ALERTS: (RiskAlert & { signals: string[] })[] = [
  { id: 'AL-3321', title: 'خرید با کارت · خارج از شبکه', userId: 'u-1002', userName: 'علی کریمی', orgName: 'هلدینگ آرمان', score: 78, severity: 'high', status: 'investigating', createdAt: minutesAgo(25), ruleId: 'r-risk-night', amount: 24_900_000, signals: ['big', 'night'] },
  { id: 'AL-3320', title: 'خرید اقساطی · مبلغ بالا', userId: 'u-1004', userName: 'رضا حسینی', orgName: 'هلدینگ آرمان', score: 46, severity: 'medium', status: 'resolved', createdAt: minutesAgo(130), amount: 48_000_000, signals: ['big'] },
  { id: 'AL-3319', title: 'شارژ کارت از اعتبار · شب', userId: 'u-1001', userName: 'سارا محمدی', orgName: 'هلدینگ آرمان', score: 31, severity: 'low', status: 'dismissed', createdAt: daysFromNow(-1, '02:40'), ruleId: 'r-risk-night', amount: 2_400_000, signals: ['night'] },
];

export function seed_opSystem(db: MockDB) {
  // ── funds: operator meta + NAV history for funds that have none
  db.funds.forEach((f, i) => {
    const m = FUND_META[f.id] ?? { lock: {}, holders: {}, orders: [0, 0, 0, 0] as [number, number, number, number], delta: 0 };
    if (!f.history && f.nav > 0) f.history = walk(f.nav, 365, 0.012, 0.0005, 23 + i * 4);
    (f as typeof f & { meta: unknown }).meta = {
      manager: 'شرکت سبدگردان نمادنو', sellFeePct: f.feePct, minBuy: m.minBuy ?? 500_000, collateralEnabled: (m.ltv ?? 70) > 0, maxLtvPct: m.ltv ?? 70,
      lockByType: lm(m.lock), holdersByType: lm(m.holders),
      ordersToday: { buyCount: m.orders[0], buyValue: m.orders[1], sellCount: m.orders[2], sellValue: m.orders[3] },
      investorsDeltaMonth: m.delta, lastNavAt: daysFromNow(-1, '14:00'), updatedAt: jalaliToIso(1405, 7, 12), updatedBy: 'علی نادری',
    };
  });

  // ── credit products: extra default parameters
  const pm: Record<string, object> = {
    'prd-card': { settleDays: 30, latePenaltyPct: 2.5, perPersonCap: 50_000_000, minScore: 550, autoLock: true },
    'prd-loan': { minScore: 600, liquidateAfter: 2, autoLock: true },
    'prd-bnpl': { lockRatioPct: 100, feePct: 4, maxPurchase: 80_000_000, codeValidityHours: 72, autoLock: true },
  };
  db.products.forEach((p) => { (p as typeof p & { meta: unknown }).meta = { ...(pm[p.id] ?? {}), updatedAt: jalaliToIso(1405, 7, 2) }; });

  // ── rules: align existing values with the console design and add the full catalogue
  const vest = db.rules.find((r) => r.id === 'r-lock-vesting');
  if (vest) { vest.value = 24; vest.unit = 'ماه'; }
  const wd = db.rules.find((r) => r.id === 'r-limit-withdraw-daily');
  if (wd) { wd.value = 50_000_000; wd.description = 'به ازای هر کاربر'; }
  for (const r of NEW_RULES) if (!db.rules.some((x) => x.id === r.id)) db.rules.push({ ...r });
  db.extra.opRulesMeta = {
    version: 12,
    defaults: Object.fromEntries(db.rules.map((r) => [r.id, { enabled: r.enabled, value: r.value }])),
    history: [
      { id: 'rh-7', at: jalaliToIso(1405, 7, 12), group: 'رزرو دارایی', text: 'افزودن نوع «دریافت مرحله‌ای» · حداکثر ۱۰ مرحله', by: 'علی نادری' },
      { id: 'rh-6', at: jalaliToIso(1405, 7, 9), group: 'تسهیلات', text: 'حداقل امتیاز اعتباری ۵۸۰ → ۶۰۰', by: 'علی نادری' },
      { id: 'rh-5', at: jalaliToIso(1405, 6, 28), group: 'KYC', text: 'افزودن ویدیو به مدارک سطح ۲', by: 'سمیرا توکلی' },
      { id: 'rh-4', at: jalaliToIso(1405, 6, 15), group: 'برداشت', text: 'سقف برداشت روزانه ۳۰ → ۵۰ میلیون', by: 'علی نادری' },
      { id: 'rh-3', at: jalaliToIso(1405, 5, 30), group: 'بسته‌ها', text: 'حداکثر مدت پس‌انداز بسته ۶ → ۱۲ ماه', by: 'علی نادری' },
      { id: 'rh-2', at: jalaliToIso(1405, 5, 12), group: 'تسهیلات', text: 'فعال‌سازی رزرو خودکار پشتوانه', by: 'مهدی رحیمی' },
      { id: 'rh-1', at: jalaliToIso(1405, 4, 2), group: 'بسته‌ها', text: 'حداقل مبلغ بسته ۵۰۰٬۰۰۰ → ۱٬۰۰۰٬۰۰۰', by: 'علی نادری' },
    ],
  };

  // ── requests: more cross-organization requests + review metadata
  for (const r of EXTRA_REQUESTS) if (!db.requests.some((x) => x.id === r.id)) db.requests.push({ ...r });
  const reqMeta: Record<string, unknown> = {};
  for (const [id, [sla, risk, details, factors, checks]] of Object.entries(REQUEST_META)) {
    reqMeta[id] = { slaDueAt: new Date(new Date(minutesAgo(0)).getTime() + sla * 60000).toISOString(), riskScore: risk, details: details.map(([k, v]) => ({ k, v })), factors: factors.map(([t, tone]) => ({ t, tone })), checks };
  }
  db.extra.opRequestMeta = reqMeta;

  // ── risk: detection signals on alerts + a few more alerts
  for (const a of db.riskAlerts) (a as RiskAlert & { signals?: string[] }).signals = ALERT_SIGNALS[a.id] ?? [];
  for (const a of EXTRA_ALERTS) if (!db.riskAlerts.some((x) => x.id === a.id)) db.riskAlerts.push({ ...a });
  db.riskAlerts.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  db.extra.opRiskSeries = {
    critical: [2, 1, 3, 2, 4, 2, 1, 3, 2, 2, 5, 3, 2, 1, 2, 3, 4, 2, 3, 2, 1, 2, 3, 5, 4, 3, 2, 3, 4, 5],
    high: [4, 5, 3, 6, 5, 4, 6, 5, 4, 7, 6, 5, 4, 6, 5, 7, 6, 5, 6, 7, 5, 6, 7, 6, 8, 7, 6, 7, 8, 9],
    medium: [6, 5, 7, 5, 6, 8, 6, 7, 8, 6, 7, 8, 9, 7, 8, 6, 7, 9, 8, 7, 9, 8, 7, 9, 8, 9, 10, 9, 8, 9],
  };
  db.extra.opLegalHolds = [
    // live legal locks of users (e.g. الهام رستمی) are read from their holdings by GET /op/risk/insights
    { id: 'lh-2', source: 'record', userName: 'امیر جعفری', reference: '۱۴۰۵۰۰۶۹۸۸۱۴', holding: 'کیف پول ریالی', reason: 'بررسی ریسک — RK-8F21A', amount: 8_500_000, createdAt: jalaliToIso(1405, 7, 14), status: 'risk' },
    { id: 'lh-3', source: 'record', userName: 'کامران فرهادی', reference: '۱۴۰۵۰۰۵۱۲۲۷۰', holding: 'صندوق درآمد ثابت', reason: 'دستور مرجع قضایی', amount: 120_000_000, createdAt: jalaliToIso(1405, 6, 18), status: 'active' },
    { id: 'lh-4', source: 'record', userName: 'شیما نیک‌پور', reference: '۱۴۰۵۰۰۴۴۰۹۱۲', holding: 'صندوق طلا', reason: 'درخواست نهاد ناظر', amount: 22_500_000, createdAt: jalaliToIso(1405, 6, 3), status: 'active' },
    { id: 'lh-5', source: 'record', userName: 'مهدی سلطانی', reference: '۱۴۰۵۰۰۳۸۷۶۰۵', holding: 'صندوق مختلط', reason: 'دستور رفع دریافت شد', amount: 6_800_000, createdAt: jalaliToIso(1405, 5, 29), status: 'pending' },
    { id: 'lh-6', source: 'record', userName: 'رویا کاظمی', reference: '۱۴۰۵۰۰۲۹۱۱۴۸', holding: 'کیف پول ریالی', reason: 'اجرای احکام', amount: 3_200_000, createdAt: jalaliToIso(1405, 5, 11), status: 'active' },
    { id: 'lh-7', source: 'record', userName: 'نیما رحیمی', reference: '۱۴۰۴۰۰۹۰۲۲۱۷', holding: 'صندوق طلا', reason: 'دستور مرجع قضایی', amount: 15_000_000, createdAt: jalaliToIso(1404, 12, 8), status: 'done', releasedAt: jalaliToIso(1405, 1, 20) },
  ];

  // ── reports: scheduled reports
  db.extra.opReportSchedules = [
    { id: 'sch-1', name: 'گزارش روزانهٔ AUM و NAV', period: 'روزانه · ۱۵:۰۰', recipients: 'مدیریت، مالی', format: 'PDF', nextAt: daysFromNow(1, '15:00'), enabled: true },
    { id: 'sch-2', name: 'گزارش ماهانهٔ تسهیلات و رزروهای پشتوانه', period: 'ماهانه · اول ماه', recipients: 'مالی، ریسک', format: 'XLSX', nextAt: jalaliToIso(1405, 9, 1), enabled: true },
    { id: 'sch-3', name: 'دارایی رزروشده به تفکیک نوع و مسدودی‌های قانونی', period: 'هفتگی · شنبه', recipients: 'ریسک، حقوقی', format: 'XLSX', nextAt: jalaliToIso(1405, 8, 17), enabled: true },
    { id: 'sch-4', name: 'گزارش سازمان‌ها برای هیئت‌مدیره', period: 'فصلی', recipients: 'هیئت‌مدیره', format: 'PDF', nextAt: jalaliToIso(1405, 10, 1), enabled: true },
    { id: 'sch-5', name: 'گزارش SLA و رخدادها', period: 'هفتگی · شنبه', recipients: 'فنی، پشتیبانی', format: 'PDF', nextAt: jalaliToIso(1405, 8, 17), enabled: true },
    { id: 'sch-6', name: 'گزارش مالیاتی سازمان‌ها', period: 'ماهانه · ۲۰ ماه', recipients: 'مالی', format: 'XLSX', nextAt: jalaliToIso(1405, 8, 20), enabled: false },
  ];

  // ── settings: operator team, role matrix and console preferences (merged over core defaults by GET /op/settings)
  db.extra.opSettings = {
    ...((db.extra.opSettings as object | undefined) ?? {}),
    platformVersion: '2.8.0',
    team: [
      { id: 'op-301', name: 'علی نادری', role: 'مدیر محصول', roleKey: 'pm', email: 'a.naderi@namadno.ir', status: 'active', lastLoginAt: minutesAgo(78) },
      { id: 'op-304', name: 'سمیرا توکلی', role: 'مالی', roleKey: 'fin', email: 's.tavakoli@namadno.ir', status: 'active', lastLoginAt: minutesAgo(110) },
      { id: 'op-302', name: 'مهدی رحیمی', role: 'ریسک', roleKey: 'risk', email: 'm.rahimi@namadno.ir', status: 'active', lastLoginAt: daysFromNow(-1, '17:05') },
      { id: 'op-303', name: 'نرگس کیانی', role: 'پشتیبانی', roleKey: 'sup', email: 'n.kiani@namadno.ir', status: 'active', lastLoginAt: jalaliToIso(1405, 7, 13) },
      { id: 'op-305', name: 'بابک شریفی', role: 'پشتیبانی', roleKey: 'sup', email: 'b.sharifi@namadno.ir', status: 'inactive', lastLoginAt: jalaliToIso(1405, 5, 20) },
    ],
    roleMatrix: {
      orgs: { pm: true, fin: true, risk: false, sup: false },
      contracts: { pm: true, fin: true, risk: false, sup: false },
      requests: { pm: true, fin: true, risk: true, sup: false },
      funds: { pm: true, fin: false, risk: false, sup: false },
      rules: { pm: true, fin: false, risk: true, sup: false },
      legal: { pm: true, fin: false, risk: true, sup: false },
      users: { pm: true, fin: false, risk: true, sup: true },
    },
    lang: 'fa', timezone: 'Asia/Tehran', navTime: '14:00',
    notify: { requests: true, risk: true, legal: true, services: true, orgs: false },
    dailyEmail: 'ops@namadno.ir', minPasswordLength: 12, ipRestrict: false, activeSessions: 7, activeDevices: 4,
    apiKeyMasked: 'nm_live_•••• 8F21', apiKeyCreatedAt: jalaliToIso(1405, 6, 1), webhookEnabled: true, webhookUrl: 'https://hr.arman.ir/hooks/namadno', rateLimit: 600,
  };
  db.extra.opSystemStatus = {
    checkedAt: minutesAgo(1),
    notice: 'سرویس اعلان از ۰۸:۱۵ دچار اختلال است؛ پیامک رمز پویا از مسیر پشتیبان ارسال می‌شود.',
    services: [
      { id: 'svc-gw', name: 'درگاه بانکی', sub: 'پرداخت، واریز و برداشت', latencyMs: 42, uptime: 99.9, status: 'ok' },
      { id: 'svc-core', name: 'هسته معاملات صندوق', sub: 'خرید / فروش واحد و NAV', latencyMs: 118, uptime: 99.7, status: 'ok' },
      { id: 'svc-credit', name: 'اعتبارسنجی', sub: 'امتیاز و سقف‌های اعتباری', latencyMs: 64, uptime: 99.8, status: 'ok' },
      { id: 'svc-risk', name: 'موتور ریسک', sub: 'قوانین تشخیص تقلب', latencyMs: 31, uptime: 100, status: 'ok' },
      { id: 'svc-shetab', name: 'شبکه شتاب', sub: 'تراکنش‌های کارت نمادنو', latencyMs: 310, uptime: 99.5, status: 'slow' },
      { id: 'svc-notify', name: 'سرویس اعلان', sub: 'پیامک و پوش', latencyMs: null, uptime: 97.2, status: 'down' },
    ],
    incidents: [
      { id: 'inc-6', at: jalaliToIso(1405, 8, 15), title: 'افزایش نرخ خطای ارسال پیامک', sub: 'رمز پویا از مسیر پشتیبان ارسال می‌شود', service: 'سرویس اعلان', severity: 'high', duration: '۲ س ۱۵ د', state: 'open' },
      { id: 'inc-5', at: jalaliToIso(1405, 8, 12), title: 'تأخیر در تسویه شتاب', sub: 'میانگین تأخیر ۸۰۰ms · بدون خطا', service: 'شبکه شتاب', severity: 'medium', duration: '۴۰ د', state: 'resolved' },
      { id: 'inc-4', at: jalaliToIso(1405, 8, 8), title: 'تأخیر در انتشار NAV', sub: 'NAV ساعت ۱۴:۲۵ منتشر شد', service: 'هسته معاملات', severity: 'medium', duration: '۲۵ د', state: 'resolved' },
      { id: 'inc-3', at: jalaliToIso(1405, 8, 1), title: 'نگهداری برنامه‌ریزی‌شده', sub: 'به‌روزرسانی نسخه ۲٫۸٫۰', service: 'همهٔ سرویس‌ها', severity: 'low', duration: '۱ س ۳۰ د', state: 'resolved' },
      { id: 'inc-2', at: jalaliToIso(1405, 7, 24), title: 'خطای درگاه بانک ملت', sub: 'پرداخت‌ها به درگاه جایگزین منتقل شد', service: 'درگاه بانکی', severity: 'high', duration: '۱ س ۱۰ د', state: 'resolved' },
      { id: 'inc-1', at: jalaliToIso(1405, 7, 18), title: 'کندی اعتبارسنجی', sub: 'صف درخواست‌ها · بدون خطا', service: 'اعتبارسنجی', severity: 'low', duration: '۱۵ د', state: 'resolved' },
    ],
  };
}
