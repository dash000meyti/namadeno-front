import Link from 'next/link';
import { Icon } from '@/components/ui/Icon';
import { LockTypeChip } from '@/components/ui/LockBar';
import { faDigits, money } from '@/lib/format';
import { routes } from '@/lib/routes';
import { Section } from '../Section';

export const ORG_FEATURES = [
  'ارسال بسته به یک نفر، یک واحد یا همه کارکنان در چند دقیقه',
  'سیاست قفل زمانی یا آزادسازی مرحله‌ای برای ماندگاری و قراردادهای پروژه‌ای',
  'تعیین صندوق‌های مجاز، امکان برداشت نقدی و سقف وام کارکنان در قرارداد',
  'اعتبار و وام کارکنان بدون ضمانت سازمان و بدون کسر از حقوق',
  'گزارش لحظه‌ای بودجه، پذیرش بسته‌ها و درخواست‌ها',
];

const BARS = [38, 52, 44, 70, 58, 86];
const MONTHS = ['اردیبهشت', 'خرداد', 'تیر', 'مرداد', 'شهریور', 'مهر'];

/** Static illustration of the organization panel (KPIs, monthly bars, recent packages). */
export function OrgPanelMock() {
  return (
    <div className="glass" style={{ borderRadius: 24, padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }} role="img" aria-label="نمای پنل سازمانی: شاخص‌ها، نمودار ارسال ماهانه و بسته‌های اخیر">
      <div className="s-row" style={{ gap: 8 }}>
        <span style={{ width: 28, height: 28, borderRadius: 8, background: 'var(--secondary-main)', color: '#FFFFFF', display: 'grid', placeItems: 'center', fontSize: 12, fontWeight: 700 }}>آ</span>
        <span style={{ fontSize: 13, fontWeight: 700 }}>هلدینگ آرمان · داشبورد</span>
        <span className="lbl soft c-success" style={{ marginRight: 'auto', height: 22, fontSize: 11 }}>قرارداد فعال</span>
      </div>
      <div className="s-kpis">
        <div className="s-kpi"><span className="k">کارکنان فعال</span><span className="v">{faDigits(384)}</span></div>
        <div className="s-kpi"><span className="k">پذیرش بسته‌ها</span><span className="v">{faDigits(94)}٪</span></div>
        <div className="s-kpi"><span className="k">بودجه مصرف‌شده</span><span className="v">{faDigits(62)}٪</span></div>
      </div>
      <div style={{ background: 'var(--bg-paper)', borderRadius: 14, boxShadow: 'var(--shadow-card)', padding: '12px 12px 8px' }}>
        <div className="s-row" style={{ justifyContent: 'space-between', marginBottom: 6 }}>
          <span style={{ fontSize: 12.5, fontWeight: 700 }}>ارزش بسته‌های ارسالی</span>
          <span className="cap">میلیارد تومان</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: 10, height: 96 }}>
          {BARS.map((b, i) => (
            <div key={MONTHS[i]} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, height: '100%', justifyContent: 'flex-end' }}>
              <span style={{ width: '100%', maxWidth: 28, height: `${b}%`, borderRadius: '6px 6px 2px 2px', background: i === BARS.length - 1 ? 'var(--chart-1)' : 'rgb(var(--primary-main-rgb) / .24)' }} />
              <span style={{ fontSize: 9.5, color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>{MONTHS[i]}</span>
            </div>
          ))}
        </div>
      </div>
      <div style={{ background: 'var(--bg-paper)', borderRadius: 14, boxShadow: 'var(--shadow-card)', padding: '0 12px' }}>
        {[
          { t: 'پاداش مهر ۱۴۰۵', n: 120, v: 2_400_000_000, lock: 'vesting' as const },
          { t: 'قرارداد پروژه پرتال', n: 1, v: 60_000_000, lock: 'milestone' as const },
          { t: 'رفاهی آبان', n: 384, v: 1_152_000_000, lock: 'none' as const },
        ].map((r, i, arr) => (
          <div key={r.t} className="s-row" style={{ minHeight: 48, gap: 8, borderBottom: i < arr.length - 1 ? '1px dashed var(--divider)' : 0 }}>
            <span className="s-col" style={{ flex: 1, lineHeight: 1.4 }}>
              <span style={{ fontSize: 12.5, fontWeight: 600 }}>{r.t}</span>
              <span className="cap" style={{ fontSize: 11 }}>{faDigits(r.n)} نفر · <span className="num">{money(r.v)}</span> تومان</span>
            </span>
            <LockTypeChip type={r.lock} />
          </div>
        ))}
      </div>
    </div>
  );
}

export function OrgsSection() {
  return (
    <Section id="orgs">
      <div className="s-split">
        <div className="s-col" style={{ gap: 16 }}>
          <span className="s-eyebrow"><span className="dot" />برای سازمان‌ها</span>
          <h2 id="orgs-title" className="s-h2">مزایای کارکنان را به دارایی ماندگار تبدیل کنید</h2>
          <p className="s-lead">پنل سازمانی نمادنو به منابع انسانی کمک می‌کند پاداش، رفاهی و پرداخت قراردادهای پروژه‌ای را شفاف، سریع و با سیاست دلخواه مدیریت کند.</p>
          <ul className="s-check">
            {ORG_FEATURES.map((f) => <li key={f}><Icon name="check" />{f}</li>)}
          </ul>
          <div className="s-actions" style={{ marginTop: 6 }}>
            <Link href={`${routes.site.business}#demo`} className="btn lg contained c-primary">درخواست دمو</Link>
            <Link href={routes.org.login} className="btn lg outlined c-primary"><Icon name="building" />ورود به پنل سازمان</Link>
          </div>
        </div>
        <OrgPanelMock />
      </div>
    </Section>
  );
}
