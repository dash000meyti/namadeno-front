import type { Metadata } from 'next';
import Link from 'next/link';
import { Icon } from '@/components/ui/Icon';
import { faDigits } from '@/lib/format';
import { routes } from '@/lib/routes';

export const metadata: Metadata = {
  title: 'نقشه محصول',
  description: 'نقشه محصول نمادنو و نقاط شروع: اپ کارکنان، پنل سازمانی، کنسول بهره‌بردار و سایت عمومی.',
};

interface Item { label: string; href: string }
interface Group { name: string; items: Item[] }
interface Surface { name: string; sub: string; start: string; startLabel: string; groups: Group[] }

const L = (href: string, label: string): Item => ({ href, label });
const a = routes.app;
const o = routes.org;
const op = routes.op;
const s = routes.site;

/** Ported from the design's Main.dc.html; links point to the real routes (docs/IMPLEMENTATION-GUIDE.md). */
const SURFACES: Surface[] = [
  {
    name: 'اپلیکیشن', sub: 'کاربر نهایی · وب‌اپ موبایل', start: a.login, startLabel: 'شروع از ورود', groups: [
      { name: 'ورود و خانه', items: [L(a.login, 'ورود'), L(a.signup, 'ثبت‌نام'), L(a.home, 'دارایی‌ها'), L(a.notifications, 'اعلان‌ها'), L(a.profile, 'حساب من'), L(a.kyc, 'احراز هویت'), L(a.support, 'پشتیبانی')] },
      { name: 'دریافتی‌ها', items: [L(a.inbox(), 'دریافتی‌ها'), L(a.inbox('in-welfare-aban'), 'بسته تخصیص ثابت'), L(a.inboxDone('in-shahrivar'), 'دریافت انجام شد'), L(a.inboxArchive, 'تأییدشده‌ها')] },
      { name: 'دارایی‌ها', items: [L(a.funds, 'همه صندوق‌ها'), L(a.deposit(), 'افزایش دارایی'), L(a.asset('rial'), 'کیف پول ریالی'), L(a.asset('gold'), 'صندوق طلا'), L(a.asset('fixed'), 'صندوق درآمد ثابت'), L(a.convert('buy', 'gold'), 'خرید و فروش'), L(a.withdraw, 'برداشت'), L(a.receipt('tx-01'), 'رسید'), L(a.history(), 'تاریخچه'), L(a.transaction('tx-01'), 'جزئیات تراکنش')] },
      { name: 'اعتبار و وام', items: [L(a.credit, 'اعتبار و تسهیلات'), L(a.score, 'امتیاز اعتباری'), L(a.loan, 'درخواست وام'), L(a.loanConfirm(20_000_000, 12, 'gold'), 'تأیید وام'), L(a.payInstallment(), 'پرداخت قسط')] },
      { name: 'کارت نمادنو', items: [L(a.card, 'کارت'), L(a.cardCharge, 'شارژ از اعتبار'), L(a.cardOtp, 'رمز پویا'), L(a.cardSettings, 'تنظیمات کارت'), L(a.cardSettle, 'تسویه زودتر')] },
      { name: 'خرید اقساطی', items: [L(a.installment, 'خرید اقساطی'), L(a.store('st-digikala'), 'فروشگاه'), L(a.installmentPlan('st-digikala'), 'طرح اقساط'), L(a.installmentConfirm({ store: 'st-digikala', months: 6 }), 'تأیید خرید'), L(a.installmentDone('inst-1'), 'کد خرید')] },
    ],
  },
  {
    name: 'پنل سازمانی', sub: 'منابع انسانی شرکت‌های طرف قرارداد', start: o.login, startLabel: 'شروع از ورود', groups: [
      { name: 'ورود و داشبورد', items: [L(o.login, 'ورود'), L(o.dashboard, 'داشبورد')] },
      { name: 'کارکنان', items: [L(o.employees, 'کارکنان'), L(o.employee('u-1001'), 'پروفایل کارمند'), L(o.employeeNew, 'افزودن کارمند')] },
      { name: 'بسته‌های دارایی', items: [L(o.packages, 'بسته‌ها'), L(o.newRecipients(), '۱ · گیرندگان'), L(o.newSettings('pkg-draft-yalda'), '۲ · تنظیمات'), L(o.newReview('pkg-draft-yalda'), '۳ · بررسی'), L(o.newSent('pkg-mehr'), 'ارسال شد'), L(o.package('pkg-mehr'), 'جزئیات بسته')] },
      { name: 'تسهیلات و مدیریت', items: [L(o.credit, 'تسهیلات و اعتبار'), L(o.requests, 'درخواست‌ها'), L(o.reports, 'گزارش‌ها'), L(o.contract, 'تنظیمات قرارداد')] },
    ],
  },
  {
    name: 'پنل بهره‌بردار', sub: 'ادمین · صاحبان صندوق و تیم توسعه', start: op.login, startLabel: 'شروع از ورود', groups: [
      { name: 'ورود و نمای کلی', items: [L(op.login, 'ورود'), L(op.overview, 'نمای کلی')] },
      { name: 'سازمان‌ها', items: [L(op.organizations, 'سازمان‌ها و قراردادها'), L(op.organization('org-arman'), 'پروفایل سازمان'), L(op.orgNew, 'افزودن سازمان')] },
      { name: 'صندوق‌ها و محصولات', items: [L(op.funds, 'صندوق‌ها'), L(op.fund('gold'), 'جزئیات صندوق'), L(op.products, 'محصولات اعتباری'), L(op.rules, 'قوانین و محدودیت‌ها')] },
      { name: 'کاربران و ریسک', items: [L(op.users, 'کاربران'), L(op.user('u-1002'), 'پروفایل کاربر'), L(op.requests, 'درخواست‌ها'), L(op.risk, 'ریسک و تقلب')] },
      { name: 'سیستم', items: [L(op.reports, 'گزارش‌ها'), L(op.settings, 'تنظیمات')] },
    ],
  },
];

const SITE: Group[] = [
  { name: 'سایت عمومی', items: [L(s.home, 'خانه'), L(s.business, 'برای سازمان‌ها'), L(s.about, 'درباره ما'), L(s.security, 'امنیت'), L(s.careers, 'فرصت‌های شغلی'), L(s.contact, 'تماس با ما'), L(s.faq, 'سوالات متداول')] },
  { name: 'وبلاگ', items: [L(s.blog, 'فهرست مطالب'), L(s.post('free-vs-locked-assets'), 'یک مطلب')] },
  { name: 'قوانین و مرجع', items: [L(s.terms, 'شرایط استفاده'), L(s.privacy, 'حریم خصوصی'), L(s.designSystem, 'سیستم طراحی')] },
];

const FLOW = [
  { b: '۱ · بهره‌بردار', t: 'قرارداد و محدودیت‌ها را تعریف می‌کند' },
  { b: '۲ · سازمان', t: 'بسته دارایی برای پرسنل می‌فرستد' },
  { b: '۳ · کاربر', t: 'در «دریافتی‌ها» تأیید و تخصیص می‌دهد' },
  { b: '۴ · استفاده', t: 'اعتبار کارت · وام با وثیقه · خرید اقساطی' },
];

const count = (gs: Group[]) => gs.reduce((n, g) => n + g.items.length, 0);

function Links({ groups }: { groups: Group[] }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {groups.map((g) => (
        <div key={g.name} style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <span className="grp">{g.name}</span>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {g.items.map((it) => (
              <Link key={it.href + it.label} className="lnk" href={it.href} title={it.href}>{it.label}</Link>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

export default function MapPage() {
  const total = SURFACES.reduce((n, x) => n + count(x.groups), 0) + count(SITE);
  return (
    <section className="s-sec" style={{ paddingTop: 32 }} aria-labelledby="map-title">
      <div className="s-wrap" style={{ display: 'flex', flexDirection: 'column', gap: 22 }}>
        <header style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'flex-end', gap: '16px 32px' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <span className="s-eyebrow"><span className="dot" />پروتوتایپ کامل · {faDigits(total)} مسیر</span>
            <h1 id="map-title" className="s-h1 page" style={{ fontSize: 'clamp(26px,3vw,32px)' }}>نقشه محصول و نقاط شروع</h1>
          </div>
          <p style={{ maxWidth: 560, fontSize: 13.5, lineHeight: 1.9, color: 'var(--text-secondary)' }}>
            دکمه «شروع از ورود» هر بخش، جریان را از صفحه ورود همان بخش اجرا می‌کند و هر صفحه از این نقشه هم مستقیم باز می‌شود. تم روشن/تیره با دکمه ماه/خورشید در هدر عوض می‌شود و بین صفحه‌ها می‌ماند. داده‌ها نمایشی‌اند و با «بازنشانی داده‌های نمایشی» در «حساب من» به حالت اول برمی‌گردند.
          </p>
        </header>

        <section className="card s-map-flow" aria-label="جریان اصلی">
          <span className="lbl" style={{ background: 'rgb(var(--primary-main-rgb) / .16)', color: 'var(--primary-text)', flex: 'none' }}>جریان اصلی</span>
          {FLOW.map((f, i) => (
            <span key={f.b} style={{ display: 'contents' }}>
              {i > 0 && <Icon name="forward" />}
              <span className="st"><b>{f.b}</b> {f.t}</span>
            </span>
          ))}
        </section>

        <div className="s-map-grid">
          {SURFACES.map((sf) => (
            <section key={sf.name} className="card" style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 14, minWidth: 0 }} aria-label={sf.name}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                  <span style={{ fontSize: 17, fontWeight: 700 }}>{sf.name}</span>
                  <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{sf.sub} · {faDigits(count(sf.groups))} صفحه</span>
                </div>
                <Link href={sf.start} className="btn sm contained c-primary" style={{ height: 34, flex: 'none' }}><Icon name="play" size={16} />{sf.startLabel}</Link>
              </div>
              <Links groups={sf.groups} />
            </section>
          ))}
        </div>

        <section className="card" style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 14 }} aria-label="سایت عمومی">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <span style={{ fontSize: 17, fontWeight: 700 }}>سایت عمومی</span>
            <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>معرفی محصول، وبلاگ و صفحات اطلاعاتی · {faDigits(count(SITE))} صفحه</span>
          </div>
          <div className="s-g s-g3" style={{ gap: 16 }}><Links groups={SITE.slice(0, 1)} /><Links groups={SITE.slice(1, 2)} /><Links groups={SITE.slice(2)} /></div>
        </section>
      </div>
    </section>
  );
}
