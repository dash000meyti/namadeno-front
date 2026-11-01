'use client';
/**
 * «خروجی گزارش» of the command center (replaces the former /op/reports page): stock per fund, orders to funds,
 * cash (summary + ledger) and organizations — each as Excel (CSV) or a printable page («ذخیره به PDF»).
 * CSV cells are machine-readable (latin digits, no separators); the printable page uses Persian compact amounts.
 */
import { useCashEntries, useTreasuryOrders, type CashEntry, type OrgTreasuryRow, type TreasuryOrder, type TreasuryPosition, type TreasurySummary } from '@/api/op-treasury-extra';
import { useToast } from '@/components/ui/Toast';
import { CASH_KIND, SIDE, STOCK_STATE, amt, cashStatus, orderStatus, unitsText } from '@/components/op/treasury/ui';
import { downloadCsv, printReport, raw } from '@/components/op/system/fmt';
import { enDigits, faDigits, jDate } from '@/lib/format';
import { now } from '@/lib/clock';

type Cell = string | number;
type Sec = { title: string; rows: Cell[][] };
type Kind = 'stock' | 'orders' | 'cash' | 'orgs';
type MenuItem = { label: string; onClick: () => void; disabled?: boolean } | 'sep';

const REPORTS: { key: Kind; title: string }[] = [
  { key: 'stock', title: 'موجودی صندوق‌ها' },
  { key: 'orders', title: 'سفارش‌ها' },
  { key: 'cash', title: 'نقدینگی' },
  { key: 'orgs', title: 'سازمان‌ها' },
];
const ALL_TITLE = 'همه‌ی گزارش‌ها';
const ORG_STATUS: Record<OrgTreasuryRow['status'], string> = { active: 'فعال', onboarding: 'در حال راه‌اندازی', suspended: 'تعلیق‌شده' };

/** Number formatter per output: CSV → raw latin integer, print → «۲۵۹ میلیارد». */
const numFor = (pdf: boolean) => (n: number) => (pdf ? amt(n) : raw(n));
const unitsFor = (pdf: boolean) => (u: number) => (pdf ? unitsText(u) : String(Math.round(u * 10_000) / 10_000));
const daysFor = (pdf: boolean) => (d: number | null | undefined) => (d == null ? '—' : pdf ? faDigits(Math.round(d)) : String(Math.round(d)));
const unitNote = (pdf: boolean) => (pdf ? ' — مبالغ به تومان' : '');

interface Data { s: TreasurySummary; orders?: TreasuryOrder[]; entries?: CashEntry[] }

function stockSec(positions: TreasuryPosition[], pdf: boolean): Sec {
  const n = numFor(pdf);
  const d = daysFor(pdf);
  const sum = (k: keyof TreasuryPosition) => positions.reduce((a, p) => a + (Number(p[k]) || 0), 0);
  return {
    title: 'موجودی صندوق‌ها' + unitNote(pdf),
    rows: [
      ['صندوق', 'نماد', 'وضعیت موجودی', 'ارزش نگهداری', 'تخصیص‌یافته', 'رزروشده', 'تعهد باز', 'موجودی آزاد', 'صدور در راه', 'مصرف خالص روزانه', 'پوشش (روز)', 'هدف پوشش (روز)'],
      ...positions.map((p) => [
        p.name, p.symbol, STOCK_STATE[p.state].label, n(p.heldValue), n(p.allocatedValue), n(p.reservedValue), n(p.committedValue),
        n(p.availableValue), n(p.pendingBuyValue), n(p.demandPerDay), d(p.coverageDays), d(p.target?.targetDays),
      ]),
      ['جمع', '', '', n(sum('heldValue')), n(sum('allocatedValue')), n(sum('reservedValue')), n(sum('committedValue')), n(sum('availableValue')), n(sum('pendingBuyValue')), n(sum('demandPerDay')), '', ''],
    ],
  };
}

function ordersSec(orders: TreasuryOrder[], positions: TreasuryPosition[], pdf: boolean): Sec {
  const n = numFor(pdf);
  const u = unitsFor(pdf);
  const name = (id: string) => positions.find((p) => p.fundId === id)?.shortName ?? id;
  return {
    title: 'سفارش‌ها به صندوق‌ها' + unitNote(pdf),
    rows: [
      ['کد', 'صندوق', 'نوع', 'مبلغ', 'تعداد واحد', 'کارمزد', 'وضعیت', 'تاریخ ثبت', 'تاریخ تسویه', 'ثبت‌کننده'],
      ...orders.map((o) => [
        o.code, name(o.fundId), SIDE[o.side].label, n(o.amount), u(o.units), n(o.fee), orderStatus(o).label,
        jDate(o.placedAt), jDate(o.settledAt ?? o.settleAt), o.by,
      ]),
    ],
  };
}

function cashSecs(s: TreasurySummary, entries: CashEntry[], pdf: boolean): Sec[] {
  const n = numFor(pdf);
  const c = s.cash;
  return [
    {
      title: 'نقدینگی — خلاصه' + unitNote(pdf),
      rows: [
        ['شاخص', 'مبلغ'],
        ['موجودی حساب', n(c.balance)],
        ['سفارش‌های صدور باز', n(-c.tiedInOrders)],
        ['کیف پول کاربران', n(-c.userWallets)],
        ['تعهد ریالی بسته‌ها', n(-c.committedRial)],
        ['نقد در دسترس', n(c.available)],
        ['واریز در انتظار سازمان‌ها', n(c.expectedDeposits)],
        ['واریز معوق', n(c.overdueAmount)],
      ],
    },
    {
      title: 'دفتر نقدینگی' + unitNote(pdf),
      rows: [
        ['تاریخ', 'نوع', 'شرح', 'سازمان', 'مبلغ', 'وضعیت', 'مرجع بانکی', 'مانده پس از ثبت'],
        ...entries.map((e) => [
          jDate(e.status === 'expected' ? e.dueAt ?? e.at : e.at), CASH_KIND[e.kind].label, e.title, e.orgName ?? '', n(e.amount), cashStatus(e).label,
          e.ref ?? '', e.balanceAfter != null ? n(e.balanceAfter) : '',
        ]),
      ],
    },
  ];
}

function orgsSec(rows: OrgTreasuryRow[], pdf: boolean): Sec {
  const n = numFor(pdf);
  return {
    title: 'سازمان‌ها' + unitNote(pdf),
    rows: [
      ['سازمان', 'وضعیت', 'دارایی اعضا', 'دارایی صندوقی', 'رزروشده', 'تعهد باز', 'گیرندگان در انتظار', 'واریز در انتظار', 'واریز معوق', 'واریز دریافتی امسال'],
      ...rows.map((r) => [
        r.orgName, ORG_STATUS[r.status], n(r.value), n(r.fundValue), n(r.reservedValue), n(r.commitments),
        pdf ? faDigits(r.pendingRecipients) : r.pendingRecipients, n(r.depositsExpected), n(r.depositsOverdue), n(r.depositsReceivedYear),
      ]),
    ],
  };
}

function sectionsOf(kind: Kind, x: Data, pdf: boolean): Sec[] | null {
  if (kind === 'stock') return [stockSec(x.s.positions, pdf)];
  if (kind === 'orders') return x.orders ? [ordersSec(x.orders, x.s.positions, pdf)] : null;
  if (kind === 'cash') return x.entries ? cashSecs(x.s, x.entries, pdf) : null;
  return [orgsSec(x.s.byOrg, pdf)];
}

const stamp = () => enDigits(jDate(now())).replace(/\//g, '-');
const flat = (secs: Sec[]) => secs.flatMap((s, i) => [...(i ? [[] as Cell[]] : []), [s.title], ...s.rows]);

/** Menu items for the «خروجی گزارش» MenuButton. Pass the loaded summary (undefined while loading). */
export function useOverviewExports(s: TreasurySummary | undefined): MenuItem[] {
  const toast = useToast();
  const orders = useTreasuryOrders();
  const entries = useCashEntries();
  const x: Data | null = s ? { s, orders: orders.data, entries: entries.data } : null;

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

  const ready = (k: Kind) => !!x && (k === 'orders' ? !!x.orders : k === 'cash' ? !!x.entries : true);
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
