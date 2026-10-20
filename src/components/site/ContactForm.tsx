'use client';
/**
 * Contact / demo-request form → POST /public/contact (useContactForm).
 * Client-side validation, server errors mapped to fields (details.field) or a toast, success state with the ticket number.
 */
import { useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useContactForm } from '@/api/site';
import { ApiRequestError } from '@/api/client';
import { Icon } from '@/components/ui/Icon';
import { useToast } from '@/components/ui/Toast';
import { enDigits, faDigits } from '@/lib/format';
import { routes } from '@/lib/routes';

type Variant = 'contact' | 'demo';
type Field = 'name' | 'phone' | 'email' | 'company' | 'topic' | 'employees' | 'message';
type Values = Record<Field, string>;

export const CONTACT_TOPICS = [
  { v: 'support', label: 'پشتیبانی کاربران اپ' },
  { v: 'business', label: 'همکاری سازمانی' },
  { v: 'careers', label: 'فرصت‌های شغلی' },
  { v: 'media', label: 'رسانه و روابط عمومی' },
  { v: 'other', label: 'سایر' },
];

const EMPLOYEE_RANGES = ['کمتر از ۵۰ نفر', '۵۰ تا ۲۰۰ نفر', '۲۰۰ تا ۱۰۰۰ نفر', 'بیش از ۱۰۰۰ نفر'];

const cleanPhone = (s: string) => enDigits(s).replace(/[\s-]/g, '');

function validate(v: Values, variant: Variant): Partial<Record<Field, string>> {
  const e: Partial<Record<Field, string>> = {};
  if (v.name.trim().length < 3) e.name = 'نام و نام خانوادگی را کامل وارد کنید.';
  const ph = cleanPhone(v.phone);
  if (!ph) e.phone = 'شماره تماس الزامی است.';
  else if (!/^0\d{10}$/.test(ph)) e.phone = 'شماره تماس باید ۱۱ رقم و با ۰ شروع شود.';
  if (v.email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.email.trim())) e.email = 'نشانی ایمیل معتبر نیست.';
  if (variant === 'demo') {
    if (v.company.trim().length < 2) e.company = 'نام سازمان الزامی است.';
    if (!v.employees) e.employees = 'تعداد کارکنان را انتخاب کنید.';
  } else {
    if (!v.topic) e.topic = 'موضوع پیام را انتخاب کنید.';
    if (v.message.trim().length < 10) e.message = 'پیام باید دست‌کم ۱۰ نویسه باشد.';
  }
  return e;
}

export function ContactForm({ variant = 'contact', initialTopic = '' }: { variant?: Variant; initialTopic?: string }) {
  const empty: Values = { name: '', phone: '', email: '', company: '', topic: CONTACT_TOPICS.some((t) => t.v === initialTopic) ? initialTopic : '', employees: '', message: '' };
  const [v, setV] = useState<Values>(empty);
  const [touched, setTouched] = useState<Partial<Record<Field, boolean>>>({});
  const [submitted, setSubmitted] = useState(false);
  const [serverErr, setServerErr] = useState<Partial<Record<Field, string>>>({});
  const m = useContactForm();
  const toast = useToast();

  // client validation wins; server messages fill fields the client considered valid
  const errors = { ...serverErr, ...validate(v, variant) };
  const show = (f: Field) => (submitted || touched[f]) && errors[f];
  const set = (f: Field) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const val = e.target.value;
    setV((s) => ({ ...s, [f]: val }));
    if (serverErr[f]) setServerErr((s) => ({ ...s, [f]: undefined }));
  };
  const blur = (f: Field) => () => setTouched((t) => ({ ...t, [f]: true }));

  const submit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setSubmitted(true);
    const errs = validate(v, variant);
    if (Object.keys(errs).length) {
      const first = Object.keys(errs)[0];
      document.getElementById(`cf-${variant}-${first}`)?.focus();
      return;
    }
    const topicLabel = CONTACT_TOPICS.find((t) => t.v === v.topic)?.label;
    const lines = variant === 'demo'
      ? ['درخواست دمو', `تعداد کارکنان: ${v.employees}`, v.email.trim() && `ایمیل: ${v.email.trim()}`, v.message.trim()]
      : [`موضوع: ${topicLabel}`, v.email.trim() && `ایمیل: ${v.email.trim()}`, v.message.trim()];
    m.mutate(
      { name: v.name.trim(), phone: cleanPhone(v.phone), company: v.company.trim() || undefined, message: lines.filter(Boolean).join('\n') },
      {
        onError: (err) => {
          if (err instanceof ApiRequestError) {
            const field = err.details?.field as Field | undefined;
            if (field && field in empty) setServerErr({ [field]: err.message });
            else toast(err.message, 'error');
          } else toast('ارسال انجام نشد. اتصال اینترنت را بررسی کنید.', 'error');
        },
      },
    );
  };

  const reset = () => { setV(empty); setTouched({}); setSubmitted(false); setServerErr({}); m.reset(); };

  if (m.isSuccess && m.data) {
    return (
      <div className="s-done" role="status">
        <span className="s-done-ic"><Icon name="check" /></span>
        <h3 className="s-h3">{variant === 'demo' ? 'درخواست دمو ثبت شد' : 'پیام شما ثبت شد'}</h3>
        <p style={{ fontSize: 14, lineHeight: 2, color: 'var(--text-secondary)', maxWidth: 420 }}>
          {variant === 'demo'
            ? 'کارشناسان فروش سازمانی تا دو روز کاری آینده برای هماهنگی جلسه با شما تماس می‌گیرند.'
            : 'همکاران ما در اولین فرصت (معمولاً تا یک روز کاری) پاسخ می‌دهند.'}
        </p>
        <span className="chip soft c-primary">کد پیگیری: <b className="num" dir="ltr" style={{ fontWeight: 600 }}>{faDigits(m.data.ticket)}</b></span>
        <div className="s-actions" style={{ justifyContent: 'center', marginTop: 4 }}>
          <button type="button" className="btn soft c-primary" onClick={reset}>ارسال پیام دیگر</button>
          <Link href={routes.site.home} className="btn c-primary">بازگشت به خانه</Link>
        </div>
      </div>
    );
  }

  const id = (f: Field) => `cf-${variant}-${f}`;
  const fieldProps = (f: Field) => ({
    id: id(f),
    value: v[f],
    onChange: set(f),
    onBlur: blur(f),
    'aria-invalid': show(f) ? true : undefined,
    'aria-describedby': `${id(f)}-help`,
  });
  const help = (f: Field, hint?: string) => (
    <span id={`${id(f)}-help`} className={'tf-help' + (show(f) ? ' err' : '')}>{show(f) ? errors[f] : hint ?? ''}</span>
  );

  return (
    <form className="s-form" onSubmit={submit} noValidate aria-label={variant === 'demo' ? 'فرم درخواست دمو' : 'فرم تماس'}>
      {variant === 'demo' && (
        <div className="s-form-row">
          <div className="s-fieldset">
            <div className={'tf' + (show('company') ? ' err' : '')}><label className="fl" htmlFor={id('company')}>نام سازمان *</label><input type="text" autoComplete="organization" {...fieldProps('company')} /></div>
            {help('company')}
          </div>
          <div className="s-fieldset">
            <div className={'tf' + (show('employees') ? ' err' : '')}>
              <label className="fl" htmlFor={id('employees')}>تعداد کارکنان *</label>
              <select {...fieldProps('employees')}>
                <option value="">انتخاب کنید</option>
                {EMPLOYEE_RANGES.map((r) => <option key={r} value={r}>{r}</option>)}
              </select>
              <Icon d="M6 9l6 6 6-6" size={18} style={{ color: 'var(--text-secondary)', pointerEvents: 'none' }} />
            </div>
            {help('employees')}
          </div>
        </div>
      )}
      <div className="s-form-row">
        <div className="s-fieldset">
          <div className={'tf' + (show('name') ? ' err' : '')}><label className="fl" htmlFor={id('name')}>نام و نام خانوادگی *</label><input type="text" autoComplete="name" {...fieldProps('name')} /></div>
          {help('name')}
        </div>
        <div className="s-fieldset">
          <div className={'tf' + (show('phone') ? ' err' : '')}><label className="fl" htmlFor={id('phone')}>شماره تماس *</label><input type="tel" inputMode="tel" autoComplete="tel" dir="ltr" style={{ textAlign: 'right' }} placeholder="۰۹۱۲ ۳۴۵ ۶۷۸۹" {...fieldProps('phone')} /></div>
          {help('phone', 'موبایل یا تلفن ثابت با پیش‌شماره')}
        </div>
      </div>
      <div className="s-form-row">
        <div className="s-fieldset">
          <div className={'tf' + (show('email') ? ' err' : '')}><label className="fl" htmlFor={id('email')}>ایمیل (اختیاری)</label><input type="email" autoComplete="email" dir="ltr" style={{ textAlign: 'right' }} {...fieldProps('email')} /></div>
          {help('email')}
        </div>
        {variant === 'contact' && (
          <div className="s-fieldset">
            <div className={'tf' + (show('topic') ? ' err' : '')}>
              <label className="fl" htmlFor={id('topic')}>موضوع *</label>
              <select {...fieldProps('topic')}>
                <option value="">انتخاب کنید</option>
                {CONTACT_TOPICS.map((t) => <option key={t.v} value={t.v}>{t.label}</option>)}
              </select>
              <Icon d="M6 9l6 6 6-6" size={18} style={{ color: 'var(--text-secondary)', pointerEvents: 'none' }} />
            </div>
            {help('topic')}
          </div>
        )}
      </div>
      <div className="s-fieldset">
        <div className={'tf ta' + (show('message') ? ' err' : '')}>
          <label className="fl" htmlFor={id('message')}>{variant === 'demo' ? 'توضیحات (اختیاری)' : 'پیام *'}</label>
          <textarea rows={4} {...fieldProps('message')} placeholder={variant === 'demo' ? 'مثلاً نوع مزایایی که پرداخت می‌کنید یا زمان مناسب تماس' : ''} />
        </div>
        {help('message')}
      </div>
      {v.topic === 'support' && variant === 'contact' && (
        <div className="alert soft c-info">
          <Icon name="info" />
          <span>اگر کاربر اپ هستید، سریع‌ترین راه، ثبت تیکت از بخش <Link href={routes.app.support}>پشتیبانی اپ</Link> است.</span>
        </div>
      )}
      <div className="s-row" style={{ flexWrap: 'wrap', gap: 12 }}>
        <button type="submit" className="btn lg contained c-primary" disabled={m.isPending} aria-busy={m.isPending}>
          {m.isPending ? 'در حال ارسال…' : variant === 'demo' ? 'ثبت درخواست دمو' : 'ارسال پیام'}
          {!m.isPending && <Icon name="send" />}
        </button>
        <span className="cap">با ارسال فرم، <Link href={routes.site.privacy}>سیاست حریم خصوصی</Link> را می‌پذیرید.</span>
      </div>
    </form>
  );
}

/** Contact form preset from ?topic= (e.g. /contact?topic=careers). Render inside <Suspense>. */
export function ContactFormFromQuery() {
  const sp = useSearchParams();
  const topic = sp.get('topic') ?? '';
  return <ContactForm key={topic} variant="contact" initialTopic={topic} />;
}
