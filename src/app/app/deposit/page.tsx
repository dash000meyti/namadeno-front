'use client';
/** /app/deposit?to=gold|fixed|rial — design: app-deposit (Shaparak payment, mocked). */
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Suspense, useMemo, useState } from 'react';
import { useBankAccounts, useDeposit, useFunds } from '@/api/app';
import { AppHeader } from '@/components/app/AppHeader';
import { BottomNav } from '@/components/app/BottomNav';
import { Scr } from '@/components/app/Screen';
import { Icon, ICONS } from '@/components/ui/Icon';
import { useToast } from '@/components/ui/Toast';
import { faDigits, money, pct, units as fmtUnits } from '@/lib/format';
import { routes } from '@/lib/routes';
import type { AssetKind, Transaction } from '@/types/domain';
import { D, amountText, feeLabel, parseAmount, signedPct } from '@/components/app/money/lib';
import '@/components/app/money/money.css';

const MIN = 10_000;
const MAX = 200_000_000;
const CHIPS: [string, number][] = [['۵ میلیون', 5_000_000], ['۱۰ میلیون', 10_000_000], ['۲۰ میلیون', 20_000_000]];
const BIN: Record<string, string> = { 'بانک ملت': '6104', 'بانک سامان': '6219', 'بانک پاسارگاد': '5022', 'بانک ملی': '6037', 'بانک صادرات': '6037', 'بانک تجارت': '5859', 'بانک پارسیان': '6221', 'بانک مسکن': '6280' };
const FALLBACK_CARDS = [{ bank: 'بانک ملت', first: '6104', last: '4521' }, { bank: 'بانک پاسارگاد', first: '5022', last: '8807' }];

type Dest = 'gold' | 'fixed' | 'rial';

export default function DepositPage() {
  return (
    <Suspense fallback={null}>
      <DepositScreen />
    </Suspense>
  );
}

function DepositScreen() {
  const sp = useSearchParams();
  const to = sp.get('to');
  const toast = useToast();
  const funds = useFunds();
  const banks = useBankAccounts();
  const deposit = useDeposit();

  const [dest, setDest] = useState<Dest>(to === 'fixed' || to === 'rial' ? to : 'gold');
  const [amount, setAmount] = useState(10_000_000);
  const [touched, setTouched] = useState(false);
  const [cardIdx, setCardIdx] = useState(0);
  const [done, setDone] = useState<Transaction | null>(null);

  const gold = funds.data?.find((f) => f.id === 'gold');
  const fixed = funds.data?.find((f) => f.id === 'fixed');
  const dests: { key: Dest; name: string; sub: string; nav: number; short: string; feePct: number; tileBg: string; tileFg: string; icon: string }[] = [
    { key: 'gold', name: gold?.name ?? 'صندوق طلا', sub: gold ? `NAV ${money(gold.nav)} · بازده یک‌ساله ${signedPct(gold.return1y)}` : '…', nav: gold?.nav ?? 0, short: gold?.shortName ?? 'طلا', feePct: gold?.feePct ?? 0.1, tileBg: 'var(--soft-warning)', tileFg: 'var(--warning-text)', icon: ICONS.gold },
    { key: 'fixed', name: fixed?.name ?? 'صندوق درآمد ثابت', sub: fixed ? `NAV ${money(fixed.nav)} · سود روزانه، مؤثر ${pct(fixed.effectiveYield ?? fixed.return1y)}` : '…', nav: fixed?.nav ?? 0, short: fixed?.shortName ?? 'درآمد ثابت', feePct: fixed?.feePct ?? 0.05, tileBg: 'var(--soft-secondary)', tileFg: 'var(--secondary-text)', icon: D.percent },
    { key: 'rial', name: 'کیف پول ریالی', sub: 'بلافاصله قابل استفاده · بدون سود', nav: 0, short: '', feePct: 0, tileBg: 'var(--soft-default)', tileFg: 'var(--default-text)', icon: D.wallet },
  ];
  const Dd = dests.find((d) => d.key === dest) ?? dests[0];
  const isFund = dest !== 'rial';

  const cards = useMemo(() => {
    const list = (banks.data ?? []).map((b) => ({ bank: b.bankName, first: BIN[b.bankName] ?? '6037', last: b.iban.slice(-4) }));
    return list.length ? list : FALLBACK_CARDS;
  }, [banks.data]);
  const card = cards[cardIdx % cards.length];
  const cardShort = card.bank.replace(/^بانک\s*/, '');

  const fee = isFund ? Math.round((amount * Dd.feePct) / 100) : 0;
  const unitsText = isFund && Dd.nav ? '≈ ' + fmtUnits((amount - fee) / Dd.nav) + ' واحد ' + Dd.short : '';
  const invalid = amount < MIN ? 'حداقل مبلغ واریز ۱۰٬۰۰۰ تومان است.' : amount > MAX ? 'مبلغ از سقف هر تراکنش درگاه بیشتر است.' : null;

  const summary = isFund
    ? [
        { k: 'مبلغ پرداخت', v: money(amount) + ' تومان', w: 500, c: 'var(--text-primary)' },
        { k: 'مقصد', v: Dd.name + ' · آزاد', w: 500, c: 'var(--text-primary)' },
        { k: 'واحد تقریبی', v: unitsText || '—', w: 500, c: 'var(--text-primary)' },
        { k: `کارمزد صدور (${feeLabel(Dd.feePct)})`, v: money(fee) + ' تومان', w: 400, c: 'var(--text-primary)' },
      ]
    : [
        { k: 'مبلغ پرداخت', v: money(amount) + ' تومان', w: 500, c: 'var(--text-primary)' },
        { k: 'مقصد', v: Dd.name + ' · آزاد', w: 500, c: 'var(--text-primary)' },
        { k: 'کارمزد', v: 'رایگان', w: 700, c: 'var(--success-text)' },
      ];

  const submit = () => {
    setTouched(true);
    if (invalid || deposit.isPending) return;
    deposit.mutate(
      { amount, destination: dest as AssetKind },
      {
        onSuccess: (tx) => setDone(tx),
        onError: (e: unknown) => toast(e instanceof Error ? e.message : 'پرداخت ناموفق بود', 'error'),
      },
    );
  };

  return (
    <div className="pg-money">
      <Scr gap={14} className="mn-noscroll">
        {!done ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {/* amount */}
            <div className="card" style={{ boxSizing: 'border-box', padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 10, flex: 'none' }}>
              <label htmlFor="dp-amt" style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)' }}>مبلغ واریز</label>
              <div style={{ height: 48, display: 'flex', alignItems: 'center', gap: 8, borderBottom: `1px solid ${touched && invalid ? 'var(--error-main)' : 'var(--divider)'}` }}>
                <input id="dp-amt" type="text" inputMode="numeric" dir="ltr" autoComplete="off" value={amountText(amount)} placeholder="۰" aria-invalid={!!(touched && invalid)} onChange={(e) => { setTouched(true); setAmount(parseAmount(e.target.value)); }} className="num" style={{ flex: 1, minWidth: 0, height: 44, border: 0, background: 'transparent', fontFamily: 'inherit', fontSize: 24, fontWeight: 300, color: 'var(--text-primary)', outline: 'none', padding: 0, textAlign: 'right' }} />
                <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>تومان</span>
              </div>
              {touched && invalid ? (
                <span role="alert" style={{ fontSize: 12, color: 'var(--error-text)' }}>{invalid}</span>
              ) : (
                <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>سقف هر تراکنش درگاه <span className="num" style={{ fontWeight: 500, color: 'var(--text-primary)' }}>{money(MAX)}</span> تومان</span>
              )}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
                {CHIPS.map(([label, v]) => {
                  const a = amount === v;
                  return (
                    <button key={v} onClick={() => setAmount(v)} aria-pressed={a} style={{ height: 36, borderRadius: 999, border: `1px solid ${a ? 'var(--primary-main)' : 'var(--outline-border)'}`, background: a ? 'var(--soft-primary)' : 'transparent', color: a ? 'var(--primary-text)' : 'var(--text-primary)', fontFamily: 'inherit', fontSize: 13, fontWeight: a ? 700 : 500, cursor: 'pointer', padding: 0 }}>{label}</button>
                  );
                })}
              </div>
            </div>

            {/* destination */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, flex: 'none' }}>
              <span style={{ height: 24, display: 'flex', alignItems: 'center', fontSize: 15, fontWeight: 700 }}>به کجا اضافه شود؟</span>
              <div role="radiogroup" aria-label="مقصد واریز" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {dests.map((d) => {
                  const on = d.key === dest;
                  return (
                    <button key={d.key} role="radio" aria-checked={on} onClick={() => setDest(d.key)} className="card" style={{ width: '100%', boxSizing: 'border-box', padding: '10px 14px', display: 'flex', alignItems: 'center', gap: 12, color: 'var(--text-primary)', fontFamily: 'inherit', textAlign: 'right', cursor: 'pointer', border: `1px solid ${on ? 'var(--primary-main)' : 'var(--glass-border)'}` }}>
                      <span style={{ width: 40, height: 40, borderRadius: 12, background: d.tileBg, color: d.tileFg, display: 'grid', placeItems: 'center', flex: 'none' }}><Icon d={d.icon} size={20} /></span>
                      <span style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 3, lineHeight: 1.3 }}>
                        <span style={{ fontSize: 14, fontWeight: 600, whiteSpace: 'nowrap' }}>{d.name}</span>
                        <span style={{ fontSize: 12, color: 'var(--text-secondary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{d.sub}</span>
                      </span>
                      <span style={{ width: 22, height: 22, boxSizing: 'border-box', borderRadius: '50%', border: `2px solid ${on ? 'var(--primary-main)' : 'var(--grey-400)'}`, display: 'grid', placeItems: 'center', flex: 'none' }}>
                        <span style={{ width: 10, height: 10, borderRadius: '50%', background: on ? 'var(--primary-main)' : 'transparent' }} />
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* payment source */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, flex: 'none' }}>
              <span style={{ height: 24, display: 'flex', alignItems: 'center', fontSize: 15, fontWeight: 700 }}>پرداخت از</span>
              <button className="card" onClick={() => setCardIdx((i) => (i + 1) % cards.length)} aria-label="تغییر کارت بانکی پرداخت" style={{ width: '100%', boxSizing: 'border-box', padding: '10px 14px', display: 'flex', alignItems: 'center', gap: 12, color: 'var(--text-primary)', fontFamily: 'inherit', textAlign: 'right', cursor: 'pointer' }}>
                <span style={{ width: 40, height: 40, borderRadius: 12, background: 'var(--soft-primary)', color: 'var(--primary-text)', display: 'grid', placeItems: 'center', flex: 'none' }}><Icon name="card" size={20} /></span>
                <span style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 3, lineHeight: 1.3 }}>
                  <span style={{ fontSize: 14, fontWeight: 600, whiteSpace: 'nowrap' }}>{card.bank} · درگاه شاپرک</span>
                  <span className="num" aria-label={`کارت ${card.bank} به شماره ${faDigits(card.first)} تا ${faDigits(card.last)}`} style={{ display: 'flex', direction: 'ltr', justifyContent: 'flex-end', gap: 6, fontSize: 13, fontWeight: 400, color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>
                    <span>{faDigits(card.first)}</span><span>••••</span><span>••••</span><span>{faDigits(card.last)}</span>
                  </span>
                </span>
                <span className="chip" style={{ height: 28, padding: '0 10px', borderRadius: 8, background: 'var(--soft-primary)', color: 'var(--primary-text)' }}>تغییر</span>
              </button>
            </div>

            {/* info */}
            <div style={{ boxSizing: 'border-box', padding: '10px 12px', borderRadius: 12, background: 'var(--soft-info)', display: 'flex', alignItems: 'center', gap: 10, flex: 'none' }}>
              <Icon name="info" size={20} style={{ color: 'var(--info-text)' }} />
              <span style={{ flex: 1, minWidth: 0, fontSize: 13, lineHeight: 1.8, color: 'var(--text-primary)' }}>
                {isFund
                  ? `واحدها با NAV صدور پایان روز به‌صورت «آزاد» به ${Dd.name} اضافه می‌شوند؛ بدون قفل و قابل فروش و برداشت.`
                  : 'مبلغ بلافاصله به‌صورت «آزاد» به کیف پول ریالی اضافه می‌شود؛ بدون قفل و قابل برداشت.'}
              </span>
            </div>

            {/* summary */}
            <div className="card" style={{ padding: '0 14px', display: 'flex', flexDirection: 'column', flex: 'none' }}>
              {summary.map((s, i) => (
                <div key={s.k} style={{ minHeight: 44, display: 'flex', alignItems: 'center', gap: 12, borderBottom: `1px dashed ${i === summary.length - 1 ? 'transparent' : 'var(--divider)'}` }}>
                  <span style={{ fontSize: 13, color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>{s.k}</span>
                  <span className="num" style={{ marginRight: 'auto', fontSize: 13, fontWeight: s.w, color: s.c, whiteSpace: 'nowrap' }}>{s.v}</span>
                </div>
              ))}
            </div>

            <button className="btn mn-cta" onClick={submit} disabled={deposit.isPending || (touched && !!invalid)} style={{ width: '100%', height: 48, flex: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, background: 'var(--primary-main)', color: 'var(--primary-contrast)', boxShadow: 'var(--shadow-primary)', fontSize: 15 }}>
              <Icon name="lock" size={18} />
              {deposit.isPending ? 'در حال اتصال به درگاه…' : <>پرداخت <span className="num" style={{ fontWeight: 600 }}>{money(amount)}</span> تومان</>}
            </button>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12, paddingTop: 24 }}>
            <span className="mn-pop" style={{ width: 72, height: 72, borderRadius: '50%', background: 'var(--soft-success)', color: 'var(--success-text)', display: 'grid', placeItems: 'center' }}><Icon d={D.check} size={36} /></span>
            <span style={{ fontSize: 20, fontWeight: 700, textAlign: 'center' }}>{isFund ? 'پرداخت موفق، سفارش خرید ثبت شد' : 'کیف پول ریالی شارژ شد'}</span>
            <span className="num" style={{ fontSize: 30, lineHeight: 1.2, whiteSpace: 'nowrap' }}>{money(done.amount)} <span style={{ fontSize: 14, fontWeight: 400, color: 'var(--text-secondary)' }}>تومان</span></span>
            <span style={{ fontSize: 13, color: 'var(--text-secondary)', textAlign: 'center' }}>{isFund ? unitsText + ' · تا پایان روز معاملاتی' : 'موجودی جدید در کیف پول ریالی قابل استفاده است'}</span>
            <div className="card" style={{ alignSelf: 'stretch', padding: '0 14px', display: 'flex', flexDirection: 'column', marginTop: 4 }}>
              {[
                { k: 'پرداخت از', v: `کارت ${cardShort} · ${faDigits(card.last)}`, ltr: false, c: 'var(--text-primary)' },
                { k: 'مقصد', v: Dd.name + ' · آزاد', ltr: false, c: 'var(--text-primary)' },
                isFund ? { k: 'وضعیت', v: 'سفارش صدور · پایان روز', ltr: false, c: 'var(--warning-text)' } : { k: 'وضعیت', v: 'به کیف پول اضافه شد', ltr: false, c: 'var(--success-text)' },
                { k: 'کد پیگیری', v: done.trackingCode, ltr: true, c: 'var(--text-primary)' },
              ].map((r, i, arr) => (
                <div key={r.k} style={{ minHeight: 46, display: 'flex', alignItems: 'center', gap: 12, borderBottom: `1px dashed ${i === arr.length - 1 ? 'transparent' : 'var(--divider)'}` }}>
                  <span style={{ fontSize: 13, color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>{r.k}</span>
                  <span dir={r.ltr ? 'ltr' : 'rtl'} className="num" style={{ marginRight: 'auto', fontSize: 13, fontWeight: 500, color: r.c, whiteSpace: 'nowrap' }}>{r.v}</span>
                </div>
              ))}
            </div>
            <Link href={isFund ? routes.app.asset(dest) : routes.app.asset('rial')} className="btn" style={{ alignSelf: 'stretch', height: 48, display: 'flex', alignItems: 'center', justifyContent: 'center', boxSizing: 'border-box', background: 'var(--primary-main)', color: 'var(--primary-contrast)', boxShadow: 'var(--shadow-primary)', textDecoration: 'none', fontSize: 15 }}>مشاهده دارایی‌ها</Link>
            <Link href={routes.app.transaction(done.id)} className="btn" style={{ alignSelf: 'stretch', display: 'flex', alignItems: 'center', justifyContent: 'center', boxSizing: 'border-box', background: 'transparent', color: 'var(--primary-text)', textDecoration: 'none' }}>مشاهده در تاریخچه</Link>
          </div>
        )}
      </Scr>

      <AppHeader title="افزایش دارایی" back={routes.app.home} />
      <BottomNav active="assets" />
    </div>
  );
}
