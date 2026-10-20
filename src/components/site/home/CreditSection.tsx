'use client';
import { useState } from 'react';
import Link from 'next/link';
import { Icon, type IconName } from '@/components/ui/Icon';
import { usePublicCreditProducts, type PublicCreditProduct } from '@/api/site-extra';
import { compactMoney, faDigits, money } from '@/lib/format';
import { routes } from '@/lib/routes';
import { Section } from '../Section';

type Kind = PublicCreditProduct['kind'];

const CARDS: { kind: Kind; icon: IconName; c: string; title: string; text: string; points: string[]; fallbackPct: number }[] = [
  {
    kind: 'card_credit', icon: 'card', c: 'c-primary', title: 'اعتبار کارت نمادنو', fallbackPct: 25,
    text: 'اعتبار خرید با پشتوانه دارایی آزاد؛ بدون فروش صندوق خرید کنید و آخر دوره یک‌جا تسویه کنید.',
    points: ['شارژ کارت از اعتبار در چند ثانیه', 'رمز پویا برای هر خرید', 'تسویه زودتر، آزادسازی زودتر وثیقه'],
  },
  {
    kind: 'loan', icon: 'bank', c: 'c-info', title: 'وام با پشتوانه دارایی', fallbackPct: 40,
    text: 'تا ۴۰٪ دارایی آزاد وام بگیرید؛ بدون ضامن، بدون چک و بدون کسر از حقوق.',
    points: ['واریز به کیف پول ریالی پس از تأیید', 'دارایی وثیقه‌شده همچنان سود می‌گیرد', 'پرداخت اقساط از داخل اپ'],
  },
  {
    kind: 'installment', icon: 'cart', c: 'c-secondary', title: 'خرید اقساطی', fallbackPct: 30,
    text: 'از فروشگاه‌های طرف قرارداد اقساطی خرید کنید؛ با هر قسط بخشی از وثیقه آزاد می‌شود.',
    points: ['دیجیتال، پوشاک، سفر و مراکز خرید', 'کد خرید آنی در اپ', 'انتخاب طرح اقساط پیش از خرید'],
  },
];

const rate = (p?: PublicCreditProduct) => {
  if (!p) return '—';
  if (!p.rateMin) return `تا ${faDigits(p.rateMax)}٪`;
  return `${faDigits(p.rateMin)} تا ${faDigits(p.rateMax)}٪`;
};
const months = (p?: PublicCreditProduct) => {
  if (!p || !p.monthsOptions.length) return '—';
  if (p.monthsOptions.length === 1 && p.monthsOptions[0] === 1) return 'تسویه ماهانه';
  return p.monthsOptions.map((m) => faDigits(m)).join('، ') + ' ماه';
};

export function CreditSection() {
  const q = usePublicCreditProducts();
  const byKind = (k: Kind) => q.data?.find((p) => p.kind === k);
  const [free, setFree] = useState(150_000_000);
  const loanPct = byKind('loan')?.maxPctOfAssets ?? 40;

  return (
    <Section
      id="credit"
      eyebrow="اعتبار و تسهیلات"
      title="اعتبار، با پشتوانه دارایی خودتان"
      lead="ظرفیت اعتباری فقط از دارایی آزاد محاسبه می‌شود. هنگام استفاده، معادل مبلغ به‌عنوان وثیقه قفل می‌شود و با تسویه دوباره آزاد است."
    >
      <div className="s-g s-g3">
        {CARDS.map((c) => {
          const p = byKind(c.kind);
          return (
            <article key={c.kind} className={'card s-card ' + c.c}>
              <span className="s-itile"><Icon name={c.icon} /></span>
              <h3 className="s-h3">{c.title}</h3>
              <p style={{ fontSize: 14, lineHeight: 1.95, color: 'var(--text-secondary)' }}>{c.text}</p>
              <ul className="s-check" style={{ marginTop: 4 }}>
                {c.points.map((pt) => <li key={pt}><Icon name="check" />{pt}</li>)}
              </ul>
              <dl className="s-kv" style={{ margin: '8px 0 0' }} aria-busy={q.isLoading}>
                <div><dt className="k">سقف</dt><dd className="v" style={{ margin: 0 }}>{faDigits(p?.maxPctOfAssets ?? c.fallbackPct)}٪ آزاد</dd></div>
                <div><dt className="k">نرخ سالانه</dt><dd className="v" style={{ margin: 0 }}>{q.isLoading ? <span className="s-skl" style={{ display: 'block', height: 18, width: '70%' }} /> : rate(p)}</dd></div>
                <div><dt className="k">مدت</dt><dd className="v" style={{ margin: 0 }} title={months(p)}>{q.isLoading ? <span className="s-skl" style={{ display: 'block', height: 18, width: '70%' }} /> : months(p)}</dd></div>
              </dl>
            </article>
          );
        })}
      </div>

      <div className="card s-card" style={{ marginTop: 20 }}>
        <div className="s-calc">
          <div className="s-col" style={{ gap: 10 }}>
            <h3 className="s-h3">سقف وام خود را تخمین بزنید</h3>
            <label htmlFor="s-free" className="cap" style={{ fontSize: 13 }}>دارایی آزاد شما (بدون قفل‌های زمانی و مرحله‌ای سازمان)</label>
            <div className="s-row" style={{ gap: 6, alignItems: 'baseline' }}>
              <span className="num" style={{ fontSize: 26, lineHeight: 1.3 }}>{money(free)}</span><span className="cap">تومان</span>
            </div>
            <input
              id="s-free"
              className="s-range"
              type="range"
              min={10_000_000}
              max={2_000_000_000}
              step={10_000_000}
              value={free}
              onChange={(e) => setFree(Number(e.target.value))}
              aria-valuetext={`${compactMoney(free)} تومان`}
              dir="ltr"
            />
            <div className="s-row cap" style={{ justifyContent: 'space-between' }}><span>۱۰ میلیون</span><span>۲ میلیارد</span></div>
          </div>
          <div className="s-col" style={{ gap: 12, padding: 16, borderRadius: 16, background: 'rgb(var(--primary-main-rgb) / .08)' }} aria-live="polite">
            <span className="cap" style={{ fontSize: 13 }}>سقف وام تا {faDigits(loanPct)}٪ دارایی آزاد</span>
            <span className="num" style={{ fontSize: 30, lineHeight: 1.3, color: 'var(--primary-text)' }}>{money((free * loanPct) / 100)} <span style={{ fontSize: 14, color: 'var(--text-secondary)' }}>تومان</span></span>
            <span className="cap">برآورد است؛ سقف نهایی پس از اعتبارسنجی و طبق قرارداد سازمان شما تعیین می‌شود.</span>
            <Link href={routes.app.login} className="btn contained c-primary" style={{ alignSelf: 'flex-start' }}>درخواست در اپ<Icon name="forward" /></Link>
          </div>
        </div>
      </div>
    </Section>
  );
}
