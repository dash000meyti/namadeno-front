'use client';
import { useState } from 'react';
import type { LockType } from '@/types/domain';
import { Icon } from '@/components/ui/Icon';
import { LockBar, LockLegend, LockTypeChip } from '@/components/ui/LockBar';
import { LOCK_META } from '@/lib/locks';
import { faDigits, money } from '@/lib/format';
import { Section } from '../Section';

interface LockExample { text: string; release: string; holding: string; total: number; locked: number; title: string; condition: string; steps?: ('released' | 'pending' | 'future')[] }

export const LOCK_INFO: Record<LockType, LockExample> = {
  collateral: {
    text: 'وقتی وام می‌گیرید یا از اعتبار کارت استفاده می‌کنید، معادل آن از دارایی آزاد به‌عنوان وثیقه قفل می‌شود.',
    release: 'با تسویه وام یا صورت‌حساب کارت آزاد می‌شود.',
    holding: 'صندوق طلا', total: 98_000_000, locked: 30_000_000, title: 'وثیقه وام', condition: 'آزاد با تسویه وام · ۴ از ۱۲ قسط پرداخت شده',
  },
  vesting: {
    text: 'سازمان می‌تواند برای ماندگاری کارکنان، بسته را با تاریخ آزادسازی بفرستد. سود و تغییر ارزش در این مدت برای شماست.',
    release: 'در تاریخ تعیین‌شده، خودکار آزاد می‌شود.',
    holding: 'صندوق درآمد ثابت', total: 64_000_000, locked: 20_000_000, title: 'پاداش تیر ۱۴۰۵', condition: 'آزاد در ۱۴۰۵/۱۰/۱۵',
  },
  installment: {
    text: 'در خرید اقساطی از فروشگاه‌های طرف قرارداد، بخشی از دارایی آزاد وثیقه اقساط می‌شود.',
    release: 'با پرداخت هر قسط، بخشی از وثیقه آزاد می‌شود.',
    holding: 'صندوق مختلط', total: 5_800_000, locked: 3_500_000, title: 'خرید اقساطی دیجی‌کالا', condition: 'با پرداخت هر قسط، بخشی آزاد می‌شود',
  },
  milestone: {
    text: 'برای قراردادهای پروژه‌ای: کل مبلغ از روز اول به نام شما ثبت می‌شود و هر مرحله با تأیید سازمان آزاد می‌شود.',
    release: 'با تأیید هر مرحله توسط سازمان، سهم همان مرحله آزاد می‌شود.',
    holding: 'صندوق طلا', total: 98_000_000, locked: 12_000_000, title: 'قرارداد پروژه پرتال منابع انسانی', condition: 'با تأیید هر مرحله توسط سازمان آزاد می‌شود',
    steps: ['released', 'released', 'pending', 'future', 'future'],
  },
  legal: {
    text: 'در صورت دستور مرجع قضایی یا قانونی، بخشی از دارایی مسدود می‌شود و دلیل آن در اپ نمایش داده می‌شود.',
    release: 'با رفع دستور توسط مرجع ذی‌صلاح آزاد می‌شود.',
    holding: 'کیف پول ریالی', total: 24_400_000, locked: 2_000_000, title: 'مسدودی به دستور مرجع قضایی', condition: 'تا اعلام رفع مسدودی',
  },
};

export const LOCK_ORDER: LockType[] = ['collateral', 'vesting', 'installment', 'milestone', 'legal'];

const STEP_STYLE = {
  released: { background: 'var(--primary-main)' },
  pending: { boxShadow: 'inset 0 0 0 1.5px var(--warning-main)' },
  future: { background: 'var(--progress-track)' },
};

export function LockItemRow({ type }: { type: LockType }) {
  const ex = LOCK_INFO[type];
  const released = ex.steps?.filter((s) => s === 'released').length ?? 0;
  return (
    <div style={{ minHeight: 56, padding: '10px 0', display: 'flex', alignItems: 'center', gap: 12 }}>
      <LockTypeChip type={type} />
      <span className="s-col" style={{ flex: 1, gap: 3, lineHeight: 1.45 }}>
        <span style={{ fontSize: 13.5, fontWeight: 600 }}>{ex.title}</span>
        <span className="cap" style={{ lineHeight: 1.45 }}>{ex.condition}</span>
        {ex.steps && (
          <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ display: 'inline-flex', gap: 3 }}>{ex.steps.map((s, i) => <span key={i} className="lkstep" style={STEP_STYLE[s]} />)}</span>
            <span className="cap" style={{ fontSize: 11 }}>{faDigits(released)} از {faDigits(ex.steps.length)} مرحله · ۴۰٪ آزاد شده</span>
          </span>
        )}
      </span>
      <span className="s-col" style={{ alignItems: 'flex-end', lineHeight: 1.4 }}>
        <span className="num" style={{ fontSize: 14, fontWeight: 500, whiteSpace: 'nowrap' }}>{money(ex.locked)}</span>
        <span className="cap" style={{ fontSize: 11 }}>{ex.holding}</span>
      </span>
    </div>
  );
}

export function LocksSection() {
  const [sel, setSel] = useState<LockType>('collateral');
  const ex = LOCK_INFO[sel];
  const free = ex.total - ex.locked;
  return (
    <Section
      id="locks"
      eyebrow="آزاد و قفل‌شده"
      title="همیشه می‌دانید چه مقدار از دارایی‌تان آزاد است"
      lead="هر کیف پول و صندوق دو بخش دارد. «قابل برداشت»، «قابل فروش» و «حداکثر» همیشه فقط از بخش آزاد محاسبه می‌شود و کنار هر قفل، دلیل و شرط آزادسازی‌اش نوشته شده است."
    >
      <div className="s-locks">
        <div className="s-lockopts" role="group" aria-label="انواع قفل">
          {LOCK_ORDER.map((t) => (
            <button key={t} type="button" className="s-lockopt" aria-pressed={sel === t} onClick={() => setSel(t)}>
              <LockTypeChip type={t} style={{ marginTop: 3 }} />
              <span className="s-col" style={{ gap: 2 }}>
                <span className="t">{LOCK_META[t].label}</span>
                <span className="d">{LOCK_INFO[t].text}</span>
              </span>
            </button>
          ))}
        </div>

        <div className="s-lock-demo" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div className="card s-card" aria-live="polite">
            <div className="s-row" style={{ gap: 8 }}>
              <span style={{ fontSize: 14, fontWeight: 700 }}>{ex.holding}</span>
              <span className="lbl soft c-default" style={{ marginRight: 'auto', height: 22, fontSize: 11 }}>نمونه</span>
            </div>
            <div className="s-row" style={{ gap: 4, alignItems: 'baseline' }}>
              <span className="num" style={{ fontSize: 28, lineHeight: 1.3 }}>{money(ex.total)}</span>
              <span className="cap">تومان</span>
            </div>
            <LockBar free={free} locked={ex.locked} height={8} />
            <LockLegend free={free} locked={ex.locked} />
            <hr className="s-divider" style={{ margin: '6px 0 0', borderTop: 0 }} />
            <LockItemRow type={sel} />
            <div className="alert soft c-primary" style={{ marginTop: 4 }}>
              <Icon name="info" />
              <span><b>آزادسازی:</b> {ex.release} قابل برداشت این صندوق اکنون <b className="num" style={{ fontWeight: 600 }}>{money(free)}</b> تومان است.</span>
            </div>
          </div>
          <div className="alert soft c-success">
            <Icon name="trend" />
            <span>دارایی قفل‌شده هم مال شماست؛ سود و تغییر ارزش آن برای شماست و فقط تا رفع شرط، قابل فروش یا برداشت نیست.</span>
          </div>
        </div>
      </div>
    </Section>
  );
}
