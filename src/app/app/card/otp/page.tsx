'use client';
import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { AppHeader } from '@/components/app/AppHeader';
import { BottomNav } from '@/components/app/BottomNav';
import { ErrorState, Scr, Skeleton } from '@/components/app/Screen';
import { Icon } from '@/components/ui/Icon';
import { useCard, useCardOtp, useMe } from '@/api/app';
import { useCardOtpSms } from '@/api/app-credit-extra';
import { routes } from '@/lib/routes';
import { faDigits } from '@/lib/format';
import { CI } from '@/components/app/credit/icons';
import { CardStatusLabel, last4, LogoChip } from '@/components/app/credit/CardVisual';
import { ApiErrorNotice } from '@/components/app/credit/ui';

const RING = 478;

export default function CardOtpPage() {
  const card = useCard();
  const me = useMe();
  const otp = useCardOtp();
  const sms = useCardOtpSms();
  const [left, setLeft] = useState(0);
  const [ttl, setTtl] = useState(60);
  const [copied, setCopied] = useState(false);

  const { mutate } = otp;
  const renew = useCallback(() => {
    setCopied(false);
    sms.reset();
    mutate(undefined, { onSuccess: (r) => { setTtl(r.expiresIn); setLeft(r.expiresIn); } });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mutate]);

  useEffect(() => { renew(); }, [renew]);
  useEffect(() => {
    if (left <= 0) return;
    const t = setTimeout(() => setLeft((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [left]);

  const code = otp.data?.code;
  const expired = !!code && left <= 0;
  const codeFa = code ? faDigits(`${code.slice(0, 3)} ${code.slice(3)}`) : '––– –––';
  const timer = faDigits(`${String(Math.floor(left / 60)).padStart(2, '0')}:${String(left % 60).padStart(2, '0')}`);
  const dash = ttl ? Math.round((RING * Math.max(0, left)) / ttl) : 0;

  const copy = async () => {
    if (!code || expired) return;
    try { await navigator.clipboard.writeText(code); } catch { /* clipboard unavailable */ }
    setCopied(true);
  };

  const m = me.data?.mobile ?? '';
  const mobileFa = m ? faDigits(`${m.slice(0, 4)} ${m.slice(4, 7)} ${m.slice(7)}`) : '';

  const notes = [
    { d: CI.clock, text: `هر رمز فقط یک‌بار و تا ${faDigits(ttl)} ثانیه معتبر است.` },
    { d: CI.shield, text: 'رمز را با هیچ‌کس، حتی پشتیبانی نمادنو، به اشتراک نگذارید.' },
    { d: CI.globe, text: 'برای خرید اینترنتی، این رمز را در فیلد «رمز دوم» درگاه وارد کنید.' },
  ];

  return (
    <>
      <Scr gap={12}>
        {card.isLoading && <Skeleton h={300} />}
        {card.isError && <ErrorState message={card.error?.message} onRetry={() => card.refetch()} />}
        {card.data && (
          <>
            {/* otp card */}
            <div className="card" style={{ boxSizing: 'border-box', padding: 16, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12, flex: 'none', textAlign: 'center' }}>
              <div className="row" style={{ width: '100%', height: 40, gap: 10 }}>
                <LogoChip />
                <span className="col" style={{ flex: 1, gap: 2, lineHeight: 1.3, alignItems: 'flex-start' }}><span style={{ fontSize: 14, fontWeight: 700 }}>کارت نمادنو</span><span className="num" dir="ltr" style={{ fontSize: 12, color: 'var(--text-secondary)' }}>•••• {last4(card.data)}</span></span>
                <CardStatusLabel card={card.data} />
              </div>
              <div style={{ position: 'relative', width: 168, height: 168 }}>
                <svg viewBox="0 0 168 168" width="168" height="168" aria-hidden="true" style={{ display: 'block' }}>
                  <circle cx="84" cy="84" r="76" fill="none" style={{ stroke: 'var(--ring-track)' }} strokeWidth="8" />
                  <circle cx="84" cy="84" r="76" fill="none" style={{ stroke: 'var(--chart-1)', transition: 'stroke-dasharray 1s linear' }} strokeWidth="8" strokeLinecap="round" strokeDasharray={`${dash} ${RING}`} transform="rotate(-90 84 84)" />
                </svg>
                <span style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 6, lineHeight: 1 }}>
                  <span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>{expired ? 'رمز منقضی شد' : 'رمز پویا'}</span>
                  <span dir="ltr" className="num" aria-live="polite" style={{ fontSize: 36, letterSpacing: '.12em', whiteSpace: 'nowrap', opacity: expired || otp.isPending ? 0.35 : 1 }}>{codeFa}</span>
                  <span className="lbl" style={{ background: expired ? 'var(--soft-error)' : 'var(--soft-warning)', color: expired ? 'var(--error-text)' : 'var(--warning-text)', gap: 4 }}><Icon d={CI.clock} size={12} /><span dir="ltr" className="num">{timer}</span></span>
                </span>
              </div>
              <div style={{ width: '100%', height: 44, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                <button type="button" className="btn" onClick={copy} aria-pressed={copied} disabled={!code || expired}
                  style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6, background: copied ? 'var(--success-main)' : 'var(--primary-main)', color: copied ? 'var(--success-contrast)' : 'var(--primary-contrast)', boxShadow: copied ? 'none' : 'var(--shadow-primary)', padding: 0, opacity: !code || expired ? 0.45 : 1 }}>
                  <Icon d={copied ? CI.check2 : CI.copy} size={18} />{copied ? 'کپی شد' : 'کپی'}
                </button>
                <button type="button" className="btn" onClick={renew} disabled={otp.isPending} style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6, border: '1px solid var(--outline-border)', background: 'transparent', color: 'var(--text-primary)', padding: 0 }}>
                  <Icon d={CI.refresh} size={18} />رمز جدید
                </button>
              </div>
            </div>
            <ApiErrorNotice error={otp.error} />

            {/* sms */}
            <div className="card" style={{ boxSizing: 'border-box', height: 64, padding: '0 12px 0 16px', display: 'flex', alignItems: 'center', gap: 10, flex: 'none' }}>
              <span style={{ width: 36, height: 36, borderRadius: '50%', background: 'var(--soft-secondary)', color: 'var(--secondary-text)', display: 'grid', placeItems: 'center', flex: 'none' }}><Icon d={CI.sms} size={18} /></span>
              <span className="col" style={{ flex: 1, gap: 2, lineHeight: 1.3 }}><span style={{ fontSize: 13, fontWeight: 600 }}>ارسال پیامکی</span><span className="num" style={{ fontSize: 11, color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>به شماره <span dir="ltr">{mobileFa}</span></span></span>
              {sms.isSuccess
                ? <span className="lbl" style={{ height: 28, background: 'var(--soft-success)', color: 'var(--success-text)', gap: 4 }}><Icon d={CI.check2} size={12} />ارسال شد</span>
                : <button type="button" onClick={() => sms.mutate()} disabled={sms.isPending || !code || expired} className="btn" style={{ height: 36, background: 'var(--soft-primary)', color: 'var(--primary-text)', padding: '0 14px', fontSize: 13, opacity: !code || expired ? 0.5 : 1 }}>{sms.isPending ? '…' : 'ارسال'}</button>}
            </div>

            {/* notes */}
            <div className="card" style={{ boxSizing: 'border-box', padding: '8px 16px 4px', display: 'flex', flexDirection: 'column', flex: 'none' }}>
              {notes.map((nt, i) => (
                <div key={nt.text} className="row" style={{ minHeight: 40, gap: 10, borderBottom: `1px dashed ${i === notes.length - 1 ? 'transparent' : 'var(--divider)'}`, padding: '4px 0' }}>
                  <span style={{ width: 28, height: 28, borderRadius: '50%', background: 'var(--soft-default)', color: 'var(--default-text)', display: 'grid', placeItems: 'center', flex: 'none' }}><Icon d={nt.d} size={15} /></span>
                  <span style={{ flex: 1, fontSize: 12, lineHeight: 1.5, color: 'var(--text-secondary)' }}>{nt.text}</span>
                </div>
              ))}
            </div>

            <Link href={routes.app.support} style={{ height: 40, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4, fontSize: 14, fontWeight: 600, color: 'var(--primary-text)', textDecoration: 'none', flex: 'none' }}><Icon d={CI.chevL} size={16} />مشکل در دریافت رمز؟</Link>
          </>
        )}
      </Scr>

      <AppHeader title="رمز پویا" back={routes.app.card} />
      <BottomNav active="card" />
    </>
  );
}
