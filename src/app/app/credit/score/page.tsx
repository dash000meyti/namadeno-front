'use client';
import { useState } from 'react';
import { AppHeader } from '@/components/app/AppHeader';
import { BottomNav } from '@/components/app/BottomNav';
import { ErrorState, Scr, Skeleton } from '@/components/app/Screen';
import { Icon } from '@/components/ui/Icon';
import { useCredit, usePortfolio } from '@/api/app';
import { useCreditExtra } from '@/api/app-credit-extra';
import { routes } from '@/lib/routes';
import { faDigits, jDayMonth, money, percent } from '@/lib/format';
import { CI, TONE } from '@/components/app/credit/icons';
import { IMPACT, SCORE_BAND, scoreRatio } from '@/components/app/credit/meta';
import { pct1 } from '@/components/app/credit/ui';

const FACTOR_ICONS = [CI.gift, CI.layers, CI.scale, CI.calendar];
const BANDS = [
  { label: 'ضعیف', c: 'var(--error-text)' },
  { label: 'متوسط', c: 'var(--warning-text)' },
  { label: 'خوب', c: 'var(--text-secondary)' },
  { label: 'عالی', c: 'var(--success-text)' },
];

export default function ScorePage() {
  const credit = useCredit();
  const pf = usePortfolio();
  const extra = useCreditExtra();
  const [open, setOpen] = useState(0);

  const c = credit.data;
  const p = pf.data;
  const band = c ? SCORE_BAND[c.scoreBand] : undefined;
  const creditLocked = p ? p.holdings.flatMap((h) => h.locks).filter((l) => l.type === 'collateral' || l.type === 'installment').reduce((s, l) => s + l.amount, 0) : 0;
  const ratio = p && p.total ? (creditLocked / p.total) * 100 : 0;

  const tips = [
    { title: 'اقساط را قبل از سررسید بپردازید', body: 'پرداخت خودکار از کیف پول ریالی را فعال کنید؛ هر قسط به‌موقع تا ۵ امتیاز اضافه می‌کند.' },
    { title: 'نسبت وثیقه را پایین نگه دارید', body: `اکنون ${money(creditLocked)} تومان (${percent(ratio, 1)} دارایی) به‌عنوان «وثیقه اعتبار و وام» و «وثیقه خرید اقساطی» قفل است. زیر ۱۵٪، این عامل «مثبت» می‌شود. قفل زمانی و مرحله‌ای سازمان در این نسبت حساب نمی‌شود.` },
    { title: 'دارایی‌ها را متنوع کنید', body: 'نگه‌داشتن هم‌زمان صندوق طلا و درآمد ثابت، ریسک پرتفوی شما را کم و امتیاز را بالا می‌برد.' },
  ];

  return (
    <>
      <Scr gap={8}>
        {credit.isLoading && <><Skeleton h={132} /><Skeleton h={78} /><Skeleton h={196} /></>}
        {credit.isError && <ErrorState onRetry={() => credit.refetch()} />}
        {c && band && (
          <>
            {/* score ring */}
            <div className="card" style={{ boxSizing: 'border-box', height: 132, padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 16, flex: 'none' }}>
              <div style={{ position: 'relative', width: 108, height: 108, flex: 'none' }}>
                <svg viewBox="0 0 108 108" width="108" height="108" aria-hidden="true" style={{ display: 'block' }}>
                  <circle cx="54" cy="54" r="47" fill="none" style={{ stroke: 'var(--ring-track)' }} strokeWidth="10" />
                  <circle cx="54" cy="54" r="47" fill="none" style={{ stroke: 'var(--chart-1)' }} strokeWidth="10" strokeLinecap="round" strokeDasharray={`${Math.round(scoreRatio(c.score) * 296)} 296`} transform="rotate(-90 54 54)" />
                </svg>
                <span style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', lineHeight: 1.1 }}>
                  <span className="num" style={{ fontSize: 30 }}>{faDigits(c.score)}</span>
                  <span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>از ۹۰۰</span>
                </span>
              </div>
              <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 6 }}>
                <span className="row" style={{ gap: 8, height: 24 }}><span style={{ fontSize: 15, fontWeight: 700 }}>امتیاز اعتباری</span><span className="lbl" style={{ background: TONE[band.tone][0], color: TONE[band.tone][1] }}>{band.label}</span></span>
                <span className="num" style={{ fontSize: 12, fontWeight: 400, color: c.scoreChange >= 0 ? 'var(--success-text)' : 'var(--error-text)', display: 'flex', alignItems: 'center', gap: 4, whiteSpace: 'nowrap' }}>
                  <Icon d={CI.trend} size={14} style={c.scoreChange < 0 ? { transform: 'scaleY(-1)' } : undefined} />
                  {c.scoreChange >= 0 ? '+' : '−'}{faDigits(Math.abs(c.scoreChange))} نسبت به ماه قبل
                </span>
                {extra.data && <span style={{ fontSize: 11, color: 'var(--text-secondary)', lineHeight: 1.4, whiteSpace: 'nowrap' }}>آخرین به‌روزرسانی: {jDayMonth(extra.data.scoreUpdatedAt, true)}</span>}
                {extra.data && <span style={{ fontSize: 11, color: 'var(--text-secondary)', lineHeight: 1.4, whiteSpace: 'nowrap' }}>به‌روزرسانی بعدی: {jDayMonth(extra.data.scoreNextUpdateAt)}</span>}
              </div>
            </div>

            {/* scale */}
            <div className="card" style={{ boxSizing: 'border-box', height: 78, padding: '10px 16px', display: 'flex', flexDirection: 'column', gap: 8, flex: 'none' }}>
              <div className="row" style={{ height: 18, gap: 8, lineHeight: 1 }}>
                <span style={{ fontSize: 13, fontWeight: 600 }}>بازه امتیاز</span>
                <span className="num" style={{ marginRight: 'auto', fontSize: 11, fontWeight: 400, color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>۳۰۰ تا ۹۰۰</span>
              </div>
              <div dir="ltr" style={{ position: 'relative', height: 22 }} role="img" aria-label={`امتیاز ${faDigits(c.score)} از ۹۰۰`}>
                <span style={{ position: 'absolute', top: 7, left: 0, right: 0, height: 8, borderRadius: 4, background: 'linear-gradient(90deg, var(--error-main) 0%, var(--warning-main) 40%, var(--success-light) 70%, var(--success-main) 100%)' }} />
                <span style={{ position: 'absolute', top: 0, left: `calc(${pct1(scoreRatio(c.score))}% - 11px)`, width: 22, height: 22, boxSizing: 'border-box', borderRadius: '50%', background: '#FFFFFF', border: '3px solid var(--primary-main)', boxShadow: 'var(--shadow-z8)' }} />
              </div>
              <div dir="ltr" style={{ height: 12, display: 'flex', fontSize: 10, lineHeight: 1, color: 'var(--text-secondary)', fontWeight: 600 }}>
                {BANDS.map((b) => <span key={b.label} style={{ flex: 25, textAlign: 'center', whiteSpace: 'nowrap', color: b.c }}>{b.label}</span>)}
              </div>
            </div>

            {/* factors */}
            <div className="card" style={{ boxSizing: 'border-box', padding: '8px 16px 4px', display: 'flex', flexDirection: 'column', flex: 'none' }}>
              <div className="row" style={{ height: 24, gap: 8 }}>
                <span style={{ fontSize: 14, fontWeight: 700 }}>عوامل مؤثر</span>
                <span style={{ marginRight: 'auto', fontSize: 11, color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>{faDigits(c.factors.length)} عامل</span>
              </div>
              {c.factors.map((f, i) => {
                const im = IMPACT[f.impact];
                return (
                  <div key={f.title} className="row" title={f.note} style={{ height: 40, gap: 10, borderBottom: `1px dashed ${i === c.factors.length - 1 ? 'transparent' : 'var(--divider)'}` }}>
                    <span style={{ width: 28, height: 28, borderRadius: '50%', background: 'var(--soft-default)', color: 'var(--default-text)', display: 'grid', placeItems: 'center', flex: 'none' }}><Icon d={FACTOR_ICONS[i % FACTOR_ICONS.length]} size={15} /></span>
                    <span style={{ flex: 1, minWidth: 0, fontSize: 13, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{f.title}</span>
                    <span className="lbl" style={{ height: 22, background: TONE[im.tone][0], color: TONE[im.tone][1] }}>{im.label}</span>
                  </div>
                );
              })}
            </div>

            {/* how to improve */}
            <div className="card" style={{ boxSizing: 'border-box', padding: '8px 16px 4px', display: 'flex', flexDirection: 'column', flex: 'none' }}>
              <div className="row" style={{ height: 24, gap: 8 }}><span style={{ fontSize: 14, fontWeight: 700 }}>چطور بالا ببرم؟</span></div>
              {tips.map((t, i) => {
                const isOpen = open === i;
                return (
                  <div key={t.title} style={{ display: 'flex', flexDirection: 'column', borderBottom: `1px dashed ${i === tips.length - 1 ? 'transparent' : 'var(--divider)'}` }}>
                    <button type="button" onClick={() => setOpen(isOpen ? -1 : i)} aria-expanded={isOpen} style={{ height: 40, border: 0, background: 'transparent', padding: 0, display: 'flex', alignItems: 'center', gap: 10, color: 'var(--text-primary)', fontFamily: 'inherit', textAlign: 'right', cursor: 'pointer' }}>
                      <span style={{ width: 22, height: 22, borderRadius: 6, background: 'var(--soft-primary)', color: 'var(--primary-text)', display: 'grid', placeItems: 'center', fontSize: 11, fontWeight: 700, flex: 'none' }}>{faDigits(i + 1)}</span>
                      <span style={{ flex: 1, minWidth: 0, fontSize: 13, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{t.title}</span>
                      <Icon d={CI.chevD} size={18} style={{ color: 'var(--text-disabled)', transform: `rotate(${isOpen ? 180 : 0}deg)`, transition: 'transform .2s ease' }} />
                    </button>
                    {isOpen && <span style={{ padding: '0 32px 10px 0', fontSize: 12, lineHeight: 1.6, color: 'var(--text-secondary)' }}>{t.body}</span>}
                  </div>
                );
              })}
            </div>
          </>
        )}
      </Scr>

      <AppHeader title="امتیاز اعتباری" back={routes.app.credit} />
      <BottomNav active="credit" />
    </>
  );
}
