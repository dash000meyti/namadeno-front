import type { MockDB } from '../db';
import { jalaliToIso } from '@/lib/clock';

/**
 * Extra mock data owned by the "app-credit" area.
 *  - db.extra.appCredit: card unsecured allowance, installment credit limit, score update dates
 *  - enriches stores/products with display fields (category, icon, shipping, special offer)
 *  - adds plan fields (prepayment, collateral) to the seeded installment purchase
 */
export interface AppCreditExtraState {
  /** Card credit usage below this amount needs no collateral (based on the credit score). */
  cardUnsecuredLimit: number;
  /** Ceiling for open installment purchases (financed amount). */
  installmentLimit: number;
  scoreUpdatedAt: string;
  scoreNextUpdateAt: string;
  /** Next card locks are taken from these holdings, in order. */
  cardLockSources: string[];
}

export const APP_CREDIT_DEFAULTS: AppCreditExtraState = {
  cardUnsecuredLimit: 8_400_000,
  installmentLimit: 40_000_000,
  scoreUpdatedAt: jalaliToIso(1405, 8, 14),
  scoreNextUpdateAt: jalaliToIso(1405, 9, 14),
  cardLockSources: ['rial', 'gold'],
};

type ProductSeed = { id: string; title: string; price: number; category: string; icon: string };

const STORE_EXTRA: Record<string, { shipping: string; special: boolean; products?: ProductSeed[]; icons?: Record<string, { category: string; icon: string }> }> = {
  'st-digikala': {
    shipping: 'ارسال ۱ تا ۳ روز کاری', special: true,
    icons: {
      'p-laptop': { category: 'لپ‌تاپ', icon: 'laptop' },
      'p-phone': { category: 'موبایل', icon: 'phone' },
      'p-fridge': { category: 'لوازم خانگی', icon: 'store' },
    },
    products: [
      { id: 'p-tablet', title: 'تبلت ۱۱ اینچ', price: 24_000_000, category: 'تبلت', icon: 'tablet' },
      { id: 'p-headphone', title: 'هدفون بی‌سیم', price: 8_500_000, category: 'لوازم جانبی', icon: 'headphone' },
    ],
  },
  'st-alef': {
    shipping: 'ارسال ۲ تا ۴ روز کاری', special: true,
    icons: {
      'p-coat': { category: 'پوشاک', icon: 'bag' },
      'p-shoes': { category: 'کفش', icon: 'bag' },
    },
  },
  'st-snapp': {
    shipping: 'صدور آنی بلیت و رزرو', special: false,
    products: [
      { id: 'p-kish', title: 'تور ۳ شب کیش', price: 18_500_000, category: 'تور', icon: 'globe' },
      { id: 'p-flight', title: 'بلیت رفت‌وبرگشت مشهد', price: 7_200_000, category: 'بلیت', icon: 'globe' },
    ],
  },
  'st-emalls': {
    shipping: 'ارسال از فروشنده منتخب', special: false,
    products: [
      { id: 'p-watch', title: 'ساعت هوشمند', price: 5_700_000, category: 'لوازم جانبی', icon: 'watch' },
      { id: 'p-console', title: 'کنسول بازی', price: 29_000_000, category: 'سرگرمی', icon: 'laptop' },
    ],
  },
  'st-tehranmall': {
    shipping: 'تحویل حضوری یا ارسال درون‌شهری', special: false,
    products: [
      { id: 'p-tv', title: 'تلویزیون ۵۵ اینچ', price: 38_000_000, category: 'لوازم خانگی', icon: 'laptop' },
      { id: 'p-sofa', title: 'مبل راحتی', price: 26_000_000, category: 'مبلمان', icon: 'store' },
    ],
  },
};

export function seed_appCredit(db: MockDB) {
  db.extra.appCredit = { ...APP_CREDIT_DEFAULTS };

  for (const s of db.stores) {
    const x = STORE_EXTRA[s.id];
    if (!x) continue;
    const rec = s as unknown as Record<string, unknown>;
    rec.shipping = x.shipping;
    rec.special = x.special;
    s.products = s.products ?? [];
    for (const p of s.products) {
      const meta = x.icons?.[p.id];
      if (meta) Object.assign(p, meta);
    }
    for (const p of x.products ?? []) if (!s.products.some((q) => q.id === p.id)) s.products.push({ ...p });
  }

  // plan fields of the seeded purchase (لپ‌تاپ · دیجی‌کالا · ۶ قسط · پشتوانه‌ی صندوق مختلط)
  for (const u of Object.values(db.users)) {
    for (const ip of u.installments) {
      const rec = ip as unknown as Record<string, unknown>;
      if (ip.id === 'inst-1') {
        rec.prepayment = 0;
        rec.collateralKind = 'mixed';
        rec.collateralAmount = 5_250_000;
      }
    }
  }
}
