'use client';
/** «احراز هویت» (design: app-kyc) — 3 level cards; L2 birth date → civil registry; L3 SEJAM OTP. */
import { useState } from 'react';
import { useKycLevel2, useKycLevel3Otp, useKycLevel3Verify, useMe } from '@/api/app';
import { useKycDetails } from '@/api/app-core-extra';
import { AppHeader } from '@/components/app/AppHeader';
import { BottomNav } from '@/components/app/BottomNav';
import { Scr, Skeleton } from '@/components/app/Screen';
import { Icon } from '@/components/ui/Icon';
import { DatePickerButton } from '@/components/ui/DateInput';
import { useToast } from '@/components/ui/Toast';
import { OtpBoxes } from '@/components/app/core/auth';
import { P } from '@/components/app/core/meta';
import { ErrorNote } from '@/components/app/core/ui';
import { enDigits, faDigits } from '@/lib/format';
import { isMocking, now } from '@/lib/clock';
import { jalaliToIsoAny } from '@/lib/jalali';
import { routes } from '@/lib/routes';

const FA = '۰۱۲۳';
const TAG: Record<number, [string, string, string]> = {
  1: ['پایه', 'var(--soft-warning)', 'var(--warning-text)'],
  2: ['میانی', 'var(--soft-info)', 'var(--info-text)'],
  3: ['کامل', 'var(--soft-success)', 'var(--success-text)'],
};
const HINT: Record<number, string> = {
  1: 'برای استفاده از سرویس‌های اعتباری (اعتبار کارت، وام، خرید اقساطی)، سطح ۲ را کامل کنید.',
  2: 'برای خرید و فروش صندوق‌ها، سطح ۳ (سجام) را کامل کنید.',
  3: 'احراز هویت شما کامل است و به همه امکانات نمادنو دسترسی دارید.',
};
const DEF = [
  { n: 1, title: 'تطبیق شاهکار', source: 'شماره موبایل و کد ملی', desc: 'بررسی می‌شود شماره موبایل به نام صاحب کد ملی باشد. این سطح هنگام ثبت‌نام انجام شده است.', unlocks: ['مشاهده دارایی‌ها', 'دریافت بسته‌های سازمان'] },
  { n: 2, title: 'هویت پایه', source: 'کد ملی و تاریخ تولد · ثبت احوال', desc: 'با کد ملی و تاریخ تولد، اطلاعات هویتی شما از ثبت احوال استعلام می‌شود. برای سرویس‌های اعتباری لازم است.', unlocks: ['اعتبار کارت نمادنو', 'وام', 'خرید اقساطی'] },
  { n: 3, title: 'احراز سجام', source: 'سامانه جامع اطلاعات مشتریان بازار سرمایه', desc: 'اطلاعات سجامی شما (کد معاملاتی، حساب بانکی، نشانی) دریافت می‌شود. برای خرید و فروش صندوق‌ها لازم است.', unlocks: ['خرید و فروش صندوق'] },
];

const mask = (s: string) => faDigits(s.slice(0, 4)) + '•••' + faDigits(s.slice(-4));
/** «13700512» → «1370/05/12» while typing */
const BIRTH_MIN = jalaliToIsoAny(1300, 1, 1) ?? undefined;
const fmtBirth = (digits: string) => [digits.slice(0, 4), digits.slice(4, 6), digits.slice(6, 8)].filter(Boolean).join('/');

function InfoRows({ rows, bg = 'var(--bg-neutral)' }: { rows: [string, string][]; bg?: string }) {
  return (
    <div style={{ padding: '0 12px', borderRadius: 12, background: bg, display: 'flex', flexDirection: 'column' }}>
      {rows.map(([k, v], i) => (
        <div key={k} style={{ minHeight: 36, display: 'flex', alignItems: 'center', gap: 10, borderBottom: `1px dashed ${i === rows.length - 1 ? 'transparent' : 'var(--divider)'}` }}>
          <span style={{ fontSize: 12.5, color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>{k}</span>
          <span className="num" style={{ marginRight: 'auto', fontSize: 13, fontWeight: 500, whiteSpace: 'nowrap', unicodeBidi: v.includes('•') ? 'isolate' : undefined, direction: v.includes('•') ? 'ltr' : undefined }}>{v}</span>
        </div>
      ))}
    </div>
  );
}

const btnStyle = (enabled: boolean) => ({ height: 48, width: '100%', boxSizing: 'border-box', border: 0, borderRadius: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, background: 'var(--primary-main)', color: 'var(--primary-contrast)', fontFamily: 'inherit', fontSize: 15, fontWeight: 700, cursor: 'pointer', boxShadow: enabled ? 'var(--shadow-primary)' : 'none', opacity: enabled ? 1 : 0.48 } as const);

export default function KycPage() {
  const toast = useToast();
  const me = useMe();
  const details = useKycDetails();
  const l2 = useKycLevel2();
  const l3otp = useKycLevel3Otp();
  const l3 = useKycLevel3Verify();

  const [birth, setBirth] = useState('');
  const [l2Result, setL2Result] = useState<{ fullName: string; fatherName: string; registryOffice: string; birthDate: string } | null>(null);
  const [sejamStep, setSejamStep] = useState<'intro' | 'otp'>('intro');
  const [sejamCode, setSejamCode] = useState('');
  const [devCode, setDevCode] = useState<string | undefined>();

  const serverLvl = me.data?.kycLevel ?? 1;
  // while the registry result is shown for confirmation, level 2 is not «done» yet on this screen
  const lvl = l2Result ? 1 : serverLvl;
  const tag = TAG[lvl];
  const birthOk = /^1[34]\d{2}\/(0[1-9]|1[0-2])\/(0[1-9]|[12]\d|3[01])$/.test(birth);

  const inquiry = () => {
    if (!birthOk) return;
    l2.mutate({ birthDate: birth }, {
      onSuccess: (r) => setL2Result({ fullName: r.fullName, fatherName: r.fatherName, registryOffice: r.registryOffice, birthDate: birth }),
    });
  };
  const confirmL2 = () => { setL2Result(null); setBirth(''); toast('احراز هویت سطح ۲ کامل شد'); };
  const sendSejam = () => l3otp.mutate(undefined, { onSuccess: (r) => { setDevCode(r.devCode); setSejamStep('otp'); setSejamCode(''); } });
  const confirmL3 = (code = sejamCode) => {
    if (code.length < 5) return;
    l3.mutate(code, { onSuccess: () => { toast('احراز هویت سطح ۳ کامل شد'); setSejamStep('intro'); setSejamCode(''); } });
  };

  const d = details.data;
  const doneRows: Record<number, [string, string][]> = {
    1: [['شماره موبایل', me.data ? mask(me.data.mobile) : ''], ['کد ملی', me.data ? mask(me.data.nationalId) : '']],
    2: [['نام و نام خانوادگی', d?.fullName ?? me.data?.fullName ?? ''], ['نام پدر', d?.fatherName ?? '—'], ['تاریخ تولد', faDigits(d?.birthDate ?? me.data?.birthDate ?? '—')]],
    3: [['کد معاملاتی', faDigits(d?.sejam?.bourseCode ?? '—')], ['حساب بانکی', faDigits(d?.sejam?.bankAccount ?? '—')], ['کد پستی', faDigits(d?.sejam?.postalCode ?? '—')]],
  };

  return (
    <>
      <Scr gap={12}>
        {me.isLoading ? (
          <>
            <Skeleton h={130} />
            <Skeleton h={180} />
            <Skeleton h={180} />
          </>
        ) : (
          <>
            {/* current level */}
            <div className="card" style={{ boxSizing: 'border-box', padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 10, flex: 'none', backgroundImage: 'linear-gradient(135deg, rgb(var(--primary-main-rgb) / .10), transparent 60%)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <span style={{ width: 44, height: 44, borderRadius: 14, background: 'var(--soft-primary)', color: 'var(--primary-text)', display: 'grid', placeItems: 'center', flex: 'none' }}><Icon d={P.shieldCheck} size={24} /></span>
                <span style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 2, lineHeight: 1.4 }}>
                  <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>سطح احراز هویت شما</span>
                  <span style={{ fontSize: 18, fontWeight: 800 }}>سطح <span className="num">{FA.charAt(lvl)}</span> از ۳</span>
                </span>
                <span className="lbl" style={{ height: 24, padding: '0 8px', fontSize: 11.5, background: tag[1], color: tag[2] }}>{tag[0]}</span>
              </div>
              <div aria-hidden="true" style={{ display: 'flex', gap: 6 }}>
                {[1, 2, 3].map((n) => <span key={n} style={{ flex: 1, height: 6, borderRadius: 6, background: n <= lvl ? 'var(--success-main)' : 'rgb(var(--grey-500-rgb) / .18)', transition: 'background .4s' }} />)}
              </div>
              <span style={{ fontSize: 12.5, lineHeight: 1.8, color: 'var(--text-secondary)' }}>{HINT[lvl]}</span>
            </div>

            {/* levels */}
            {DEF.map((L) => {
              const done = L.n <= lvl;
              const cur = L.n === lvl + 1;
              return (
                <div key={L.n} className="card" style={{ boxSizing: 'border-box', padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 10, flex: 'none', border: `1px solid ${cur ? 'var(--primary-main)' : 'var(--glass-border)'}` }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <span className="num" style={{ width: 30, height: 30, borderRadius: '50%', background: done ? 'var(--success-main)' : cur ? 'var(--primary-main)' : 'rgb(var(--grey-500-rgb) / .18)', color: done || cur ? '#FFFFFF' : 'var(--text-secondary)', display: 'grid', placeItems: 'center', fontSize: 13, fontWeight: 800, flex: 'none' }}>
                      {done ? <Icon d={P.check} size={16} strokeWidth={2.4} /> : FA.charAt(L.n)}
                    </span>
                    <span style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 1, lineHeight: 1.4 }}>
                      <span style={{ fontSize: 14, fontWeight: 700 }}>سطح {FA.charAt(L.n)} · {L.title}</span>
                      <span style={{ fontSize: 11.5, color: 'var(--text-secondary)' }}>{L.source}</span>
                    </span>
                    <span className="lbl" style={{ height: 22, padding: '0 8px', fontSize: 11, background: done ? 'var(--soft-success)' : cur ? 'var(--soft-primary)' : 'var(--soft-default)', color: done ? 'var(--success-text)' : cur ? 'var(--primary-text)' : 'var(--text-secondary)' }}>
                      {done ? 'تکمیل شده' : cur ? 'قدم بعدی' : 'در انتظار'}
                    </span>
                  </div>
                  <span style={{ fontSize: 12, lineHeight: 1.8, color: 'var(--text-secondary)' }}>{L.desc}</span>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                    {L.unlocks.map((u) => (
                      <span key={u} className="chip" style={{ height: 22, padding: '0 8px', background: done ? 'var(--soft-success)' : 'var(--soft-default)', color: done ? 'var(--success-text)' : 'var(--text-secondary)' }}>
                        <Icon d={P.check} size={12} strokeWidth={2.2} />{u}
                      </span>
                    ))}
                  </div>
                  {done && <InfoRows rows={doneRows[L.n]} />}

                  {/* level 2 form: national ID (from signup) + birth date */}
                  {cur && L.n === 2 && !l2Result && (
                    <div className="kin" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                      <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                        <span style={{ fontSize: 12.5, fontWeight: 600 }}>کد ملی</span>
                        <span style={{ height: 48, boxSizing: 'border-box', padding: '0 12px', borderRadius: 12, border: '1.5px solid var(--outline-border)', background: 'var(--bg-neutral)', display: 'flex', alignItems: 'center', gap: 10 }}>
                          <Icon d="M3 6a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2zM8 11a2 2 0 1 0 0-4 2 2 0 0 0 0 4M5.5 16c.6-1.6 1.6-2.5 2.5-2.5s1.9.9 2.5 2.5M14 9h4M14 13h3" size={18} style={{ color: 'var(--text-secondary)' }} />
                          <span className="num" style={{ flex: 1, fontSize: 16, letterSpacing: 1.5, color: 'var(--text-secondary)', textAlign: 'left' }}>{faDigits(me.data?.nationalId ?? '')}</span>
                          <Icon d={P.lock} size={15} style={{ color: 'var(--text-disabled)' }} />
                        </span>
                      </label>
                      <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                        <span style={{ fontSize: 12.5, fontWeight: 600 }}>تاریخ تولد</span>
                        <span style={{ height: 48, boxSizing: 'border-box', padding: '0 12px', borderRadius: 12, border: `1.5px solid ${birth ? 'var(--primary-main)' : 'var(--outline-border)'}`, background: 'var(--bg-paper)', display: 'flex', alignItems: 'center', gap: 10 }}>
                          <input
                            type="text" inputMode="numeric" aria-label="تاریخ تولد" className="num" placeholder="روز / ماه / سال" dir={birth ? 'ltr' : 'rtl'}
                            value={faDigits(birth)}
                            onChange={(e: React.ChangeEvent<HTMLInputElement>) => { setBirth(fmtBirth(enDigits(e.target.value).replace(/\D/g, '').slice(0, 8))); l2.reset(); }}
                            onKeyDown={(e: React.KeyboardEvent<HTMLInputElement>) => { if (e.key === 'Enter') inquiry(); }}
                            style={{ flex: 1, minWidth: 0, height: 44, border: 0, background: 'transparent', padding: 0, fontFamily: 'inherit', fontSize: 16, color: 'var(--text-primary)', textAlign: 'right', outline: 'none' }}
                          />
                          <DatePickerButton value={birth} onChange={(t) => { setBirth(enDigits(t)); l2.reset(); }} label="تاریخ تولد" min={BIRTH_MIN} max={now()} />
                        </span>
                        {isMocking() && me.data?.birthDate && <span className="num" style={{ fontSize: 11, color: 'var(--text-secondary)' }}>تاریخ تولد آزمایشی: {faDigits(me.data.birthDate)}</span>}
                      </label>
                      <ErrorNote error={l2.error} />
                      <button onClick={inquiry} aria-disabled={!birthOk || undefined} disabled={l2.isPending} style={btnStyle(birthOk && !l2.isPending)}>
                        {l2.isPending ? 'در حال استعلام…' : 'استعلام از ثبت احوال'}<Icon d={P.arrowFwd} size={18} strokeWidth={2} />
                      </button>
                    </div>
                  )}

                  {/* level 2 result: identity returned by civil registry */}
                  {cur && L.n === 2 && l2Result && (
                    <div className="kin" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                      <InfoRows bg="var(--soft-success)" rows={[['نام و نام خانوادگی', l2Result.fullName], ['نام پدر', l2Result.fatherName], ['تاریخ تولد', faDigits(l2Result.birthDate)], ['محل صدور', l2Result.registryOffice]]} />
                      <button onClick={confirmL2} style={btnStyle(true)}>اطلاعات درست است، تأیید<Icon d={P.arrowFwd} size={18} strokeWidth={2} /></button>
                    </div>
                  )}

                  {/* level 3: SEJAM */}
                  {cur && L.n === 3 && (
                    <div className="kin" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                      {sejamStep === 'intro' ? (
                        <button onClick={sendSejam} disabled={l3otp.isPending} style={btnStyle(!l3otp.isPending)}>
                          {l3otp.isPending ? 'در حال ارسال…' : 'دریافت کد تأیید از سجام'}<Icon d={P.arrowFwd} size={18} strokeWidth={2} />
                        </button>
                      ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                          <span style={{ fontSize: 12.5, color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: 8 }}>
                            کد ۵ رقمی سجام به شماره ثبت‌شده در سجام پیامک شد
                            {devCode && <span className="num" style={{ marginRight: 'auto', fontSize: 11, whiteSpace: 'nowrap' }}>کد آزمایشی: {faDigits(devCode)}</span>}
                          </span>
                          <OtpBoxes value={sejamCode} onChange={(v) => { setSejamCode(v); l3.reset(); }} length={5} label="کد تأیید سجام" height={48} fontSize={22} autoFocus error={l3.isError} onComplete={(v) => confirmL3(v)} />
                          <ErrorNote error={l3.error} />
                          <button onClick={() => confirmL3()} aria-disabled={sejamCode.length < 5 || undefined} disabled={l3.isPending} style={btnStyle(sejamCode.length === 5 && !l3.isPending)}>
                            {l3.isPending ? 'در حال بررسی…' : 'تأیید و دریافت اطلاعات سجام'}<Icon d={P.arrowFwd} size={18} strokeWidth={2} />
                          </button>
                          <button onClick={sendSejam} disabled={l3otp.isPending} style={{ alignSelf: 'flex-start', height: 36, border: 0, background: 'transparent', padding: '0 4px', fontFamily: 'inherit', fontSize: 12.5, fontWeight: 600, color: 'var(--primary-text)', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                            <Icon d={P.refresh} size={14} />ارسال دوباره کد
                          </button>
                        </div>
                      )}
                      <ErrorNote error={l3otp.error} />
                      <span style={{ fontSize: 11.5, lineHeight: 1.8, color: 'var(--text-secondary)' }}>ثبت‌نام در سجام ندارید؟ ابتدا در sejam.ir ثبت‌نام و احراز حضوری یا غیرحضوری را کامل کنید.</span>
                    </div>
                  )}
                </div>
              );
            })}

            <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '0 4px', fontSize: 11.5, lineHeight: 1.8, color: 'var(--text-secondary)', flex: 'none' }}>
              <Icon d={P.lock} size={14} />اطلاعات فقط از سامانه‌های رسمی (شاهکار، ثبت احوال، سجام) استعلام و محرمانه نگهداری می‌شود.
            </div>
          </>
        )}
      </Scr>
      <AppHeader title="احراز هویت" back={routes.app.profile} />
      <BottomNav active="assets" />
    </>
  );
}
