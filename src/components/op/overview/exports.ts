'use client';
/**
 * «خروجی گزارش» of the command center (replaces the former /op/reports page): the rial treasury + stock per fund,
 * orders to funds, cash (summary, organizations' rial accounts, deposit receipts, ledger, rial moves) and organizations — each as Excel
 * (CSV) or a printable page («ذخیره به PDF»).
 * CSV cells are machine-readable (latin digits, no separators); the printable page uses Persian compact amounts.
 */
import {
  useCashEntries, useRialMoves, useTreasuryOrders,
  type CashEntry, type OrgRialAccount, type OrgTreasuryRow, type RialMove, type TreasuryOrder, type TreasuryPosition, type TreasurySummary,
} from '@/api/op-treasury-extra';
import { useToast } from '@/components/ui/Toast';
import { rialReportRows } from '@/components/op/funds/rial';
import { CASH_KIND, RIAL_MOVE, SIDE, STOCK_STATE, amt, cashStatus, orderAt, unitsText } from '@/components/op/treasury/ui';
import { downloadCsv, printReport, raw } from '@/components/op/system/fmt';
import { depositPurpose } from '@/components/op/cash/ReviewDepositDialog';
import { enDigits, faDigits, jDate, jDateTime, money } from '@/lib/format';
import { now } from '@/lib/clock';

type Cell = string | number;
type Sec = { title: string; rows: Cell[][] };
type Kind = 'stock' | 'orders' | 'cash' | 'orgs';
type MenuItem = { label: string; onClick: () => void; disabled?: boolean } | 'sep';

const REPORTS: { key: Kind; title: string }[] = [
  { key: 'stock', title: 'موجودی ریال و صندوق‌ها' },
  { key: 'orders', title: 'سفارش‌ها' },
  { key: 'cash', title: 'نقدینگی' },
  { key: 'orgs', title: 'سازمان‌ها' },
];
const ALL_TITLE = 'همه‌ی گزارش‌ها';
const ORG_STATUS: Record<OrgTreasuryRow['status'], string> = { active: 'فعال', onboarding: 'در حال راه‌اندازی', suspended: 'تعلیق‌شده' };

/** Number formatter per output: CSV → raw latin integer, print → «۲۵۹ میلیارد». */
const numFor = (pdf: boolean) => (n: number) => (pdf ? amt(n) : raw(n));
const unitsFor = (pdf: boolean) => (u: number) => (pdf ? unitsText(u) : String(Math.round(u * 10_000) / 10_000));
const unitNote = (pdf: boolean) => (pdf ? ' — مبالغ به تومان' : '');

interface Data { s: TreasurySummary; orders?: TreasuryOrder[]; entries?: CashEntry[]; moves?: RialMove[] }

/** «خزانه‌ی ریالی»: «ریال», «ریال رزرو» and the bank total — first in the stock report. */
function rialSec(s: TreasurySummary, pdf: boolean): Sec {
  return { title: 'خزانه‌ی ریالی' + unitNote(pdf), rows: rialReportRows(s.rial, numFor(pdf), pdf ? '—' : '') };
}

function stockSec(positions: TreasuryPosition[], pdf: boolean): Sec {
  const n = numFor(pdf);
  const sum = (k: keyof TreasuryPosition) => positions.reduce((a, p) => a + (Number(p[k]) || 0), 0);
  return {
    title: 'موجودی صندوق‌ها' + unitNote(pdf),
    rows: [
      // nothing goes negative: what the free stock cannot cover waits in «صف تأمین»; the gap is «نیاز به خرید»
      ['صندوق', 'نماد', 'وضعیت موجودی', 'ارزش نگهداری', 'تخصیص‌یافته', 'رزروشده', 'تعهد باز', 'موجودی آزاد', 'در صف تأمین', 'نیاز به خرید', 'تحویل صف تا', 'مصرف خالص روزانه', 'حداقل هدف', 'سقف هدف'],
      ...positions.map((p) => [
        p.name, p.symbol, STOCK_STATE[p.state].label, n(p.heldValue), n(p.allocatedValue), n(p.reservedValue), n(p.committedValue),
        n(Math.max(0, p.availableValue)), n(p.queuedValue ?? 0), n(p.needBuyValue ?? 0), p.needBy ? jDateTime(p.needBy) : '',
        n(p.demandPerDay), p.target ? n(p.target.minFreeValue) : '', p.target?.maxFreeValue ? n(p.target.maxFreeValue) : '',
      ]),
      ['جمع', '', '', n(sum('heldValue')), n(sum('allocatedValue')), n(sum('reservedValue')), n(sum('committedValue')), n(sum('availableValue')), n(sum('queuedValue')), n(sum('needBuyValue')), '', n(sum('demandPerDay')), '', ''],
    ],
  };
}

function ordersSec(orders: TreasuryOrder[], positions: TreasuryPosition[], pdf: boolean): Sec {
  const n = numFor(pdf);
  const u = unitsFor(pdf);
  const name = (id: string) => positions.find((p) => p.fundId === id)?.shortName ?? id;
  // cash-first: every order is recorded when done (paid, units in or out at once) — a ledger, newest first
  const done = orders.filter((o) => o.status !== 'cancelled').sort((a, b) => orderAt(b).localeCompare(orderAt(a)));
  return {
    title: 'سفارش‌ها به صندوق‌ها' + unitNote(pdf),
    rows: [
      ['کد', 'صندوق', 'نوع', 'مبلغ', 'تعداد واحد', 'NAV', 'کارمزد', 'زمان ثبت', 'ثبت‌کننده', 'یادداشت'],
      ...done.map((o) => [
        o.code, name(o.fundId), SIDE[o.side].label, n(o.amount), u(o.units), pdf ? money(o.navAtSettle ?? o.navAtOrder) : raw(o.navAtSettle ?? o.navAtOrder), n(o.fee),
        jDateTime(orderAt(o)), o.by, o.note ?? '',
      ]),
    ],
  };
}

const sumOf = (xs: OrgRialAccount[], k: 'free' | 'blocked' | 'setAside' | 'queuedTotal' | 'pending' | 'balance') => xs.reduce((a, x) => a + (x[k] ?? 0), 0);

/** Organizations' rial accounts with Namadno, largest first. */
function orgRialSec(rows: OrgRialAccount[], pdf: boolean): Sec {
  const n = numFor(pdf);
  const list = [...rows].sort((a, b) => b.blocked + b.free - (a.blocked + a.free) || b.pending - a.pending);
  return {
    title: 'حساب ریالی سازمان‌ها' + unitNote(pdf),
    rows: [
      ['سازمان', 'آزاد', 'کنار گذاشته (بسته‌های در صف)', 'بلاک‌شده', 'بسته‌های در صف', 'فیش در انتظار تأیید', 'مانده'],
      ...list.map((a) => [a.orgName, n(a.free), n(a.setAside ?? 0), n(a.blocked), n(a.queuedTotal ?? 0), n(a.pending), n(a.balance)]),
      ['جمع', n(sumOf(list, 'free')), n(sumOf(list, 'setAside')), n(sumOf(list, 'blocked')), n(sumOf(list, 'queuedTotal')), n(sumOf(list, 'pending')), n(sumOf(list, 'balance'))],
    ],
  };
}

/** Rial moves between the treasuries and wallets, newest first. */
function rialMovesSec(moves: RialMove[], pdf: boolean): Sec {
  const n = numFor(pdf);
  return {
    title: 'گردش ریالی' + unitNote(pdf),
    rows: [
      ['تاریخ', 'نوع', 'شرح', 'از', 'به', 'سازمان', 'کاربر', 'مبلغ', 'مرجع بانکی'],
      ...moves.map((m) => [jDate(m.at), RIAL_MOVE[m.kind].label, m.title, m.from, m.to, m.orgName ?? '', m.userName ?? '', n(m.amount), m.ref ?? '']),
    ],
  };
}

/** Organizations' deposit receipts («فیش واریز»): pending first, then approved and rejected ones. */
function receiptsSec(entries: CashEntry[], pdf: boolean): Sec {
  const n = numFor(pdf);
  const rank = { expected: 0, done: 1, rejected: 2, cancelled: 3 } as const;
  const list = entries
    .filter((e) => e.kind === 'org_deposit' && (e.status === 'expected' || e.status === 'rejected' || (e.status === 'done' && !!e.receipt)))
    .sort((a, b) => rank[a.status] - rank[b.status] || b.at.localeCompare(a.at));
  return {
    title: 'فیش‌های واریز سازمان‌ها' + unitNote(pdf),
    rows: [
      ['زمان', 'سازمان', 'بابت', 'مبلغ', 'وضعیت', 'توضیحات سازمان', 'ارسال‌کننده', 'بررسی‌کننده', 'دلیل رد', 'فایل فیش'],
      ...list.map((e) => [
        jDateTime(e.status === 'done' ? e.receivedAt ?? e.at : e.at), e.orgName ?? '', depositPurpose(e), n(e.amount), cashStatus(e).label,
        e.note ?? '', e.submittedBy ?? '', e.status === 'expected' ? '' : e.by ?? '', e.rejectReason ?? '', e.receipt?.name ?? '',
      ]),
    ],
  };
}

function cashSecs(s: TreasurySummary, entries: CashEntry[], moves: RialMove[], pdf: boolean): Sec[] {
  const n = numFor(pdf);
  const c = s.cash;
  return [
    {
      title: 'نقدینگی — خلاصه' + unitNote(pdf),
      rows: [
        ['شاخص', 'مبلغ'],
        ['موجودی حساب بانکی', n(c.balance)],
        ['کیف پول کاربران', n(-c.userWallets)],
        ['حساب آزاد سازمان‌ها', n(-c.orgFree)],
        ['ریال رزرو', n(-c.reserve)],
        ['ریال آزاد نمادنو', n(c.available)],
        ['فیش در انتظار تأیید', n(c.expectedDeposits)],
        ['تعداد فیش در انتظار تأیید', pdf ? faDigits(c.expectedCount) : c.expectedCount],
      ],
    },
    orgRialSec(s.rial.byOrg, pdf),
    receiptsSec(entries, pdf),
    {
      title: 'دفتر نقدینگی' + unitNote(pdf),
      rows: [
        ['تاریخ', 'نوع', 'شرح', 'سازمان', 'مبلغ', 'وضعیت', 'مرجع بانکی', 'مانده پس از ثبت'],
        ...entries.filter((e) => e.status === 'done').map((e) => [
          jDate(e.at), CASH_KIND[e.kind].label, e.title, e.orgName ?? '', n(e.amount), cashStatus(e).label,
          e.ref ?? '', e.balanceAfter != null ? n(e.balanceAfter) : '',
        ]),
      ],
    },
    rialMovesSec(moves, pdf),
  ];
}

function orgsSec(rows: OrgTreasuryRow[], pdf: boolean): Sec {
  const n = numFor(pdf);
  return {
    title: 'سازمان‌ها' + unitNote(pdf),
    rows: [
      ['سازمان', 'وضعیت', 'دارایی اعضا', 'دارایی صندوقی', 'رزروشده', 'تعهد باز', 'گیرندگان در انتظار', 'فیش در انتظار تأیید', 'واریز دریافتی امسال'],
      ...rows.map((r) => [
        r.orgName, ORG_STATUS[r.status], n(r.value), n(r.fundValue), n(r.reservedValue), n(r.commitments),
        pdf ? faDigits(r.pendingRecipients) : r.pendingRecipients, n(r.depositsExpected), n(r.depositsReceivedYear),
      ]),
    ],
  };
}

function sectionsOf(kind: Kind, x: Data, pdf: boolean): Sec[] | null {
  if (kind === 'stock') return [rialSec(x.s, pdf), stockSec(x.s.positions, pdf)];
  if (kind === 'orders') return x.orders ? [ordersSec(x.orders, x.s.positions, pdf)] : null;
  if (kind === 'cash') return x.entries && x.moves ? cashSecs(x.s, x.entries, x.moves, pdf) : null;
  return [orgsSec(x.s.byOrg, pdf)];
}

const stamp = () => enDigits(jDate(now())).replace(/\//g, '-');
const flat = (secs: Sec[]) => secs.flatMap((s, i) => [...(i ? [[] as Cell[]] : []), [s.title], ...s.rows]);

/** Menu items for the «خروجی گزارش» MenuButton. Pass the loaded summary (undefined while loading). */
export function useOverviewExports(s: TreasurySummary | undefined): MenuItem[] {
  const toast = useToast();
  const orders = useTreasuryOrders();
  const entries = useCashEntries();
  const moves = useRialMoves({ limit: 200 });
  const x: Data | null = s ? { s, orders: orders.data, entries: entries.data, moves: moves.data } : null;

  const run = (kinds: Kind[], title: string, file: string, pdf: boolean) => {
    if (!x) return;
    const secs = kinds.map((k) => sectionsOf(k, x, pdf));
    if (secs.some((v) => v === null)) { toast('داده‌های گزارش هنوز آماده نیست؛ چند لحظه بعد دوباره امتحان کنید', 'info'); return; }
    const all = secs.flat() as Sec[];
    if (!pdf) {
      downloadCsv(`namadno-${file}-${stamp()}`, flat(all));
      toast(`فایل Excel «${title}» دانلود شد`);
      return;
    }
    const ok = printReport(`${title} — ${jDate(now())}`, all);
    toast(ok ? `نسخه‌ی چاپی «${title}» باز شد؛ «ذخیره به PDF» را انتخاب کنید` : 'پنجره‌ی چاپ باز نشد؛ اجازه‌ی پنجره‌ی بازشو را بدهید', ok ? 'success' : 'error');
  };

  const ready = (k: Kind) => !!x && (k === 'orders' ? !!x.orders : k === 'cash' ? !!x.entries && !!x.moves : true);
  const allKinds = REPORTS.map((r) => r.key);
  const allReady = allKinds.every(ready);
  return [
    { label: `${ALL_TITLE} · Excel`, onClick: () => run(allKinds, ALL_TITLE, 'treasury', false), disabled: !allReady },
    { label: `${ALL_TITLE} · PDF`, onClick: () => run(allKinds, ALL_TITLE, 'treasury', true), disabled: !allReady },
    'sep',
    // single reports: Excel only, so the menu stays short (the printable PDF covers everything at once)
    ...REPORTS.map((r) => ({ label: `${r.title} · Excel`, onClick: () => run([r.key], r.title, r.key, false), disabled: !ready(r.key) })),
  ];
}
