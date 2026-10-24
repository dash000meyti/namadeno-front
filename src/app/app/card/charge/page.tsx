'use client';
import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { AppHeader } from '@/components/app/AppHeader';
import { BottomNav } from '@/components/app/BottomNav';
import { ErrorState, Scr, Skeleton } from '@/components/app/Screen';
import { Icon } from '@/components/ui/Icon';
import { useToast } from '@/components/ui/Toast';
import { useCard, useChargeCard, useMe, usePortfolio } from '@/api/app';
import { useCreditExtra } from '@/api/app-credit-extra';
import { LOCK_META } from '@/lib/locks';
import { routes } from '@/lib/routes';
import { jDayMonth, money } from '@/lib/format';
import { CI } from '@/components/app/credit/icons';
import { AmountChips, AmountField, ApiErrorNotice, KvRows, KycBanner, pct1, PrimaryButton } from '@/components/app/credit/ui';

export default function CardChargePage() {
  const router = useRouter();
  const toast = useToast();
  const me = useMe();
  const card = useCard();
  const pf = usePortfolio();
  const extra = useCreditExtra();
  const charge = useChargeCard();
  const [amtState, setAmt] = useState<number | null>(null);

  const c = card.data;
  const x = extra.data;
  const avail = c ? Math.max(0, c.creditLimit - c.creditUsed) : 0;
  const amt = amtState ?? Math.min(10_000_000, avail);

  // collateral needed: card usage above the unsecured allowance is locked from FREE rial, then gold
  const unsecured = x?.cardUnsecuredLimit ?? 0;
  const lockNow = x?.cardLocked ?? 0;
  const lockAfter = c ? Math.max(lockNow, Math.max(0, c.creditUsed + amt - unsecured)) : 0;
  const lockInc = lockAfter - lockNow;
  let need = lockInc;
  const lockSrc = (x?.cardLockSources ?? ['rial', 'gold']).map((k) => {
    const h = pf.data?.holdings.find((y) => y.kind === k);
    const take = h ? Math.min(h.free, need) : 0;
    need -= take;
    return { kind: k, title: h?.name ?? k, take, after: (h?.free ?? 0) - take };
  }).filter((s) => s.take > 0);
  const lockShort = need > 0;
  const rial = pf.data?.holdings.find((h) => h.kind === 'rial');

  const invalid = amt <= 0 || amt > avail;
  const submit = () => {
    if (invalid || lockShort) return;
    charge.mutate(amt, {
      onSuccess: (r) => {
        toast(`کارت ${money(amt)} تومان شارژ شد`);
        router.push(routes.app.receipt(r.transaction.id));
      },
    });
  };

  return (
    <>
      <Scr gap={10}>
        {me.data && me.data.kycLevel < 2 && <KycBanner text="شارژ کارت از اعتبار پس از تکمیل احراز هویت پایه (ثبت احوال) فعال می‌شود." />}
        {card.isLoading && <><Skeleton h={100} /><Skeleton h={134} /></>}
        {card.isError && <ErrorState message={card.error?.message} onRetry={() => card.refetch()} />}

        {c && (
          <>
            {/* available credit */}
            <div className="card" style={{ boxSizing: 'border-box', height: 100, padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: 6, flex: 'none' }}>
              <div className="row" style={{ height: 18, gap: 8, lineHeight: 1 }}>
                <span style={{ fontSize: 13, fontWeight: 600 }}>اعتبار در دسترس</span>
                <span className="num" style={{ marginRight: 'auto', fontSize: 11, fontWeight: 400, color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>استفاده‌شده {money(c.creditUsed)} از {money(c.creditLimit)}</span>
              </div>
              <span className="num" style={{ fontSize: 24, lineHeight: 1.1, whiteSpace: 'nowrap' }}>{money(avail)} <span style={{ fontSize: 12, fontWeight: 400, color: 'var(--text-secondary)' }}>تومان</span></span>
              <div dir="ltr" style={{ height: 6, borderRadius: 999, background: 'var(--progress-track)', overflow: 'hidden', display: 'flex' }}>
                <span style={{ display: 'block', width: `${pct1(c.creditUsed / c.creditLimit)}%`, height: '100%', background: 'var(--primary-main)' }} />
                <span style={{ display: 'block', width: `${pct1(Math.min(amt, avail) / c.creditLimit)}%`, height: '100%', background: 'var(--primary-light)', opacity: 0.7 }} />
              </div>
              <span className="num" style={{ fontSize: 11, color: 'var(--text-secondary)', lineHeight: 1.3, whiteSpace: 'nowrap' }}>پس از شارژ: اعتبار باقی‌مانده {money(Math.max(0, avail - amt))} تومان</span>
            </div>

            {/* amount */}
            <div className="card" style={{ boxSizing: 'border-box', height: invalid && amt > 0 ? 'auto' : 134, padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: 8, flex: 'none' }}>
              <label htmlFor="chg-amt" style={{ height: 18, fontSize: 13, fontWeight: 600, lineHeight: 1 }}>مبلغ شارژ</label>
              <AmountField id="chg-amt" label="مبلغ شارژ" value={amt} onChange={setAmt} invalid={amt > avail} />
              <AmountChips value={amt} onPick={setAmt} items={[{ id: 5_000_000, label: '۵٬۰۰۰٬۰۰۰' }, { id: 10_000_000, label: '۱۰٬۰۰۰٬۰۰۰' }, { id: 20_000_000, label: '۲۰٬۰۰۰٬۰۰۰' }, { id: avail, label: 'حداکثر' }]} />
              {amt > avail && <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--error-text)' }}>مبلغ از اعتبار در دسترس بیشتر است.</span>}
            </div>

            {/* resulting collateral reserve */}
            <div className="card" style={{ boxSizing: 'border-box', padding: '10px 16px', display: 'flex', flexDirection: 'column', gap: 6, flex: 'none', background: 'rgb(var(--info-main-rgb) / .06)' }}>
              <div className="row" style={{ height: 22, gap: 8 }}>
                <span style={{ fontSize: 13, fontWeight: 600 }}>افزایش رزرو پشتوانه</span>
                <span className="lktype" style={{ marginRight: 'auto', background: LOCK_META.collateral.bg, color: LOCK_META.collateral.fg }}><Icon d={LOCK_META.collateral.d} size={12} />{LOCK_META.collateral.label}</span>
              </div>
              <div className="row" style={{ height: 26, gap: 8 }}>
                <span className="num" style={{ fontSize: 18, whiteSpace: 'nowrap', color: 'var(--info-text)' }}>+{money(lockInc)} <span style={{ fontSize: 11, fontWeight: 400, color: 'var(--text-secondary)' }}>تومان</span></span>
                <span className="num" style={{ marginRight: 'auto', fontSize: 11, color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>رزرو کارت {money(lockNow)} ← {money(lockAfter)}</span>
              </div>
              {lockSrc.map((s) => (
                <div key={s.kind} className="row" style={{ height: 20, gap: 6, fontSize: 12, whiteSpace: 'nowrap' }}>
                  <span className="num" style={{ fontWeight: 600 }}>{money(s.take)}</span><span style={{ color: 'var(--text-secondary)' }}>از {s.title}</span>
                  <span className="num" style={{ marginRight: 'auto', fontSize: 11, color: 'var(--text-secondary)' }}>آزاد پس از آن {money(s.after)}</span>
                </div>
              ))}
              {lockShort && <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--error-text)', lineHeight: 1.5 }}>دارایی آزاد شما برای پشتوانه‌ی این مبلغ کافی نیست؛ مبلغ کمتری انتخاب کنید.</span>}
              <span style={{ fontSize: 11, color: 'var(--text-secondary)', lineHeight: 1.5 }}>تا {money(unsecured)} مصرف بر پایه‌ی امتیاز اعتباری شماست و پشتوانه نمی‌خواهد؛ بیش از آن، به همان اندازه از دارایی آزاد رزرو و با تسویه‌ی صورت‌حساب دوباره آزاد می‌شود.</span>
            </div>

            {/* settlement */}
            <div className="card" style={{ boxSizing: 'border-box', height: 60, padding: '0 16px', display: 'flex', alignItems: 'center', gap: 10, flex: 'none' }}>
              <span style={{ width: 36, height: 36, borderRadius: '50%', background: 'var(--soft-default)', color: 'var(--default-text)', display: 'grid', placeItems: 'center', flex: 'none' }}><Icon d={CI.refresh} size={18} /></span>
              <span className="col" style={{ flex: 1, gap: 2, lineHeight: 1.3 }}><span style={{ fontSize: 13, fontWeight: 600 }}>تسویه خودکار</span><span className="num" style={{ fontSize: 11, color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>{jDayMonth(c.statementDue)} · از کیف پول ریالی (آزاد {money(rial?.free ?? 0)})</span></span>
              <Link href={routes.app.cardSettings} className="lbl" style={{ height: 28, background: 'var(--soft-primary)', color: 'var(--primary-text)', textDecoration: 'none' }}>تغییر</Link>
            </div>

            <div role="status" style={{ minHeight: 44, boxSizing: 'border-box', padding: '6px 12px', borderRadius: 12, background: 'var(--soft-success)', color: 'var(--success-text)', display: 'flex', alignItems: 'center', gap: 8, flex: 'none' }}><Icon d={CI.checkCircle} size={18} /><span style={{ fontSize: 12, fontWeight: 500, lineHeight: 1.5 }}>بدون کارمزد تا ۳۰ روز · پس از آن ۲٫۵٪ ماهانه روی مانده تسویه‌نشده</span></div>

            {/* summary */}
            <div className="card" style={{ boxSizing: 'border-box', padding: '0 16px', display: 'flex', flexDirection: 'column', flex: 'none' }}>
              <KvRows h={34} rows={[
                { k: 'مبلغ شارژ', v: money(amt), u: 'تومان' },
                { k: 'کارمزد', v: '۰', u: 'تومان' },
                { k: 'رزرو پشتوانه‌ی کارت پس از شارژ', v: money(lockAfter), u: 'تومان' },
                { k: 'موجودی کارت پس از شارژ', v: money(c.balance + amt), u: 'تومان' },
              ]} />
            </div>

            <ApiErrorNotice error={charge.error} />
            <PrimaryButton d={CI.bolt} onClick={submit} disabled={invalid || lockShort || c.status === 'blocked'} busy={charge.isPending}>شارژ کارت</PrimaryButton>
          </>
        )}
      </Scr>

      <AppHeader title="شارژ کارت از اعتبار" back={routes.app.card} />
      <BottomNav active="card" />
    </>
  );
}
