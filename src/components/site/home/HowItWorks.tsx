import { Icon, type IconName } from '@/components/ui/Icon';
import { LockTypeChip } from '@/components/ui/LockBar';
import { faDigits, money } from '@/lib/format';
import { Section } from '../Section';

const STEPS: { n: string; icon: IconName; title: string; text: string }[] = [
  { n: '۱', icon: 'gift', title: 'سازمان بسته دارایی می‌فرستد', text: 'منابع انسانی پاداش یا مزایا را برای یک نفر یا گروهی از کارکنان، به‌صورت واحد صندوق و با سیاست قفل دلخواه ارسال می‌کند.' },
  { n: '۲', icon: 'pie', title: 'کارمند تأیید و تخصیص می‌دهد', text: 'در «دریافتی‌ها» بسته را تأیید می‌کند و اگر سازمان اجازه داده، سهم هر صندوق را خودش تعیین می‌کند.' },
  { n: '۳', icon: 'credit', title: 'از دارایی استفاده می‌کند', text: 'دارایی رشد می‌کند و بخش آزاد آن پشتوانه اعتبار کارت، وام بدون ضامن و خرید اقساطی است.' },
];

const VALUES: { icon: IconName; c: string; title: string; text: string }[] = [
  { icon: 'shield', c: 'c-warning', title: 'حفظ ارزش در برابر تورم', text: 'پاداش به‌جای ریال در صندوق طلا یا درآمد ثابت می‌نشیند و قدرت خریدش حفظ می‌شود.' },
  { icon: 'trend', c: 'c-success', title: 'مزایایی که رشد می‌کند', text: 'سود صندوق‌ها روزانه در ارزش واحدها لحاظ می‌شود؛ حتی بخش قفل‌شده هم برای شما رشد می‌کند.' },
  { icon: 'credit', c: 'c-primary', title: 'اعتبار بدون کاغذبازی', text: 'وام و اعتبار با پشتوانه دارایی آزاد؛ بدون ضامن، بدون چک و بدون مراجعه حضوری.' },
  { icon: 'chart', c: 'c-secondary', title: 'شفافیت کامل برای منابع انسانی', text: 'وضعیت هر بسته، پذیرش کارکنان و مصرف بودجه به‌صورت لحظه‌ای در پنل سازمان.' },
];

export function HowItWorks() {
  return (
    <Section id="product" eyebrow="چطور کار می‌کند" title="از پاداش تا اعتبار، در سه قدم" lead="یک جریان ساده بین سازمان و کارکنان؛ همه‌چیز آنلاین، شفاف و قابل پیگیری.">
      <ol className="s-steps" style={{ listStyle: 'none', margin: 0, padding: 0 }}>
        {STEPS.map((s, i) => (
          <li key={s.n} className="card s-card">
            <div className="s-row">
              <span className="s-step-n">{s.n}</span>
              <span className="s-itile c-primary" style={{ marginRight: 'auto' }}><Icon name={s.icon} /></span>
            </div>
            <h3 className="s-h3">{s.title}</h3>
            <p style={{ fontSize: 14, lineHeight: 1.95, color: 'var(--text-secondary)' }}>{s.text}</p>
            <StepVisual i={i} />
          </li>
        ))}
      </ol>

      <div className="s-g s-g4" style={{ marginTop: 20 }}>
        {VALUES.map((v) => (
          <div key={v.title} className={'card s-card ' + v.c}>
            <span className="s-itile"><Icon name={v.icon} /></span>
            <h3 className="s-h3" style={{ fontSize: 16 }}>{v.title}</h3>
            <p style={{ fontSize: 13.5, lineHeight: 1.95, color: 'var(--text-secondary)' }}>{v.text}</p>
          </div>
        ))}
      </div>
    </Section>
  );
}

function StepVisual({ i }: { i: number }) {
  if (i === 0) {
    return (
      <div className="s-mini" aria-hidden="true">
        <div className="s-row" style={{ gap: 8 }}>
          <span style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--primary-main)' }} />
          <span style={{ fontSize: 13, fontWeight: 700 }}>پاداش مهر ۱۴۰۵</span>
          <span className="lbl soft c-success" style={{ marginRight: 'auto', height: 22, fontSize: 11 }}>ارسال شد</span>
        </div>
        <div className="s-row" style={{ gap: 8, fontSize: 12, color: 'var(--text-secondary)', flexWrap: 'wrap' }}>
          <span>۱۲۰ نفر</span><span>·</span><span className="num" style={{ color: 'var(--text-primary)' }}>{money(2_400_000_000)}</span><span>تومان</span>
          <LockTypeChip type="vesting" style={{ marginRight: 'auto' }} />
        </div>
      </div>
    );
  }
  if (i === 1) {
    const parts = [
      { label: 'طلا', pct: 50, c: 'var(--warning-main)' },
      { label: 'درآمد ثابت', pct: 30, c: 'var(--secondary-main)' },
      { label: 'ریال', pct: 20, c: 'var(--grey-500)' },
    ];
    return (
      <div className="s-mini" aria-hidden="true">
        <div className="s-alloc">{parts.map((p) => <span key={p.label} style={{ width: p.pct + '%', background: p.c }} />)}</div>
        <div className="s-row" style={{ gap: 12, fontSize: 12, color: 'var(--text-secondary)', flexWrap: 'wrap' }}>
          {parts.map((p) => (
            <span key={p.label} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              <span style={{ width: 8, height: 8, borderRadius: 2, background: p.c }} />{p.label} <b className="num" style={{ color: 'var(--text-primary)', fontWeight: 500 }}>{faDigits(p.pct)}٪</b>
            </span>
          ))}
        </div>
      </div>
    );
  }
  return (
    <div className="s-mini" aria-hidden="true" style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
      <span className="chip soft c-primary" style={{ height: 30 }}><Icon name="card" size={16} />کارت نمادنو</span>
      <span className="chip soft c-info" style={{ height: 30 }}><Icon name="bank" size={16} />وام با وثیقه</span>
      <span className="chip soft c-secondary" style={{ height: 30 }}><Icon name="cart" size={16} />خرید اقساطی</span>
    </div>
  );
}
