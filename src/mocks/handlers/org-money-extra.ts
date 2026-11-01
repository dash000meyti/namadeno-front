/**
 * Mock handlers of the "org-money" area — the organization's rial account with Namadno («حساب ریالی سازمان»).
 * Types: src/api/org-money-extra.ts · engine: src/mocks/treasury.ts · contract: docs/API.md.
 *
 *   GET  /org/account → OrgAccount (free / blocked / setAside / queue / pending, Namadno's bank account, receipts, movements)
 *   POST /org/account/deposits  multipart/form-data { amount, receipt (file), note?, packageId? }
 *        → 201 OrgAccountEntry («اعلام واریز»: a receipt waiting for Namadno's review; never overdue)
 *        · 422 bad_amount (min 1M) | missing_receipt | bad_receipt (type / > 5MB) | bad_package (not waiting for payment)
 */
import { http, type HttpHandler } from 'msw';
import type { OrgAccount, OrgAccountEntry } from '@/api/org-money-extra';
import type { CashEntry } from '@/api/op-treasury-extra';
import { db } from '../db';
import { body, fail, latency, ok, p, who } from '../http';
import { isMultipart, readReceiptForm } from '../receipts';
import { seed_opTreasury } from '../seed/extra-op-treasury';
import { cashEntries, orgAccounts, rialMoves, snapshot, submitReceipt, treasuryOf, type TreasuryError } from '../treasury';

const NAMADNO_BANK = { name: 'بانک ملت', iban: 'IR120120000000009876543210', holder: 'شرکت نمادنو (سهامی خاص)' };

function ensure() {
  const d = db();
  if (!treasuryOf(d)) seed_opTreasury(d);
  return d;
}
const isErr = (x: unknown): x is TreasuryError => !!x && typeof x === 'object' && 'code' in x && 'status' in x && 'message' in x;

/** The organization's view of one of its deposits. */
export function entryOf(e: CashEntry, orgId?: string): OrgAccountEntry {
  const pkg = e.packageId && orgId ? db().orgPackages[orgId]?.find((x) => x.id === e.packageId) : undefined;
  return {
    id: e.id, at: e.at, title: e.title, amount: e.amount, status: e.status, receivedAt: e.receivedAt, ref: e.ref, note: e.note,
    receipt: e.receipt, rejectReason: e.rejectReason, rejectedAt: e.rejectedAt, packageId: e.packageId, packageTitle: pkg?.title,
  };
}

export const orgMoneyHandlers: HttpHandler[] = [
  http.get(p('/org/account'), async ({ request }) => {
    await latency();
    const orgId = who(request, 'org_admin').orgId!;
    const s = snapshot(ensure());
    const acc = orgAccounts(s.d, s.t, s.com).find((a) => a.orgId === orgId);
    if (!acc) return fail(404, 'not_found', 'سازمان پیدا نشد.');
    const { orgId: _o, orgName: _n, status: _s, ...balance } = acc;
    void _o; void _n; void _s;
    // every receipt waiting for review and every rejected one (they may need a new upload), then the latest approved ones
    const all = cashEntries(s.d, { kind: 'org_deposit', orgId }).filter((e) => e.status !== 'cancelled');
    const entries = [
      ...all.filter((e) => e.status === 'expected'),
      ...all.filter((e) => e.status === 'rejected'),
      ...all.filter((e) => e.status === 'done').slice(0, 10),
    ].map((e) => entryOf(e, orgId));
    const out: OrgAccount = { ...balance, bank: NAMADNO_BANK, entries, moves: rialMoves(s, { orgId, limit: 12 }) };
    return ok(out);
  }),
  http.post(p('/org/account/deposits'), async ({ request }) => {
    await latency();
    const s = who(request, 'org_admin');
    const d = ensure();
    const name = d.organizations.find((o) => o.id === s.orgId)?.admins.find((a) => a.id === s.userId)?.name ?? 'سازمان';
    let input: { amount?: number; note?: string; packageId?: string; receipt?: CashEntry['receipt'] };
    if (isMultipart(request)) {
      const f = await readReceiptForm(request);
      if (f.receipt && 'error' in f.receipt) return fail(422, f.receipt.error.code, f.receipt.error.message);
      input = { amount: f.amount, note: f.note, packageId: f.packageId, receipt: f.receipt?.file };
    } else {
      input = await body(request); // no file → missing_receipt
      input.receipt = undefined;
    }
    const r = submitReceipt(d, s.orgId!, input, name);
    return isErr(r) ? fail(r.status, r.code, r.message, r.details) : ok(entryOf(r, s.orgId), { status: 201 });
  }),
];
