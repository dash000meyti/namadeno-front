# راهنمای پیاده‌سازی — Namadno Web

این سند قواعد پیاده‌سازی صفحه‌ها از روی طراحی (Design artifact) و نحوهٔ کار با لایهٔ ماک API را توضیح می‌دهد. مخاطب: تیم فرانت و هر کسی که صفحهٔ جدید اضافه می‌کند.

## ساختار

```
src/
  app/                    Next.js App Router
    (site)/               سایت عمومی: لندینگ، وبلاگ، صفحات اطلاعاتی
    app/                  اپلیکیشن کاربر (وب‌اپ موبایل) — /app/...
    org/(auth|panel)/     پنل سازمانی — /org/...
    op/(auth|panel)/      پنل بهره‌بردار — /op/...
  api/                    کلاینت REST و هوک‌های React Query (client.ts, keys.ts, app.ts, org.ts, op.ts, site.ts, auth.ts)
  mocks/                  بک‌اند ماک (MSW): db.ts، seed/*، handlers/*
  components/
    ui/                   Icon، LockBar، Sheet، Toast
    app/                  AppHeader، BottomNav، Scr
    panel/                PanelShell، PageHeading
  lib/                    format.ts (اعداد/تاریخ فارسی)، routes.ts، locks.ts، clock.ts
  styles/                 tokens.css، base.css، app.css، ui.css، shell.css، panel.css، site.css
  theme/                  تم MUI (RTL) و حالت روشن/تیره
  types/domain.ts         مدل داده و قرارداد API
```

## پورت کردن صفحه از طراحی

فایل‌های طراحی: `project/<screen>.dc.html` در آرتیفکت طراحی. هر فایل سه بخش دارد:
- `<helmet><style>` — کلاس‌ها. کلاس‌های مشترک در `src/styles/*.css` آمده‌اند (`card`, `glass`, `num`, `lbl`, `chip`, `btn`, `ibtn`, `ico`, `lkbar`, `lktype`, …). اگر صفحه کلاس اختصاصی دارد، آن را در فایل CSS کنار صفحه بگذارید و زیر یک کلاس ریشهٔ یکتا scope کنید.
- markup بین `</helmet>` و `<script type="text/x-dc">`.
- `class Component … renderVals()` — منطق، state و داده‌های نمایشی.

قواعد تبدیل به JSX:
1. `class` → `className`، `style="a: b"` → `style={{ a: 'b' }}` (camelCase، عدد خالص برای px). استایل‌های طراحی **inline** می‌مانند؛ استایل inline در RTL برعکس نمی‌شود و دقیقاً مثل طراحی است.
2. `{{x}}` → داده واقعی از هوک‌ها؛ `<sc-for list>` → `.map` با `key`؛ `<sc-if value>` → شرط.
3. `this.state` → `useState`. داده‌های hard-code شده با داده API جایگزین شوند (با `lib/format` قالب‌بندی شوند). فلگ‌های پروتوتایپ در localStorage (`nm-pending`، `nm-kyc`، `nm-conv`) دیگر لازم نیستند؛ از API بخوانید.
4. لینک‌ها با `next/link` و `routes` از `lib/routes.ts` (جدول نگاشت پایین).
5. آیکن: `<Icon d="…مسیر طراحی…" />` یا `<Icon name="lock" />`.
6. در `sx` و `styled` MUI جهت‌ها برعکس می‌شوند (stylis-plugin-rtl). برای چیدمان از style inline استفاده کنید؛ MUI فقط برای کامپوننت‌های تعاملی (Dialog، Menu، Tooltip، Switch، …) در صورت نیاز.
7. هر صفحه `'use client'` است. اگر از `useSearchParams` استفاده می‌کند، محتوای صفحه را داخل `<Suspense>` بگذارید. پارامتر مسیر با `useParams()`.
8. متن فارسی دقیقاً از طراحی؛ اعداد فارسی (`money`, `faDigits`, `jDate`, …). بدون ایموجی. aria-labelها حفظ شوند.
9. ابعاد: اپ در قاب حداکثر ۴۴۰px (طراحی ۳۹۰) — از عرض ثابت ۳۹۰ استفاده نکنید. پنل‌ها طراحی ۱۲۸۰×۸۰۰ دارند اما در عمل `<main>` اسکرول می‌شود؛ ارتفاع ثابت صفحه نگذارید و جدول‌ها را با overflow مدیریت کنید.
10. حالت‌های بارگذاری/خطا/خالی: `Skeleton` و `ErrorState` از `components/app/Screen`.

## داده و API

- همهٔ درخواست‌ها با `src/api/client.ts` به `NEXT_PUBLIC_API_BASE_URL` (پیش‌فرض `/api/v1`) می‌روند.
- در توسعه `NEXT_PUBLIC_API_MOCKING=enabled` است و MSW در مرورگر پاسخ می‌دهد (`src/mocks/handlers`). دادهٔ ماک در localStorage می‌ماند؛ برای بازنشانی: `POST /api/v1/_mock/reset` (دکمه در «حساب من»).
- قرارداد کامل API: `docs/API.md`. انواع: `src/types/domain.ts`.
- قواعد کسب‌وکار ماک: آزاد = کل − مجموع قفل‌ها (در UI «رزرو»؛ `docs/WORDING.md`)؛ «قابل برداشت/فروش/حداکثر» فقط از بخش آزاد؛ تبدیل فقط ریال ⇄ صندوق؛ سقف وام ۴۰٪ دارایی آزاد؛ خرید و فروش صندوق سطح ۳ احراز هویت، خدمات اعتباری سطح ۲.
- کاربر نمایشی: سارا محمدی (`u-1001`) در هلدینگ آرمان؛ ادمین سازمان: نیما رضایی؛ بهره‌بردار: علی نادری. کد OTP ماک همیشه `12345`.

### افزودن endpoint یا داده
هر بخش فایل‌های «extra» خودش را دارد تا تداخل پیش نیاید. نام بخش‌ها: `app-core`، `app-money`، `app-credit`، `org-people`، `org-packages`، `op-core`، `op-system`، `site`.
- `src/mocks/handlers/<area>-extra.ts` — endpointهای اضافه؛ قبل از هندلرهای اصلی ثبت می‌شوند و می‌توانند override کنند (اگر resolver چیزی برنگرداند، درخواست به هندلر بعدی می‌رسد). سرآیند هر فایل endpointها را مستند کرده است.
- `src/mocks/seed/extra-<area>.ts` — دادهٔ اضافه (معمولاً در `db.extra.<key>`)
- `src/api/<area>-extra.ts` — هوک‌ها و انواع مربوط

با تغییر ساختار seed، `DB_VERSION` در `src/mocks/db.ts` را یکی بالا ببرید تا دادهٔ ذخیره‌شده در مرورگرها دوباره ساخته شود.

## نگاشت فایل طراحی → مسیر

| طراحی | مسیر |
|---|---|
| app-login / app-signup | `/app/login` · `/app/signup` |
| app-assets | `/app` |
| app-notifications / app-profile / app-kyc / app-support | `/app/notifications` · `/app/profile` · `/app/kyc` · `/app/support` |
| app-inbox / app-inbox-fixed | `/app/inbox` (با `?open=<inboxId>`) |
| app-inbox-done / app-inbox-archive | `/app/inbox/done?id=` · `/app/inbox/archive` |
| app-funds / app-deposit | `/app/funds` · `/app/deposit` |
| app-rial / app-gold / app-fixed | `/app/assets/rial` · `/app/assets/gold` · `/app/assets/fixed` (سایر صندوق‌ها `/app/assets/[kind]`) |
| app-convert | `/app/convert?dir=buy|sell&fund=gold` |
| app-withdraw / app-done | `/app/withdraw` · `/app/receipt?tx=` |
| app-history / app-transaction | `/app/history` · `/app/history/[id]` |
| app-credit / app-score / app-loan / app-loan-confirm / app-pay-installment | `/app/credit` · `/app/credit/score` · `/app/credit/loan` · `/app/credit/loan/confirm` · `/app/credit/pay` |
| app-card / -charge / -otp / -settings / -settle | `/app/card` · `/app/card/charge` · `/app/card/otp` · `/app/card/settings` · `/app/card/settle` |
| app-installment / app-store / -plan / -confirm / -done | `/app/installment` · `/app/installment/store/[id]` · `/app/installment/plan` · `/app/installment/confirm` · `/app/installment/done` |
| org-login / org-dashboard | `/org/login` · `/org` |
| org-employees / org-employee / org-employee-new | `/org/employees` · `/org/employees/[id]` · `/org/employees/new` |
| org-packages / org-package-detail | `/org/packages` · `/org/packages/[id]` |
| org-package-recipients → org-package → org-package-review → org-package-sent | `/org/packages/new` → `/new/settings?draft=` → `/new/review?draft=` → `/new/sent?id=` |
| org-credit / org-requests / org-reports / org-contract | `/org/credit` · `/org/requests` · داشبورد `/org` (صفحه‌ی گزارش‌ها در داشبورد ادغام شد؛ گزارش‌های زمان‌بندی‌شده حذف شد) · `/org/contract` |
| op-login / op-overview | `/op/login` · `/op` |
| op-organizations / op-organization / op-org-new | `/op/organizations` · `/op/organizations/[id]` · `/op/organizations/new` |
| op-users / op-user | `/op/users` · `/op/users/[id]` |
| op-funds / op-fund / op-products / op-rules | `/op/funds` · `/op/funds/[id]` · `/op/products` · `/op/rules` |
| op-requests / op-risk / op-reports / op-settings | `/op/requests` · `/op/risk` · `/op/reports` · `/op/settings` |
| Main | `/map` (نقشهٔ پروتوتایپ) |
