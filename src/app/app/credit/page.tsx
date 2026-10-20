'use client';
import Link from 'next/link';
import { AppHeader, HeaderIconButton } from '@/components/app/AppHeader';
import { BottomNav } from '@/components/app/BottomNav';
import { ErrorState, Scr, Skeleton } from '@/components/app/Screen';
import { Icon } from '@/components/ui/Icon';
import { LockBar, LockLegend } from '@/components/ui/LockBar';
import { useCard, useCredit, useInstallments, useLoans, useMe, usePortfolio } from '@/api/app';
import { routes } from '@/lib/routes';
import { faDigits, jDayMonth, money } from '@/lib/format';
import { LOCK_META } from '@/lib/locks';
import type { Lock } from '@/types/domain';
import { CI, KIND_ICON, TONE } from '@/components/app/credit/icons';
import { SCORE_BAND, scoreRatio } from '@/components/app/credit/meta';
import { Chev, KycBanner, Segs } from '@/components/app/credit/ui';

const CREDIT_LOCK_TYPES = new Set(['collateral', 'installment']);

export default function CreditPage() {
  const me = useMe();
  const credit = useCredit();
  const pf = usePortfolio();
  const loans = useLoans();
  const card = useCard();
  const inst = useInstallments();

  const c = credit.data;
  const p = pf.data;
  const activeLoan = loans.data?.find((l) => l.status === 'active');
  const nextInst = activeLoan?.installments.find((i) => i.status !== 'paid');
  const paidCount = activeLoan ? activeLoan.installments.filter((i) => i.status === 'paid').length : 0;

  const allLocks: Lock[] = p ? p.holdings.flatMap((h) => h.locks) : [];
  const creditLocks = allLocks.filter((l) => CREDIT_LOCK_TYPES.has(l.type));
  const otherLocked = allLocks.filter((l) => !CREDIT_LOCK_TYPES.has(l.type)).reduce((s, l) => s + l.amount, 0);
  const creditLockedSum = creditLocks.reduce((s, l) => s + l.amount, 0);

  const holdingName = (kind: string) => p?.holdings.find((h) => h.kind === kind)?.name ?? kind;
  const source = (l: Lock) => {
    if (l.sourceId && loans.data?.some((x) => x.id === l.sourceId)) return { label: 'وام فعال', href: routes.app.payInstallment(l.sourceId) };
    if (l.sourceId && card.data && l.sourceId === card.data.id) return { label: 'کارت نمادنو', href: routes.app.card };
    if (l.type === 'installment' || (l.sourceId && inst.data?.some((x) => x.id === l.sourceId))) return { label: 'خرید اقساطی', href: routes.app.installment };
    return { label: 'جزئیات', href: routes.app.asset(l.holdingKind) };
  };
  const releaseText = (l: Lock) => {
    const label = LOCK_META[l.type].label;
    if (l.type === 'installment' && l.totalCount) {
      const remain = Math.max(1, l.totalCount - (l.paidCount ?? 0));
      return `${label} · ${faDigits(remain)} قسط مانده · با پرداخت هر قسط، ${money(l.amount / remain)} آزاد می‌شود`;
    }
    if (l.totalCount) return `${label} · ${l.condition} (${faDigits(l.totalCount)} قسط، ${faDigits(l.totalCount - (l.paidCount ?? 0))} مانده)`;
    return `${label} · ${l.condition}`;
  };

  const band = c ? SCORE_BAND[c.scoreBand] : undefined;
  const usedPct = c && c.creditLimit ? Math.round((c.creditUsed / c.creditLimit) * 1000) / 10 : 0;
  const loading = credit.isLoading || pf.isLoading;

  return (
    <>
      <Scr gap={12}>
        {me.data && me.data.kycLevel < 2 && <KycBanner />}

        {loading && <><Skeleton h={116} /><Skeleton h={150} /><Skeleton h={90} /></>}
        {(credit.isError || pf.isError) && <ErrorState onRetry={() => { credit.refetch(); pf.refetch(); }} />}

        {c && band && (
          <Link href={routes.app.score} className="card" style={{ boxSizing: 'border-box', height: 116, padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 16, flex: 'none', color: 'var(--text-primary)', textDecoration: 'none' }}>
            <div style={{ position: 'relative', width: 88, height: 88, flex: 'none' }}>
              <svg viewBox="0 0 88 88" width="88" height="88" aria-hidden="true" style={{ display: 'block' }}>
                <circle cx="44" cy="44" r="38" fill="none" style={{ stroke: 'var(--ring-track)' }} strokeWidth="8" />
                <circle cx="44" cy="44" r="38" fill="none" style={{ stroke: 'var(--chart-1)' }} strokeWidth="8" strokeLinecap="round" strokeDasharray={`${Math.round(scoreRatio(c.score) * 239)} 239`} transform="rotate(-90 44 44)" />
              </svg>
              <span style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', lineHeight: 1.1 }}>
                <span className="num" style={{ fontSize: 24 }}>{faDigits(c.score)}</span>
                <span style={{ fontSize: 10, color: 'var(--text-secondary)' }}>از ۹۰۰</span>
              </span>
            </div>
            <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 6 }}>
              <span style={{ fontSize: 15, fontWeight: 700, lineHeight: 1.2 }}>امتیاز اعتباری</span>
              <span><span className="lbl" style={{ background: TONE[band.tone][0], color: TONE[band.tone][1] }}>{band.label}</span></span>
              <span style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.4 }}>بر اساس دارایی و سابقه</span>
            </div>
            <Chev />
          </Link>
        )}

        {/* collateral capacity: FREE assets only */}
        {p && c && (
          <Link href={routes.app.home} className="card" style={{ boxSizing: 'border-box', padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: 8, flex: 'none', color: 'var(--text-primary)', textDecoration: 'none' }}>
            <div className="row" style={{ height: 22, gap: 8 }}>
              <span style={{ fontSize: 13, fontWeight: 600 }}>ظرفیت وثیقه</span>
              <span className="chip" style={{ height: 20 }}>فقط دارایی آزاد</span>
              <Chev style={{ marginRight: 'auto' }} />
            </div>
            <div className="row" style={{ height: 28, gap: 8, alignItems: 'baseline' }}>
              <span className="num" style={{ fontSize: 22, lineHeight: 1.1, whiteSpace: 'nowrap' }}>{money(p.free)} <span style={{ fontSize: 12, fontWeight: 400, color: 'var(--text-secondary)' }}>تومان</span></span>
              <span className="num" style={{ marginRight: 'auto', fontSize: 11, fontWeight: 400, color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>از کل {money(p.total)}</span>
            </div>
            <LockBar free={p.free} locked={p.locked} />
            <LockLegend free={p.free} locked={p.locked} />
            <div className="row" style={{ height: 30, gap: 8, borderTop: '1px dashed var(--divider)', paddingTop: 6 }}>
              <span style={{ fontSize: 12, color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>سقف وام جدید · {faDigits(c.loanMaxPct)}٪ دارایی آزاد</span>
              <span className="num" style={{ marginRight: 'auto', fontSize: 14, fontWeight: 500, whiteSpace: 'nowrap' }}>{money(c.loanMax)} <span style={{ fontSize: 10, fontWeight: 400, color: 'var(--text-secondary)' }}>تومان</span></span>
            </div>
          </Link>
        )}

        {/* card credit limit */}
        {c && (
          <div className="card" style={{ boxSizing: 'border-box', height: 90, padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 8, flex: 'none' }}>
            <div style={{ height: 24, display: 'flex', alignItems: 'center', gap: 8, lineHeight: 1.2 }}>
              <span style={{ fontSize: 13, fontWeight: 600 }}>سقف اعتبار کارت</span>
              <span className="num" style={{ marginRight: 'auto', fontSize: 18, whiteSpace: 'nowrap' }}>{money(c.creditLimit)} <span style={{ fontSize: 11, fontWeight: 400, color: 'var(--text-secondary)' }}>تومان</span></span>
            </div>
            <div dir="ltr" style={{ height: 8, borderRadius: 999, background: 'var(--progress-track)', overflow: 'hidden' }}><span style={{ display: 'block', width: `${usedPct}%`, height: '100%', borderRadius: 999, background: 'var(--primary-main)' }} /></div>
            <span className="num" style={{ height: 16, fontSize: 11, fontWeight: 400, color: 'var(--text-secondary)', lineHeight: '16px', whiteSpace: 'nowrap' }}>استفاده‌شده {money(c.creditUsed)} · قابل استفاده {money(c.creditLimit - c.creditUsed)} تومان</span>
          </div>
        )}

        {/* products */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, flex: 'none' }}>
          <span style={{ height: 24, display: 'flex', alignItems: 'center', fontSize: 15, fontWeight: 700 }}>محصولات اعتباری</span>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <Product href={routes.app.card} d={CI.card} tone="primary" title="اعتبار کارت نمادنو" sub="تا ۲۵٪ دارایی · شارژ آنی کارت" />
            <Product href={routes.app.loan} d={CI.banknote} tone="secondary" title="وام با پشتوانه دارایی" sub="تا ۴۰٪ دارایی آزاد · با قفل وثیقه" active={!!activeLoan} />
            <Product href={routes.app.installment} d={CI.cart} tone="info" title="خرید اقساطی" sub="از فروشگاه‌های طرف قرارداد با وثیقه دارایی" />
          </div>
        </div>

        {/* active loan */}
        {activeLoan && (
          <div className="card" style={{ boxSizing: 'border-box', height: 118, padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 8, flex: 'none' }}>
            <div style={{ height: 24, display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 14, fontWeight: 700 }}>وام فعال</span>
              <span className="num" style={{ fontSize: 13, fontWeight: 400, color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>{money(activeLoan.principal)} تومان · {faDigits(activeLoan.months)} ماهه</span>
              <span className="lbl" style={{ marginRight: 'auto', background: 'var(--soft-primary)', color: 'var(--primary-text)' }}>{faDigits(paidCount)} از {faDigits(activeLoan.months)}</span>
            </div>
            <Segs total={activeLoan.months} paid={paidCount} />
            <div style={{ height: 44, display: 'flex', alignItems: 'center', gap: 10 }}>
              {nextInst && (
                <span style={{ display: 'flex', flexDirection: 'column', gap: 2, lineHeight: 1.25 }}>
                  <span style={{ fontSize: 11, color: nextInst.status === 'overdue' ? 'var(--error-text)' : 'var(--text-secondary)' }}>قسط بعدی · {jDayMonth(nextInst.dueDate)}</span>
                  <span className="num" style={{ fontSize: 16, whiteSpace: 'nowrap' }}>{money(nextInst.amount)} تومان</span>
                </span>
              )}
              <Link href={routes.app.payInstallment(activeLoan.id)} className="btn" style={{ marginRight: 'auto', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', boxSizing: 'border-box', background: 'var(--primary-main)', color: 'var(--primary-contrast)', boxShadow: 'var(--shadow-primary)', padding: '0 18px', textDecoration: 'none' }}>پرداخت قسط</Link>
            </div>
          </div>
        )}

        {/* locks created by credit products */}
        {p && creditLocks.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, flex: 'none' }}>
            <div className="row" style={{ height: 24, gap: 8 }}>
              <span style={{ fontSize: 15, fontWeight: 700, whiteSpace: 'nowrap' }}>دارایی‌های قفل‌شده برای اعتبار</span>
              <span className="num" style={{ marginRight: 'auto', fontSize: 12, fontWeight: 400, color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>جمع {money(creditLockedSum)}</span>
            </div>
            <div className="card" style={{ boxSizing: 'border-box', padding: '2px 16px', display: 'flex', flexDirection: 'column' }}>
              {creditLocks.map((l, i) => {
                const m = LOCK_META[l.type];
                const src = source(l);
                return (
                  <div key={l.id} style={{ padding: '10px 0', display: 'flex', flexDirection: 'column', gap: 6, borderBottom: `1px dashed ${i === creditLocks.length - 1 ? 'transparent' : 'var(--divider)'}` }}>
                    <div className="row" style={{ height: 22, gap: 8 }}>
                      <span className="lktype" style={{ background: m.bg, color: m.fg }}><Icon d={m.d} size={12} />{m.short}</span>
                      <span style={{ flex: 1, minWidth: 0, fontSize: 13, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{l.title}</span>
                      <span className="num" style={{ fontSize: 14, fontWeight: 500, whiteSpace: 'nowrap' }}>{money(l.amount)} <span style={{ fontSize: 10, fontWeight: 400, color: 'var(--text-secondary)' }}>تومان</span></span>
                    </div>
                    <span style={{ fontSize: 11, color: 'var(--text-secondary)', lineHeight: 1.5 }}>{releaseText(l)}</span>
                    <div className="row" style={{ height: 26, gap: 6 }}>
                      <Link href={routes.app.asset(l.holdingKind)} className="chip" style={{ height: 26, padding: '0 8px', borderRadius: 8, fontSize: 12, textDecoration: 'none' }}><Icon d={KIND_ICON[l.holdingKind] ?? CI.trend} size={14} />{holdingName(l.holdingKind)}</Link>
                      <Link href={src.href} className="chip" style={{ height: 26, padding: '0 8px', borderRadius: 8, fontSize: 12, background: 'var(--soft-primary)', color: 'var(--primary-text)', textDecoration: 'none' }}>{src.label}<Icon d={CI.chevL} size={14} /></Link>
                    </div>
                  </div>
                );
              })}
            </div>
            {otherLocked > 0 && (
              <Link href={routes.app.home} className="row" style={{ minHeight: 32, gap: 6, fontSize: 11, color: 'var(--text-secondary)', textDecoration: 'none', lineHeight: 1.5 }}>
                <Icon d={CI.info} size={14} />
                <span style={{ flex: 1 }}>{money(otherLocked)} تومان قفل دیگر (قفل زمانی و مرحله‌ای سازمان) در ظرفیت وثیقه حساب نمی‌شود</span>
                <Chev size={14} />
              </Link>
            )}
          </div>
        )}
      </Scr>

      <AppHeader title="اعتبار و تسهیلات" actions={<HeaderIconButton d={CI.info} label="راهنمای اعتبار" href={routes.app.support} first />} />
      <BottomNav active="credit" />
    </>
  );
}

function Product({ href, d, tone, title, sub, active }: { href: string; d: string; tone: 'primary' | 'secondary' | 'info'; title: string; sub: string; active?: boolean }) {
  return (
    <Link href={href} className="card" style={{ boxSizing: 'border-box', height: 68, padding: '0 14px', display: 'flex', alignItems: 'center', gap: 12, color: 'var(--text-primary)', textDecoration: 'none' }}>
      <span style={{ width: 40, height: 40, borderRadius: 12, background: TONE[tone][0], color: TONE[tone][1], display: 'grid', placeItems: 'center', flex: 'none' }}><Icon d={d} size={20} /></span>
      <span style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 3, lineHeight: 1.3 }}>
        <span style={{ fontSize: 14, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{title}</span>
        <span style={{ fontSize: 11, color: 'var(--text-secondary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{sub}</span>
      </span>
      {active && <span className="lbl" style={{ background: 'var(--soft-success)', color: 'var(--success-text)' }}>فعال</span>}
      <Chev />
    </Link>
  );
}
