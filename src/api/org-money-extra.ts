'use client';
/**
 * The organization's rial account with Namadno («حساب ریالی سازمان») — area "org-money".
 * Every interaction with Namadno is in rial. The organization transfers money and uploads the receipt («فیش واریز», with an
 * optional description); Namadno reviews it — approved → the money is in «آزاد», rejected → a reason, upload a new one.
 * A sent package blocks its amount («بلاک‌شده», kept in Namadno's «ریال رزرو») until each recipient accepts it; an expired
 * or cancelled share returns to «آزاد». A package is sent only when it is paid: when «آزاد» is short, it needs a receipt
 * for the rest and waits in a queue («در انتظار تأیید واریز») — nothing reaches employees, only the part «آزاد» covered is
 * set aside («کنار گذاشته») — until Namadno approves the receipt; then it is delivered. Nothing is ever overdue or unfunded.
 * Endpoints: src/mocks/handlers/org-money-extra.ts (engine: src/mocks/treasury.ts); documented in docs/API.md.
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { ID, ISODate, OrgPackage, Toman } from '@/types/domain';
import type { OrgRialBalance, ReceiptFile, RialMove } from './op-treasury-extra';
import { get, postForm } from './client';
import { qk } from './keys';

/** A deposit of the organization: `expected` = receipt waiting for Namadno's review, `done` = approved, `rejected` = see rejectReason. */
export interface OrgAccountEntry {
  id: ID;
  at: ISODate;
  title: string;
  amount: Toman;
  status: 'expected' | 'done' | 'cancelled' | 'rejected';
  receivedAt?: ISODate;
  ref?: string;
  /** The organization's description (e.g. the tracking number). */
  note?: string;
  receipt?: ReceiptFile;
  rejectReason?: string;
  rejectedAt?: ISODate;
  packageId?: ID;
  packageTitle?: string;
}

export interface OrgAccount extends OrgRialBalance {
  /** Namadno's bank account the organization deposits to. */
  bank: { name: string; iban: string; holder: string };
  /** Deposits, expected first (by due date), then received (newest first). */
  entries: OrgAccountEntry[];
  /** Recent movements of the organization's money (deposits, blocked for packages, paid to recipients, returned). */
  moves: RialMove[];
}

/** How a sent package is funded (returned by POST /org/packages/:id/send as `funding`). */
export interface PackageFunding { fromFree: Toman; toDeposit: Toman }

/** A receipt upload: `receipt` = the image / PDF file (≤ 5MB), `note` = optional description. */
export interface ReceiptInput { amount: Toman; receipt: File; note?: string; packageId?: ID }

/** FormData of a receipt upload (also used by POST /org/packages/:id/send when «آزاد» is short). */
export function receiptForm(v: { amount: Toman; receipt: File; note?: string; packageId?: ID }): FormData {
  const f = new FormData();
  f.set('amount', String(Math.round(v.amount)));
  f.set('receipt', v.receipt, v.receipt.name);
  if (v.note?.trim()) f.set('note', v.note.trim());
  if (v.packageId) f.set('packageId', v.packageId);
  return f;
}

const ok = ['org', 'money'] as const;
export const omk = { account: [...ok, 'account'] as const };

export const useOrgAccount = () => useQuery({ queryKey: omk.account, queryFn: () => get<OrgAccount>('/org/account') });

/**
 * «اعلام واریز»: the organization uploads the receipt of a bank transfer (+ optional description); it stays
 * «در انتظار تأیید» until Namadno approves it. `packageId` = a new receipt for a package waiting for payment.
 */
export const useAnnounceDeposit = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: ReceiptInput) => postForm<OrgAccountEntry>('/org/account/deposits', receiptForm(v)),
    onSuccess: () => { qc.invalidateQueries({ queryKey: qk.org.all }); qc.invalidateQueries({ queryKey: ['op'] }); },
  });
};

/**
 * Send a package whose amount «آزاد» does not cover: the receipt for the rest goes with it (multipart). The package
 * becomes `awaiting_payment` and is delivered when Namadno approves the receipt. (When «آزاد» covers it, use useSendPackage.)
 */
export const useSendPackageWithReceipt = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { packageId: ID; amount: Toman; receipt: File; note?: string }) =>
      postForm<OrgPackage & { deposit?: OrgAccountEntry }>(`/org/packages/${v.packageId}/send`, receiptForm({ amount: v.amount, receipt: v.receipt, note: v.note })),
    onSuccess: () => { qc.invalidateQueries({ queryKey: qk.org.all }); qc.invalidateQueries({ queryKey: ['op'] }); },
  });
};
