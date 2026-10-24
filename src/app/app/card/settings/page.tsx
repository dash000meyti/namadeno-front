'use client';
import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { AppHeader } from '@/components/app/AppHeader';
import { BottomNav } from '@/components/app/BottomNav';
import { ErrorState, Scr, Skeleton } from '@/components/app/Screen';
import { Icon } from '@/components/ui/Icon';
import { Sheet } from '@/components/ui/Sheet';
import { useToast } from '@/components/ui/Toast';
import { useCard, useCredit, usePortfolio, useTransactions } from '@/api/app';
import { useBlockCard, useCardSettingsX, useCreditExtra, useRequestPhysicalCard, type CardSettingsX } from '@/api/app-credit-extra';
import { ApiRequestError } from '@/api/client';
import { LOCK_META } from '@/lib/locks';
import { routes } from '@/lib/routes';
import { faDigits, jDate, money } from '@/lib/format';
import { now } from '@/lib/clock';
import { CI, TONE, type Tone } from '@/components/app/credit/icons';
import { CardStatusLabel, last4, LogoChip } from '@/components/app/credit/CardVisual';
import { ApiErrorNotice, Chev, KvRows, Toggle } from '@/components/app/credit/ui';

type SwitchKey = 'online' | 'atm' | 'contactless' | 'notifyEach';
const SWITCHES: { id: SwitchKey; title: string; sub: string; d: string; t: Tone }[] = [
  { id: 'online', title: 'پرداخت اینترنتی', sub: 'خرید از درگاه‌های آنلاین با رمز پویا', d: CI.globe, t: 'primary' },
  { id: 'atm', title: 'برداشت از خودپرداز', sub: 'فقط با کارت فیزیکی', d: CI.atm, t: 'secondary' },
  { id: 'contactless', title: 'پرداخت بدون تماس', sub: 'تا ۲٬۰۰۰٬۰۰۰ تومان بدون رمز', d: CI.nfc, t: 'info' },
  { id: 'notifyEach', title: 'اعلان هر تراکنش', sub: 'پیامک و اعلان درون‌برنامه', d: CI.bell, t: 'warning' },
];
const LIM_BUY = [30_000_000, 50_000_000, 100_000_000];
const LIM_ATM = [5_000_000, 10_000_000, 20_000_000];
const nextIn = (list: number[], cur: number) => list.find((v) => v > cur) ?? list[0];

export default function CardSettingsPage() {
  const router = useRouter();
  const toast = useToast();
  const card = useCard();
  const credit = useCredit();
  const extra = useCreditExtra();
  const pf = usePortfolio();
  const txs = useTransactions({ category: 'card' });
  const save = useCardSettingsX();
  const block = useBlockCard();
  const physical = useRequestPhysicalCard();
  const [local, setLocal] = useState<Partial<CardSettingsX>>({});
  const [confirmBlock, setConfirmBlock] = useState(false);

  const c = card.data;
  const s: CardSettingsX | undefined = c ? { ...(c.settings as CardSettingsX), ...local } : undefined;
  const atmLimit = s?.atmDailyLimit ?? 10_000_000;

  const update = (patch: Partial<CardSettingsX>, msg?: string) => {
    setLocal((l) => ({ ...l, ...patch }));
    save.mutate(patch, {
      onSuccess: () => { if (msg) toast(msg); },
      onError: (e) => {
        setLocal((l) => { const n = { ...l }; for (const k of Object.keys(patch)) delete n[k as keyof CardSettingsX]; return n; });
        toast(e instanceof ApiRequestError ? e.message : 'تنظیمات ذخیره نشد؛ دوباره امتحان کنید', 'error');
      },
    });
  };

  // spent today with the card (purchases only)
  const today = jDate(now());
  const usedToday = (txs.data ?? []).filter((t) => t.amount < 0 && jDate(t.at) === today && !/تسویه/.test(t.title)).reduce((sum, t) => sum - t.amount, 0);

  const cardLocks = c && pf.data ? pf.data.holdings.filter((h) => h.locks.some((l) => l.sourceId === c.id)) : [];
  const sources = (extra.data?.cardLockSources ?? ['rial', 'gold']).map((k) => pf.data?.holdings.find((h) => h.kind === k)?.name ?? k);

  const requestPhysical = () => physical.mutate(undefined, { onSuccess: (r) => { toast('درخواست کارت فیزیکی ثبت شد'); router.push(routes.app.receipt(r.transaction.id)); } });
  const doBlock = () => block.mutate(undefined, { onSuccess: (r) => { setConfirmBlock(false); toast('کارت باطل شد', 'info'); router.push(routes.app.receipt(r.transaction.id)); } });

  return (
    <>
      <Scr gap={10}>
        {card.isLoading && <><Skeleton h={64} /><Skeleton h={170} /><Skeleton h={210} /></>}
        {card.isError && <ErrorState message={card.error?.message} onRetry={() => card.refetch()} />}
        {c && s && (
          <>
            {/* card mini */}
            <div className="card" style={{ boxSizing: 'border-box', height: 64, padding: '0 16px', display: 'flex', alignItems: 'center', gap: 12, flex: 'none' }}>
              <LogoChip w={48} h={32} r={8} lw={24} lh={15} />
              <span className="col" style={{ flex: 1, gap: 2, lineHeight: 1.3 }}><span style={{ fontSize: 14, fontWeight: 700 }}>کارت اعتباری نمادنو</span><span className="num" dir="ltr" style={{ fontSize: 12, color: 'var(--text-secondary)', textAlign: 'right' }}>•••• {last4(c)} · {faDigits(c.expiry)}</span></span>
              <CardStatusLabel card={c} />
            </div>

            {/* credit backing */}
            <div className="card" style={{ boxSizing: 'border-box', padding: '8px 16px 10px', display: 'flex', flexDirection: 'column', flex: 'none' }}>
              <div className="row" style={{ height: 26, gap: 8 }}>
                <span style={{ fontSize: 14, fontWeight: 700 }}>پشتوانه اعتبار کارت</span>
                <span className="lktype" style={{ marginRight: 'auto', background: LOCK_META.collateral.bg, color: LOCK_META.collateral.fg }}><Icon d={LOCK_META.collateral.d} size={12} />{LOCK_META.collateral.label}</span>
              </div>
              <KvRows h={32} rows={[
                { k: 'سقف اعتبار', v: money(c.creditLimit), u: 'تومان' },
                { k: `بر پایه‌ی امتیاز ${faDigits(credit.data?.score ?? 0)}`, v: money(extra.data?.cardUnsecuredLimit ?? 0), u: 'تومان' },
                ...(cardLocks.length
                  ? cardLocks.map((h) => ({ k: `رزرو فعلی · ${h.name}`, v: money(h.locks.filter((l) => l.sourceId === c.id).reduce((x, l) => x + l.amount, 0)), u: 'تومان' }))
                  : [{ k: 'رزرو فعلی', v: '۰', u: 'تومان' }]),
                { k: 'منبع رزروهای بعدی', v: sources.join('، سپس ') },
              ]} />
              <span style={{ paddingTop: 6, fontSize: 11, color: 'var(--text-secondary)', lineHeight: 1.5 }}>مصرف بیش از سقف بر پایه‌ی امتیاز، به همان اندازه از دارایی آزاد شما به‌عنوان پشتوانه رزرو می‌شود و با تسویه‌ی صورت‌حساب دوباره آزاد می‌شود. <Link href={routes.app.asset('rial')} style={{ fontWeight: 700, color: 'var(--primary-text)', textDecoration: 'none' }}>مشاهده کیف پول ریالی</Link></span>
            </div>

            {/* switches */}
            <div className="card" style={{ boxSizing: 'border-box', padding: '6px 8px 2px 16px', display: 'flex', flexDirection: 'column', flex: 'none' }}>
              {SWITCHES.map((w, i) => {
                const on = !!s[w.id];
                return (
                  <div key={w.id} className="row" style={{ height: 50, gap: 10, borderBottom: `1px dashed ${i === SWITCHES.length - 1 ? 'transparent' : 'var(--divider)'}` }}>
                    <span style={{ width: 32, height: 32, borderRadius: '50%', background: TONE[w.t][0], color: TONE[w.t][1], display: 'grid', placeItems: 'center', flex: 'none' }}><Icon d={w.d} size={16} /></span>
                    <span className="col" style={{ flex: 1, gap: 2, lineHeight: 1.3 }}><span style={{ fontSize: 13, fontWeight: 600, whiteSpace: 'nowrap' }}>{w.title}</span><span style={{ fontSize: 11, color: 'var(--text-secondary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{w.sub}</span></span>
                    <Toggle on={on} label={w.title} disabled={c.status === 'blocked'} onClick={() => update({ [w.id]: !on } as Partial<CardSettingsX>, `${w.title} ${on ? 'غیرفعال' : 'فعال'} شد`)} />
                  </div>
                );
              })}
            </div>

            {/* limits */}
            <div className="card" style={{ boxSizing: 'border-box', padding: '8px 8px 2px 16px', display: 'flex', flexDirection: 'column', flex: 'none' }}>
              <div className="row" style={{ height: 22, gap: 8, paddingLeft: 8 }}>
                <span style={{ fontSize: 14, fontWeight: 700 }}>سقف‌ها</span>
                <span style={{ marginRight: 'auto', fontSize: 11, color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>برای تغییر ضربه بزنید</span>
              </div>
              {[
                { key: 'buy', title: 'سقف خرید روزانه', value: s.dailyLimit, used: usedToday, d: CI.bag, next: () => update({ dailyLimit: nextIn(LIM_BUY, s.dailyLimit) }, 'سقف خرید روزانه به‌روز شد') },
                { key: 'atm', title: 'سقف برداشت روزانه', value: atmLimit, used: 0, d: CI.banknote, next: () => update({ atmDailyLimit: nextIn(LIM_ATM, atmLimit) }, 'سقف برداشت روزانه به‌روز شد') },
              ].map((l, i) => (
                <button key={l.key} type="button" onClick={l.next} disabled={c.status === 'blocked'} aria-label={`تغییر ${l.title}`} className="row"
                  style={{ height: 50, gap: 10, border: 0, borderBottom: `1px dashed ${i === 1 ? 'transparent' : 'var(--divider)'}`, background: 'transparent', padding: 0, color: 'var(--text-primary)', fontFamily: 'inherit', textAlign: 'right', cursor: 'pointer', width: '100%' }}>
                  <span style={{ width: 32, height: 32, borderRadius: '50%', background: 'var(--soft-default)', color: 'var(--default-text)', display: 'grid', placeItems: 'center', flex: 'none' }}><Icon d={l.d} size={16} /></span>
                  <span className="col" style={{ flex: 1, gap: 2, lineHeight: 1.3 }}><span style={{ fontSize: 13, fontWeight: 600, whiteSpace: 'nowrap' }}>{l.title}</span><span className="num" style={{ fontSize: 11, color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>استفاده‌شده امروز {money(l.used)}</span></span>
                  <span className="num" style={{ fontSize: 14, fontWeight: 500, whiteSpace: 'nowrap' }}>{money(l.value)} <span style={{ fontSize: 10, fontWeight: 400, color: 'var(--text-secondary)' }}>تومان</span></span>
                  <span className="ibtn" style={{ width: 36, height: 36, color: 'var(--text-disabled)' }}><Chev /></span>
                </button>
              ))}
            </div>

            <ApiErrorNotice error={physical.error ?? block.error} />

            {/* physical card */}
            <button type="button" onClick={requestPhysical} disabled={physical.isPending || c.status === 'blocked'}
              style={{ height: 48, width: '100%', boxSizing: 'border-box', borderRadius: 8, border: '1px solid var(--outline-border)', background: 'transparent', color: 'var(--text-primary)', fontFamily: 'inherit', fontSize: 14, fontWeight: 700, flex: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, cursor: 'pointer', opacity: c.status === 'blocked' ? 0.5 : 1 }}>
              <Icon d={CI.card} size={18} />درخواست کارت فیزیکی<span className="lbl" style={{ height: 20, background: 'var(--soft-default)', color: 'var(--default-text)', fontWeight: 600 }}>رایگان</span>
            </button>
            {c.status === 'blocked'
              ? <span style={{ height: 40, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4, fontSize: 13, fontWeight: 600, color: 'var(--error-text)', flex: 'none' }}><Icon d={CI.ban} size={16} />این کارت باطل شده است</span>
              : <button type="button" onClick={() => setConfirmBlock(true)} style={{ height: 40, border: 0, background: 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4, fontFamily: 'inherit', fontSize: 14, fontWeight: 600, color: 'var(--error-text)', cursor: 'pointer', flex: 'none' }}><Icon d={CI.ban} size={16} />ابطال کارت</button>}
          </>
        )}
      </Scr>

      <AppHeader title="تنظیمات کارت" back={routes.app.card} />
      <BottomNav active="card" />

      <Sheet open={confirmBlock} onClose={() => setConfirmBlock(false)} title="ابطال کارت" subtitle="این کار قابل بازگشت نیست">
        <span style={{ fontSize: 13, lineHeight: 1.8, color: 'var(--text-secondary)' }}>
          پس از ابطال، خرید، برداشت و شارژ با این کارت انجام نمی‌شود. بدهی جاری ({money(c?.creditUsed ?? 0)} تومان) همچنان باید تسویه شود و پشتوانه‌ی کارت تا تسویه رزرو می‌ماند. اگر فقط می‌خواهید کارت مدتی کار نکند، از «توقف موقت» در صفحه‌ی کارت استفاده کنید.
        </span>
        <ApiErrorNotice error={block.error} />
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
          <button type="button" className="btn" onClick={() => setConfirmBlock(false)} style={{ border: '1px solid var(--outline-border)', background: 'transparent', color: 'var(--text-primary)' }}>انصراف</button>
          <button type="button" className="btn" onClick={doBlock} disabled={block.isPending} style={{ background: 'var(--error-main)', color: 'var(--error-contrast)' }}>{block.isPending ? '…' : 'ابطال کارت'}</button>
        </div>
      </Sheet>
    </>
  );
}
