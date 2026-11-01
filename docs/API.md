# قرارداد API — Namadno REST v1

این سند قرارداد بین فرانت و بک‌اند است. فرانت امروز با بک‌اند ماک (MSW، پوشهٔ `src/mocks`) کار می‌کند؛ بک‌اند واقعی باید همین مسیرها و شکل‌ها را پیاده کند.

## قراردادهای کلی

- **Base URL:** `NEXT_PUBLIC_API_BASE_URL` (پیش‌فرض `/api/v1`).
- **احراز هویت:** هدر `Authorization: Bearer <token>`. سه نقش: `employee` (اپ)، `org_admin` (پنل سازمان)، `operator` (کنسول بهره‌بردار). فرانت توکن هر نقش را جدا نگه می‌دارد (`src/api/client.ts`) و بر اساس پیشوند مسیر (`/org/…`، `/op/…`، بقیه) می‌فرستد.
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
| POST | `/org/auth/login` | `{ email, password }` — در ماک، ایمیل یکی از `admins` هر سازمان با همان شخص وارد می‌شود (مدیر / تأییدکننده / کارشناس)؛ ایمیل دیگر = کارشناس سازمان نمونه. کاربری که با رمز موقت ساخته شده `Session.mustChangePassword: true` می‌گیرد و پیش از ورود به پنل باید رمز تازه بسازد | `Session` (org_admin) |
| POST | `/org/auth/password` | `{ password }` — اولین ورود با رمز موقت: رمز تازه (حداقل ۸ نویسه، حرف و عدد → وگرنه `422 weak_password`)؛ `mustChangePassword` پاک می‌شود | `{ ok }` |
| POST | `/op/auth/login` | `{ email, password, otp? }` | `Session` (operator) |

## اپ کارمند

| روش | مسیر | توضیح / بدنه | پاسخ |
|---|---|---|---|
| GET | `/me` | پروفایل | `UserProfile` |
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
| POST | `/me/trades` | `{ direction: buy\|sell, fundId, amount }` — خرید از ریال آزاد، فروش از بخش آزاد صندوق | `Transaction` |
| POST | `/me/deposits` | `{ amount, destination: rial\|gold\|fixed\|… }` | `Transaction` |
| POST | `/me/withdrawals` | `{ amount, bankAccountId? }` از ریال آزاد | `Transaction` (pending) |
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
| GET | `/org/me` | سازمان و ادمین جاری؛ `admin.panelRole` نقش است: `admin` «مدیر» · `approver` «تأییدکننده» · `specialist` «کارشناس» (نبودنش = `specialist`)؛ `admin.role` همان برچسب فارسی نقش است | `{ organization, admin }` |
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
| GET | `/org/requests?status=` · POST `/org/requests/:id/decision` `{ approve, note? }` | فقط درخواست‌هایی که سازمان تأیید می‌کند: `milestone_release` (و `loan` پس از فعال شدن تسهیلات). برداشت، افزایش اعتبار، اقساط و تغییر مشخصات فقط در کنسول بهره‌بردار (`/op/requests`). همین قاعده برای `/org/people/requests`، `kpis.pendingRequests` داشبورد و درخواست‌های صفحه‌ی کارمند. برای `milestone_release`: `approve: true` مرحله را آزاد می‌کند و `approve: false` یعنی **بازپس‌گیری** همان مرحله (`note` الزامی، حداقل ۳ حرف → `422 note_required`؛ همان اثر `POST …/milestones/:stepId/reclaim`)؛ درخواست `rejected` می‌شود و در UI «بازپس گرفته شد» نمایش داده می‌شود. تصمیم‌های `milestone_release` برگشت‌پذیر نیستند. `ApprovalRequest` فیلدهای اختیاری `packageId`، `stepId` و `trigger` (`employee` \| `due_date`) هم دارد | `ApprovalRequest` |
| GET | `/org/notifications` · POST `/org/notifications/read` `{ ids? }` | اعلان‌های پنل سازمان (زنگوله): «نیاز به اقدام» (از داده‌ی جاری: مرحله در انتظار تأیید، پیش‌نویس ارسال‌نشده، مهلت پذیرش نزدیک، همکاران فعال‌نشده، پایان قرارداد) + «به‌روزرسانی‌های سامانه»؛ `ids` نبود = همه خوانده شود | `{ items: OrgNotification[] }` · `{ ok }` |
| GET | `/org/credit` · `/org/reports` | `/org/reports` (ماهانه‌ی ارسال) و `/org/reports/overview` و خروجی‌ها در داشبورد سازمان نمایش داده می‌شوند؛ صفحه‌ی جدای گزارش‌ها حذف شد | |
| GET/PATCH | `/org/contract` | تنظیمات قرارداد و کاربران پنل | `Organization` |

> **مراحل قرارداد (دریافت مرحله‌ای):** هر مرحله سررسید (`dueDate`) **الزامی** دارد (ساخت و ویرایش پیش‌نویس: `422 bad_steps` «سررسید همه‌ی مراحل الزامی است.»؛ سررسید باید در آینده و هم‌زمان یا پس از مرحله‌ی قبل باشد) و `requiresApproval` اختیاری (نبودنش = `true`). مراحل به ترتیب پیش می‌روند و همیشه یک مرحله‌ی باز `pending_approval` (مرحله‌ی جاری) است. در سررسید مرحله‌ی جاری: اگر `requiresApproval: false` باشد خودکار آزاد می‌شود (درخواست‌های باز آن مرحله با `decidedBy: 'سامانه'` تأیید می‌شوند) و مرحله‌ی بعد بررسی می‌شود؛ اگر تأیید لازم باشد برای هر گیرنده‌ی پذیرفته یک درخواست `milestone_release` با `trigger: 'due_date'`، `packageId`، `stepId` و یادداشت «سررسید این مرحله رسیده است.» باز می‌شود (برای هر مرحله و گیرنده فقط یک بار). قرارداد تا پذیرش کارمند شروع نمی‌شود. **بک‌اند واقعی باید این پردازش را زمان‌بندی‌شده (مثلاً روزانه) اجرا کند**؛ ماک آن را پیش از هر درخواست API اجرا می‌کند (`processDueMilestones` در `src/mocks/handlers/org.ts`). وضعیت `reclaimed` («بازپس گرفته شد»، با `reclaimedAt` و `reclaimNote`) مثل `released` نهایی است.

> **ویزارد ارسال بسته (UI):** نوع بسته پرسیده نمی‌شود؛ `reason` از شیوه‌ی دریافت می‌آید (مرحله‌ای = `project_contract`، بقیه همان قبلی یا `bonus`). برداشت نقدی هم پرسیده نمی‌شود؛ `cashAllowed` همان `settings.cashWithdrawalAllowed` قرارداد است (بخش آزاد قابل برداشت است). گیرندگان را می‌شود از فایل اکسل (کد ملی، مبلغ) انتخاب کرد؛ آن‌وقت مبلغ هر نفر در مرحله‌ی تنظیمات فقط‌خواندنی است. `OrgPackage.amountSource` اختیاری است (نبودنش = `uniform`).

## کنسول بهره‌بردار

| روش | مسیر | توضیح |
|---|---|---|
| GET | `/op/overview` | KPIهای پلتفرم، تفکیک قفل، صندوق‌ها، درخواست‌ها و هشدارها |
| GET/POST | `/op/organizations` · GET/PATCH `/op/organizations/:id` | سازمان‌ها و قراردادها |
| GET | `/op/users?q=&filter=locked\|kyc\|legal` · `/op/users/:id` | کاربران با تفکیک آزاد/قفل |
| POST | `/op/users/:id/status` `{ status }` | تعلیق/فعال‌سازی |
| POST | `/op/users/:id/legal-hold` `{ holdingKind, amount, reference, reason }` | اعمال مسدودی قانونی (فقط از بخش آزاد) |
| DELETE | `/op/users/:id/legal-hold/:lockId` | رفع مسدودی |
| GET | `/op/funds` · GET/PATCH `/op/funds/:id` | صندوق‌ها |
| GET | `/op/products` · PATCH `/op/products/:id` | محصولات اعتباری |
| GET | `/op/rules` · PATCH `/op/rules/:id` | قوانین و محدودیت‌ها |
| GET | `/op/requests?status=&kind=` · POST `/op/requests/:id/decision` | درخواست‌های همه سازمان‌ها، به‌جز `milestone_release` (تأیید یا بازپس‌گیری مراحل قرارداد با سازمان است؛ تصمیم بهره‌بردار روی آن `409 org_decides`) |
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
GET    /api/v1/op/core/org-ext                         → Record<orgId, OrgContractExt>   (metrics + contract terms + HR users of every organization)
GET    /api/v1/op/core/organizations/:id/credit        → OrgCreditRow[]                   (loans / card credit / BNPL of the organization's users)
POST   /api/v1/op/core/organizations/:id/hr-users      { name, email, role } → HrUser (status «invited»)   · 422 missing_fields
GET    /api/v1/op/core/overview?range=7|30|90          → OverviewExt                      (daily flow series, KPI deltas, lock counts, service health, feed)
GET    /api/v1/op/core/users-meta                      → UsersMeta                        (facility kinds / lock types / KYC state per user + platform totals)
GET    /api/v1/op/core/users/:id/extra                 → OpUserExtra                      (facilities, operator notes, audit log, devices)
POST   /api/v1/op/core/users/:id/notes                 { text, tag } → UserNote           · 422 missing_text
POST   /api/v1/op/core/users/:id/reset-password        {} → { sent: true }

── Overrides of core endpoints ──
POST   /api/v1/op/organizations          body: Partial<Organization> & { contract?: Partial<OrgContractExt>; hrUsers?: {name,email,mobile?,role,tempPassword?}[]; sendInvites?: boolean }
       sendInvites: true → SMS invite link (the user sets a password). sendInvites: false → every user needs tempPassword
       (≥ 8 chars, letters + digits; 422 temp_password_required | weak_password); the user changes it on first login
       (admins[].mustChangePassword, HrUser.access 'temp_password'). The real backend stores only a hash.
                                         → Organization (201, status «onboarding»)   · 422 missing_name | invalid_employees | missing_funds
PATCH  /api/v1/op/organizations/:id      body: Partial<Organization> & { contract?: Partial<OrgContractExt>; changeNote?: string }
                                         → Organization; a change of settings/contract bumps the contract version (OrgContractExt.versions)
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

نمادنو از صندوق‌ها واحد می‌خرد («صدور»)، آن‌ها را یک موجودی مشترک نگه می‌دارد، بخشی را به بسته‌های سازمان‌ها و کاربران تخصیص می‌دهد (بخشی رزروشده) و باقی «موجودی آزاد» است. پول از یک حساب ریالی پلتفرم می‌گذرد: واریز سازمان‌ها و کاربران ورودی، صدور خروجی، ابطال ورودی. نوع‌ها: `src/api/op-treasury-extra.ts` · موتور ماک: `src/mocks/treasury.ts` · seed: `src/mocks/seed/extra-op-treasury.ts`.

```
Identities (per fund, in units; value = units × current NAV)
  held       units Namadno owns — changes ONLY when an order settles
  allocated  baseline (people the mock does not model one by one) + Σ holdings of modelled people
  reserved   baseline + Σ reservations of modelled people                        (always ≤ allocated)
  committed  baseline + pending recipients of sent, not expired packages × split (free split → assumptions.defaultSplit)
  available  = held − allocated − committed − pending redeem                      (negative = shortfall «کسری»)
  demandPerDay (NET, Toman) = assumptions.demandPerDay + newPackagesPerMonth × split / 30 − assumptions.returnsPerDay
  coverageDays = (availableValue + pendingBuyValue) / demandPerDay               (null when demandPerDay ≤ 0)
  minTarget  = max(target.minFreeValue, demandPerDay × target.targetDays)       (TreasuryPosition.minTargetValue; reservedByType is in units)
  state      inactive (fund not active) · shortfall (available < 0) · below (< minTarget) · surplus (> target.maxFreeValue) · ok
  suggestion buy  = minTarget − (available + pending buy)   (rounded up to 0.1B; ≥ 10M)
             redeem = available − maxFreeValue               (only when surplus; never under minTarget)
Cash (Toman)
  balance   = opening + Σ done entries          available = balance − tiedInOrders (open buys) − userWallets − committedRial

Computed fields on existing resources (same names and shapes — values now come from the treasury so every screen agrees)
  Fund.aum                 = held value                         GET /op/funds, /op/funds/:id, /funds …
  Fund.meta.lockByType     = reserved value per reservation type
  OrgContractExt.aum / locked / lockByType = baseline + the organization's modelled members; last aumHistory point = aum
  GET /op/overview stats.aum = Σ held value · stats.lockedValue = Σ reserved value · stats.freeValue = aum − lockedValue
                   stats.monthly[].aum (last = aum) · lockMix (% of reserved value per type)
  Invariants (the mock warns in the console when broken): reserved ≤ allocated per fund ·
  Σ organization fundValue ≤ Σ allocated value · Σ fund AUM = Σ held value = overview aum.

Stock
  GET   /api/v1/op/treasury/summary?range=7|30|90      → TreasurySummary { asOf, totals, coverageDays, positions[], cash, mix[], otherTargetPct?,
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
        → 422 bad_amount | fund_unavailable | insufficient_cash {available} | insufficient_stock {availableUnits, availableValue} | below_target {minFree, availableValue}
        buy fee = amount × fund.feePct; units = (amount − fee) / NAV at settlement · redeem units = amount / NAV; proceeds = units × NAV − amount × meta.sellFeePct
  POST  /api/v1/op/treasury/orders/:id/settle           → TreasuryOrder (held ±units, cash entry, stock movement, activity)  · 404 · 409 not_open
  POST  /api/v1/op/treasury/orders/:id/cancel  body { reason? } → TreasuryOrder                                                 · 404 · 409 not_open
Cash
  GET   /api/v1/op/treasury/cash?range=30|90            → CashSummary { balance, tiedInOrders, userWallets, committedRial, available,
                                                          expectedDeposits, expectedCount, overdueCount, overdueAmount, history[] }
  GET   /api/v1/op/treasury/cash/entries?kind&status&orgId → CashEntry[] (balanceAfter on done entries; overdue flag). status: expected|done|cancelled|overdue
  POST  /api/v1/op/treasury/deposits/:id/confirm  body { ref? } → CashEntry (expected → done, receivedAt, bank ref)  · 404 · 409 already_received
  POST  /api/v1/op/treasury/deposits              body { orgId, amount, ref?, note? } → 201 CashEntry (done)          · 422 bad_amount | missing_org
Organizations
  GET   /api/v1/op/treasury/orgs/:id                    → OrgTreasuryDetail { row: OrgTreasuryRow, deposits: CashEntry[], upcoming: ForecastEvent[] (90 days) } · 404
Targets + planning
  GET   /api/v1/op/treasury/targets                     → TreasuryTargets { stock[], aum{value, by}, mix{fundId|other: %}, orgs{value, by}, users{value, by}, updatedAt, updatedBy }
  PATCH /api/v1/op/treasury/targets  body TargetsPatch (any of stock[] (merged by fundId) | aum | mix | orgs | users) → TreasuryTargets
        → 422 bad_mix (mix ≠ 100) | bad_target (unknown fund, minFreeValue < 0, targetDays ∉ 1…365, maxFreeValue ≤ minFreeValue, value ≤ 0) | bad_date (by not in the future)
  GET   /api/v1/op/treasury/plan?horizon=30|60|90       → TreasuryPlan { horizon, from, to, buckets[] (weekly), perFund: FundForecast[], events: ForecastEvent[],
                                                          recommendations[], progress: TargetProgress[], assumptions }
        FundForecast: demand = user buys + expected new packages + planned packages/drafts (× split) over the horizon
                      returns = user sells + savings releases × vestingSellBackPct + milestone dues × reclaimRate + committed × (1 − acceptanceRate)
                      projectedEnd = available + pending buy − demand + returns → state + suggestion (same rules as the position)
        Recommendation (buy): horizonAmount = the forecast's need over the horizon; amount / action.amount = what to order now =
                      min(need, maxFreeValue − (available + pending buy), free cash left after more urgent funds); below 10M → action is a link to cash
        events: planned packages and baseline releases (seed schedule) + live drafts, package expiries, open milestone steps, savings releases of
                modelled people, open orders (settleAt) and expected deposits (dueAt; overdue ones keep their past date)
Action queue + activity
  GET   /api/v1/op/actions → ActionItem[] most severe first (critical → warning → info), then oldest. kinds:
        stock_shortfall | stock_below | stock_surplus (cta order) · order_settle (cta settle_order) · deposit_overdue | deposit_expected (≤ 3 days; cta confirm_deposit) ·
        request_sla (pending operator requests whose SLA ends within 4h; credit kinds hidden while FEATURES.orgCredit is off) · risk_alert (open high/critical) ·
        milestone_due (approval steps due within 3 days) · org_onboarding · service_incident (open incidents)
  GET   /api/v1/op/activity?actor=user|org|operator|system&category&orgId&userId&q&limit&offset
        → ActivityPage { items[] newest first, total, counts{all, user, org, operator, system} (ignoring the actor filter), daily[14] }
        userId matches the actor or any ref. Events are written by the flows below and by the treasury endpoints.
        href fields may carry ?id= (requests, risk, orders, cash) or ?status=overdue (cash) for the pages to open the item.

Live flows (the core handlers call the treasury engine)
  org sends a package        → expected org_deposit (pkg.total, due in 3 days) + commitment + activity      (org.ts send)
  org cancels a package      → its expected deposit becomes cancelled                                       (org.ts cancel)
  employee accepts a package → committed ↓, allocated ↑ (free stock unchanged), allocate movement, activity  (app.ts accept)
  user buys / sells a fund   → allocated ↑ / ↓ (a sale returns to the shared stock), movement, activity      (app.ts trades)
  user deposit / withdrawal  → user_deposit / user_withdrawal cash entry (wallets move with the balance)     (app.ts deposits, withdrawals)
  milestone step released    → reserved ↓, activity · reclaimed → reserved and allocated ↓, reclaim movement (back to free stock), activity (org.ts)

Fixed mock clock: nothing settles on its own. «ثبت تسویه» and «ثبت دریافت» are manual in the mock; the real backend settles orders from the
funds' trading core (NAV at settlement) and matches deposits from the bank statement. /op/reports and /op/reports/schedules remain but are
no longer used by the console (reports were folded into the overview).
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
