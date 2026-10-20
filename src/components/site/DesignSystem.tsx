'use client';
/** /design-system — compact living reference of tokens and core components (ns-foundation, ns-components-a/b). */
import { useEffect, useState } from 'react';
import type { LockType } from '@/types/domain';
import { Icon } from '@/components/ui/Icon';
import { LockBar, LockLegend, LockTypeChip } from '@/components/ui/LockBar';
import { money } from '@/lib/format';
import { useColorMode } from '@/theme/ColorModeProvider';
import { LockItemRow } from './home/LocksSection';
import { Sparkline } from './FundCard';

const GREYS = ['50', '100', '200', '300', '400', '500', '600', '700', '800', '900'];
const RAMPS: { name: string; fa: string; steps: string[] }[] = [
  { name: 'primary', fa: 'نیلی برند', steps: ['lighter', 'light', 'main', 'dark', 'darker'] },
  { name: 'secondary', fa: 'فیروزه‌ای', steps: ['lighter', 'light', 'main', 'dark', 'darker'] },
  { name: 'success', fa: 'سبز برند', steps: ['lighter', 'light', 'main', 'dark', 'darker'] },
  { name: 'info', fa: 'آبی آسمانی', steps: ['lighter', 'light', 'main', 'dark'] },
  { name: 'warning', fa: 'کهربایی', steps: ['lighter', 'light', 'main', 'dark'] },
  { name: 'error', fa: 'قرمز', steps: ['lighter', 'light', 'main', 'dark'] },
];
const THEME_TOKENS = ['bg-default', 'bg-paper', 'bg-neutral', 'bg-canvas', 'card-bg', 'glass-bg', 'text-primary', 'text-secondary', 'text-disabled', 'divider', 'action-hover', 'action-selected', 'primary-text', 'success-text'];
const TYPE: { name: string; sample: string; size: number; weight: number; lh: number; ls?: string; display?: boolean; color?: string }[] = [
  { name: 'h1', sample: 'مدیریت ثروت، ساده و شفاف', size: 40, weight: 700, lh: 1.25 },
  { name: 'wordmark · Divan', sample: 'نمادنو', size: 40, weight: 700, lh: 1.25, display: true },
  { name: 'h2', sample: 'داشبورد سازمان', size: 32, weight: 700, lh: 1.3 },
  { name: 'h3', sample: 'پرداخت حقوق مهر ۱۴۰۵', size: 24, weight: 700, lh: 1.4 },
  { name: 'h4', sample: 'تراکنش‌های اخیر', size: 20, weight: 700, lh: 1.5 },
  { name: 'h5', sample: 'اعتبار در دسترس', size: 18, weight: 700, lh: 1.5 },
  { name: 'subtitle1', sample: 'واریز حقوق — هلدینگ آرمان', size: 16, weight: 600, lh: 1.5 },
  { name: 'body1', sample: 'برای ادامه، کد تأیید ارسال‌شده به شماره همراه خود را وارد کنید.', size: 16, weight: 400, lh: 1.5 },
  { name: 'body2', sample: 'آخرین به‌روزرسانی: ۱۴ مهر ۱۴۰۵ — ساعت ۰۹:۱۲', size: 14, weight: 400, lh: 1.57 },
  { name: 'caption', sample: 'کارمزد انتقال: ۵٬۰۰۰ تومان', size: 12, weight: 400, lh: 1.5, color: 'var(--text-secondary)' },
  { name: 'overline', sample: 'حساب‌ها و کارت‌ها', size: 12, weight: 700, lh: 1.5, ls: '.08em', color: 'var(--text-secondary)' },
  { name: 'button', sample: 'تأیید و ارسال', size: 14, weight: 700, lh: 1.71, color: 'var(--primary-text)' },
  { name: 'numeral', sample: '۲۴۸٬۶۵۰٬۰۰۰ تومان', size: 28, weight: 300, lh: 1.2 },
];
const RADII = [{ n: 'sm · 8', px: 8 }, { n: 'md · 12', px: 12 }, { n: 'lg · 16', px: 16 }, { n: 'xl · 24', px: 24 }, { n: 'pill', px: 999 }];
const SPACING = [4, 8, 12, 16, 20, 24, 32, 40, 48, 64];
const SHADOWS = ['shadow-z1', 'shadow-z8', 'shadow-z24', 'shadow-card', 'shadow-dropdown', 'shadow-primary', 'shadow-glass'];
const COLORS = ['primary', 'secondary', 'info', 'success', 'warning', 'error', 'default'];
const COLOR_FA: Record<string, string> = { primary: 'اصلی', secondary: 'ثانویه', info: 'اطلاع', success: 'موفق', warning: 'هشدار', error: 'خطا', default: 'پیش‌فرض' };
const LOCKS: (LockType | 'none')[] = ['none', 'collateral', 'vesting', 'installment', 'milestone', 'legal'];

const NAV = [
  { id: 'ds-colors', label: 'رنگ‌ها' }, { id: 'ds-theme', label: 'توکن‌های تم' }, { id: 'ds-type', label: 'تایپوگرافی' },
  { id: 'ds-shape', label: 'شعاع و فاصله' }, { id: 'ds-shadow', label: 'سایه‌ها' }, { id: 'ds-buttons', label: 'دکمه‌ها' },
  { id: 'ds-labels', label: 'برچسب و چیپ' }, { id: 'ds-fields', label: 'فیلدها و هشدار' }, { id: 'ds-locks', label: 'آزاد و قفل‌شده' }, { id: 'ds-cards', label: 'کارت‌ها' },
];

/** Reads the current computed values of CSS custom properties (refreshes after a theme switch). */
function useCssVars(names: string[]) {
  const { mode } = useColorMode();
  const [vals, setVals] = useState<Record<string, string>>({});
  const key = names.join('|');
  useEffect(() => {
    const id = requestAnimationFrame(() => {
      const cs = getComputedStyle(document.documentElement);
      const out: Record<string, string> = {};
      for (const n of key.split('|')) out[n] = cs.getPropertyValue('--' + n).trim();
      setVals(out);
    });
    return () => cancelAnimationFrame(id);
  }, [key, mode]);
  return vals;
}

function Block({ id, title, en, children }: { id: string; title: string; en: string; children: React.ReactNode }) {
  return (
    <section id={id} className="card s-card" aria-labelledby={`${id}-h`} style={{ gap: 14 }}>
      <div className="s-row" style={{ justifyContent: 'space-between', alignItems: 'baseline', flexWrap: 'wrap', gap: 6 }}>
        <h2 id={`${id}-h`} style={{ fontSize: 17, fontWeight: 700 }}>{title}</h2>
        <span className="s-code">{en}</span>
      </div>
      {children}
    </section>
  );
}

function Swatch({ v, label, value }: { v: string; label: string; value?: string }) {
  return (
    <div className="s-sw">
      <i style={{ background: `var(--${v})` }} />
      <b>{label}</b>
      <small title={value}>{value || ' '}</small>
    </div>
  );
}

export function DesignSystem() {
  const { mode, toggle } = useColorMode();
  const rampVars = RAMPS.flatMap((r) => r.steps.map((s) => `${r.name}-${s}`));
  const vals = useCssVars([...GREYS.map((g) => 'grey-' + g), ...rampVars, ...THEME_TOKENS]);
  const [seg, setSeg] = useState('مجازی');
  const [sw, setSw] = useState(true);

  return (
    <section className="s-sec" style={{ paddingTop: 16 }} aria-label="مرجع سیستم طراحی">
      <div className="s-wrap" style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
        <div className="s-row" style={{ flexWrap: 'wrap', gap: 10 }}>
          <nav className="s-ds-nav" aria-label="بخش‌های سیستم طراحی" style={{ flex: '1 1 400px' }}>
            {NAV.map((n) => <a key={n.id} href={`#${n.id}`} className="chip soft c-default">{n.label}</a>)}
          </nav>
          <button type="button" className="btn soft c-primary" onClick={toggle}><Icon name={mode === 'dark' ? 'sun' : 'moon'} />{mode === 'dark' ? 'مشاهده در تم روشن' : 'مشاهده در تم تیره'}</button>
        </div>

        <Block id="ds-colors" title="پالت رنگ" en="grey + 6 semantic ramps · tokens.css">
          <div className="s-col" style={{ gap: 6 }}>
            <span style={{ fontSize: 12.5, fontWeight: 700 }}>Grey — خنثی‌های سرد با ته‌رنگ نیلی</span>
            <div className="s-sw-grid grey">{GREYS.map((g) => <Swatch key={g} v={'grey-' + g} label={g} value={vals['grey-' + g]} />)}</div>
          </div>
          <div className="s-g s-g2" style={{ gap: '16px 24px' }}>
            {RAMPS.map((r) => (
              <div key={r.name} className="s-col" style={{ gap: 6 }}>
                <div className="s-row" style={{ gap: 8, alignItems: 'baseline' }}>
                  <span style={{ fontSize: 13, fontWeight: 700 }} dir="ltr">{r.name}</span>
                  <span className="cap">{r.fa}</span>
                </div>
                <div className="s-sw-grid">{r.steps.map((s) => <Swatch key={s} v={`${r.name}-${s}`} label={s} value={vals[`${r.name}-${s}`]} />)}</div>
              </div>
            ))}
          </div>
          <div className="s-col" style={{ gap: 6 }}>
            <span style={{ fontSize: 12.5, fontWeight: 700 }}>گرادیان برند <span className="s-code">--brand-gradient</span></span>
            <div style={{ height: 40, borderRadius: 12, background: 'var(--brand-gradient)' }} />
          </div>
        </Block>

        <Block id="ds-theme" title={`توکن‌های تم — ${mode === 'dark' ? 'تیره' : 'روشن'}`} en="background / text / divider / action">
          <div className="s-g s-g2" style={{ gap: '0 24px' }}>
            {THEME_TOKENS.map((t) => (
              <div key={t} className="s-row" style={{ gap: 10, minHeight: 34, borderBottom: '1px solid var(--divider)' }}>
                <span style={{ width: 30, height: 20, borderRadius: 4, background: `var(--${t})`, border: '1px solid var(--divider)', flex: 'none' }} />
                <span className="s-code" style={{ flex: 1, color: 'var(--text-primary)', fontWeight: 600 }}>--{t}</span>
                <span className="s-code" style={{ maxWidth: '50%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={vals[t]}>{vals[t]}</span>
              </div>
            ))}
          </div>
          <span className="cap">Aurora (<span className="s-code">--bg-aurora</span>): radial-gradientهای کم‌رنگ نیلی، فیروزه‌ای و سبز روی پس‌زمینه صفحه؛ در تم تیره کمی پررنگ‌تر.</span>
        </Block>

        <Block id="ds-type" title="مقیاس تایپوگرافی" en="IRANSansX everywhere · Divan only for the wordmark · numerals 300 tabular">
          <div>
            {TYPE.map((t) => (
              <div key={t.name} className="s-ty-row">
                <div className={'sample' + (t.display ? ' wm' : '')} style={{ fontSize: `clamp(${Math.min(t.size, 18)}px, ${t.size / 12}vw, ${t.size}px)`, fontWeight: t.weight, lineHeight: t.lh, letterSpacing: t.ls, color: t.color, fontVariantNumeric: 'tabular-nums' }}>{t.sample}</div>
                <div className="spec">
                  <span style={{ fontSize: 12, fontWeight: 700 }}>{t.name}</span>
                  <span className="cap" style={{ fontSize: 10.5 }}>{t.size}px · {t.weight} · lh {t.lh}{t.ls ? ` · ls ${t.ls}` : ''} · {t.display ? 'Divan' : 'IRANSansX'}</span>
                </div>
              </div>
            ))}
          </div>
        </Block>

        <Block id="ds-shape" title="شعاع و فاصله" en="radius 8–24 · spacing unit 4/8">
          <div className="s-row" style={{ flexWrap: 'wrap', gap: 16 }}>
            {RADII.map((r) => (
              <div key={r.n} className="s-col" style={{ alignItems: 'center', gap: 4 }}>
                <span style={{ width: 52, height: 52, borderRadius: r.px, background: 'var(--bg-neutral)', border: '1px solid var(--divider)' }} />
                <span className="s-code">{r.n}</span>
              </div>
            ))}
          </div>
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: 10, flexWrap: 'wrap', paddingTop: 8, borderTop: '1px solid var(--divider)' }}>
            {SPACING.map((p) => (
              <div key={p} className="s-col" style={{ alignItems: 'center', gap: 4 }}>
                <span style={{ width: 18, height: p, borderRadius: 2, background: 'var(--primary-main)' }} />
                <span className="s-code">{p}</span>
              </div>
            ))}
          </div>
        </Block>

        <Block id="ds-shadow" title="سایه‌ها" en="grey-500 @16% in light · black in dark · primary = colored hover">
          <div className="s-shadow-grid">
            {SHADOWS.map((s) => <div key={s}><i style={{ boxShadow: `var(--${s})` }} />{s.replace('shadow-', '')}</div>)}
          </div>
        </Block>

        <Block id="ds-buttons" title="دکمه‌ها" en=".btn contained / outlined / soft / text · .c-{color} · sm / md / lg">
          {['contained', 'outlined', 'soft', 'text'].map((v) => (
            <div key={v} className="s-ds-demo">
              {COLORS.map((c) => (
                <button key={c} type="button" className={`btn ${v} c-${c}`}>{COLOR_FA[c]}</button>
              ))}
              <span className="s-code" style={{ marginRight: 'auto' }}>{v}</span>
            </div>
          ))}
          <div className="s-ds-demo">
            <button type="button" className="btn sm contained c-primary">کوچک</button>
            <button type="button" className="btn contained c-primary">متوسط</button>
            <button type="button" className="btn lg contained c-primary">بزرگ</button>
            <button type="button" className="btn contained c-primary"><Icon name="plus" />افزودن کارمند</button>
            <button type="button" className="btn outlined c-primary"><Icon name="download" />دانلود</button>
            <button type="button" className="btn contained c-primary" disabled>غیرفعال</button>
            <button type="button" className="ibtn" aria-label="ویرایش"><Icon name="edit" /></button>
            <button type="button" className="ibtn" aria-label="اشتراک‌گذاری" style={{ background: 'var(--soft-primary)', color: 'var(--primary-text)' }}><Icon name="share" /></button>
          </div>
          <div className="s-ds-demo">
            <div className="s-seg" role="group" aria-label="نمونه کنترل بخش‌بندی‌شده">
              {['فیزیکی', 'مجازی', 'همه'].map((x) => <button key={x} type="button" aria-pressed={seg === x} onClick={() => setSeg(x)}>{x}</button>)}
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={sw}
              aria-label="نمونه کلید"
              onClick={() => setSw((v) => !v)}
              style={{ width: 40, height: 24, borderRadius: 12, border: 0, padding: 3, cursor: 'pointer', display: 'flex', justifyContent: sw ? 'flex-end' : 'flex-start', background: sw ? 'var(--primary-main)' : 'var(--switch-off)', transition: 'background .2s' }}
            >
              <span style={{ width: 18, height: 18, borderRadius: '50%', background: '#FFFFFF', boxShadow: 'var(--shadow-z1)' }} />
            </button>
            <span className="s-code">segmented · switch</span>
          </div>
        </Block>

        <Block id="ds-labels" title="برچسب و چیپ" en=".lbl filled / soft / outlined (24px · radius 6) · .chip (32px pill)">
          {['filled', 'soft', 'outlined'].map((v) => (
            <div key={v} className="s-ds-demo">
              {COLORS.map((c) => <span key={c} className={`lbl ${v} c-${c}`}>{COLOR_FA[c]}</span>)}
              <span className="s-code" style={{ marginRight: 'auto' }}>{v}</span>
            </div>
          ))}
          <div className="s-ds-demo">
            <span className="chip filled c-primary">نیلی</span>
            <span className="chip outlined c-primary">outlined</span>
            <span className="chip soft c-primary">soft</span>
            <span className="chip soft c-default"><span style={{ width: 24, height: 24, borderRadius: '50%', background: 'var(--secondary-main)', color: '#FFFFFF', fontSize: 11, fontWeight: 700, display: 'grid', placeItems: 'center', marginRight: -8 }}>س</span>سارا محمدی</span>
            <span className="chip soft c-success">فیلتر: واریز<Icon name="close" size={14} /></span>
          </div>
        </Block>

        <Block id="ds-fields" title="فیلدها و هشدارها" en=".tf (56px · label floating) · .alert soft / outlined / filled">
          <div className="s-form-row">
            <div className="s-fieldset"><div className="tf"><label className="fl" htmlFor="ds-f1">نام و نام خانوادگی</label><input id="ds-f1" type="text" defaultValue="سارا محمدی" /></div><span className="tf-help">outlined · medium</span></div>
            <div className="s-fieldset"><div className="tf"><label className="fl" htmlFor="ds-f2">مبلغ انتقال</label><input id="ds-f2" type="text" defaultValue={money(12_500_000)} className="num" style={{ fontSize: 18 }} /><span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)' }}>تومان</span></div><span className="tf-help">amount · adornment</span></div>
            <div className="s-fieldset"><div className="tf err"><label className="fl" htmlFor="ds-f3">شماره شبا</label><input id="ds-f3" type="text" defaultValue="IR12 0170 000" dir="ltr" style={{ textAlign: 'right' }} aria-invalid /></div><span className="tf-help err">شماره شبا باید ۲۴ رقم باشد</span></div>
            <div className="s-fieldset"><div className="tf" style={{ borderStyle: 'dashed', color: 'var(--text-disabled)' }}><label className="fl" htmlFor="ds-f4">واحد سازمانی</label><input id="ds-f4" type="text" defaultValue="فنی و مهندسی" disabled /></div><span className="tf-help">disabled</span></div>
          </div>
          <div className="s-g s-g2" style={{ gap: 10 }}>
            <div className="alert soft c-info"><Icon name="info" /><span>برداشت‌ها در چرخه پایا تسویه می‌شوند.</span></div>
            <div className="alert soft c-success"><Icon name="check" /><span>بسته با موفقیت تأیید شد.</span></div>
            <div className="alert soft c-warning"><Icon name="risk" /><span>برای خرید صندوق، احراز سطح ۳ لازم است.</span></div>
            <div className="alert filled c-error"><Icon name="close" /><span>موجودی آزاد کافی نیست.</span></div>
          </div>
        </Block>

        <Block id="ds-locks" title="آزاد و قفل‌شده" en="LockBar · LockLegend · LockTypeChip · lkstep — available = free only">
          <div className="s-g s-g3" style={{ gap: 12 }}>
            {[
              { n: 'صندوق طلا', free: 56_000_000, locked: 42_000_000, st: 'بخشی قفل', c: 'c-warning' },
              { n: 'صندوق سهامی', free: 8_200_000, locked: 0, st: 'همه آزاد', c: 'c-success' },
              { n: 'صندوق نقره', free: 0, locked: 2_100_000, st: 'همه قفل', c: 'c-default' },
            ].map((k) => (
              <div key={k.n} className="card" style={{ padding: '14px 16px', borderRadius: 16, display: 'flex', flexDirection: 'column', gap: 8, minWidth: 0 }}>
                <div className="s-row" style={{ gap: 8 }}><span style={{ fontSize: 13, fontWeight: 600 }}>{k.n}</span><span className={`lbl soft ${k.c}`} style={{ marginRight: 'auto', height: 20, fontSize: 11 }}>{k.st}</span></div>
                <span className="num" style={{ fontSize: 20, lineHeight: 1.2 }}>{money(k.free + k.locked)} <span className="cap">تومان</span></span>
                <LockBar free={k.free} locked={k.locked} />
                <LockLegend free={k.free} locked={k.locked} />
              </div>
            ))}
          </div>
          <div className="s-ds-demo">
            {LOCKS.map((t) => <LockTypeChip key={t} type={t} />)}
          </div>
          <div className="s-ds-demo">
            {LOCKS.slice(1).map((t) => <LockTypeChip key={t} type={t} long />)}
          </div>
          <div className="card" style={{ padding: '0 16px', borderRadius: 16 }}>
            <LockItemRow type="milestone" />
          </div>
          <div className="s-row cap" style={{ gap: 14, flexWrap: 'wrap' }}>
            <span style={{ fontWeight: 700 }}>مراحل:</span>
            <span className="s-row" style={{ gap: 6 }}><span className="lkstep" style={{ background: 'var(--primary-main)' }} />آزاد شده</span>
            <span className="s-row" style={{ gap: 6 }}><span className="lkstep" style={{ boxShadow: 'inset 0 0 0 1.5px var(--warning-main)' }} />در انتظار تأیید سازمان</span>
            <span className="s-row" style={{ gap: 6 }}><span className="lkstep" style={{ background: 'var(--progress-track)' }} />آینده</span>
          </div>
        </Block>

        <Block id="ds-cards" title="کارت‌ها و سطوح" en=".card (glass, radius 16) · .glass (AppBar, nav, popover) · widget summary">
          <div className="s-g s-g3" style={{ gap: 14 }}>
            <div className="card" style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 8, justifyContent: 'space-between' }}>
              <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-secondary)' }}>کاربران فعال</span>
              <span className="num" style={{ fontSize: 30, lineHeight: 1.2 }}>۱٫۲۸ <span style={{ fontSize: 14, fontWeight: 500, color: 'var(--text-secondary)' }}>میلیون</span></span>
              <div className="s-row" style={{ justifyContent: 'space-between' }}>
                <span className="lbl soft c-success" dir="ltr"><Icon name="trend" size={14} strokeWidth={2.2} />+۲٫۶٪</span>
                <Sparkline values={[30, 24, 27, 18, 20, 12, 15, 8, 10, 4].map((v) => 40 - v)} w={110} h={36} color="var(--chart-2)" />
              </div>
              <span className="cap">widget summary · .card</span>
            </div>
            <div style={{ position: 'relative', minHeight: 170, borderRadius: 16, overflow: 'hidden', backgroundColor: 'var(--bg-canvas)', backgroundImage: 'var(--bg-aurora)' }}>
              <span style={{ position: 'absolute', width: 140, height: 140, borderRadius: '50%', background: 'var(--brand-gradient)', filter: 'blur(22px)', opacity: 0.85, left: 24, top: -40 }} />
              <span style={{ position: 'absolute', width: 90, height: 90, borderRadius: '50%', background: 'var(--success-main)', filter: 'blur(22px)', opacity: 0.55, right: 30, bottom: -30 }} />
              <div className="glass" style={{ position: 'absolute', inset: '30px 24px', borderRadius: 12, padding: '14px 16px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
                <span style={{ fontSize: 13, fontWeight: 700 }}>سطح شیشه‌ای</span>
                <span className="cap" style={{ color: 'var(--text-primary)' }} dir="ltr">AppBar · Nav · Bottom nav · Popover</span>
                <span className="s-row" style={{ gap: 6 }}><span style={{ width: 44, height: 6, borderRadius: 3, background: 'var(--primary-main)' }} /><span style={{ width: 28, height: 6, borderRadius: 3, background: 'var(--divider)' }} /></span>
              </div>
            </div>
            <div style={{ borderRadius: 16, padding: 20, background: 'var(--bg-paper)', boxShadow: 'var(--shadow-card)', display: 'flex', flexDirection: 'column', gap: 8 }}>
              <span style={{ fontSize: 14, fontWeight: 700 }}>کارت جامد</span>
              <span className="cap">paper · radius 16 · shadow-card — برای High contrast و جدول‌ها</span>
              <div className="s-row" style={{ gap: 6, marginTop: 'auto' }}>
                <span className="lbl soft c-primary">paper</span><span className="lbl soft c-default">solid</span>
              </div>
            </div>
          </div>
        </Block>
      </div>
    </section>
  );
}
