# قرارداد API — Namadno REST v1

این سند قرارداد بین فرانت و بک‌اند است. فرانت امروز با بک‌اند ماک (MSW، پوشهٔ `src/mocks`) کار می‌کند؛ بک‌اند واقعی باید همین مسیرها و شکل‌ها را پیاده کند.

## قراردادهای کلی

- **Base URL:** `NEXT_PUBLIC_API_BASE_URL` (پیش‌فرض `/api/v1`).
- **احراز هویت:** هدر `Authorization: Bearer <token>`. سه نقش: `employee` (اپ)، `org_admin` (پنل سازمان)، `operator` (کنسول بهره‌بردار). فرانت توکن هر نقش را جدا نگه می‌دارد (`src/api/client.ts`) و بر اساس پیشوند مسیر (`/org/…`، `/op/…`، بقیه) می‌فرستد. `employee` و `org_admin` **یک حساب** هستند (همان شخص، همان کد ملی و رمز)؛ فقط نشست‌ها جدا نگه داشته می‌شوند. بهره‌بردارها حساب‌های جدای تیم نمادنو هستند.
- **پول:** عدد صحیح به **تومان**. **تاریخ:** رشته ISO-8601 (UTC)؛ نمایش شمسی در فرانت. **واحد صندوق:** عدد اعشاری.
- **خطا:** وضعیت HTTP مناسب + بدنه `ApiError { code, message, details? }`. `message` فارسی و قابل نمایش به کاربر است. کدهای پرکاربرد: `kyc_required` (۴۰۳، `details.requiredLevel`)، `insufficient_free`، `over_limit`، `active_loan`، `not_found`، `bad_code`، `weak_password`، `over_budget`.
- **انواع داده:** `src/types/domain.ts` منبع حقیقت شکل پاسخ‌هاست.
- **نمایش:** در UI بخش قفل‌شده «رزرو» نام دارد و نوع‌ها «پشتوانه / پس‌انداز سازمانی / اقساطی / دریافت مرحله‌ای / مسدودی قانونی» (`docs/WORDING.md`)؛ نام فیلدها و مقدارهای API همان `locks`، `locked`، `lockType` می‌ماند.
- **قاعده آزاد/قفل:** `free = value − Σ locks`. هر مقدار «قابل برداشت/فروش/حداکثر» و هر عملیات خروج پول فقط از بخش آزاد مجاز است. انواع قفل: `collateral`، `vesting`، `installment`، `milestone`، `legal`.
- **تبدیل:** فقط ریال ⇄ صندوق (`POST /me/trades`). صندوق به صندوق نداریم.
- **سطح احراز هویت:** سرویس‌های اعتباری سطح ۲؛ خرید و فروش صندوق سطح ۳.

## احراز هویت

| روش | مسیر | بدنه | پاسخ |
|---|---|---|---|
| POST | `/auth/otp/request` | `{ mobile, purpose: login\|signup\|reset }` | `{ sent, ttl, devCode? }` |
| POST | `/auth/otp/verify` | `{ mobile, code, purpose }` | `Session` (login) یا `{ verified, mobile }` |
| POST | `/auth/login` | `{ mobile, password }` | `Session` |
| POST | `/auth/signup` | `{ nationalId, mobile, password }` | `Session` |
| POST | `/auth/password/reset` | `{ mobile, code, password }` | `Session` |
| POST | `/auth/logout` | — | `{ ok }` |
| POST | `/org/auth/login` | `{ nationalId, password }` — **همان حساب نمادنو** (کد ملی + رمز حساب، همان رمز اپ). فقط عضوی که در `Organization.admins` سازمانش است وارد می‌شود؛ `Session.userId` همان شناسه‌ی حساب (`UserProfile.id` = `Employee.id`) است. خطاها: `422 bad_national_id` · `401 bad_credentials` · `403 no_panel_access` (حساب هست ولی دسترسی پنل ندارد) · `403 not_activated` (عضو دعوت‌شده‌ای که هنوز رمز نساخته). در ماک هر رمز ۶+ نویسه پذیرفته می‌شود | `Session` (org_admin) |
| POST | `/org/auth/otp` | `{ nationalId }` — «فراموشی رمز / فعال‌سازی»: کد به موبایل ثبت‌شده در حساب پیامک می‌شود · `403 no_panel_access` · `422 no_mobile` | `{ sent, ttl, mobile (پوشیده، مثل 0912•••4567), devCode? }` |
| POST | `/org/auth/password/reset` | `{ nationalId, code, password }` — رمز **حساب نمادنو** را می‌سازد یا عوض می‌کند (در اپ هم همین رمز)؛ عضو دعوت‌شده فعال می‌شود (`admins[].status` و کارمند → `active`) و وارد پنل می‌شود · `422 bad_code` · `422 weak_password` (حداقل ۸ نویسه، حرف و عدد) | `Session` (org_admin) |
| POST | `/op/auth/login` | `{ email, password, otp? }` | `Session` (operator) |

## اپ کارمند

| روش | مسیر | توضیح / بدنه | پاسخ |
|---|---|---|---|
| GET | `/me` | پروفایل؛ `panelAccess?: { orgId, orgName, panelRole, status }` وقتی همین حساب در پنل سازمانش دسترسی دارد (اپ ردیف «پنل سازمان» را در «حساب من» نشان می‌دهد) | `UserProfile` |
| PATCH | `/me/profile` | `Partial<UserProfile>` | `UserProfile` |
| POST | `/me/password` | `{ current?, next }` | `{ ok }` |
| GET | `/me/portfolio` | کل دارایی، آزاد/قفل، هر کیف/صندوق با قفل‌ها | `Portfolio` |
| GET | `/me/holdings/:kind` | یک دارایی + صندوق + ۱۰ تراکنش آخر | `{ holding, fund?, transactions }` |
| GET | `/funds` · `/funds/:id` | فهرست صندوق‌ها / جزئیات با تاریخچه NAV | `Fund[]` · `Fund` |
| GET | `/me/inbox?status=pending\|accepted` | دریافتی‌ها | `InboxPackage[]` |
| GET | `/me/inbox/:id` | | `InboxPackage` |
| POST | `/me/inbox/:id/accept` | `{ split?: { gold, fixed, rial? } }` (برای تخصیص آزاد؛ جمع ۱۰۰) | `{ transaction, portfolio, package }` |
| GET | `/me/transactions?category=&holding=&q=&limit=` | تاریخچه | `Transaction[]` |
| GET | `/me/transactions/:id` | با id یا کد پیگیری | `Transaction` |
| GET | `/me/notifications` · POST `/me/notifications/read-all` · POST `/me/notifications/:id/read` | | |
| POST | `/me/trades` | `{ direction: buy\|sell, fundId, amount }` — خرید از ریال آزاد، فروش از بخش آزاد صندوق. هیچ چیز منفی نمی‌شود: اگر موجودی آزاد نمادنو (پس از صف) خرید را پوشش ندهد، پول کسر و تراکنش `pending` («در انتظار تأمین»، جزئیات `تأمین تا`) می‌شود و واحدها حداکثر تا تسویه‌ی صندوق + یک روز کاری می‌رسند؛ اگر ریال آزاد نمادنو فروش را پوشش ندهد، فروش `pending` («در انتظار واریز»، `واریز تا`) می‌ماند | `Transaction` |
| POST | `/me/deposits` | `{ amount, destination: rial\|gold\|fixed\|… }` | `Transaction` |
| POST | `/me/withdrawals` | `{ amount, bankAccountId? }` از ریال آزاد، در سقف ثابت روزانه و ماهانه (بدون تأیید؛ بیشتر از سقف → `422 over_daily_limit \| over_monthly_limit` با `details { remainingToday, remainingMonth }`) | `Transaction` (pending = چرخه‌ی پایا) |
| GET/POST | `/me/bank-accounts` · POST `/me/bank-accounts/:id/default` | `{ iban, bankName? }` | `BankAccount[]` |
| GET | `/me/credit` | امتیاز، سقف وام (۴۰٪ آزاد)، اعتبار کارت | `CreditSummary` |
| GET | `/me/loans` · `/me/loans/:id` | | `Loan[]` · `Loan` |
| POST | `/me/loans/quote` | `{ amount, months, collateralKind? }` | `LoanQuote` |
| POST | `/me/loans` | `{ amount, months, collateralKind? }` — قفل وثیقه روی بخش آزاد | `Loan` |
| POST | `/me/loans/:id/pay` | `{ count?, source? }` — تسویه کامل قفل را آزاد می‌کند | `Transaction` |
| GET | `/me/card` · PATCH `/me/card/settings` · POST `/me/card/freeze` `{ frozen }` | | `Card` |
| POST | `/me/card/charge` `{ amount }` · `/me/card/settle` `{ amount }` · `/me/card/otp` | | |
| GET | `/stores` · `/stores/:id` | فروشگاه‌های اقساطی | `Store[]` · `Store` |
| POST | `/me/installments/quote` | `{ storeId, price }` | `InstallmentPlanOption[]` |
| GET/POST | `/me/installments` | `{ storeId, title, price, months, monthly, prepayment?, collateralKind? }` | `InstallmentPurchase` |
| POST | `/me/kyc/level2` `{ birthDate }` · `/me/kyc/level3/request-otp` · `/me/kyc/level3/verify` `{ code }` | | `{ level }` |
| GET | `/support/faq` · `/me/tickets` · `/me/tickets/:id` | | |
| POST | `/me/tickets` `{ subject, text }` · `/me/tickets/:id/messages` `{ text }` | | `Ticket` |

## پنل سازمانی

| روش | مسیر | توضیح | پاسخ |
|---|---|---|---|
| GET | `/org/me` | سازمان و عضو واردشده؛ `admin` یکی از `organization.admins` است (`OrgPanelUser`: `id` = شناسه‌ی حساب، `nationalId`، `mobile`، `status`)؛ `admin.panelRole` نقش است: `admin` «مدیر» · `approver` «تأییدکننده» · `specialist` «کارشناس» (نبودنش = `specialist`)؛ `admin.role` همان برچسب فارسی نقش است | `{ organization, admin }` |
| GET | `/org/dashboard` | KPIها، بسته‌ها و درخواست‌های اخیر | `OrgDashboard` |
| GET | `/org/employees?q=&status=&department=` · `/org/employees/:id` | | `Employee[]` · `{ employee, packages, holdings?, requests, loans }` |
| POST/PATCH | `/org/employees` · `/org/employees/:id` | ساخت: فقط `nationalId` الزامی است؛ `department` خالی = «سایر»؛ `fullName` خالی از ثبت احوال پر می‌شود. ویرایش: `department` خالی = «سایر» | `Employee` |
| GET | `/org/packages?status=` · `/org/packages/:id` | | `OrgPackage[]` · `OrgPackage` |
| POST | `/org/packages` | پیش‌نویس: `{ title, reason, amountPerPerson, recipientIds, recipientAmounts?, allocationMode, fixedSplit?, cashAllowed, lockPolicy, message?, expiresAt? }` — `recipientAmounts` (employeeId → تومان) مبلغ هر نفر را از فایل اکسل می‌گیرد: `amountSource: 'file'`، `amountPerPerson: 0`، `total = Σ` | `OrgPackage` |
| PATCH | `/org/packages/:id` | ویرایش پیش‌نویس؛ `recipientAmounts` = مبلغ جدا برای هر نفر، `recipientIds` بدون مبلغ یا `amountPerPerson` مثبت = مبلغ یکسان | `OrgPackage` |
| POST | `/org/packages/:id/send` | ارسال؛ بسته در inbox گیرندگان ثبت می‌شود (`over_budget`) | `OrgPackage` |
| POST | `/org/packages/:id/cancel` | | `OrgPackage` |
| POST | `/org/packages/:id/milestones/:stepId/release` | تأیید مرحله؛ سهم آن مرحله از قفل کارمند آزاد می‌شود (`409 already_released \| already_reclaimed`) | `OrgPackage` |
| PATCH | `/org/packages/:id/milestones/:stepId` | `{ requiresApproval?, dueDate? }` — «نیاز به تأیید» و سررسید یک مرحله (پیش‌نویس یا ارسال‌شده، مرحله‌ی تعیین‌تکلیف‌نشده). جزئیات در بخش `org-packages-extra.ts` | `OrgPackage` |
| POST | `/org/packages/:id/milestones/:stepId/reclaim` | `{ note }` — «بازپس‌گیری»: مرحله پرداخت نمی‌شود؛ سهم آن از دارایی کارمند کم می‌شود و به سازمان برمی‌گردد. جزئیات در بخش `org-packages-extra.ts` | `OrgPackage` |
| GET | `/org/requests?status=` · POST `/org/requests/:id/decision` `{ approve, note? }` | فقط درخواست‌هایی که سازمان تأیید می‌کند: `milestone_release` (و `loan` پس از فعال شدن تسهیلات). افزایش اعتبار و اقساط فقط در کنسول بهره‌بردار (`/op/requests`). برداشت تأیید ندارد (سقف ثابت) و احراز هویت خودکار در اپ است، پس درخواستی از این دو نوع ساخته نمی‌شود. همین قاعده برای `/org/people/requests`، `kpis.pendingRequests` داشبورد و درخواست‌های صفحه‌ی کارمند. برای `milestone_release`: `approve: true` مرحله را آزاد می‌کند و `approve: false` یعنی **بازپس‌گیری** همان مرحله (`note` الزامی، حداقل ۳ حرف → `422 note_required`؛ همان اثر `POST …/milestones/:stepId/reclaim`)؛ درخواست `rejected` می‌شود و در UI «بازپس گرفته شد» نمایش داده می‌شود. تصمیم‌های `milestone_release` برگشت‌پذیر نیستند. `ApprovalRequest` فیلدهای اختیاری `packageId`، `stepId` و `trigger` (`employee` \| `due_date`) هم دارد | `ApprovalRequest` |
| GET | `/org/notifications` · POST `/org/notifications/read` `{ ids? }` | اعلان‌های پنل سازمان (زنگوله): «نیاز به اقدام» (از داده‌ی جاری: مرحله در انتظار تأیید، پیش‌نویس ارسال‌نشده، مهلت پذیرش نزدیک، همکاران فعال‌نشده، پایان قرارداد) + «به‌روزرسانی‌های سامانه»؛ `ids` نبود = همه خوانده شود | `{ items: OrgNotification[] }` · `{ ok }` |
| GET | `/org/credit` · `/org/reports` | `/org/reports` (ماهانه‌ی ارسال) و `/org/reports/overview` و خروجی‌ها در داشبورد سازمان نمایش داده می‌شوند؛ صفحه‌ی جدای گزارش‌ها حذف شد | |
| GET/PATCH | `/org/contract` | تنظیمات قرارداد و کاربران پنل | `Organization` |

> **مراحل قرارداد (دریافت مرحله‌ای):** تعداد مراحل را سازمان برای هر بسته تعیین می‌کند (سقفی ندارد؛ حداقل یک مرحله، هر مرحله حداقل ۵٪ و جمع ۱۰۰٪ — پس عملاً حداکثر ۲۰ مرحله). هر مرحله سررسید (`dueDate`) **الزامی** دارد (ساخت و ویرایش پیش‌نویس: `422 bad_steps` «سررسید همه‌ی مراحل الزامی است.»؛ سررسید باید در آینده و هم‌زمان یا پس از مرحله‌ی قبل باشد) و `requiresApproval` اختیاری (نبودنش = `true`). مراحل به ترتیب پیش می‌روند و همیشه یک مرحله‌ی باز `pending_approval` (مرحله‌ی جاری) است. در سررسید مرحله‌ی جاری: اگر `requiresApproval: false` باشد خودکار آزاد می‌شود (درخواست‌های باز آن مرحله با `decidedBy: 'سامانه'` تأیید می‌شوند) و مرحله‌ی بعد بررسی می‌شود؛ اگر تأیید لازم باشد برای هر گیرنده‌ی پذیرفته یک درخواست `milestone_release` با `trigger: 'due_date'`، `packageId`، `stepId` و یادداشت «سررسید این مرحله رسیده است.» باز می‌شود (برای هر مرحله و گیرنده فقط یک بار). قرارداد تا پذیرش کارمند شروع نمی‌شود. **بک‌اند واقعی باید این پردازش را زمان‌بندی‌شده (مثلاً روزانه) اجرا کند**؛ ماک آن را پیش از هر درخواست API اجرا می‌کند (`processDueMilestones` در `src/mocks/handlers/org.ts`). وضعیت `reclaimed` («بازپس گرفته شد»، با `reclaimedAt` و `reclaimNote`) مثل `released` نهایی است.

> **ویزارد ارسال بسته (UI):** نوع بسته پرسیده نمی‌شود؛ `reason` از شیوه‌ی دریافت می‌آید (مرحله‌ای = `project_contract`، بقیه همان قبلی یا `bonus`). برداشت نقدی هم پرسیده نمی‌شود؛ `cashAllowed` همان `settings.cashWithdrawalAllowed` قرارداد است (بخش آزاد قابل برداشت است). گیرندگان را می‌شود از فایل اکسل (کد ملی، مبلغ) انتخاب کرد؛ آن‌وقت مبلغ هر نفر در مرحله‌ی تنظیمات فقط‌خواندنی است. `OrgPackage.amountSource` اختیاری است (نبودنش = `uniform`).

## کنسول بهره‌بردار

| روش | مسیر | توضیح |
|---|---|---|
| GET | `/op/overview` | KPIهای پلتفرم، تفکیک قفل، صندوق‌ها، درخواست‌ها و هشدارها |
| GET/POST | `/op/organizations` · GET/PATCH `/op/organizations/:id` | سازمان‌ها و قراردادها |
| GET | `/op/users?q=&filter=locked\|legal` · `/op/users/:id` | کاربران با تفکیک آزاد/رزرو و سطح احراز هویت (`kycLevel` ۱ شاهکار، ۲ ثبت احوال، ۳ سجام؛ فقط نمایش). فیلتر `kyc` دیگر در UI استفاده نمی‌شود |
| POST | `/op/users/:id/status` `{ status }` | تعلیق/فعال‌سازی |
| POST | `/op/users/:id/legal-hold` `{ holdingKind, amount, reference, reason }` | اعمال مسدودی قانونی (فقط از بخش آزاد) |
| DELETE | `/op/users/:id/legal-hold/:lockId` | رفع مسدودی |
| GET | `/op/funds` · GET/PATCH `/op/funds/:id` | صندوق‌ها |
| GET | `/op/products` · PATCH `/op/products/:id` | محصولات اعتباری |
| GET | `/op/rules` · PATCH `/op/rules/:id` | قوانین و محدودیت‌ها |
| GET | `/op/requests?status=&kind=` · POST `/op/requests/:id/decision` | درخواست‌های همه سازمان‌ها، به‌جز `milestone_release` (تأیید یا بازپس‌گیری مراحل قرارداد با سازمان است؛ تصمیم بهره‌بردار روی آن `409 org_decides`). `RequestKind`های `cash_withdrawal` و `profile_change` دیگر ساخته نمی‌شوند (در نوع برای سابقه مانده‌اند): برداشت در سقف ثابت روزانه/ماهانه بدون تأیید است و احراز هویت فقط سه سطح خودکار اپ است؛ KYC مدرکی (کارت ملی، سلفی، ویدیو) و صف بررسی آن وجود ندارد |
| GET | `/op/risk?status=` · PATCH `/op/risk/:id` | هشدارهای ریسک |
| GET | `/op/reports` · GET/PATCH `/op/settings` | گزارش‌ها و تنظیمات |

## سایت عمومی

| روش | مسیر | پاسخ |
|---|---|---|
| GET | `/public/blog` · `/public/blog/:slug` | `BlogPost[]` (بدون body) · `BlogPost` |
| GET | `/public/funds` · `/public/faq` | `Fund[]` · `FaqItem[]` |
| POST | `/public/contact` `{ name, phone, email?, company?, topic?, employees?, message? }` | `{ ok, ticket }` |

## فقط ماک

| POST | `/_mock/reset` | بازگرداندن دادهٔ نمایشی به حالت اولیه |
|---|---|---|

---

## endpointهای تکمیلی هر بخش

بخش‌های زیر عیناً از سرآیند فایل‌های `src/mocks/handlers/*-extra.ts` استخراج شده‌اند (برخی endpointهای اصلی را با رفتار دقیق‌تر جایگزین می‌کنند).

### اپ — ورود، خانه، دریافتی‌ها، حساب (`app-core-extra.ts`)

```
Additional mock endpoints owned by the "app-core" area (auth, home, inbox, account screens).
Registered before the core handlers, so the overrides below replace the core behaviour.

GET  /api/v1/me/kyc
     → 200 { level: 1|2|3, mobile, nationalId, fullName, birthDate?, fatherName?, registryOffice?,
              sejam?: { bourseCode, bankAccount, postalCode } }
     Identity details per completed KYC level (fatherName/registryOffice from level 2, sejam from level 3).

POST /api/v1/me/kyc/level2            (override of the core endpoint — same contract, consistent data)
     body { birthDate: 'YYYY/MM/DD' (Jalali) }
     → 200 { level, fullName, fatherName, registryOffice }   · 422 bad_birth_date

GET  /api/v1/me/security
     → 200 { passwordChangedAt: ISODate }

POST /api/v1/me/password              (override — also records passwordChangedAt)
     body { current?: string, next: string }
     → 200 { ok: true, passwordChangedAt }   · 422 weak_password · 401 bad_current_password

POST /api/v1/me/tickets               (override — the support agent replies to the first message)
     body { subject: string, text: string }
     → 200 Ticket (messages: [user message, agent auto-reply])
```

### اپ — دارایی‌ها و پول (`app-money-extra.ts`)

```
Additional mock endpoints owned by the "app-money" area. Registered before the core handlers (can override).

GET /api/v1/me/withdrawals/limits
  Response: WithdrawLimits { daily, monthly, usedToday, usedMonth, remainingToday, remainingMonth }   (Toman; null = no cap)
  Fixed caps per user from the rules r-limit-withdraw-daily / r-limit-withdraw-monthly (/op/rules); days and months are Jalali.
  Within them a withdrawal goes through with no approval; POST /me/withdrawals refuses more:
  422 over_daily_limit | over_monthly_limit { remainingToday, remainingMonth }. (src/mocks/withdraw-limits.ts)

GET /api/v1/me/holdings/:kind/stats
  Request:  —
  Response: HoldingStats {
    kind: AssetKind; units: number; nav: Toman;
    avgCost: Toman;        // average purchase price per unit
    costBasis: Toman;      // total cost of the units held
    pnl: Toman;            // value − costBasis (signed)
    pnlPct: number;        // pnl / costBasis × 100
    dailyAccrual: Toman;   // estimated daily profit (fixed-income funds: value × yield / 365; others: today's change)
  }
  Errors: 404 not_found (no such holding), 422 not_a_fund (rial wallet)

Cost basis is tracked per user/fund in db.extra.appMoney.basis and reconciled lazily:
units added since the last read are booked at the current NAV, units removed reduce the
basis proportionally (average cost stays the same).
```

### اپ — اعتبار، وام، کارت، اقساط (`app-credit-extra.ts`)

```
Mock endpoints owned by the "app-credit" area (credit, loans, card, installment purchase).
Registered before the core handlers, so the routes below override the core ones with the same path.

GET  /me/credit/extra
     → CreditExtra { cardUnsecuredLimit, cardLocked, cardLockSources: AssetKind[], installmentLimit,
                     installmentOutstanding, installmentAvailable, scoreUpdatedAt, scoreNextUpdateAt }

POST /me/loans                         (override: collateral may be split over several holdings)
     ← { amount, months, collateralKind?: AssetKind, collaterals?: AssetKind[] }   (greedy in the given order, FREE part only)
     → Loan   · errors: 403 kyc_required · 409 active_loan · 422 over_limit | insufficient_collateral | bad_amount

POST /me/loans/:id/pay                 (override: source may be 'bank'; settlement releases every collateral lock of the loan)
     ← { count?: number, source?: AssetKind | 'bank' }
     → Transaction · errors: 404 not_found · 409 settled · 422 insufficient_free

POST /me/installments/quote            (override: prepayment chosen by the user, collateral = 50% of the financed amount)
     ← { storeId, price, prepayment? }
     → InstallmentPlanOption[]

POST /me/installments                  (override: 50% collateral, plan fields kept on the purchase)
     ← { storeId, productId?, title, price, months, monthly, prepayment?, collateralKind? }
     → InstallmentPurchase & { prepayment, collateralKind, collateralAmount, codeExpiresAt }
     · errors: 403 kyc_required · 422 insufficient_collateral | insufficient_free | over_limit

POST /me/installments/:id/pay          (new)
     ← { count?: number, source?: AssetKind | 'bank' }
     → Transaction (each paid installment releases collateral/remaining of the purchase lock)

POST /me/card/charge                   (override: usage above cardUnsecuredLimit is locked from FREE rial, then gold)
     ← { amount } → { card, transaction } · errors: 403 kyc_required · 409 card_blocked · 422 over_limit | insufficient_collateral

POST /me/card/settle                   (override: source rial | fixed | bank; releases card locks above the unsecured part)
     ← { amount, source?: 'rial' | 'fixed' | 'bank' } → { card, transaction, released }

POST /me/card/otp                      (override: 60 s validity)          → { code, expiresIn }
POST /me/card/otp/sms                  (new)                              → { sent: true, mobile }
POST /me/card/block                    (new, permanent block)             → { card, transaction }
POST /me/card/physical                 (new, physical card request)       → { transaction } · 409 already_requested
```

### پنل سازمان — کارکنان، داشبورد، درخواست‌ها (`org-people-extra.ts`)

```
Additional mock endpoints owned by the "org-people" area (HR panel: dashboard, employees,
credit, requests). Registered before the core handlers (can override / fall through).

GET  /api/v1/org/people/facts
     → Record<employeeId, EmpFacts>   free/locked split, locks by type, allocation %, loan, card, pending packages, score
GET  /api/v1/org/people/employees/:id
     → EmpDetailExtra                 holdings (real or derived), loans, card, activity, per-package split, e-mail, last activity
GET  /api/v1/org/people/insights
     → PeopleInsights                 dashboard: allocation (Toman), sent this/last month, new employees, pending milestone steps
GET  /api/v1/org/people/credit
     → PeopleCredit                   active loans of employees, 6-month repayment schedule, cards, overdue installments
GET  /api/v1/org/people/requests
     → { items: RequestRow[]; avgResponseDays: number | null }   requests enriched with employee facts, details and rule checks
POST /api/v1/org/people/requests/:id/reopen
     → ApprovalRequest                undo a decision (409 irreversible for a decided milestone_release: released or reclaimed)
POST /api/v1/org/people/employees/import   { rows: ImportRow[]; sendSms: boolean }   (per row only nationalId is required; empty unit → «سایر»)
     → { created: Employee[]; errors: { row: number; message: string }[] }
POST /api/v1/org/people/employees/status   { ids: string[]; status: 'active' | 'invited' | 'inactive' }
     → { updated: number }
GET    /api/v1/org/departments                       → OrgDepartment[]   any panel role (units + employee counts)
POST   /api/v1/org/departments    { name, head? }    → 201 OrgDepartment · 403 forbidden_role · 422 missing_name · 409 duplicate_name
PATCH  /api/v1/org/departments/:id { name?, head? }  → OrgDepartment (a rename moves the unit's employees too) · 403 · 404 · 409 · 422 (default_unit: «سایر» keeps its name)
DELETE /api/v1/org/departments/:id                   → { ok: true, moved: number } (its employees move to «سایر») · 403 forbidden_role · 409 default_unit
       Every organization has the default unit «سایر» (`isDefault`), created with the organization.
POST   /api/v1/org/departments/:id/members { employeeIds: string[] } → OrgDepartment (moves those employees into the unit) · 403 · 404 · 422 no_employees
       Writes are allowed only for the organization's administrator (`admins[].panelRole === 'admin'`).
POST   /api/v1/org/panel-users        { employeeId, panelRole } → 201 Organization['admins'] · 404 not_found (not an employee) · 409 already_member · 422 bad_role | inactive_member
PATCH  /api/v1/org/panel-users/:id    { panelRole }             → Organization['admins'] · 404 · 422 bad_role | last_admin
DELETE /api/v1/org/panel-users/:id                              → Organization['admins'] · 404 · 422 self | last_admin
       Panel access is chosen from the organization's employees (one Namadno account per person). Admin only (403 forbidden_role).
       An `invited` employee (no active account yet) gets status `invited`: an activation SMS is sent and they sign in after
       setting a password (`/org/auth/password/reset`). `PATCH /org/contract` no longer changes `admins`.
POST /api/v1/org/employees  (override of the core endpoint)
     { nationalId, department?, fullName?, mobile?, employeeCode?, jobTitle?, joinedAt?, email?, role?, cardLimitPct?, sendSms? }
     Only the national id is required. No unit → «سایر». No name → looked up by national id (civil registry; simulated in the mock).
     → 201 Employee · 422 missing_fields | bad_national_id | bad_mobile · 409 duplicate | duplicate_code
GET  /api/v1/org/*  (pass-through) syncs portfolio/locked of employees that have an app account, then falls through.
POST /api/v1/org/requests/:id/decision  (pass-through) notifies the employee's app for non-milestone requests,
     then falls through to the core handler which records the decision (approve → releases the milestone step,
     reject → reclaims it; see «بازپس‌گیری»).

Types: src/api/org-people-extra.ts · `OrgDepartment`, `OrgPanelRole` in src/types/domain.ts
```

> **یک حساب برای اپ و پنل سازمان:** هر شخص یک حساب نمادنو دارد (کد ملی + موبایل + رمز). عضویت در سازمان = رکورد `Employee` (با همان `id` حساب)؛ دسترسی پنل = ورودی همان شخص در `Organization.admins` (`OrgPanelUser`). ورود پنل با کد ملی و رمز همان حساب است؛ ایمیل فقط برای تماس است و رمز موقت وجود ندارد. هر حساب فقط در یک سازمان دسترسی پنل دارد. مدیر سازمان دسترسی را از میان کارکنان می‌دهد (`/org/panel-users`)؛ بهره‌بردار هنگام ساخت سازمان یا از صفحه‌ی سازمان، با کد ملی و موبایل اضافه می‌کند (`hrUsers`): حساب موجود فوراً دسترسی می‌گیرد، در غیر این صورت حساب «دعوت‌شده» ساخته و پیامک فعال‌سازی فرستاده می‌شود؛ شخص در هر دو حالت عضو سازمان (واحد «سایر») هم می‌شود. «کارکنان» نقش پنل هر نفر را نشان می‌دهد.

> **واحدها و نقش‌های پنل سازمان:** هر کاربر پنل (`Organization.admins[]`) یک `panelRole` دارد. فقط `admin` (مدیر سازمان) واحد می‌سازد، نامش را عوض می‌کند یا حذفش می‌کند؛ بک‌اند واقعی هم باید همین را بررسی کند و برای بقیه ۴۰۳ `forbidden_role` بدهد. خواندن فهرست واحدها برای همه‌ی نقش‌ها آزاد است (فیلتر و فرم کارکنان از آن استفاده می‌کنند). کارکنان با نام واحد به آن وصل‌اند (`Employee.department`)؛ تغییر نام واحد، واحد کارکنانش را هم عوض می‌کند. هر سازمان از زمان ساخت واحد پیش‌فرض «سایر» (`isDefault`) دارد: کارمند هیچ‌وقت بی‌واحد نیست؛ واحد خالی در ساخت، ورود از اکسل یا ویرایش کارمند «سایر» می‌شود و با حذف هر واحد، همکارانش به «سایر» می‌روند. «سایر» نه حذف می‌شود و نه نامش عوض می‌شود (`default_unit`). در UI، صفحه‌ی «واحدها» (`/org/departments`) و آیتم منوی آن فقط برای مدیر سازمان دیده می‌شود.

### پنل سازمان — بسته‌ها، گزارش‌ها، قرارداد (`org-packages-extra.ts`)

```
Additional mock endpoints owned by the "org-packages" area. Registered before the core handlers (can override).

PATCH  /api/v1/org/packages/:id                         (overrides core)
       body: Partial<OrgPackage> & { recipientIds?: string[]; recipientAmounts?: Record<employeeId, Toman> }
       `recipientAmounts` = per-person amounts from an Excel file → amountSource 'file' (amountPerPerson 0, total = Σ amounts).
       `recipientIds` without amounts, or a positive `amountPerPerson`, switches back to one amount for everyone.
       → OrgPackage. Draft only. Validates amount ≥ 0, fixed split = 100%, milestone steps (1–8, each ≥ 5%, sum = 100%,
         every step with a future due date, in order) and (re)builds `milestoneProgress` when the lock policy changes
         (`requiresApproval` missing = true). Errors: 404 not_found, 409 not_draft,
         422 bad_amount | bad_split | bad_steps | cash_not_allowed | policy_not_allowed.
GET    /api/v1/org/packages/:id/insights
       → PackageInsights { recipients[] (with department, code, chosen split, reminded), allocation {gold,fixed,rial},
         claims: pending milestone_release requests of this package (stepId, trigger) }
POST   /api/v1/org/packages/:id/remind                   body: { employeeIds?: string[] } (default: every pending recipient)
       → { reminded: number, employeeIds: string[] }   (registered app users get a notification)
PATCH  /api/v1/org/packages/:id/milestones/:stepId       body: { requiresApproval?: boolean; dueDate?: ISODate }
       → OrgPackage. Draft or sent package, step not settled yet (released / reclaimed). Updates the step in
         `milestoneProgress`, in `lockPolicy.steps` and in the recipients' app copies (milestone lock + inbox).
         A new future due date withdraws a pending request that the old due date opened. Turning approval off for a
         step whose due date has passed releases it at once. Errors: 404 not_found,
         409 already_released | already_reclaimed | not_editable,
         422 bad_due (missing / invalid / in the past / before the previous step / after the next step) | no_changes.
(all)  /api/v1/*  (pass-through, registered first in handlers/index.ts) runs processDueMilestones() (handlers/org.ts):
       due steps without approval are released automatically; due steps that need approval open a
       `milestone_release` request (trigger 'due_date'). The real backend does this on a schedule.
POST   /api/v1/org/packages/:id/milestones/:stepId/reclaim   body: { note: string }   («بازپس‌گیری»)
       → OrgPackage. The step is not paid: status 'reclaimed' (+ reclaimedAt, reclaimNote), its share leaves the
         employees' assets (milestone reservation AND holding units/value) and returns to the organization's budget
         (`budgetUsed −= amount`); each employee with an app account gets a ledger entry (negative amount) and a calm
         notification with the note; pending requests of the step become 'rejected' with the note; the next step
         becomes current. Irreversible. Sent packages only. (reclaimStep in handlers/org.ts)
         Errors: 404 not_found, 409 not_sent | already_released | already_reclaimed, 422 note_required (≥ 3 characters).
GET    /api/v1/org/reports/overview
       → ReportsOverview { weekly[], earlierMonths[], currentMonthExtra, units[], exports[] }   (shown on the org dashboard; scheduled reports were removed)
POST   /api/v1/org/reports/exports/:id                   body: { format: 'xlsx' | 'pdf' } → ReportFile { fileName, title, columns, rows }
GET    /api/v1/org/contract/approval-chain               → ApprovalChain { items[], updatedAt }
PATCH  /api/v1/org/contract/approval-chain               body: { values: Record<id, boolean> } → ApprovalChain
       (locked items cannot be disabled → 422 locked_step)
```

### بهره‌بردار — نمای کلی، سازمان‌ها، کاربران (`op-core-extra.ts`)

```
Additional mock endpoints owned by the "op-core" area (operator console: overview, organizations, users).
Registered before the core handlers, so the overrides below win; a resolver that returns nothing falls
through to the core handler. Types: src/api/op-core-extra.ts.

── New endpoints ──
GET    /api/v1/op/core/org-ext                         → Record<orgId, OrgContractExt>   (metrics + contract terms + panel members of every organization;
                                                          `hrUsers` is a read view of Organization.admins with last sign-in and 2FA; `hrEmail` = contact e-mail)
GET    /api/v1/op/core/organizations/:id/credit        → OrgCreditRow[]                   (loans / card credit / BNPL of the organization's users)
POST   /api/v1/op/core/organizations/:id/hr-users      { name, nationalId, mobile, role } → 201 HrUser   (adds a panel member; `role` = Persian label)
       An existing Namadno account (matched by national ID) gets access at once (`active`); otherwise an account is opened as
       `invited` and an activation SMS is sent. The person also becomes an employee of the organization (unit «سایر»).
       · 422 missing_fields | bad_national_id | bad_mobile · 409 already_member | other_org (one organization per account)
GET    /api/v1/op/core/overview?range=7|30|90          → OverviewExt                      (daily flow series, KPI deltas, lock counts, service health, feed)
GET    /api/v1/op/core/users-meta                      → UsersMeta                        (facility kinds / lock types per user + platform totals; `kyc`, `kycPending`, `kycAvgDays` deprecated — always ok / 0)
GET    /api/v1/op/core/users/:id/extra                 → OpUserExtra                      (facilities, operator notes, audit log, devices)
POST   /api/v1/op/core/users/:id/notes                 { text, tag } → UserNote           · 422 missing_text
POST   /api/v1/op/core/users/:id/reset-password        {} → { sent: true }

── Overrides of core endpoints ──
POST   /api/v1/op/organizations          body: Partial<Organization> & { contract?: Partial<OrgContractExt>; hrUsers?: { name, nationalId, mobile, role }[] }
       The first panel members, handled like hr-users above (no e-mail, no temporary passwords: they sign in with their own
       Namadno account; people without an account get an activation SMS).
                                         → Organization (201, status «onboarding»)   · 422 missing_name | invalid_employees | missing_funds
                                           | missing_fields | bad_national_id | bad_mobile | duplicate_national_id · 409 other_org
PATCH  /api/v1/op/organizations/:id      body: Partial<Organization> & { contract?: Partial<OrgContractExt>; changeNote?: string }
                                         → Organization; a change of settings/contract bumps the contract version (OrgContractExt.versions)
       The contract only allows the receive policies (settings.lockPolicies: vesting / milestone); it sets no maximum savings
       months or milestone steps. The organization sets the release date or the steps of each package (OrgContractExt
       vestingMaxMonths / milestoneMaxSteps were removed).
GET    /api/v1/op/users · /op/users/:id  each user carries `panelAccess?` (UserProfile) when they have organization-panel access; `q` also matches the national ID
GET    /api/v1/op/users/:id              platform users without an app account get a real Portfolio built from their operator-side breakdown
POST   /api/v1/op/users/:id/legal-hold   { holdingKind, amount, reference, reason } → Lock   · 422 missing_reference | invalid_amount | exceeds_free
                                         (locks from the FREE part only; adds a «lock» transaction + notification for app users)
DELETE /api/v1/op/users/:id/legal-hold/:lockId → { ok: true }   · 404 not_found (works for platform users too)
POST   /api/v1/op/users/:id/status       logs the change in the user's audit log, then falls through to the core handler
```

### بهره‌بردار — صندوق‌ها، محصولات، قوانین، ریسک، گزارش، تنظیمات (`op-system-extra.ts`)

```
Additional mock endpoints owned by the "op-system" area (operator console:
funds, products, rules, requests, risk, reports, settings).
Registered before the core handlers, so the overrides below win.

Optional fields added to core resources (backend: return them when available)
  Fund.meta            FundMeta    (see src/api/op-system-extra.ts) — returned by GET /op/funds, /op/funds/:id
  CreditProduct.meta   ProductMeta — returned by GET /op/products
  RiskAlert.signals    RiskSignal[] — returned by GET /op/risk
  GET /op/settings     also returns OpSettingsX fields (team[].roleKey/status/lastLoginAt, roleMatrix, notify, …)

Overrides of core endpoints
  PATCH /api/v1/op/funds/:id                 body Partial<Fund> & { meta?: Partial<FundMeta> } → OpFund   (meta deep-merged, stamps meta.updatedAt/By; 422 on invalid fee/settlement/ltv)
  PATCH /api/v1/op/products/:id              body Partial<CreditProduct> & { meta?: Partial<ProductMeta> } → OpProduct (422 on invalid rates/percent/months)
  PATCH /api/v1/op/rules/:id                 body Partial<PlatformRule> → PlatformRule (also logs the change in the rules history, bumps version)
        Withdrawal rules: r-limit-withdraw-daily, r-limit-withdraw-monthly (fixed caps, no approval). The rules r-withdraw-manual
        and r-kyc-l1-docs / r-kyc-l2-docs / r-kyc-l2-withdraw-cap are removed (no manual withdrawal approval, no document KYC);
        r-kyc-credit (level 2 for credit) and r-kyc-trade (level 3 = سجام for fund trades) describe the app's automated levels.
  POST  /api/v1/op/requests/:id/decision     body { approve, note? } → ApprovalRequest (decidedBy = calling operator; notifies the employee in-app)

New endpoints
  POST  /api/v1/op/funds/nav-refresh         body { fundId? } → { lastNavAt, funds: OpFund[] }
  GET   /api/v1/op/rules/meta                → RulesMeta { version, history[], defaults{ruleId: {enabled, value}} }
  POST  /api/v1/op/rules/batch               body { changes: { id, enabled?, value? }[] } → { version, rules, history }  (422 on invalid values)
  GET   /api/v1/op/requests/meta             → Record<requestId, RequestMeta { slaDueAt, riskScore, creditScore?, details[], factors[], checks[] }>
  PATCH /api/v1/op/requests/:id/meta         body { checks: boolean[] } → RequestMeta
  POST  /api/v1/op/requests/:id/reopen       → ApprovalRequest (back to pending; 409 if already pending)
  POST  /api/v1/op/requests/:id/escalate     → RiskAlert (new open alert referring the request to the risk team)
  GET   /api/v1/op/risk/insights             → RiskInsights { platformScore, platformScoreDelta, suspiciousToday, txToday, alertsToday, daily[30], legalHolds[] }
  POST  /api/v1/op/legal-holds/:id/release   → LegalHold (record: only when status = pending, else 409; lock: removes the user's legal lock)
  GET   /api/v1/op/reports/extra             → ReportsExtra { aumMonthly[12], lockedValue, credit[6], creditOutstanding, …, sla, schedules[] }
  POST  /api/v1/op/reports/schedules         body { name, period, recipients, format } → ReportSchedule (422 without name)
  PATCH /api/v1/op/reports/schedules/:id     body { enabled } → ReportSchedule
  GET   /api/v1/op/system-status             → SystemStatus { checkedAt, services[], incidents[], notice? }
  POST  /api/v1/op/system-status/refresh     → SystemStatus
  POST  /api/v1/op/settings/team             body { name, email, roleKey } → OpSettingsX (422 invalid name/email, 409 duplicate email)
  PATCH /api/v1/op/settings/team/:id         body { status: 'active'|'inactive' } → OpSettingsX (422 for the panel owner)
  POST  /api/v1/op/settings/api-key/rotate   → OpSettingsX (new masked key)
  POST  /api/v1/op/settings/sessions/revoke  → OpSettingsX (ends every session except the current one)
```

### بهره‌بردار — خزانه، سفارش‌ها، نقدینگی، برنامه‌ریزی، فعالیت‌ها (`op-treasury-extra.ts`)

نمادنو از صندوق‌ها واحد می‌خرد («صدور»)، آن‌ها را یک موجودی مشترک نگه می‌دارد، بخشی را به بسته‌های سازمان‌ها و کاربران تخصیص می‌دهد (بخشی رزروشده) و باقی «موجودی آزاد» است.

**ریال در مرکز:** هر تعامل کاربران و سازمان‌ها با نمادنو ریالی است (واریز، دریافت بسته، برداشت، فروش واحد)؛ صندوق‌ها سیاست پشت صحنه‌اند. حساب بانکی نمادنو دو خزانه‌ی ریالی دارد که مثل موجودی صندوق‌ها نمایش داده می‌شوند: **«ریال»** (کیف پول کاربران، حساب آزاد سازمان‌ها، پول کنار گذاشته برای سفارش‌های صدور، و ریال آزاد نمادنو) و **«ریال رزرو»** (مبلغ بسته‌های ارسالی تا دریافت گیرندگان). جریان: واریز سازمان (فیش تأییدشده) → «ریال» (آزاد سازمان) → ارسال بسته آن را در «ریال رزرو» بلاک می‌کند (بسته فقط پس از پرداخت ارسال می‌شود؛ اگر «آزاد» کافی نباشد، بسته با فیش در **صف** می‌ماند و تا تأیید فیش نه ارسال می‌شود نه بلاک) → پذیرش گیرنده → کیف پول ریالی کاربر → بخش صندوقی از موجودی ما خریده می‌شود (پول به «ریال»، آزاد نمادنو برمی‌گردد). فروش واحد کاربر و سفارش صدور هم از «ریال» پرداخت می‌شوند. هر سازمان یک **حساب ریالی** نزد نمادنو دارد: آزاد / کنار گذاشته (برای بسته‌های در صف) / بلاک‌شده / فیش در انتظار تأیید؛ چیزی به نام «تأمین‌نشده» وجود ندارد. نوع‌ها: `src/api/op-treasury-extra.ts` · موتور ماک: `src/mocks/treasury.ts` · seed: `src/mocks/seed/extra-op-treasury.ts`.

```
Identities (per fund, in units; value = units × current NAV)
  held       units Namadno owns — changes ONLY when an order settles
  allocated  baseline (people the mock does not model one by one) + Σ holdings of modelled people
  reserved   baseline + Σ reservations of modelled people                        (always ≤ allocated)
  committed  baseline + pending recipients of sent, not expired packages × split (free split → assumptions.defaultSplit)
  available  = held − allocated − committed − pending redeem                      (never negative)
  queue («صف تأمین»): nothing goes negative anywhere — what the free stock (or Namadno's free rial) cannot cover waits and is
             fulfilled automatically, oldest first, as soon as it is covered (fillQueues runs before every request):
             packages awaiting_stock (gold/fixed parts) · users' purchases (buy) · accepted package fund parts (accept) ·
             users' sales waiting for free rial (sell). New demand only gets what is left after the queue (stockRoom / rialRoom).
             Promise (eta) = fund settlement + one working day (T+2 → 72h). GET /api/v1/op/treasury/queue?fundId → QueueItem[]
  queuedValue / queuedCount / needBy = the queue on this fund · needBuyValue = max(0, queued − available) («نیاز به خرید»)
  demandPerDay (NET, Toman) = assumptions.demandPerDay + newPackagesPerMonth × split / 30 − assumptions.returnsPerDay
  coverageDays = (availableValue − queuedValue + pendingBuyValue) / demandPerDay   (null when demandPerDay ≤ 0)
  minTarget  = max(target.minFreeValue, demandPerDay × target.targetDays)       (TreasuryPosition.minTargetValue; reservedByType is in units)
  state      inactive (fund not active) · need_buy (queue > available: items wait — buy now) · below (< minTarget) ·
             surplus (> target.maxFreeValue) · ok — measured on available − queued. `shortfall` is deprecated (never produced)
  suggestion buy  = minTarget − (available − queued + pending buy)   (rounded up to 0.1B; ≥ 10M)
             redeem = available − maxFreeValue               (only when surplus; never under minTarget)
Rial (Toman) — everything users and organizations do is in rial
  bank (CashSummary.balance) = opening + Σ done entries
  organization rial account  balance  = approved deposits − paid to recipients (on acceptance) + reclaimed milestone shares
                             blocked  = pending recipients of its sent, not expired packages (whole amounts; plus an unmodelled baseline)
                                        — always ≤ balance: a package is sent (and blocked) only when it is paid
                             queue    = its packages waiting for their receipt approval (awaiting_payment) or for Namadno's stock
                                        (awaiting_stock): not delivered, not blocked; queuedTotal / queuedCount
                             setAside = Σ queued packages' funding.fromFree (the part «آزاد» covered when submitted), capped at balance − blocked
                             free     = max(0, balance − blocked − setAside)
                             pending  = deposit receipts waiting for the operator's review (status expected) — never overdue
                             unfunded = 0 (deprecated: nothing is ever sent unpaid)
  «ریال رزرو» held = Σ blocked          «ریال» held = bank − «ریال رزرو» held
  Namadno free rial = CashSummary.available = «ریال» held − userWallets − orgFree − orgSetAside − tiedInOrders
                    = bank − userWallets − tiedInOrders − Σ organizations' balances
  userWallets includes users' money in transit (purchases waiting for stock). Namadno free rial is never negative.
  RialTreasury.main.queuedValue / queuedCount = users' sales waiting for free rial; needValue = max(0, queued − available)
  «ریال» state: need_buy («نیاز به تأمین ریال», sales wait) · below (< targets.rial.minFreeValue) · surplus (> maxFreeValue) · ok
  «ریال رزرو» state: always ok (kept for compatibility)
  managed assets (AUM) = Σ held fund value + bank (TreasurySummary.managed; aumMonthly, aumTarget.pct and mix use it)
  CashSummary.committedRial is deprecated (the rial part of open commitments, before the rial treasuries) and not part of available.

Computed fields on existing resources (same names and shapes — values now come from the treasury so every screen agrees)
  Fund.aum                 = held value                         GET /op/funds, /op/funds/:id, /funds …
  Fund.meta.lockByType     = reserved value per reservation type
  OrgContractExt.aum / locked / lockByType = baseline + the organization's modelled members; last aumHistory point = aum
  GET /op/overview stats.aum = Σ held value + rial bank · stats.lockedValue = Σ reserved value · stats.freeValue = aum − lockedValue
                   stats.monthly[].aum (last = aum) · lockMix (% of reserved value per type)
  Invariants (the mock warns in the console when broken): reserved ≤ allocated per fund ·
  Σ organization fundValue ≤ Σ allocated value · Σ fund AUM = Σ held value ·
  bank = userWallets + tiedInOrders + orgFree + reserve + available.

Stock
  GET   /api/v1/op/treasury/summary?range=7|30|90      → TreasurySummary { asOf, totals, coverageDays, positions[], cash, rial: RialTreasury,
                                                          managed{value, funds, rial}, mix[] (first entry fundId 'rial'), otherTargetPct?,
                                                          byOrg[], individualsValue, flow{labels, allocated[], returned[], bought[], redeemed[]},
                                                          aumMonthly[{month, aum, target?}], aumTarget{value, by, pct}, growth }
  GET   /api/v1/op/treasury/positions                   → TreasuryPosition[]   (all funds, d.funds order)
  GET   /api/v1/op/treasury/positions/:fundId           → TreasuryPositionDetail (+ history[90]{t, available, held}, movements[30], orders[], forecast (30 days; missing for inactive funds))  · 404 not_found
  GET   /api/v1/op/treasury/movements?fundId&kind&limit → StockMovement[] newest first (limit default 50). units: + into free stock, − out of it
Orders («صدور» = buy units, «ابطال» = redeem)
  GET   /api/v1/op/treasury/orders?status&fundId&side   → TreasuryOrder[] (open first). status: placed | due (placed and settleAt ≤ now) | settled | cancelled
  POST  /api/v1/op/treasury/orders/quote  body { fundId, side, amount }
        → OrderQuote { units, fee, nav, settleAt, cashAvailableAfter, availableUnitsAfter, availableValueAfter, coverageDaysAfter, warnings[] }
        → 422 bad_amount (< 10,000,000) | fund_unavailable (not active / no NAV) | bad_side. Conditions that would block the order appear in warnings[].
  POST  /api/v1/op/treasury/orders        body { fundId, side, amount, note?, source?: 'manual'|'suggestion', recommendationId? }
        → 201 TreasuryOrder (status placed; a buy ties its amount in cash; a redeem leaves the free stock at once)
        → 422 bad_amount | fund_unavailable | insufficient_cash {available} (free rial after the sales queue) | insufficient_stock {availableUnits, availableValue}
          (free stock after the queue) | below_target {minFree, availableValue}
        buy fee = amount × fund.feePct; units = (amount − fee) / NAV at settlement · redeem units = amount / NAV; proceeds = units × NAV − amount × meta.sellFeePct
  POST  /api/v1/op/treasury/orders/:id/settle           → TreasuryOrder (held ±units, cash entry, stock movement, activity)  · 404 · 409 not_open
  POST  /api/v1/op/treasury/orders/:id/cancel  body { reason? } → TreasuryOrder                                                 · 404 · 409 not_open
Cash
  GET   /api/v1/op/treasury/cash?range=30|90            → CashSummary { balance, tiedInOrders, userWallets, committedRial (deprecated), orgFree, orgSetAside, reserve, unfunded (deprecated, 0),
                                                          available (Namadno free rial), expectedDeposits / expectedCount (receipts waiting for review),
                                                          overdueCount / overdueAmount (deprecated, always 0), history[] }
  GET   /api/v1/op/treasury/rial?range=30|90            → RialTreasury { bank, main{held, users, usersReserved, orgFree, orgSetAside, tied, available, target?, state},
                                                          reserve{held (= blocked), blocked, unfunded (deprecated, 0), expected (receipts waiting), state (always ok)},
                                                          byOrg: OrgRialAccount[] { …OrgRialBalance { balance, blocked, free, setAside, queuedTotal, queuedCount,
                                                          unfunded (0), pending, pendingCount } }, history[]{t, bank, available, reserve} }
  GET   /api/v1/op/treasury/rial/moves?kind&orgId&userId&limit → RialMove[] newest first (limit default 50, max 300), derived from the ledger,
                                                          the activity log and stock movements. kinds: org_deposit | reserve (package sent) | payout (recipient accepted) |
                                                          release (package cancelled) | reclaim | user_buy | user_sell | user_deposit | user_withdrawal | order_buy |
                                                          order_redeem | fee | adjustment; `from` → `to` are display labels
  GET   /api/v1/op/treasury/cash/entries?kind&status&orgId → CashEntry[] (balanceAfter on done entries). status: expected (receipt waiting
                                                          for review) | done (approved) | rejected | cancelled. Organization deposits carry receipt
                                                          { id, name, type, size, url }, note (the organization's description), submittedBy,
                                                          rejectReason / rejectedAt, and forPackage? { id, title, recipients, total, fromFree,
                                                          status queued|sent|cancelled|other } (derived: the package the receipt pays for).
                                                          dueAt / overdue are deprecated and no longer set.
  POST  /api/v1/op/treasury/deposits/:id/confirm  body { ref? } → approve a receipt: CashEntry (expected → done, receivedAt; the organization's
                                                          balance rises) + deliveredPackage? { id, title, recipients } when the receipt belonged to a
                                                          package waiting for payment that is now covered (it goes out to its recipients)  · 404 · 409 not_pending
  POST  /api/v1/op/treasury/deposits/:id/reject   body { reason } → CashEntry (rejected; the organization is notified and can upload a new
                                                          receipt) · 404 · 409 not_pending · 422 missing_reason
  POST  /api/v1/op/treasury/deposits              body { orgId, amount, ref?, note? } → 201 CashEntry (done; the organization's balance rises) · 422 bad_amount | missing_org
Organizations
  GET   /api/v1/op/treasury/orgs/:id                    → OrgTreasuryDetail { row: OrgTreasuryRow (+ rial: OrgRialBalance), deposits: CashEntry[], upcoming: ForecastEvent[] (90 days) } · 404
Targets + planning
  GET   /api/v1/op/treasury/targets                     → TreasuryTargets { stock[], rial?{minFreeValue, maxFreeValue?}, aum{value, by}, mix{rial|fundId|other: %}, orgs{value, by}, users{value, by}, updatedAt, updatedBy }
  PATCH /api/v1/op/treasury/targets  body TargetsPatch (any of stock[] (merged by fundId) | rial | aum | mix | orgs | users) → TreasuryTargets
        → 422 bad_mix (mix ≠ 100) | bad_target (unknown fund, minFreeValue < 0, targetDays ∉ 1…365, maxFreeValue ≤ minFreeValue, value ≤ 0) | bad_date (by not in the future)
  GET   /api/v1/op/treasury/plan?horizon=30|60|90       → TreasuryPlan { horizon, from, to, buckets[] (weekly), perFund: FundForecast[], events: ForecastEvent[],
                                                          recommendations[], progress: TargetProgress[], assumptions }
        FundForecast: demand = user buys + expected new packages + planned packages/drafts (× split) over the horizon
                      returns = user sells + savings releases × vestingSellBackPct + milestone dues × reclaimRate + committed × (1 − acceptanceRate)
                      projectedEnd = available + pending buy − demand + returns → state + suggestion (same rules as the position)
        Recommendation (buy): horizonAmount = the forecast's need over the horizon; amount / action.amount = what to order now =
                      min(need, maxFreeValue − (available + pending buy), free cash left after more urgent funds); below 10M → action is a link to cash
        events: planned packages and baseline releases (seed schedule) + live drafts, package expiries, open milestone steps, savings releases of
                modelled people and open orders (settleAt). (Deposits have no due date; 'deposit_due' / 'collect_deposit' are no longer produced.)
Action queue + activity
  GET   /api/v1/op/actions → ActionItem[] most severe first (critical → warning → info), then oldest. kinds:
        stock_need_buy («نیاز به خرید», critical; cta order buy, or «سفارش‌ها» when an open buy covers it) | stock_below | stock_surplus (cta order) ·
        order_settle (cta settle_order) · deposit_review (a receipt waiting for review; cta review_deposit) ·
        request_sla (pending operator requests whose SLA ends within 4h; credit kinds hidden while FEATURES.orgCredit is off) · risk_alert (open high/critical) ·
        milestone_due (approval steps due within 3 days) · org_onboarding · service_incident (open incidents) ·
        rial_need («نیاز به تأمین ریال»: users' sales wait for free rial, critical) | rial_below (< targets.rial.minFreeValue).
        (stock_shortfall, rial_shortfall and reserve_unfunded are no longer produced: nothing goes negative.)
  GET   /api/v1/op/activity?actor=user|org|operator|system&category&orgId&userId&q&limit&offset
        actor may be a comma list (the console's «سامانه» tab = operator,system: Namadno team and automatic actions together)
        → ActivityPage { items[] newest first, total, counts{all, user, org, operator, system} (ignoring the actor filter), daily[14] }
        userId matches the actor or any ref. Events are written by the flows below and by the treasury endpoints.
        href fields may carry ?id= (requests, risk, orders, cash) for the pages to open the item. (deposit_overdue / deposit_expected are no longer produced.)

Live flows (the core handlers call the treasury engine)
  org sends a package        → «آزاد» covers it: sent and delivered; its amount is blocked in «ریال رزرو»; commitment + activity.
                               «آزاد» short: the request must carry the receipt for the rest (multipart) → status awaiting_payment
                               («در انتظار تأیید واریز», not delivered, whole amount blocked) + a receipt waiting for review.
                               The response has funding { fromFree, toDeposit } (+ deposit)                     (org.ts send)
  org sends, stock short     → paid, but the free stock (after the queue) does not cover its gold / fixed parts → status awaiting_stock
                               («در انتظار تأمین موجودی», stockEta = settlement + one working day, whole amount set aside, nothing delivered);
                               the response has stock { eta, missing }. Sent automatically when the stock arrives (oldest first).
  operator approves receipt  → the organization's balance ↑; a package waiting for it is delivered (inbox, notifications, activity) —
                               or, if the stock is short, moves to awaiting_stock (response stockQueued { id, title, eta })
  operator rejects receipt   → rejected with a reason; the organization's notifications show it; it uploads a new receipt or cancels
  org cancels a package      → a pending receipt for it is cancelled; the blocked money returns to the organization's free (org.ts cancel)
  employee accepts a package → the organization's balance ↓ (reserve → the user's rial wallet); committed ↓, allocated ↑ (free stock
                               unchanged), allocate movement, activity. A fund part the stock cannot cover (free choice above the assumed
                               split) waits in the queue (kind accept; tx details «در انتظار تأمین …») and gets its reservation on arrival (app.ts accept)
  operator settles a buy     → held ↑ → the queue is served (packages sent, purchases delivered, users notified)
  org uploads a receipt      → «اعلام واریز» from the dashboard (or a new receipt for a waiting package): pending review   (org panel)
  user buys / sells a fund   → allocated ↑ / ↓ (a sale returns to the shared stock), movement, activity      (app.ts trades)
  user deposit / withdrawal  → user_deposit / user_withdrawal cash entry (wallets move with the balance)     (app.ts deposits, withdrawals)
  milestone step released    → reserved ↓, activity · reclaimed → reserved and allocated ↓, reclaim movement (back to free stock),
                               the reclaimed value is credited to the organization's rial account, activity    (org.ts)

Fixed mock clock: nothing settles on its own. «ثبت تسویه» and receipt reviews are manual; the real backend settles orders from the
funds' trading core (NAV at settlement); receipts are reviewed by the operator against the bank statement. /op/reports and /op/reports/schedules remain but are
no longer used by the console (reports were folded into the overview).
```

### پنل سازمان — حساب ریالی سازمان (`org-money-extra.ts`)

```
The organization's rial account with Namadno (same numbers as OrgTreasuryRow.rial in the operator console).
Types: src/api/org-money-extra.ts · handlers: src/mocks/handlers/org-money-extra.ts · engine: src/mocks/treasury.ts.

GET  /api/v1/org/account → OrgAccount { balance, blocked, free, setAside, queuedTotal, queuedCount, unfunded (deprecated, 0), pending, pendingCount,
                            bank { name, iban, holder } (Namadno's account to deposit to),
                            entries: OrgAccountEntry[] (every receipt waiting for review, every rejected one, then the latest 10 approved) —
                                     { id, at, title, amount, status expected|done|rejected, note, receipt, rejectReason?, packageId?, packageTitle? },
                            moves: RialMove[] (the organization's recent rial movements; max 12) }
POST /api/v1/org/account/deposits multipart/form-data { amount, receipt (file: image/jpeg|png|webp or application/pdf, ≤ 5MB), note?, packageId? }
                            → 201 OrgAccountEntry («اعلام واریز» / a new receipt for a package in the queue): waits for the operator's
                            review (approve → «آزاد» rises; reject → reason) · 422 bad_amount (< 1,000,000, or for a package < its funding.toDeposit
                            { shortfall }) | missing_receipt | bad_receipt | bad_package
POST /api/v1/org/packages/:id/send → when «آزاد» covers the total: JSON (no body) → OrgPackage (sent) + funding { fromFree: total, toDeposit: 0 };
                            if Namadno's stock (after the queue) does not cover its gold / fixed parts → OrgPackage (awaiting_stock, stockEta,
                            stockQueuedAt, funding { fromFree: total }) + stock { eta, missing { gold?, fixed? } } — sent automatically when stocked.
                            When it does not: multipart { receipt, amount (≥ shortfall), note? } → OrgPackage (awaiting_payment, submittedAt,
                            funding { fromFree, toDeposit } — kept on the package) + deposit (the receipt waiting for review).
                            The package waits in the queue: nothing is delivered, notified or blocked; only `fromFree` is set aside from «آزاد».
                            When the operator approves its receipt it is delivered (sent, blocked, inbox items); a rejected receipt keeps it in the
                            queue for a new receipt (or cancel). · 422 receipt_required { shortfall, free } | bad_amount { shortfall } | bad_receipt.
                            The annual budget cap (Organization.budgetYear/budgetUsed) is a separate limit; budgetUsed counts a package when it is
                            delivered, and the check includes packages in the queue: 422 over_budget «مبلغ بسته از سقف بودجه‌ی سالانه‌ی سازمان بیشتر است.»
                            Cancelling a queued package cancels its pending receipt and frees what was set aside.
```

### سایت عمومی (`site-extra.ts`)

```
Additional mock endpoints owned by the "site" area. Registered before the core handlers (can override).

GET  /api/v1/public/stats
     → { organizations: number; employees: number; aum: number (Toman); funds: number }
     Public headline numbers for the landing page (active organizations, active employees,
     total AUM of the group's funds, number of active funds).

GET  /api/v1/public/credit-products
     → { id, kind: 'loan'|'card_credit'|'installment', name, rateMin, rateMax, maxPctOfAssets, monthsOptions }[]
     Active credit products (public subset of the operator's product catalogue).

POST /api/v1/public/contact            (overrides the core handler; same response shape)
     body  { name: string; phone: string; company?: string; email?: string; topic?: 'contact'|'demo'|'support'|'careers'; employees?: string; message?: string }
     → 200 { ok: true; ticket: string }   ticket = 'CT-xxxx' (contact) | 'DM-xxxx' (demo)
     → 422 { code: 'missing_fields' | 'invalid_phone' | 'invalid_email' | 'missing_company', message, details: { field } }
```
