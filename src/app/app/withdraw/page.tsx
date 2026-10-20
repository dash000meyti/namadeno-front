'use client';
/** /app/withdraw — design: app-withdraw (free part of the rial wallet → bank account, Paya). */
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { useBankAccounts, useHolding, useWithdraw } from '@/api/app';
import { AppHeader } from '@/components/app/AppHeader';
import { BottomNav } from '@/components/app/BottomNav';
import { ErrorState, Scr, Skeleton } from '@/components/app/Screen';
import { Icon } from '@/components/ui/Icon';
import { Sheet } from '@/components/ui/Sheet';
import { useToast } from '@/components/ui/Toast';
import { faDigits, money } from '@/lib/format';
import { routes } from '@/lib/routes';
import { now } from '@/lib/clock';
import type { BankAccount } from '@/types/domain';
import { D, amountText, parseAmount } from '@/components/app/money/lib';
import '@/components/app/money/money.css';

/** Next Paya settlement cycle (Tehran time) after the current time. */
function nextPayaCycle(): string {
  const parts = new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Asia/Tehran' }).format(now());
  const [h, m] = parts.split(':').map(Number);
  const cur = h * 60 + m;
  const cycles = ['04:45', '10:45', '13:45', '18:45'];
  const next = cycles.find((c) => { const [ch, cm] = c.split(':').map(Number); return ch * 60 + cm > cur; });
  return next ?? cycles[0];
}

const mask = (a: BankAccount) => 'IR•• •••• ' + faDigits(a.iban.slice(-4));

export default function WithdrawPage() {
  const router = useRouter();
  const toast = useToast();
  const hq = useHolding('rial');
  const banks = useBankAccounts();
  const withdraw = useWithdraw();
  const [amount, setAmount] = useState<number | null>(null);
  const [acctId, setAcctId] = useState<string | null>(null);
  const [sheet, setSheet] = useState(false);
  const [touched, setTouched] = useState(false);

  const header = <AppHeader title="برداشت به حساب بانکی" back={routes.app.asset('rial')} />;

  if (hq.isLoading || banks.isLoading || hq.isError || banks.isError || !hq.data) {
    return (
      <div className="pg-money">
        <Scr gap={12} style={{ paddingTop: 16, paddingBottom: 96 }}>
          {hq.isError || banks.isError ? (
            <ErrorState message={(hq.error ?? banks.error)?.message} onRetry={() => { void hq.refetch(); void banks.refetch(); }} />
          ) : (
            <>
              <Skeleton h={68} />
              <Skeleton h={98} />
              <Skeleton h={160} />
            </>
          )}
        </Scr>
        {header}
        <BottomNav active="assets" />
      </div>
    );
  }

  const h = hq.data.holding;
  const MAX = Math.max(0, Math.floor(h.free));
  const LOCKED = h.locked;
  const accounts = banks.data ?? [];
  const acct = accounts.find((a) => a.id === acctId) ?? accounts.find((a) => a.isDefault) ?? accounts[0];
  const amt = amount ?? Math.min(10_000_000, MAX);
  const chips: [string, number][] = [['۵ میلیون', 5_000_000], ['۱۰ میلیون', 10_000_000], ['همه', MAX]];
  const invalid = !acct ? 'ابتدا یک حساب بانکی به نام خودتان اضافه کنید.' : amt <= 0 ? 'مبلغ را وارد کنید.' : amt > MAX ? 'مبلغ از موجودی قابل برداشت بیشتر است.' : null;
  const cycle = faDigits(nextPayaCycle());
  const summary = [
    { k: 'مبلغ برداشت', v: money(amt) + ' تومان', w: 500, c: 'var(--text-primary)' },
    { k: 'کارمزد', v: 'رایگان', w: 700, c: 'var(--success-text)' },
    { k: 'مبلغ واریزی', v: money(amt) + ' تومان', w: 500, c: 'var(--text-primary)' },
    { k: 'موجودی آزاد پس از برداشت', v: money(Math.max(0, MAX - amt)) + ' تومان', w: 400, c: 'var(--text-secondary)' },
  ];

  const submit = () => {
    setTouched(true);
    if (invalid || withdraw.isPending || !acct) return;
    withdraw.mutate(
      { amount: amt, bankAccountId: acct.id },
      {
        onSuccess: (tx) => router.push(routes.app.receipt(tx.id)),
        onError: (e: unknown) => toast(e instanceof Error ? e.message : 'ثبت برداشت ناموفق بود', 'error'),
      },
    );
  };

  return (
    <div className="pg-money">
      <Scr gap={12} style={{ paddingTop: 16, paddingBottom: 96 }}>
        {/* source */}
        <div className="card" style={{ boxSizing: 'border-box', padding: '12px 14px', display: 'flex', alignItems: 'center', gap: 12, flex: 'none', backgroundImage: 'linear-gradient(135deg, rgb(var(--grey-500-rgb) / .14), transparent 60%)' }}>
          <span style={{ width: 40, height: 40, borderRadius: 12, background: 'var(--soft-default)', color: 'var(--default-text)', display: 'grid', placeItems: 'center', flex: 'none' }}><Icon d={D.wallet} size={20} /></span>
          <span style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 3, lineHeight: 1.3 }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)' }}>از کیف پول ریالی · قابل برداشت (آزاد)</span>
            <span className="num" style={{ fontSize: 20, whiteSpace: 'nowrap' }}>{money(MAX)} <span style={{ fontSize: 12, fontWeight: 400, color: 'var(--text-secondary)' }}>تومان</span></span>
          </span>
        </div>

        {/* destination */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, flex: 'none' }}>
          <span style={{ height: 24, display: 'flex', alignItems: 'center', fontSize: 15, fontWeight: 700 }}>حساب مقصد</span>
          {acct ? (
            <button className="card" onClick={() => setSheet(true)} aria-label="انتخاب حساب مقصد" aria-haspopup="dialog" style={{ width: '100%', boxSizing: 'border-box', padding: '12px 14px', display: 'flex', alignItems: 'center', gap: 12, color: 'var(--text-primary)', fontFamily: 'inherit', textAlign: 'right', cursor: 'pointer' }}>
              <span style={{ width: 44, height: 44, borderRadius: 12, background: 'var(--soft-primary)', color: 'var(--primary-text)', display: 'grid', placeItems: 'center', flex: 'none' }}><Icon name="bank" size={22} /></span>
              <span style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 4, lineHeight: 1.3 }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontSize: 14, fontWeight: 600, whiteSpace: 'nowrap' }}>{acct.bankName}</span>
                  {acct.isDefault && <span className="lbl" style={{ height: 20, fontSize: 11, background: 'var(--soft-default)', color: 'var(--default-text)' }}>پیش‌فرض</span>}
                </span>
                <span dir="ltr" className="num" style={{ fontSize: 13, fontWeight: 400, color: 'var(--text-secondary)', textAlign: 'right', whiteSpace: 'nowrap' }}>{mask(acct)}</span>
              </span>
              <span className="chip" style={{ height: 28, padding: '0 10px', borderRadius: 8, background: 'var(--soft-primary)', color: 'var(--primary-text)' }}>تغییر</span>
            </button>
          ) : (
            <Link href={routes.app.profile} className="card" style={{ boxSizing: 'border-box', padding: '12px 14px', display: 'flex', alignItems: 'center', gap: 12, color: 'var(--primary-text)', fontSize: 14, fontWeight: 600, textDecoration: 'none' }}>
              <Icon name="plus" size={20} />افزودن حساب بانکی
            </Link>
          )}
        </div>

        {/* amount */}
        <div className="card" style={{ boxSizing: 'border-box', padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 10, flex: 'none' }}>
          <label htmlFor="wd-amt" style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)' }}>مبلغ برداشت</label>
          <div style={{ height: 48, display: 'flex', alignItems: 'center', gap: 8, borderBottom: `1px solid ${touched && invalid ? 'var(--error-main)' : 'var(--divider)'}` }}>
            <input id="wd-amt" type="text" inputMode="numeric" dir="ltr" autoComplete="off" value={amountText(amt)} placeholder="۰" aria-invalid={!!(touched && invalid)} onChange={(e) => { setTouched(true); setAmount(parseAmount(e.target.value)); }} className="num" style={{ flex: 1, minWidth: 0, height: 44, border: 0, background: 'transparent', fontFamily: 'inherit', fontSize: 24, fontWeight: 300, color: 'var(--text-primary)', outline: 'none', padding: 0, textAlign: 'right' }} />
            <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>تومان</span>
          </div>
          {touched && invalid ? (
            <span role="alert" style={{ fontSize: 12, color: 'var(--error-text)' }}>{invalid}</span>
          ) : (
            <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>حداکثر <span className="num" style={{ fontWeight: 500, color: 'var(--text-primary)' }}>{money(MAX)}</span> تومان</span>
          )}
          {LOCKED > 0 && (
            <div style={{ minHeight: 28, display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--text-secondary)', marginTop: -8 }}>
              <Icon name="lock" size={12} />
              <span style={{ minWidth: 0 }}>قفل‌شده: <span className="num" style={{ fontWeight: 500, color: 'var(--text-primary)' }}>{money(LOCKED)}</span> — قابل برداشت نیست ·</span>
              <Link href={routes.app.asset('rial')} style={{ height: 28, display: 'inline-flex', alignItems: 'center', padding: '0 4px', margin: '0 -4px', fontWeight: 600 }}>چرا؟</Link>
            </div>
          )}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
            {chips.map(([label, v]) => {
              const a = amt === v;
              return (
                <button key={label} onClick={() => { setTouched(true); setAmount(v); }} aria-pressed={a} style={{ height: 36, borderRadius: 999, border: `1px solid ${a ? 'var(--primary-main)' : 'var(--outline-border)'}`, background: a ? 'var(--soft-primary)' : 'transparent', color: a ? 'var(--primary-text)' : 'var(--text-primary)', fontFamily: 'inherit', fontSize: 13, fontWeight: a ? 700 : 500, cursor: 'pointer', padding: 0, fontVariantNumeric: 'tabular-nums' }}>{label}</button>
              );
            })}
          </div>
        </div>

        {/* paya info */}
        <div style={{ boxSizing: 'border-box', padding: '10px 12px', borderRadius: 12, background: 'var(--soft-info)', display: 'flex', alignItems: 'center', gap: 10, flex: 'none' }}>
          <Icon name="clock" size={20} style={{ color: 'var(--info-text)' }} />
          <span style={{ flex: 1, minWidth: 0, fontSize: 13, lineHeight: 1.8, color: 'var(--text-primary)' }}>واریز در سیکل پایای بعدی (حدود <span dir="ltr" className="num" style={{ fontWeight: 500 }}>{cycle}</span>)</span>
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

        <button className="btn mn-cta" onClick={submit} disabled={withdraw.isPending || (touched && !!invalid)} style={{ width: '100%', height: 48, flex: 'none', background: 'var(--primary-main)', color: 'var(--primary-contrast)', boxShadow: 'var(--shadow-primary)', fontSize: 15 }}>
          {withdraw.isPending ? 'در حال ثبت…' : 'برداشت'}
        </button>
      </Scr>

      {header}
      <BottomNav active="assets" />

      <Sheet open={sheet} onClose={() => setSheet(false)} title="انتخاب حساب مقصد" padding="0 16px 28px">
        <div role="radiogroup" aria-label="حساب‌های بانکی" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {accounts.map((a) => {
            const on = a.id === acct?.id;
            return (
              <button key={a.id} role="radio" aria-checked={on} onClick={() => { setAcctId(a.id); setSheet(false); }} className="card" style={{ width: '100%', boxSizing: 'border-box', padding: '12px 14px', display: 'flex', alignItems: 'center', gap: 12, color: 'var(--text-primary)', fontFamily: 'inherit', textAlign: 'right', cursor: 'pointer', border: `1px solid ${on ? 'var(--primary-main)' : 'var(--glass-border)'}`, flex: 'none' }}>
                <span style={{ width: 22, height: 22, boxSizing: 'border-box', borderRadius: '50%', border: `2px solid ${on ? 'var(--primary-main)' : 'var(--grey-400)'}`, display: 'grid', placeItems: 'center', flex: 'none' }}>
                  <span style={{ width: 10, height: 10, borderRadius: '50%', background: on ? 'var(--primary-main)' : 'transparent' }} />
                </span>
                <span style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 4, lineHeight: 1.3 }}>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontSize: 14, fontWeight: 600, whiteSpace: 'nowrap' }}>{a.bankName}</span>
                    {a.isDefault && <span className="lbl" style={{ height: 20, fontSize: 11, background: 'var(--soft-default)', color: 'var(--default-text)' }}>پیش‌فرض</span>}
                  </span>
                  <span dir="ltr" className="num" style={{ fontSize: 13, fontWeight: 400, color: 'var(--text-secondary)', textAlign: 'right', whiteSpace: 'nowrap' }}>{mask(a)}</span>
                  <span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>به نام {a.ownerName}</span>
                </span>
              </button>
            );
          })}
        </div>
        <Link href={routes.app.profile} className="btn" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, boxSizing: 'border-box', border: '1px dashed var(--outline-border)', color: 'var(--primary-text)', textDecoration: 'none', flex: 'none' }}>
          <Icon name="plus" size={18} />مدیریت حساب‌های بانکی
        </Link>
      </Sheet>
    </div>
  );
}
