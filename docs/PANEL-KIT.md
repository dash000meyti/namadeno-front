# Namadno One — Panel kit (پنل سازمان و کنسول بهره‌بردار)

پنل سازمان (`/org`) و کنسول بهره‌بردار (`/op`) **یک محصول** هستند: یک پوسته، یک آناتومی صفحه، یک مجموعه عنصر.
هر بخش باید برای کاربر آشنا و تکراری باشد؛ هیچ صفحه‌ای الگوی نمایش یا رفتار اختصاصی ندارد.

- کامپوننت‌ها: `src/components/panel/kit.tsx` (و نمودارها در `charts.tsx`، از همان kit صادر می‌شوند)
- استایل‌ها: `src/styles/panel.css` (کیت) و `src/styles/shell.css` (پوسته)، همه زیر `.nm-shell`
- پوسته: `src/components/panel/PanelShell.tsx` — نوار کناری به سبک System Settings؛ در حالت جمع (یا عرض زیر ۱۱۰۰px) **داک macOS** با بزرگ‌نمایی آیکون‌ها
- نمونه‌های مرجع (کپی کنید):
  - صفحه‌ی فهرست + Inspector: `src/app/op/(panel)/users/page.tsx`
  - صفحه‌ی جزئیات: `src/app/op/(panel)/users/[id]/page.tsx`
  - صفحه‌ی تنظیمات: `src/app/op/(panel)/rules/page.tsx`
  - داشبورد: `src/app/org/(panel)/page.tsx`

```ts
import { PageHeading, StatStrip, Card, Toolbar, Tabs, SearchField, Select, Table, TableFoot, usePaging,
  Inspector, Who, KeyStats, Section, KV, List, ListRow, Pill, Ava, Tile, Meter, FreeLocked, BigNum,
  SettingsGroup, SettingRow, Switch, NumberInput, NumInput, Chips, Field, Note, Dialog, Confirm,
  Empty, ErrorBlock, SkeletonCard, SkeletonRows, Skel, Steps, ActionBar, BulkBar, MenuButton,
  Bars, LineChart, Spark, Ring, Allocation, Legend, type Column, type Tone } from '@/components/panel/kit';
```

## ۱. آناتومی هر صفحه

```
PageHeading            عنوان، مسیر، زیرعنوان، اقدام‌ها (چپ)
StatStrip (اختیاری)    یک کارت با ۲ تا ۵ عدد کلیدی، با خط مو بین آن‌ها
Tabs (اختیاری)         کنترل بخش‌بندی (segmented) — برای بخش‌های صفحه یا فیلتر وضعیت
Card(ها)               محتوا: فهرست، تنظیمات، نمودار، …
Inspector              جزئیات مورد انتخاب‌شده از هر فهرست (همیشه همین یک الگو)
ActionBar (اختیاری)    نوار ذخیره‌ی چسبان پایین فرم‌ها و ویزاردها
```

### چهار قالب صفحه

| قالب | کجا | ساختار |
|---|---|---|
| **فهرست** | کارکنان، بسته‌ها، درخواست‌ها، کاربران، سازمان‌ها، صندوق‌ها، ریسک، … | `PageHeading` → `StatStrip` → `Card flush` { `Toolbar` (Tabs + Select + SearchField) → `Table` → `TableFoot` } → `Inspector` |
| **جزئیات** | پروفایل کارمند/کاربر، بسته، سازمان، صندوق | `PageHeading` با `lead` (آواتار/کاشی)، `pills` و اقدام‌ها → `StatStrip` → `Tabs size="lg"` → کارت‌ها در `nm-grid side` |
| **تنظیمات** | قوانین، تنظیمات، قرارداد، محصولات | `PageHeading` → (`Tabs`) → `SettingsGroup` + `SettingRow` (در `nm-grid c2` یا ستونی) → `ActionBar` |
| **نمای کلی / گزارش** | داشبورد، نمای کلی پلتفرم، گزارش‌ها، اعتبار | `PageHeading` → `StatStrip` → کارت‌های نمودار (`Bars`, `LineChart`, `Allocation`) و فهرست‌های کوتاه (`List`) |
| **ویزارد / فرم** | ارسال بسته، افزودن کارمند، سازمان جدید | `PageHeading` → `Steps` → کارت‌های فرم (`Field`) → `ActionBar` |

### چیدمان
- ستون‌ها فقط با کلاس‌ها: `nm-grid c2 | c3 | c4 | side (محتوا + ستون ۳۶۰) | side-s (ستون ۳۶۰ + محتوا)`، `nm-stack` (ستون عمودی با فاصله‌ی استاندارد).
- فاصله‌ی استاندارد صفحه ۲۰px است (`--pn-gap`)؛ فاصله‌ی دستی بین کارت‌ها نگذارید.

## ۲. قواعد رفتار (یکسان در همه‌ی بخش‌ها)

1. **کلیک روی ردیف هر فهرست = باز شدن Inspector** (پنل شناور سمت چپ، بدون پرده). کلیک دوباره روی همان ردیف یا ✕ یا Esc آن را می‌بندد؛ کلیک روی ردیف دیگر محتوا را عوض می‌کند. اگر صفحه‌ی کامل وجود دارد، `href` به Inspector بدهید («صفحه کامل»).
   - پنل کناری ثابت درون صفحه (inline aside) و کشوی اختصاصی ممنوع است.
   - اقدام‌های اصلی مورد (تأیید، رد، مسدودسازی، ویرایش) در `footer` اینسپکتور.
   - اقدام سریع درون ردیف فقط وقتی لازم است (مثلاً تأیید/رد درخواست) و با `nm-ib` کوچک؛ `onClick` آن `e.stopPropagation()` داشته باشد.
2. **فیلتر وضعیت = `Tabs`** (با شمارنده). فیلترهای دیگر = `Select`. جستجو = `SearchField`. همه در `Toolbar`، به همین ترتیب: Tabs، فاصله (`<span className="grow" />`)، Select(ها)، SearchField.
3. **بخش‌های یک صفحه = `Tabs size="lg"`** زیر StatStrip (نه تب‌های زیرخط‌دار، نه دکمه‌های اختصاصی).
4. **اعداد کلیدی = `StatStrip`** (نه کارت‌های KPI جدا با آیکون و sparkline). حداکثر ۵ عدد.
5. **فرم تنظیمات = `SettingsGroup`/`SettingRow`**؛ ذخیره با `ActionBar` (تعداد تغییرات ذخیره‌نشده، لغو، ذخیره).
6. **تأیید عملیات حساس = `Confirm`**، فرم کوچک = `Dialog`. هیچ مودال دست‌ساز.
7. **پیام = `useToast()`** از `@/components/ui/Toast` (در پنل‌ها پایین چپ نمایش داده می‌شود). `usePanelToast`/`useFlash` هم به همین وصل‌اند.
8. **حالت‌ها:** بارگذاری = `StatStrip loading` / `SkeletonCard` / `Table loading`؛ خطا = `ErrorBlock` (با «تلاش دوباره»)؛ خالی = `Empty` (آیکون، عنوان، توضیح، اقدام).
9. **قانون آزاد/قفل:** هر عدد دارایی کنار سهم آزاد و قفل: `FreeLocked` (نوار + دو عدد) یا `LockBar` کوچک در جدول؛ نوع قفل با `LockTypeChip` از `@/components/ui/LockBar`.

## ۳. زبان بصری

- **رنگ فقط برای معنا:** وضعیت با `Pill tone`، دسته با `Tile tone` (پس‌زمینه‌ی کم‌رنگ + آیکون رنگی)، آواتار با `Ava id` (رنگ پایدار برای هر شخص/سازمان). هیچ پس‌زمینه‌ی رنگی پررنگ یا گرادیانی روی کارت‌ها.
- **tone ها:** `primary | secondary | success | warning | error | info | neutral`.
  - موفق/فعال/تأییدشده = success · در انتظار/هشدار = warning · رد/مسدود/خطا = error · اطلاعات/در حال انجام = info · پیش‌نویس/غیرفعال = neutral · ویژه/برند = primary.
- **دکمه‌ها:** `nm-btn` (اصلی) · `nm-btn ghost` (ثانویه) · `nm-btn line` (حاشیه‌دار) · `nm-btn text` (لینک‌مانند) · `nm-btn danger` / `line danger` / `line ok` · اندازه‌ها `sm`/`lg` · دکمه‌ی آیکونی `nm-ib`. در هر ناحیه حداکثر یک دکمه‌ی اصلی.
- **تایپوگرافی:** عنوان صفحه ۲۶، عنوان کارت ۱۵٫۵، متن ۱۳٫۵، برچسب‌ها ۱۲٫۵، اعداد بزرگ ۲۴–۲۶ با وزن ۶۰۰. اعداد همیشه با `money`، `faDigits`، `jDate` و … از `src/lib/format.ts`.
- **نمودارها فقط از kit:** `Bars` (ستونی، با سری‌های روی هم)، `LineChart` (خطی نرم با خوانش هاور)، `Spark` (روند کوچک)، `Ring` (یک مقدار)، `Allocation` (سهم‌ها: یک نوار + ردیف‌ها — به‌جای دونات). رنگ‌ها: `var(--chart-1..5)` یا `var(--<tone>-main)`.
- رنگ hard-code، `box-shadow` یا `border-radius` دلخواه، و `style` برای ساختار (grid/flex صفحه) ممنوع است؛ استایل inline فقط برای جزئیات کوچک (عرض یک ستون، رنگ متن یک عدد).

## ۴. مرجع سریع کامپوننت‌ها

| کامپوننت | کاربرد |
|---|---|
| `PageHeading({ title, sub?, crumbs?, lead?, pills?, children=actions })` | سر همه‌ی صفحه‌ها. صفحه‌ی سطح اول: `crumbs={[{ label: 'نام گروه' }]}`؛ جزئیات: `crumbs={[{ label: 'فهرست', href }]}` + `lead` + `pills` |
| `StatStrip({ items: Stat[], loading? })` | `Stat = { label, value, unit?, note?, trend?: 'up'\|'down'\|'warn', href?, onClick?+active? }` |
| `Card({ title?, count?, sub?, actions?, more?: {label, href\|onClick}, flush? })` | `flush` برای جدول/فهرست لبه‌به‌لبه |
| `Toolbar` · `Tabs` · `Select` · `SearchField` · `MenuButton` | ردیف ابزار فهرست |
| `Table({ columns, rows, rowKey, onRowClick?, rowHref?, selectedKey?, rowLabel?, dimRow?, loading?, error?, onRetry?, empty?, select?: { selected, onChange, label?, allLabel? }, minWidth?, chevron? })` | `Column = { key, label, width?, align?: 'end'\|'center', col?, render }`؛ ستون اول معمولاً `Ident`/`nm-ident` با `Ava` یا `Tile` |
| `TableFoot({ shown, total, unit, page, pages, onPage })` + `usePaging(rows, size, resetKey)` | صفحه‌بندی |
| `BulkBar({ count, onClear, children })` | جایگزین Toolbar وقتی ردیف‌ها انتخاب شده‌اند |
| `Inspector({ open, onClose, title, label, href?, hrefLabel?, footer?, children })` | بدنه: `Who` → `KeyStats` → `Section`ها (`KV`, `List`/`ListRow`, `FreeLocked`) |
| `SettingsGroup({ title, action?, footer? })` + `SettingRow({ label, desc?, stack?, lead? })` | کنترل‌ها: `Switch`، `NumberInput` (عدد)، `NumInput` (متن/عدد رشته‌ای؛ `full` برای تمام‌عرض)، `Chips`، `Select`؛ `lead` برای آواتار/کاشی/نقطه کنار عنوان |
| `Field({ label, htmlFor?, help?, error? })` + `.nm-ctl` / `.nm-in` / `.nm-ta` | فرم‌ها در کارت و دیالوگ |
| `Dialog({ open, onClose, title, sub?, icon?, width?, footer })` · `Confirm(...)` | مودال‌ها؛ دکمه‌ی اصلی آخرین دکمه‌ی footer |
| `Steps({ steps, current })` · `ActionBar({ actions, children })` | ویزارد و فرم |
| `Note({ tone: 'info'\|'warn'\|'err'\|'ok'\|'mute' })` | توضیح و هشدار درون کارت |
| `Empty` · `ErrorBlock` · `SkeletonCard` · `SkeletonRows` · `Skel` | حالت‌ها |

## ۵. نگاشت عناصر قدیمی ← جدید

| قدیمی | جدید |
|---|---|
| ردیف کارت‌های KPI (`Kpi`، کارت با آیکون + sparkline) | `StatStrip` |
| `CountTabs`، `Seg`، `Segmented`، `.tab`، چیپ‌های فیلتر | `Tabs` |
| `SearchBox`، لیبل جستجوی دست‌ساز | `SearchField` |
| منوی کشویی دست‌ساز | `Select` / `MenuButton` |
| جدول grid دست‌ساز (`.th`/`.tr`/`.trow`) و `Pager` | `Table` + `TableFoot` |
| `EmployeeSidePanel`، aside ثابت در صفحه، `UserDrawer`، `Drawer` | `Inspector` |
| `.lbl` / `Lbl` با رنگ inline | `Pill tone` |
| کاشی/آواتار با `background` inline | `Tile` / `Ava` |
| `.btn`، `.btnp`، `.btno`، `.btnt`، `.btnd`، `.ibtn` | `nm-btn` و انواعش، `nm-ib` |
| `Sw`، `Switch` قدیمی، `.sw` | `Switch` (kit) |
| `NumField`، `BoxNum`، `.fld`، `.fi` | `NumberInput` / `NumInput` / `Field` + `.nm-in` / `.nm-ctl` |
| `Modal`، `Dialog`/`.dlg` قدیمی، `Confirm` قدیمی | `Dialog` / `Confirm` (kit) |
| `Notice`، باکس هشدار دست‌ساز | `Note` |
| `Stepper` قدیمی | `Steps` + `PageHeading` (ویزارد ارسال بسته: `WizardHeader` در `src/components/org/packages/Stepper.tsx` روی همین دو ساخته شده) |
| دونات | `Allocation` (یا `Ring` برای یک مقدار) |
| `Skeleton`، `ErrorState`، `PanelState`، `CardSkeleton`، `CardError` | `SkeletonCard` / `ErrorBlock` / `Table loading` |

## ۶. فایل‌های کمکی

- کمکی‌های داده و فرمت (فقط داده، بدون UI): `src/components/op/core/ui.tsx` (آیکن‌ها، وضعیت سازمان، متای محصول، `fb`/`fm`/`pctFa`، `parseJalali`)، `src/components/op/system/ui.tsx` (`IC`)، `src/components/op/system/fmt.ts`، `src/components/org/people/shared.tsx` (آیکن‌ها، وضعیت کارمند/درخواست، `compactParts`، CSV، `MsSeg`)، `src/components/org/packages/meta.ts`.
- قطعه‌های مشترک چند صفحه: `EmployeeInspector` (`org/people/EmployeeSidePanel.tsx`)، `ContractEditor` + `useContractDraft` (`op/core/ContractEditor.tsx`)، `FundEditDialog` + `NavChart` (`op/system/FundUi.tsx`)، `WizardHeader` (`org/packages/Stepper.tsx`).
- `org.css` و `op.css` حذف شده‌اند؛ کلاس‌های قدیمی (`.btn`، `.btnp`، `.lbl` رنگی دستی، `.fld`، `.th`، `.dim`، …) در پنل‌ها استفاده نشوند. نام کلاس‌های کیت همه با `nm-` شروع می‌شوند تا با چیزی تداخل نکنند.

## ۷. مرزها

- داده فقط از هوک‌های `src/api/*`؛ مسیرها و فیلدهای API تغییر نمی‌کنند. اگر نمایش جدید داده‌ی تازه می‌خواهد، طبق CLAUDE.md در ماک اضافه شود.
- همه‌ی رفتارهای موجود (mutation، اعتبارسنجی، toast، ناوبری، خروجی CSV، …) و همه‌ی `aria-label`ها حفظ می‌شوند.
- متن فارسی، بدون ایموجی؛ اصطلاحات مخاطب طبق CLAUDE.md.
- CSS اختصاصی صفحه (اگر واقعاً لازم شد) در `page.css` کنار صفحه و زیر یک کلاس ریشه‌ی یکتا.
