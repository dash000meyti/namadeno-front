import type { MockDB } from '../db';
import { jalaliToIso } from '@/lib/clock';

/** Identity details returned by the civil registry / SEJAM inquiries (per user id). */
export interface CoreKycDetails {
  fatherName: string;
  registryOffice: string;
  sejam: { bourseCode: string; bankAccount: string; postalCode: string };
}

/** Account security info shown in «حساب من». */
export interface CoreSecurity {
  passwordChangedAt: string;
}

export interface AppCoreExtra {
  kyc: Record<string, CoreKycDetails>;
  security: Record<string, CoreSecurity>;
}

export const APP_CORE_KEY = 'appCore';

/** Extra mock data owned by the "app-core" area — stored under db.extra.appCore. */
export function seed_appCore(db: MockDB) {
  const data: AppCoreExtra = {
    kyc: {
      'u-1001': {
        fatherName: 'علی',
        registryOffice: 'تهران',
        sejam: { bourseCode: 'محم12457', bankAccount: 'بانک ملت · 4521', postalCode: '1435987654' },
      },
    },
    security: {
      'u-1001': { passwordChangedAt: jalaliToIso(1405, 5, 12) },
    },
  };
  db.extra[APP_CORE_KEY] = data;
}

/** Reads (and lazily creates) the app-core bag — tolerates databases persisted before this seed existed. */
export function appCoreExtra(db: MockDB): AppCoreExtra {
  const cur = db.extra[APP_CORE_KEY] as AppCoreExtra | undefined;
  if (cur && cur.kyc && cur.security) return cur;
  seed_appCore(db);
  return db.extra[APP_CORE_KEY] as AppCoreExtra;
}
