'use client';
/** /app/history?category= — design: app-history (category chips, search, month groups). */
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useMemo, useState } from 'react';
import { useTransactions } from '@/api/app';
import { AppHeader, HeaderIconButton } from '@/components/app/AppHeader';
import { BottomNav } from '@/components/app/BottomNav';
import { ErrorState, Scr, Skeleton } from '@/components/app/Screen';
import { Icon } from '@/components/ui/Icon';
import { useToast } from '@/components/ui/Toast';
import { faDigits, jDate, jDayMonth, jMonthYear, signedMoney } from '@/lib/format';
import { routes } from '@/lib/routes';
import type { Transaction, TxCategory } from '@/types/domain';
import { CATEGORY_LABEL, D, STATUS_LABEL, downloadText, txVisual } from '@/components/app/money/lib';
import '@/components/app/money/money.css';

const BASE_CHIPS: { id: string; label: string }[] = [
  { id: 'all', label: 'همه' }, { id: 'lock', label: 'قفل و آزادسازی' }, { id: 'inbox', label: 'دریافتی' }, { id: 'trade', label: 'خرید/فروش' }, { id: 'loan', label: 'وام' }, { id: 'card', label: 'کارت' },
];

export default function HistoryPage() {
  return (
    <Suspense fallback={null}>
      <HistoryScreen />
    </Suspense>
  );
}

function HistoryScreen() {
  const sp = useSearchParams();
  const initial = sp.get('category') || 'all';
  const [filter, setFilter] = useState(initial);
  const [text, setText] = useState('');
  const [q, setQ] = useState('');
  const toast = useToast();

  useEffect(() => { setFilter(sp.get('category') || 'all'); }, [sp]);
  useEffect(() => {
    const t = setTimeout(() => setQ(text.trim()), 250);
    return () => clearTimeout(t);
  }, [text]);

  const chips = useMemo(() => {
    if (BASE_CHIPS.some((c) => c.id === filter)) return BASE_CHIPS;
    const label = CATEGORY_LABEL[filter as TxCategory];
    return label ? [...BASE_CHIPS, { id: filter, label }] : BASE_CHIPS;
  }, [filter]);

  const txq = useTransactions({ category: filter === 'all' ? undefined : filter, q: q || undefined });
  const list = useMemo(() => [...(txq.data ?? [])].sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime()), [txq.data]);

  const groups = useMemo(() => {
    const out: { month: string; rows: Transaction[] }[] = [];
    for (const t of list) {
      const m = jMonthYear(t.at);
      const g = out[out.length - 1];
      if (g && g.month === m) g.rows.push(t);
      else out.push({ month: m, rows: [t] });
    }
    return out;
  }, [list]);

  const sumOf = (rows: Transaction[]) => {
    if (filter !== 'all' || q) return faDigits(rows.length) + ' تراکنش';
    const net = rows.filter((t) => !t.lockEvent || t.category === 'inbox').filter((t) => t.category !== 'trade' && t.status !== 'failed').reduce((s, t) => s + t.amount, 0);
    return 'خالص ' + signedMoney(net);
  };

  const exportCsv = () => {
    if (!list.length) { toast('تراکنشی برای خروجی وجود ندارد', 'info'); return; }
    const esc = (v: string) => `"${v.replace(/"/g, '""')}"`;
    const lines = [
      ['تاریخ', 'شرح', 'توضیح', 'دسته', 'مبلغ (تومان)', 'وضعیت', 'کد پیگیری'].map(esc).join(','),
      ...list.map((t) => [jDate(t.at), t.title, t.subtitle, CATEGORY_LABEL[t.category], String(t.amount), STATUS_LABEL[t.status].label, t.trackingCode].map(esc).join(',')),
    ];
    downloadText('namadno-transactions.csv', lines.join('\n'), 'text/csv;charset=utf-8');
  };

  return (
    <div className="pg-money">
      <Scr gap={10}>
        <label style={{ height: 44, boxSizing: 'border-box', padding: '0 12px', borderRadius: 12, border: '1px solid var(--glass-border)', background: 'var(--card-bg)', boxShadow: 'var(--shadow-glass)', display: 'flex', alignItems: 'center', gap: 8, flex: 'none' }}>
          <Icon name="search" size={20} style={{ color: 'var(--text-secondary)' }} />
          <input className="mn-search" type="search" aria-label="جستجوی تراکنش" placeholder="جستجو در تراکنش‌ها" value={text} onChange={(e) => setText(e.target.value)} style={{ flex: 1, minWidth: 0, height: 40, border: 0, background: 'transparent', color: 'var(--text-primary)', fontFamily: 'inherit', fontSize: 14, outline: 'none' }} />
          {text && (
            <button className="ibtn" aria-label="پاک کردن جستجو" onClick={() => setText('')} style={{ width: 32, height: 32, color: 'var(--text-secondary)', flex: 'none' }}><Icon name="close" size={18} /></button>
          )}
        </label>

        {/* filter chips */}
        <div className="mn-noscroll" style={{ height: 36, display: 'flex', gap: 8, overflowX: 'auto', overflowY: 'hidden', margin: '0 -16px', padding: '0 16px', flex: 'none' }}>
          {chips.map((c) => {
            const a = c.id === filter;
            return (
              <button key={c.id} onClick={() => setFilter(c.id)} aria-pressed={a} style={{ height: 36, flex: 'none', padding: '0 14px', border: `1px solid ${a ? 'transparent' : 'var(--outline-border)'}`, borderRadius: 999, background: a ? 'var(--soft-primary)' : 'transparent', color: a ? 'var(--primary-text)' : 'var(--text-primary)', fontFamily: 'inherit', fontSize: 13, fontWeight: a ? 700 : 500, cursor: 'pointer', whiteSpace: 'nowrap' }}>{c.label}</button>
            );
          })}
        </div>

        {txq.isLoading && [0, 1].map((i) => <Skeleton key={i} h={240} />)}
        {txq.isError && <ErrorState message={txq.error?.message} onRetry={() => void txq.refetch()} />}

        {groups.map((g) => (
          <div key={g.month} style={{ display: 'flex', flexDirection: 'column', gap: 6, flex: 'none' }}>
            <div className="row" style={{ height: 22, padding: '0 4px' }}>
              <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-secondary)' }}>{g.month}</span>
              <span className="num" style={{ marginRight: 'auto', fontSize: 11, fontWeight: 400, color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>{sumOf(g.rows)}</span>
            </div>
            <div className="card" style={{ padding: '0 14px', display: 'flex', flexDirection: 'column' }}>
              {g.rows.map((t, i) => <HistoryRow key={t.id} tx={t} last={i === g.rows.length - 1} />)}
            </div>
          </div>
        ))}

        {txq.data && groups.length === 0 && (
          <div className="card" style={{ boxSizing: 'border-box', height: 120, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 8, color: 'var(--text-secondary)', flex: 'none' }}>
            <Icon d={D.emptyBox} size={28} />
            <span style={{ fontSize: 13, fontWeight: 600 }}>{q ? 'تراکنشی با این عبارت پیدا نشد' : 'تراکنشی در این دسته نیست'}</span>
          </div>
        )}
      </Scr>

      <AppHeader title="تاریخچه" trailing={<HeaderIconButton icon="download" label="دریافت خروجی تراکنش‌ها" onClick={exportCsv} />} />
      <BottomNav active="history" />
    </div>
  );
}

function HistoryRow({ tx, last }: { tx: Transaction; last: boolean }) {
  const v = txVisual(tx);
  return (
    <Link href={routes.app.transaction(tx.id)} className="row" style={{ minHeight: 54, gap: 10, borderBottom: `1px dashed ${last ? 'transparent' : 'var(--divider)'}`, color: 'var(--text-primary)', textDecoration: 'none' }}>
      <span style={{ width: 40, height: 40, borderRadius: '50%', background: v.bg, color: v.fg, display: 'grid', placeItems: 'center', flex: 'none' }}><Icon d={v.d} size={20} /></span>
      <span className="col" style={{ flex: 1, gap: 2, lineHeight: 1.3 }}>
        <span style={{ fontSize: 14, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{tx.title}</span>
        <span style={{ minWidth: 0, display: 'flex', alignItems: 'center', gap: 4 }}>
          {v.lock && (
            <span className="lktype" style={{ height: 18, padding: '0 5px', fontSize: 10, gap: 3, background: v.lock.bg, color: v.lock.fg, flex: 'none' }}><Icon d={v.lock.d} size={11} />{v.lock.label}</span>
          )}
          <span className="num" style={{ minWidth: 0, fontSize: 11, fontWeight: 400, color: 'var(--text-secondary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{jDayMonth(tx.at)} · {tx.subtitle}</span>
        </span>
      </span>
      {v.status && <span className="lbl" style={{ height: 22, background: v.status.bg, color: v.status.fg, fontWeight: 600 }}>{v.status.label}</span>}
      <span className="col" style={{ alignItems: 'flex-start', gap: 2, lineHeight: 1.2, flex: 'none' }}>
        <span className="num" style={{ fontSize: 15, fontWeight: 400, color: v.amountColor, whiteSpace: 'nowrap' }}>{v.amount}</span>
        {v.sub2 && <span className="num" style={{ fontSize: 11, fontWeight: 400, color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>{v.sub2}</span>}
      </span>
    </Link>
  );
}
