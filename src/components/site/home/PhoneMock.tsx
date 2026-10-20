/** Hero illustration: the employee app's «دارایی‌ها» screen in a phone frame (HTML/CSS, demo numbers of the sample user). */
import { Icon, type IconName } from '@/components/ui/Icon';
import { LockBar, LockLegend } from '@/components/ui/LockBar';
import { money, percent } from '@/lib/format';

const TOTAL = 202_500_000;
const LOCKED = 71_600_000;
const FREE = TOTAL - LOCKED;

const WALLETS = [
  { name: 'صندوق طلا', dot: 'var(--warning-main)', value: 98_000_000, free: 56_000_000, locked: 42_000_000, delta: 1.2 },
  { name: 'صندوق درآمد ثابت', dot: 'var(--secondary-main)', value: 64_000_000, free: 44_000_000, locked: 20_000_000, delta: 0.08 },
];

const QUICK: { label: string; icon: IconName }[] = [
  { label: 'واریز', icon: 'deposit' },
  { label: 'برداشت', icon: 'withdraw' },
  { label: 'اعتبار', icon: 'credit' },
];

const NAV: { label: string; icon: IconName; on?: boolean }[] = [
  { label: 'دارایی‌ها', icon: 'assets', on: true },
  { label: 'دریافتی‌ها', icon: 'inbox' },
  { label: 'اعتبار', icon: 'credit' },
  { label: 'حساب من', icon: 'user' },
];

export function PhoneMock() {
  return (
    <div className="s-stage" role="img" aria-label="نمای اپ نمادنو: دارایی کل با بخش آزاد و قفل‌شده">
      {/* floating: incoming package */}
      <div className="glass s-float" aria-hidden="true" style={{ top: '14%', left: 'max(0px, calc(50% - 290px))', alignItems: 'center', gap: 10, width: 224 }}>
        <span className="s-itile c-primary" style={{ width: 36, height: 36, borderRadius: 10 }}><Icon name="gift" /></span>
        <span className="s-col" style={{ gap: 2, lineHeight: 1.4 }}>
          <span style={{ fontSize: 12.5, fontWeight: 700 }}>پاداش مهر ۱۴۰۵</span>
          <span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>هلدینگ آرمان · <span className="num">{money(20_000_000)}</span> تومان</span>
        </span>
      </div>
      {/* floating: loan cap */}
      <div className="glass s-float b" aria-hidden="true" style={{ bottom: '16%', right: 'max(0px, calc(50% - 290px))', flexDirection: 'column', gap: 4, width: 196 }}>
        <span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>سقف وام شما · ۴۰٪ دارایی آزاد</span>
        <span className="num" style={{ fontSize: 17, lineHeight: 1.3 }}>{money(FREE * 0.4)} <span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>تومان</span></span>
        <span className="lbl soft c-success" style={{ height: 22, fontSize: 11, alignSelf: 'flex-start' }}><Icon name="check" size={12} strokeWidth={2.2} />بدون ضامن</span>
      </div>

      <div className="s-phone">
        <div className="s-phone-scr">
          <span className="s-phone-notch" />
          {/* header */}
          <div className="s-row" style={{ gap: 8 }}>
            <span style={{ width: 32, height: 32, borderRadius: '50%', background: 'var(--secondary-main)', color: '#FFFFFF', display: 'grid', placeItems: 'center', fontSize: 13, fontWeight: 700 }}>س</span>
            <span className="s-col" style={{ lineHeight: 1.35 }}>
              <span style={{ fontSize: 12.5, fontWeight: 700 }}>سلام، سارا</span>
              <span style={{ fontSize: 10.5, color: 'var(--text-secondary)' }}>هلدینگ آرمان</span>
            </span>
            <span style={{ marginRight: 'auto', position: 'relative', color: 'var(--text-secondary)', display: 'grid' }}>
              <Icon name="bell" size={20} />
              <span style={{ position: 'absolute', top: 0, left: 1, width: 7, height: 7, borderRadius: '50%', background: 'var(--error-main)', boxShadow: '0 0 0 2px var(--bg-default)' }} />
            </span>
          </div>

          {/* total assets */}
          <div className="card" style={{ position: 'relative', overflow: 'hidden', padding: '10px 12px 12px', borderRadius: 18, display: 'flex', flexDirection: 'column', gap: 8, background: 'var(--bg-paper) linear-gradient(135deg, rgb(var(--primary-main-rgb) / .10), transparent 60%)' }}>
            <span aria-hidden="true" style={{ position: 'absolute', left: -40, top: -60, width: 140, height: 140, borderRadius: '50%', background: 'rgb(var(--primary-main-rgb) / .08)' }} />
            <div className="s-row" style={{ gap: 6, position: 'relative' }}>
              <span style={{ width: 7, height: 7, borderRadius: '50%', background: 'var(--primary-main)' }} />
              <span style={{ fontSize: 11.5, fontWeight: 600, color: 'var(--text-secondary)' }}>دارایی کل</span>
              <Icon name="eye" size={16} style={{ marginRight: 'auto', color: 'var(--text-secondary)' }} />
            </div>
            <div className="s-row" style={{ gap: 6, position: 'relative', justifyContent: 'space-between' }}>
              <span className="num" style={{ fontSize: 21, lineHeight: 1.2, whiteSpace: 'nowrap' }}>{money(TOTAL)} <span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>تومان</span></span>
              <span style={{ padding: '2px 7px', borderRadius: 7, background: 'var(--soft-success)', color: 'var(--success-text)', display: 'flex', flexDirection: 'column', alignItems: 'flex-end', lineHeight: 1.3, fontVariantNumeric: 'tabular-nums' }}>
                <span dir="ltr" style={{ fontSize: 9.5, fontWeight: 500 }}>+{money(1_181_550)}</span>
                <span style={{ fontSize: 10.5, fontWeight: 700 }}><span dir="ltr">{percent(0.58, 2, true)}</span> امروز</span>
              </span>
            </div>
            <div style={{ position: 'relative', display: 'flex', flexDirection: 'column', gap: 6 }}>
              <LockBar free={FREE} locked={LOCKED} />
              <div style={{ fontSize: 10.5 }}><LockLegend free={FREE} locked={LOCKED} /></div>
            </div>
            <div className="s-row" style={{ gap: 6, position: 'relative', marginTop: 2, alignItems: 'flex-start' }}>
              <span style={{ flex: 1, height: 40, borderRadius: 12, background: 'var(--primary-main)', color: '#FFFFFF', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, fontSize: 12, fontWeight: 700, boxShadow: 'var(--shadow-primary)' }}>
                <Icon name="inbox" size={16} />دریافتی‌ها
                <span style={{ minWidth: 16, height: 16, borderRadius: 8, background: '#FFFFFF', color: 'var(--primary-main)', fontSize: 10, display: 'grid', placeItems: 'center' }}>۱</span>
              </span>
              {QUICK.map((q) => (
                <span key={q.label} style={{ width: 40, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3 }}>
                  <span style={{ width: 40, height: 40, borderRadius: 12, border: '1px solid var(--glass-edge)', background: 'var(--bg-paper)', color: 'var(--primary-text)', display: 'grid', placeItems: 'center', boxShadow: 'var(--shadow-z1)' }}><Icon name={q.icon} size={16} /></span>
                  <span style={{ fontSize: 9, color: 'var(--text-secondary)' }}>{q.label}</span>
                </span>
              ))}
            </div>
          </div>

          <div className="s-row" style={{ justifyContent: 'space-between', marginTop: 2 }}>
            <span style={{ fontSize: 12.5, fontWeight: 700 }}>کیف پول‌ها و صندوق‌ها</span>
            <span style={{ fontSize: 10.5, fontWeight: 600, color: 'var(--primary-text)' }}>همه صندوق‌ها</span>
          </div>
          {WALLETS.map((w) => (
            <div key={w.name} className="card" style={{ padding: '8px 12px', borderRadius: 14, display: 'flex', flexDirection: 'column', gap: 3 }}>
              <div className="s-row" style={{ gap: 6 }}>
                <span style={{ width: 7, height: 7, borderRadius: '50%', background: w.dot }} />
                <span style={{ fontSize: 12, fontWeight: 600 }}>{w.name}</span>
                <span className="lbl" style={{ marginRight: 'auto', height: 18, fontSize: 10, padding: '0 5px', background: 'var(--soft-success)', color: 'var(--success-text)' }} dir="ltr">{percent(w.delta, 2, true)}</span>
              </div>
              <span className="num" style={{ fontSize: 15, lineHeight: 1.3 }}>{money(w.value)} <span style={{ fontSize: 10, color: 'var(--text-secondary)' }}>تومان</span></span>
              <div className="lkleg" style={{ fontSize: 10, gap: 8, borderTop: '1px dashed var(--divider)', paddingTop: 4 }}>
                <span><span className="lkdot" style={{ width: 6, height: 6 }} />قابل برداشت <b>{money(w.free)}</b></span>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }}><Icon name="lock" size={10} />قفل <b>{money(w.locked)}</b></span>
              </div>
            </div>
          ))}

          <div className="glass s-phone-nav">
            {NAV.map((n) => (
              <span key={n.label} className={n.on ? 'on' : undefined}><Icon name={n.icon} />{n.label}</span>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
