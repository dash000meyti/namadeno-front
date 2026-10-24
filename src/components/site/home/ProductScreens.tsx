/**
 * Product illustrations for the landing tour (HTML/CSS, demo numbers of the sample user «سارا محمدی»).
 * PhoneFrame + three employee-app screens, and the organization panel in a browser window with its dock.
 */
import { Icon, LogoMark, type IconName } from '@/components/ui/Icon';
import { LogoFull } from '@/components/ui/Brand';
import { LockBar, LockLegend, LockTypeChip } from '@/components/ui/LockBar';
import { faDigits, money, percent } from '@/lib/format';

const TOTAL = 202_500_000;
const LOCKED = 71_600_000;
const FREE = TOTAL - LOCKED;

const NAV: { label: string; icon: IconName }[] = [
  { label: 'دارایی‌ها', icon: 'assets' },
  { label: 'دریافتی‌ها', icon: 'inbox' },
  { label: 'اعتبار', icon: 'credit' },
  { label: 'حساب من', icon: 'user' },
];

export function PhoneFrame({ active, label, children }: { active: number; label: string; children: React.ReactNode }) {
  return (
    <div className="s-phone" role="img" aria-label={label}>
      <div className="s-phone-scr">
        <span className="s-phone-notch" />
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
        {children}
        <div className="glass s-phone-nav">
          {NAV.map((n, i) => (
            <span key={n.label} className={i === active ? 'on' : undefined}><Icon name={n.icon} />{n.label}</span>
          ))}
        </div>
      </div>
    </div>
  );
}

const Toman = () => <span style={{ fontSize: 10.5, color: 'var(--text-secondary)' }}>تومان</span>;

/** «دارایی‌ها»: total with free/locked split and two funds. */
export function AssetsScreen() {
  const wallets = [
    { name: 'صندوق طلا', dot: 'var(--warning-main)', value: 98_000_000, free: 56_000_000, locked: 42_000_000, delta: 1.2 },
    { name: 'صندوق درآمد ثابت', dot: 'var(--secondary-main)', value: 64_000_000, free: 44_000_000, locked: 20_000_000, delta: 0.08 },
  ];
  return (
    <PhoneFrame active={0} label="اپ نمادنو: دارایی کل با بخش آزاد و قفل‌شده">
      <div className="card" style={{ position: 'relative', overflow: 'hidden', padding: '12px 12px 14px', borderRadius: 18, display: 'flex', flexDirection: 'column', gap: 8, background: 'var(--bg-paper) linear-gradient(135deg, rgb(var(--primary-main-rgb) / .14), transparent 60%)' }}>
        <div className="s-row" style={{ gap: 6 }}>
          <span style={{ width: 7, height: 7, borderRadius: '50%', background: 'var(--primary-main)' }} />
          <span style={{ fontSize: 11.5, fontWeight: 600, color: 'var(--text-secondary)' }}>دارایی کل</span>
          <span className="lbl" style={{ marginRight: 'auto', height: 20, fontSize: 10, background: 'var(--soft-success)', color: 'var(--success-text)' }}><span dir="ltr">{percent(0.58, 2, true)}</span>&nbsp;امروز</span>
        </div>
        <span className="num" style={{ fontSize: 24, lineHeight: 1.2, whiteSpace: 'nowrap' }}>{money(TOTAL)} <Toman /></span>
        <LockBar free={FREE} locked={LOCKED} />
        <div style={{ fontSize: 10.5 }}><LockLegend free={FREE} locked={LOCKED} /></div>
      </div>
      <span style={{ fontSize: 12.5, fontWeight: 700, marginTop: 4 }}>کیف پول‌ها و صندوق‌ها</span>
      {wallets.map((w) => (
        <div key={w.name} className="card" style={{ padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: 4 }}>
          <div className="s-row" style={{ gap: 6 }}>
            <span style={{ width: 7, height: 7, borderRadius: '50%', background: w.dot }} />
            <span style={{ fontSize: 12, fontWeight: 600 }}>{w.name}</span>
            <span className="lbl" style={{ marginRight: 'auto', height: 18, fontSize: 10, padding: '0 5px', background: 'var(--soft-success)', color: 'var(--success-text)' }} dir="ltr">{percent(w.delta, 2, true)}</span>
          </div>
          <span className="num" style={{ fontSize: 15, lineHeight: 1.3 }}>{money(w.value)} <Toman /></span>
          <LockBar free={w.free} locked={w.locked} height={4} />
          <div className="lkleg" style={{ fontSize: 10, gap: 8 }}>
            <span><span className="lkdot" style={{ width: 6, height: 6 }} />آزاد <b>{money(w.free)}</b></span>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }}><Icon name="lock" size={10} />قفل <b>{money(w.locked)}</b></span>
          </div>
        </div>
      ))}
    </PhoneFrame>
  );
}

/** «دریافتی‌ها»: an incoming package with the allocation choice. */
export function InboxScreen() {
  const opts = [
    { label: 'صندوق طلا', sub: '۱۰۰٪ طلا', on: false },
    { label: 'ترکیبی ۵۰/۵۰', sub: '۵۰٪ طلا · ۵۰٪ درآمد ثابت', on: true },
    { label: 'درآمد ثابت', sub: '۱۰۰٪ درآمد ثابت', on: false },
  ];
  return (
    <PhoneFrame active={1} label="اپ نمادنو: تأیید و تخصیص بسته دریافتی">
      <span style={{ fontSize: 15, fontWeight: 800, marginTop: 4 }}>دریافتی‌ها</span>
      <div className="card" style={{ padding: 12, display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div className="s-row" style={{ gap: 8 }}>
          <span style={{ width: 34, height: 34, borderRadius: 11, background: 'var(--soft-primary)', color: 'var(--primary-text)', display: 'grid', placeItems: 'center' }}><Icon name="gift" size={18} /></span>
          <span className="s-col" style={{ lineHeight: 1.4 }}>
            <span style={{ fontSize: 12.5, fontWeight: 700 }}>پاداش مهر ۱۴۰۵</span>
            <span style={{ fontSize: 10.5, color: 'var(--text-secondary)' }}>هلدینگ آرمان · ۱۴ مهر</span>
          </span>
        </div>
        <span className="num" style={{ fontSize: 22, lineHeight: 1.2 }}>{money(20_000_000)} <Toman /></span>
        <div className="s-row" style={{ gap: 6, flexWrap: 'wrap' }}>
          <LockTypeChip type="vesting" />
          <span className="lbl" style={{ height: 22, fontSize: 10.5, background: 'var(--soft-default)', color: 'var(--default-text)' }}>برداشت نقدی مجاز</span>
        </div>
      </div>
      <span style={{ fontSize: 12, fontWeight: 700 }}>تخصیص مبلغ</span>
      {opts.map((o) => (
        <div key={o.label} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 12px', borderRadius: 14, border: o.on ? '1.5px solid var(--primary-main)' : '1px solid var(--glass-border)', background: o.on ? 'rgb(var(--primary-main-rgb) / .08)' : 'var(--card-bg)' }}>
          <span style={{ width: 16, height: 16, borderRadius: '50%', border: o.on ? '5px solid var(--primary-main)' : '1.5px solid var(--grey-500)', boxSizing: 'border-box', flex: 'none' }} />
          <span className="s-col" style={{ lineHeight: 1.35 }}>
            <span style={{ fontSize: 12, fontWeight: 700 }}>{o.label}</span>
            <span style={{ fontSize: 10, color: 'var(--text-secondary)' }}>{o.sub}</span>
          </span>
        </div>
      ))}
      <div className="s-alloc" style={{ height: 6, marginTop: 2 }}>
        <span style={{ width: '50%', background: 'var(--warning-main)' }} />
        <span style={{ width: '50%', background: 'var(--secondary-main)' }} />
      </div>
      <span style={{ height: 42, borderRadius: 13, background: 'var(--primary-main)', color: '#FFFFFF', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, fontSize: 12.5, fontWeight: 700, marginTop: 2 }}>
        <Icon name="check" size={16} strokeWidth={2} />تأیید و تخصیص
      </span>
    </PhoneFrame>
  );
}

/** «اعتبار»: credit backed by the free part of the assets. */
export function CreditScreen() {
  const items: { icon: IconName; t: string; d: string }[] = [
    { icon: 'card', t: 'کارت نمادنو', d: 'تا ۲۵٪ دارایی · شارژ آنی' },
    { icon: 'bank', t: 'وام با پشتوانه دارایی', d: 'تا ۴۰٪ دارایی آزاد · بدون ضامن' },
    { icon: 'cart', t: 'خرید اقساطی', d: 'از فروشگاه‌های طرف قرارداد' },
  ];
  return (
    <PhoneFrame active={2} label="اپ نمادنو: اعتبار با پشتوانه دارایی آزاد">
      <span style={{ fontSize: 15, fontWeight: 800, marginTop: 4 }}>اعتبار و تسهیلات</span>
      <div className="card" style={{ padding: 14, display: 'flex', flexDirection: 'column', gap: 8, background: 'var(--bg-paper) linear-gradient(160deg, rgb(var(--success-main-rgb) / .16), transparent 65%)' }}>
        <span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>سقف وام شما · ۴۰٪ دارایی آزاد</span>
        <span className="num" style={{ fontSize: 24, lineHeight: 1.2 }}>{money(FREE * 0.4)} <Toman /></span>
        <LockBar free={FREE} locked={LOCKED} />
        <span style={{ fontSize: 10.5, color: 'var(--text-secondary)' }}>فقط بخش آزاد دارایی پشتوانه اعتبار است.</span>
      </div>
      {items.map((it) => (
        <div key={it.t} className="card" style={{ padding: '10px 12px', display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ width: 34, height: 34, borderRadius: 11, background: 'var(--soft-primary)', color: 'var(--primary-text)', display: 'grid', placeItems: 'center', flex: 'none' }}><Icon name={it.icon} size={18} /></span>
          <span className="s-col" style={{ lineHeight: 1.4, flex: 1 }}>
            <span style={{ fontSize: 12, fontWeight: 700 }}>{it.t}</span>
            <span style={{ fontSize: 10.5, color: 'var(--text-secondary)' }}>{it.d}</span>
          </span>
          <Icon name="forward" size={16} style={{ color: 'var(--text-secondary)' }} />
        </div>
      ))}
    </PhoneFrame>
  );
}

const DOCK: { icon: IconName; label: string; on?: boolean }[] = [
  { icon: 'chart', label: 'داشبورد' },
  { icon: 'users', label: 'کارکنان' },
  { icon: 'gift', label: 'بسته‌ها', on: true },
  { icon: 'credit', label: 'اعتبار' },
  { icon: 'inbox', label: 'درخواست‌ها' },
  { icon: 'doc', label: 'گزارش‌ها' },
];

/** Organization panel (OS-style shell with dock) sending a package. */
export function OrgWindow() {
  return (
    <div className="s-win" role="img" aria-label="پنل سازمانی نمادنو: ارسال بسته پاداش برای کارکنان">
      <div className="s-win-bar"><i /><i /><i /><span className="s-win-url">org.namadno.ir</span></div>
      <div style={{ position: 'relative', padding: '16px 18px 84px', display: 'flex', flexDirection: 'column', gap: 12, background: 'var(--bg-aurora), var(--bg-default)', fontSize: 12, lineHeight: 1.5 }}>
        <div className="s-row" style={{ gap: 8 }}>
          <LogoMark size={18} />
          <span style={{ fontWeight: 700 }}>بسته‌های دارایی</span>
          <span style={{ color: 'var(--text-secondary)', fontSize: 11 }}>· هلدینگ آرمان</span>
          <span className="lbl" style={{ marginRight: 'auto', height: 22, fontSize: 10.5, background: 'var(--soft-primary)', color: 'var(--primary-text)' }}>مرحله ۳ از ۳</span>
        </div>
        <div className="card" style={{ padding: 14, display: 'flex', flexDirection: 'column', gap: 12, borderRadius: 16 }}>
          <div className="s-row" style={{ justifyContent: 'space-between' }}>
            <span className="s-col" style={{ lineHeight: 1.45 }}>
              <span style={{ fontSize: 14, fontWeight: 800 }}>پاداش مهر ۱۴۰۵</span>
              <span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>بررسی و ارسال</span>
            </span>
            <span className="num" style={{ fontSize: 18 }}>{money(2_400_000_000)} <Toman /></span>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0,1fr))', gap: 8 }}>
            {[
              { k: 'گیرندگان', v: faDigits(120) + ' نفر' },
              { k: 'تخصیص', v: 'آزاد · طلا / درآمد ثابت' },
              { k: 'سیاست قفل', v: 'زمانی تا ۱۴۰۵/۱۰/۱۵' },
            ].map((x) => (
              <span key={x.k} className="s-col" style={{ padding: '8px 10px', borderRadius: 12, border: '1px solid var(--line)', lineHeight: 1.45 }}>
                <span style={{ fontSize: 10, color: 'var(--text-secondary)' }}>{x.k}</span>
                <span style={{ fontSize: 11.5, fontWeight: 600 }}>{x.v}</span>
              </span>
            ))}
          </div>
          <div className="s-row" style={{ gap: 8 }}>
            <span style={{ flex: 1, fontSize: 10.5, color: 'var(--text-secondary)' }}>کارکنان پس از تأیید، سهم هر صندوق را خودشان انتخاب می‌کنند.</span>
            <span style={{ height: 34, padding: '0 14px', borderRadius: 10, background: 'var(--primary-main)', color: '#FFFFFF', display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 11.5, fontWeight: 700, whiteSpace: 'nowrap' }}><Icon name="send" size={14} />ارسال برای ۱۲۰ نفر</span>
          </div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0,1fr))', gap: 8 }}>
          {[
            { k: 'پذیرش بسته‌های امسال', v: '۸۹٪' },
            { k: 'دارایی قفل‌شده پرسنل', v: '۲۷۹ میلیون' },
            { k: 'در انتظار تأیید', v: '۵ بسته' },
          ].map((x) => (
            <span key={x.k} className="card s-col" style={{ padding: '10px 12px', borderRadius: 14, lineHeight: 1.45 }}>
              <span style={{ fontSize: 10, color: 'var(--text-secondary)' }}>{x.k}</span>
              <span className="num" style={{ fontSize: 15 }}>{x.v}</span>
            </span>
          ))}
        </div>
        <div style={{ position: 'absolute', bottom: 14, left: '50%', transform: 'translateX(-50%)', display: 'flex', gap: 4, padding: 6, borderRadius: 16, background: 'var(--glass-bg)', border: '1px solid var(--glass-border)', boxShadow: '0 16px 32px -16px rgb(7 11 20 / .5)', backdropFilter: 'blur(16px)' }}>
          {DOCK.map((d) => (
            <span key={d.label} style={{ width: 52, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2, padding: '4px 0', borderRadius: 10, background: d.on ? 'var(--soft-primary)' : 'transparent', color: d.on ? 'var(--primary-text)' : 'var(--text-secondary)', fontSize: 9, fontWeight: 600 }}>
              <Icon name={d.icon} size={17} />{d.label}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

/** The black Namadno card (demo cardholder) — same face as the app's card screen. */
export function NamadnoCard() {
  return (
    <div className="s-ncard" role="img" aria-label="کارت اعتباری نمادنو">
      <LogoMark size={260} style={{ position: 'absolute', left: -54, bottom: -84, color: 'rgb(255 255 255 / .05)' }} />
      <div className="s-row" style={{ justifyContent: 'space-between', position: 'relative' }}>
        <LogoFull height={20} />
        <span style={{ fontSize: 11, fontWeight: 600, opacity: .75 }}>اعتباری</span>
      </div>
      <span className="chip-emv" />
      <span className="pan" dir="ltr">••••&nbsp;&nbsp;••••&nbsp;&nbsp;••••&nbsp;&nbsp;{faDigits('4218')}</span>
      <div className="s-row" style={{ justifyContent: 'space-between', position: 'relative', fontSize: 11.5 }}>
        <span className="s-col" style={{ lineHeight: 1.4 }}><span style={{ opacity: .6, fontSize: 10 }}>دارنده کارت</span><b style={{ fontWeight: 600 }}>سارا محمدی</b></span>
        <span className="s-col" style={{ lineHeight: 1.4, alignItems: 'flex-end' }}><span style={{ opacity: .6, fontSize: 10 }}>انقضا</span><b style={{ fontWeight: 600 }} dir="ltr">{faDigits('1408/07')}</b></span>
      </div>
    </div>
  );
}

/** «خرید صندوق»: rial → gold fund, with NAV, units and fee shown before confirming. */
export function ConvertScreen() {
  const rows = [
    { k: 'قیمت هر واحد (NAV)', v: `${money(3_015_000)} تومان` },
    { k: 'تعداد واحد', v: '≈ ۳٫۳۱' },
    { k: 'کارمزد', v: `${money(10_000)} تومان` },
  ];
  return (
    <PhoneFrame active={0} label="اپ نمادنو: خرید صندوق طلا از کیف پول ریالی">
      <span style={{ fontSize: 15, fontWeight: 800, marginTop: 4 }}>خرید صندوق طلا</span>
      <div className="s-row" style={{ gap: 6 }}>
        {['طلا', 'درآمد ثابت', 'سهامی'].map((t, i) => (
          <span key={t} style={{ height: 28, padding: '0 12px', borderRadius: 999, display: 'inline-flex', alignItems: 'center', fontSize: 11, fontWeight: 700, background: i === 0 ? 'var(--text-primary)' : 'var(--action-hover)', color: i === 0 ? 'var(--bg-default)' : 'var(--text-secondary)' }}>{t}</span>
        ))}
      </div>
      <div className="card" style={{ padding: 14, display: 'flex', flexDirection: 'column', gap: 6, alignItems: 'center', textAlign: 'center' }}>
        <span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>مبلغ خرید از کیف پول ریالی</span>
        <span className="num" style={{ fontSize: 28, lineHeight: 1.2 }}>{money(10_000_000)}</span>
        <span style={{ fontSize: 10.5, color: 'var(--text-secondary)' }}>تومان · موجودی آزاد {money(20_400_000)}</span>
        <div className="s-row" style={{ gap: 6, marginTop: 4 }}>
          {['۲۵٪', '۵۰٪', 'همه'].map((t, i) => <span key={t} style={{ height: 24, padding: '0 10px', borderRadius: 999, border: '1px solid var(--glass-border)', fontSize: 10.5, fontWeight: 600, display: 'inline-flex', alignItems: 'center', background: i === 1 ? 'var(--soft-primary)' : 'transparent', color: i === 1 ? 'var(--primary-text)' : 'var(--text-secondary)' }}>{t}</span>)}
        </div>
      </div>
      <div className="card" style={{ padding: '6px 12px' }}>
        {rows.map((r, i) => (
          <div key={r.k} className="s-row" style={{ justifyContent: 'space-between', height: 30, fontSize: 11, borderTop: i ? '1px solid var(--divider)' : 0 }}>
            <span style={{ color: 'var(--text-secondary)' }}>{r.k}</span><b className="num" style={{ fontWeight: 500 }}>{r.v}</b>
          </div>
        ))}
      </div>
      <span style={{ fontSize: 10, color: 'var(--text-secondary)', textAlign: 'center' }}>بازده یک‌ساله صندوق طلا: ۴۲٪ · بازدهی گذشته تضمین آینده نیست</span>
      <span style={{ height: 42, borderRadius: 13, background: 'var(--primary-main)', color: '#FFFFFF', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, fontSize: 12.5, fontWeight: 700 }}>
        <Icon name="check" size={16} strokeWidth={2} />تأیید و خرید
      </span>
    </PhoneFrame>
  );
}
