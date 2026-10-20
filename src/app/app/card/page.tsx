'use client';
import Link from 'next/link';
import { AppHeader, HeaderIconButton } from '@/components/app/AppHeader';
import { BottomNav } from '@/components/app/BottomNav';
import { ErrorState, Scr, Skeleton } from '@/components/app/Screen';
import { Icon } from '@/components/ui/Icon';
import { useToast } from '@/components/ui/Toast';
import { useCard, useFreezeCard, usePortfolio, useTransactions } from '@/api/app';
import { useCreditExtra } from '@/api/app-credit-extra';
import { ApiRequestError } from '@/api/client';
import { routes } from '@/lib/routes';
import { faDigits, jDayMonth, money } from '@/lib/format';
import { CI } from '@/components/app/credit/icons';
import { CardFace, cardTxIcon, cardTxTitle } from '@/components/app/credit/CardVisual';
import { Chev, daysUntil, pct1 } from '@/components/app/credit/ui';

export default function CardPage() {
  const toast = useToast();
  const card = useCard();
  const pf = usePortfolio();
  const extra = useCreditExtra();
  const txs = useTransactions({ category: 'card', limit: 4 });
  const freeze = useFreezeCard();

  const c = card.data;
  const noCard = card.error instanceof ApiRequestError && card.error.code === 'no_card';
  const blocked = c ? c.status !== 'active' : false;
  const permanent = c?.status === 'blocked';
  const avail = c ? c.creditLimit - c.creditUsed : 0;
  const usedPct = c && c.creditLimit ? pct1(c.creditUsed / c.creditLimit) : 0;
  const dueIn = c ? Math.max(0, daysUntil(c.statementDue)) : 0;

  const locks = c && pf.data ? pf.data.holdings.flatMap((h) => h.locks).filter((l) => l.sourceId === c.id) : [];
  const lockedSum = locks.reduce((s, l) => s + l.amount, 0);
  const lockHoldings = Array.from(new Set(locks.map((l) => l.holdingKind)));
  const holdingName = (k: string) => pf.data?.holdings.find((h) => h.kind === k)?.name ?? k;

  const toggleFreeze = () => {
    if (!c || permanent) return;
    freeze.mutate(!blocked, {
      onSuccess: (r) => toast(r.status === 'frozen' ? 'کارت موقتاً مسدود شد' : 'مسدودی کارت برداشته شد', r.status === 'frozen' ? 'info' : 'success'),
      onError: (e) => toast(e instanceof ApiRequestError ? e.message : 'خطا در ارتباط با سرور', 'error'),
    });
  };

  const actions = [
    { label: 'شارژ از اعتبار', d: CI.bolt, href: routes.app.cardCharge },
    { label: 'رمز پویا', d: CI.key, href: routes.app.cardOtp },
    { label: blocked ? 'رفع مسدودی' : 'مسدودسازی', d: CI.ban, toggle: true },
    { label: 'تنظیمات', d: CI.sliders, href: routes.app.cardSettings },
  ];

  return (
    <>
      <Scr gap={8} style={{ paddingBottom: 84 }}>
        {card.isLoading && <><Skeleton h={200} r={24} /><Skeleton h={104} /><Skeleton h={58} /></>}
        {noCard && (
          <div className="card" style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 6, alignItems: 'center', textAlign: 'center', flex: 'none' }}>
            <Icon d={CI.card} size={28} style={{ color: 'var(--text-secondary)' }} />
            <span style={{ fontSize: 14, fontWeight: 700 }}>کارتی برای شما صادر نشده است</span>
            <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>برای صدور کارت اعتباری نمادنو با پشتیبانی تماس بگیرید.</span>
          </div>
        )}
        {card.isError && !noCard && <ErrorState onRetry={() => card.refetch()} />}

        {c && (
          <>
            <CardFace card={c} />

            {/* available credit */}
            <div className="card" style={{ boxSizing: 'border-box', height: 104, padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: 6, flex: 'none' }}>
              <div className="row" style={{ height: 18, gap: 8, lineHeight: 1 }}>
                <span style={{ fontSize: 13, fontWeight: 600 }}>اعتبار در دسترس</span>
                <span className="num" style={{ marginRight: 'auto', fontSize: 11, fontWeight: 400, color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>استفاده‌شده {money(c.creditUsed)} از {money(c.creditLimit)}</span>
              </div>
              <span className="num" style={{ fontSize: 22, lineHeight: 1.1, whiteSpace: 'nowrap' }}>{money(avail)} <span style={{ fontSize: 12, fontWeight: 400, color: 'var(--text-secondary)' }}>تومان</span></span>
              <div dir="ltr" style={{ height: 6, borderRadius: 999, background: 'var(--progress-track)', overflow: 'hidden' }}><span style={{ display: 'block', width: `${usedPct}%`, height: '100%', borderRadius: 999, background: 'var(--primary-main)' }} /></div>
              {blocked
                ? <span style={{ fontSize: 11, color: 'var(--error-text)', fontWeight: 600, lineHeight: 1.3, whiteSpace: 'nowrap', display: 'flex', alignItems: 'center', gap: 4 }}><Icon d={CI.ban} size={14} />کارت مسدود است · خرید با کارت ممکن نیست</span>
                : <span style={{ fontSize: 11, color: 'var(--text-secondary)', lineHeight: 1.3, whiteSpace: 'nowrap', display: 'flex', alignItems: 'center', gap: 4 }}><Icon d={CI.refresh} size={14} />تسویه خودکار از کیف پول ریالی: {jDayMonth(c.statementDue)}</span>}
            </div>

            {/* credit backing: collateral lock */}
            <Link href={routes.app.asset(lockHoldings[0] ?? 'rial')} className="card" style={{ boxSizing: 'border-box', height: 58, padding: '0 12px 0 14px', display: 'flex', alignItems: 'center', gap: 10, flex: 'none', color: 'var(--text-primary)', textDecoration: 'none' }}>
              <span className="lktype" style={{ background: 'var(--soft-info)', color: 'var(--info-text)' }}><Icon d={CI.lock} size={12} />وثیقه</span>
              <span className="col" style={{ flex: 1, gap: 2, lineHeight: 1.3 }}>
                <span className="num" style={{ fontSize: 13, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {lockedSum > 0 ? `پشتوانه: ${money(lockedSum)} قفل در ${lockHoldings.map(holdingName).join('، ')}` : 'پشتوانه: فعلاً قفلی ندارد'}
                </span>
                <span style={{ fontSize: 11, color: 'var(--text-secondary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {lockedSum > 0 ? locks[0].condition : `تا ${money(extra.data?.cardUnsecuredLimit ?? 0)} تومان مصرف بدون وثیقه`}
                </span>
              </span>
              <Chev />
            </Link>

            {/* card actions */}
            <div style={{ height: 58, display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8, flex: 'none' }}>
              {actions.map((a) => a.href ? (
                <Link key={a.label} href={a.href} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, padding: 0, color: 'var(--text-primary)', textDecoration: 'none' }}>
                  <span style={{ width: 40, height: 40, borderRadius: '50%', background: 'var(--bg-paper)', boxShadow: 'var(--shadow-card)', color: 'var(--primary-text)', display: 'grid', placeItems: 'center' }}><Icon d={a.d} size={20} /></span>
                  <span style={{ fontSize: 11, lineHeight: 1.3, fontWeight: 500, whiteSpace: 'nowrap' }}>{a.label}</span>
                </Link>
              ) : (
                <button key={a.label} type="button" onClick={toggleFreeze} aria-pressed={blocked} disabled={permanent || freeze.isPending} title={permanent ? 'کارت مسدود دائم است' : undefined}
                  style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, border: 0, background: 'transparent', padding: 0, color: 'var(--text-primary)', fontFamily: 'inherit', cursor: permanent ? 'default' : 'pointer', opacity: permanent ? 0.5 : 1 }}>
                  <span style={{ width: 40, height: 40, borderRadius: '50%', background: blocked ? 'var(--soft-error)' : 'var(--bg-paper)', boxShadow: 'var(--shadow-card)', color: blocked ? 'var(--error-text)' : 'var(--primary-text)', display: 'grid', placeItems: 'center' }}><Icon d={a.d} size={20} /></span>
                  <span style={{ fontSize: 11, lineHeight: 1.3, fontWeight: 500, whiteSpace: 'nowrap' }}>{a.label}</span>
                </button>
              ))}
            </div>

            {/* statement */}
            <div className="card" style={{ boxSizing: 'border-box', height: 84, padding: '10px 16px', display: 'flex', flexDirection: 'column', gap: 6, flex: 'none' }}>
              <div className="row" style={{ height: 22, gap: 8 }}>
                <span style={{ fontSize: 14, fontWeight: 700 }}>صورتحساب اعتبار</span>
                <span className="lbl" style={{ marginRight: 'auto', height: 22, background: 'var(--soft-warning)', color: 'var(--warning-text)', fontWeight: 600 }}>مهلت تسویه {faDigits(dueIn)} روز</span>
              </div>
              <div className="row" style={{ height: 36, gap: 10 }}>
                <span className="col" style={{ gap: 2, lineHeight: 1.2 }}><span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>بدهی جاری</span><span className="num" style={{ fontSize: 16, whiteSpace: 'nowrap' }}>{money(c.creditUsed)} <span style={{ fontSize: 11, fontWeight: 400, color: 'var(--text-secondary)' }}>تومان</span></span></span>
                <Link href={routes.app.cardSettle} style={{ marginRight: 'auto', height: 36, padding: '0 14px', boxSizing: 'border-box', borderRadius: 8, background: 'var(--soft-primary)', color: 'var(--primary-text)', fontSize: 13, fontWeight: 700, display: 'inline-flex', alignItems: 'center', whiteSpace: 'nowrap', textDecoration: 'none' }}>تسویه زودتر</Link>
              </div>
            </div>

            {/* last card transactions */}
            <div className="card" style={{ padding: '0 16px', display: 'flex', flexDirection: 'column', flex: 'none' }}>
              <div className="row" style={{ height: 22, gap: 8, paddingTop: 2 }}>
                <span style={{ fontSize: 13, fontWeight: 700 }}>تراکنش‌های کارت</span>
                <Link href={routes.app.history('card')} style={{ marginRight: 'auto', fontSize: 12, fontWeight: 600, color: 'var(--primary-text)', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 2 }}>همه<Icon d={CI.chevL} size={14} /></Link>
              </div>
              {txs.isLoading && <div style={{ height: 34 }} />}
              {txs.data && txs.data.length === 0 && <span style={{ height: 34, display: 'flex', alignItems: 'center', fontSize: 12, color: 'var(--text-secondary)' }}>هنوز تراکنشی با کارت ندارید</span>}
              {txs.data?.map((tx, i, arr) => (
                <Link key={tx.id} href={routes.app.transaction(tx.id)} className="row" style={{ height: 34, gap: 10, borderBottom: `1px dashed ${i === arr.length - 1 ? 'transparent' : 'var(--divider)'}`, color: 'var(--text-primary)', textDecoration: 'none' }}>
                  <span style={{ width: 28, height: 28, borderRadius: '50%', background: 'var(--soft-default)', color: 'var(--default-text)', display: 'grid', placeItems: 'center', flex: 'none' }}><Icon d={cardTxIcon(tx.title)} size={15} /></span>
                  <span style={{ flex: 1, minWidth: 0, fontSize: 13, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{cardTxTitle(tx.title)}</span>
                  <span style={{ fontSize: 11, color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>{jDayMonth(tx.at)}</span>
                  <span className="num" style={{ fontSize: 14, fontWeight: 400, whiteSpace: 'nowrap', minWidth: 86, textAlign: 'left', color: tx.amount > 0 ? 'var(--success-text)' : 'var(--text-primary)' }}>{tx.amount > 0 ? '+' : ''}{money(tx.amount)}</span>
                </Link>
              ))}
            </div>
          </>
        )}
      </Scr>

      <AppHeader title="کارت نمادنو" back={routes.app.credit} trailing={<HeaderIconButton d={CI.more} label="تنظیمات کارت" href={routes.app.cardSettings} />} />
      <BottomNav active="card" />
    </>
  );
}
