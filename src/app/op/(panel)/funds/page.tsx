'use client';
/** /op/funds — design: op-funds.dc.html (fund cards with free/locked AUM, credit products, global rules). */
import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { PageHeading } from '@/components/panel/PanelShell';
import { Icon } from '@/components/ui/Icon';
import { Skeleton, ErrorState } from '@/components/app/Screen';
import { useToast } from '@/components/ui/Toast';
import { useOpFunds, useOpOrganizations, useOpProducts, useOpRules } from '@/api/op';
import { useRefreshNav, useRulesMeta, useSaveRules, type OpFund, type OpProduct, type RuleChange } from '@/api/op-system-extra';
import { routes } from '@/lib/routes';
import { faDigits, jDayMonth, money } from '@/lib/format';
import { LOCK_META } from '@/lib/locks';
import { bn, dayTime, errMsg, spct } from '@/components/op/system/fmt';
import { CardHead, IC, Lbl, NumField, Sw, TONES } from '@/components/op/system/ui';
import { FUND_STATUS, FUND_UI, LOCK_COL, LOCK_ORDER, fundTitle, lockedOf, sparkOf } from '@/components/op/system/funds';
import { PRODUCT_STATUS, PRODUCT_UI, orgsWith, paramChips } from '@/components/op/system/products';

const RULE_IDS = ['r-pkg-min-amount', 'r-pkg-max-vesting', 'r-credit-auto-lock', 'r-credit-min-score'] as const;

export default function OpFundsPage() {
  const toast = useToast();
  const funds = useOpFunds();
  const refresh = useRefreshNav();
  const list = (funds.data ?? []) as OpFund[];
  const lastNav = list.map((f) => f.meta?.lastNavAt ?? '').sort().pop();

  const onRefresh = () => refresh.mutate({}, {
    onSuccess: (r) => toast(`NAV ${faDigits(r.funds.length)} صندوق فعال از هسته معاملات به‌روزرسانی شد`),
    onError: (e) => toast(errMsg(e), 'error'),
  });

  return (
    <>
      <PageHeading title="صندوق‌ها و محصولات" crumbs={[{ label: 'بهره‌بردار', href: routes.op.overview }, { label: 'محصول', href: routes.op.products }, { label: 'صندوق‌ها' }]}>
        <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>آخرین NAV: <span className="num" style={{ fontWeight: 500 }}>{dayTime(lastNav)}</span></span>
        <button type="button" className="btno" onClick={onRefresh} disabled={refresh.isPending} style={{ opacity: refresh.isPending ? 0.7 : 1 }}>
          <Icon d={IC.refresh} size={18} />{refresh.isPending ? 'در حال به‌روزرسانی…' : 'به‌روزرسانی NAV'}
        </button>
        <button type="button" className="btnp" style={{ fontSize: 14 }} onClick={() => toast('درخواست تعریف صندوق جدید ثبت شد؛ پس از مجوز سازمان بورس فعال می‌شود', 'info')}>
          <Icon d={IC.plus} size={18} strokeWidth={2} />صندوق جدید
        </button>
      </PageHeading>

      {funds.isLoading ? (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 24 }}>{[0, 1, 2].map((i) => <Skeleton key={i} h={252} />)}</div>
      ) : funds.isError ? (
        <ErrorState message={errMsg(funds.error)} onRetry={() => funds.refetch()} />
      ) : (
        <div style={{ flex: 'none', display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 24 }}>
          {list.map((f) => <FundCard key={f.id} f={f} />)}
        </div>
      )}

      <div style={{ flex: 'none', display: 'flex', gap: 24, alignItems: 'stretch' }}>
        <ProductsTable />
        <GlobalRules />
      </div>
    </>
  );
}

function FundCard({ f }: { f: OpFund }) {
  const ui = FUND_UI[f.kind];
  const st = FUND_STATUS[f.status];
  const [tbg, tfg] = TONES[ui.tone];
  const draft = f.status === 'coming_soon';
  const head = (
    <div style={{ height: 36, display: 'flex', alignItems: 'center', gap: 10 }}>
      <span style={{ width: 36, height: 36, borderRadius: 10, background: draft ? 'var(--soft-default)' : tbg, color: draft ? 'var(--default-text)' : tfg, display: 'grid', placeItems: 'center', flex: 'none' }}><Icon d={ui.d} size={20} /></span>
      <span style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', lineHeight: 1.25 }}>
        <span style={{ fontSize: 14, fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', color: draft ? 'var(--text-secondary)' : 'var(--text-primary)' }}>{fundTitle(f)}</span>
        <span style={{ fontSize: 11, color: 'var(--text-secondary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>ETF {f.shortName} · {draft ? 'در انتظار مجوز' : f.description}</span>
      </span>
      <Lbl tone={st.tone}>{st.label}</Lbl>
    </div>
  );
  const isFixed = f.category === 'fixed_income';
  const m1 = { label: 'AUM', v: draft ? '—' : bn(f.aum) + ' میلیارد' };

  if (draft) {
    return (
      <div className="card" style={{ boxSizing: 'border-box', minHeight: 252, padding: 20, display: 'flex', flexDirection: 'column', gap: 12, borderStyle: 'dashed' }}>
        {head}
        <div style={{ height: 40, display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ display: 'flex', flexDirection: 'column', lineHeight: 1.1, gap: 4 }}>
            <span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>NAV هر واحد</span>
            <span className="num" style={{ fontSize: 24, color: 'var(--text-secondary)' }}>—</span>
          </span>
          <Link href={routes.op.fund(f.id)} className="btno" style={{ marginRight: 'auto', height: 32, padding: '0 12px', borderColor: 'var(--primary-main)', color: 'var(--primary-text)' }}>
            <Icon d={IC.play} size={16} />راه‌اندازی
          </Link>
        </div>
        <Metrics m1={m1} m2={{ label: 'تاریخ راه‌اندازی', v: 'تعیین‌نشده' }} muted />
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, paddingTop: 10, borderTop: '1px dashed var(--divider)', fontSize: 11, color: 'var(--text-secondary)', lineHeight: 1.5 }}>
          <div className="lkbar" style={{ opacity: 0.5 }} />
          <span>انواع قفل مجاز پس از راه‌اندازی: وثیقه، قفل زمانی، مرحله‌ای، مسدودی</span>
        </div>
      </div>
    );
  }

  const locked = lockedOf(f);
  const free = Math.max(0, f.aum - locked);
  const freePct = f.aum > 0 ? Math.round((free / f.aum) * 1000) / 10 : 100;
  const lockedPctFa = faDigits(Math.round(100 - freePct)) + '٪';
  const spark = sparkOf(f);
  const d = f.navChangePct1d;
  const types = LOCK_ORDER.filter((t) => (f.meta?.lockByType[t] ?? 0) > 0);
  return (
    <Link href={routes.op.fund(f.id)} className="card" style={{ boxSizing: 'border-box', minHeight: 252, padding: 20, display: 'flex', flexDirection: 'column', gap: 12, color: 'inherit', textDecoration: 'none', minWidth: 0 }}>
      {head}
      <div style={{ height: 40, display: 'flex', alignItems: 'center', gap: 10 }}>
        <span style={{ display: 'flex', flexDirection: 'column', lineHeight: 1.1, gap: 4 }}>
          <span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>NAV هر واحد</span>
          <span style={{ display: 'flex', alignItems: 'baseline', gap: 5, whiteSpace: 'nowrap' }}><span className="num" style={{ fontSize: 24 }}>{money(f.nav)}</span><span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>تومان</span></span>
        </span>
        <Lbl tone={d > 0 ? 'success' : d < 0 ? 'error' : 'default'} style={{ height: 20, padding: '0 6px' }}>{spct(d, 2)} امروز</Lbl>
        <div dir="ltr" style={{ marginLeft: 'auto', width: 64, height: 36, flex: 'none' }}>
          {spark && (
            <svg viewBox="0 0 96 36" width="64" height="36" preserveAspectRatio="none" aria-hidden="true" style={{ display: 'block', overflow: 'visible' }}>
              <defs><linearGradient id={'fs-' + f.id} x1="0" y1="0" x2="0" y2="1"><stop offset="0" style={{ stopColor: `var(${ui.col})`, stopOpacity: 0.22 }} /><stop offset="1" style={{ stopColor: `var(${ui.col})`, stopOpacity: 0 }} /></linearGradient></defs>
              <path d={spark.area} fill={`url(#fs-${f.id})`} />
              <path d={spark.line} fill="none" style={{ stroke: `var(${ui.col})` }} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          )}
        </div>
      </div>
      <Metrics m1={m1} m2={isFixed ? { label: 'سود مؤثر سالانه', v: faDigits(f.effectiveYield ?? f.return1y) + '٪' } : { label: 'واحدهای قفل‌شده', v: lockedPctFa }} />
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, paddingTop: 10, borderTop: '1px dashed var(--divider)', marginTop: 'auto' }}>
        <div className="lkbar" role="img" aria-label={`واحدهای آزاد ${bn(free)} میلیارد · قفل ${bn(locked)} میلیارد`}>
          <span className="f" style={{ width: `${freePct}%` }} />{locked > 0 && <span className="l" style={{ flex: 1 }} />}
        </div>
        <div className="lkleg">
          <span><span className="lkdot" />آزاد <b>{bn(free)} میلیارد</b></span>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}><Icon d={IC.lock} size={12} />قفل <b>{bn(locked)} میلیارد</b></span>
          <span style={{ marginRight: 'auto' }}>{lockedPctFa} قفل</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: '4px 10px', fontSize: 11, color: 'var(--text-secondary)', whiteSpace: 'nowrap', minHeight: 16 }}>
          {types.length ? types.map((t) => (
            <span key={t} style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
              <span style={{ width: 6, height: 6, borderRadius: 2, background: `var(${LOCK_COL[t]})` }} />{LOCK_META[t].short} <span className="num" style={{ color: 'var(--text-primary)' }}>{bn(f.meta?.lockByType[t] ?? 0)}</span>
            </span>
          )) : <span>بدون واحد قفل‌شده</span>}
        </div>
      </div>
    </Link>
  );
}

function Metrics({ m1, m2, muted }: { m1: { label: string; v: string }; m2: { label: string; v: string }; muted?: boolean }) {
  const c = muted ? 'var(--text-secondary)' : 'var(--text-primary)';
  return (
    <div style={{ height: 36, display: 'flex', alignItems: 'center', gap: 16 }}>
      <span style={{ display: 'flex', flexDirection: 'column', lineHeight: 1.25 }}><span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>{m1.label}</span><span className="num" style={{ fontSize: 15, color: c }}>{m1.v}</span></span>
      <span style={{ width: 1, height: 28, background: 'var(--divider)' }} />
      <span style={{ display: 'flex', flexDirection: 'column', lineHeight: 1.25 }}><span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>{m2.label}</span><span className="num" style={{ fontSize: 15, color: c }}>{m2.v}</span></span>
    </div>
  );
}

const COLS = 'minmax(0, 1fr) 196px 64px 72px 56px';
function ProductsTable() {
  const products = useOpProducts();
  const orgs = useOpOrganizations();
  const list = (products.data ?? []) as OpProduct[];
  return (
    <div className="card" style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <CardHead title="محصولات اعتباری" badge={<Lbl>{faDigits(list.length)} محصول</Lbl>}>
        <Link href={routes.op.products} style={{ marginRight: 'auto', fontSize: 13, fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: 4 }}><Icon d={IC.plus} size={16} strokeWidth={2} />تعریف محصول</Link>
      </CardHead>
      <div style={{ height: 36, flex: 'none', display: 'grid', gridTemplateColumns: COLS, alignItems: 'center', padding: '0 20px', background: 'var(--table-head)', color: 'var(--grey-600)', fontSize: 12, fontWeight: 700 }}>
        <span>محصول</span><span>پارامترهای پیش‌فرض</span><span>سازمان‌ها</span><span>وضعیت</span><span />
      </div>
      {products.isLoading && <div style={{ padding: 20 }}><Skeleton h={72} /></div>}
      {products.isError && <div style={{ padding: 20 }}><ErrorState message={errMsg(products.error)} onRetry={() => products.refetch()} /></div>}
      {list.map((p) => {
        const ui = PRODUCT_UI[p.kind];
        const st = PRODUCT_STATUS[p.status];
        const [bg, fg] = TONES[ui.tone];
        return (
          <div key={p.id} style={{ minHeight: 72, flex: 'none', display: 'grid', gridTemplateColumns: COLS, alignItems: 'center', padding: '0 20px', borderBottom: '1px dashed var(--divider)', fontSize: 13 }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
              <span style={{ width: 32, height: 32, borderRadius: 8, background: bg, color: fg, display: 'grid', placeItems: 'center', flex: 'none' }}><Icon d={ui.d} size={18} /></span>
              <span style={{ display: 'flex', flexDirection: 'column', lineHeight: 1.25, minWidth: 0 }}><span style={{ fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{p.name}</span><span style={{ fontSize: 11, color: 'var(--text-secondary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{ui.type}</span></span>
            </span>
            <span style={{ display: 'flex', flexWrap: 'wrap', gap: 4, paddingLeft: 12 }}>
              {paramChips(p).map((k) => <Lbl key={k} style={{ height: 22, padding: '0 6px', fontSize: 11, fontWeight: 600 }}>{k}</Lbl>)}
            </span>
            <span style={{ display: 'flex', alignItems: 'baseline', gap: 3 }}><span className="num" style={{ fontSize: 15 }}>{orgs.data ? faDigits(orgsWith(p.kind, orgs.data).length) : '—'}</span><span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>سازمان</span></span>
            <span><Lbl tone={st.tone}>{st.label}</Lbl></span>
            <span><Link href={`${routes.op.products}?edit=${p.id}`} className="btnt" style={{ height: 28, padding: '0 8px' }}>ویرایش</Link></span>
          </div>
        );
      })}
      <div style={{ marginTop: 'auto', minHeight: 48, flex: 'none', boxSizing: 'border-box', padding: '8px 20px', display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: 'var(--text-secondary)', borderTop: '1px solid var(--divider)' }}>
        <Icon d={IC.info} size={16} />
        <span>پارامترهای پیش‌فرض برای سازمان‌های جدید اعمال می‌شود؛ هر قرارداد می‌تواند آن‌ها را محدودتر کند.</span>
      </div>
    </div>
  );
}

type Draft = Record<string, { enabled: boolean; value: number }>;
function GlobalRules() {
  const toast = useToast();
  const rules = useOpRules();
  const meta = useRulesMeta();
  const save = useSaveRules();
  const [draft, setDraft] = useState<Draft | null>(null);
  const byId = useMemo(() => Object.fromEntries((rules.data ?? []).map((r) => [r.id, r])), [rules.data]);
  const server: Draft = useMemo(() => Object.fromEntries(RULE_IDS.map((id) => [id, { enabled: byId[id]?.enabled ?? false, value: Number(byId[id]?.value ?? 0) }])), [byId]);
  useEffect(() => { if (rules.data) setDraft(null); }, [rules.data]);
  const cur = draft ?? server;
  const set = (id: string, v: Partial<{ enabled: boolean; value: number }>) => setDraft({ ...cur, [id]: { ...cur[id], ...v } });

  const vestDays = cur['r-pkg-max-vesting']?.value ?? 0;
  const score = cur['r-credit-min-score']?.value ?? 0;
  const minPkg = cur['r-pkg-min-amount']?.value ?? 0;
  const errs = {
    pkg: !(minPkg >= 0),
    vest: !(vestDays >= 1 && vestDays <= 36),
    score: !(score >= 300 && score <= 900),
  };
  const last = meta.data?.history[0];

  const onSave = () => {
    if (errs.pkg || errs.vest || errs.score) { toast(errs.score ? 'امتیاز اعتباری باید بین ۳۰۰ تا ۹۰۰ باشد' : errs.vest ? 'حداکثر قفل زمانی باید بین ۱ تا ۳۶ ماه باشد' : 'حداقل مبلغ بسته معتبر نیست', 'error'); return; }
    const changes: RuleChange[] = RULE_IDS.filter((id) => byId[id] && (cur[id].enabled !== server[id].enabled || cur[id].value !== server[id].value))
      .map((id) => (id === 'r-credit-auto-lock' ? { id, enabled: cur[id].enabled } : { id, value: cur[id].value }));
    if (!changes.length) { toast('تغییری برای ذخیره وجود ندارد', 'info'); return; }
    save.mutate({ changes }, {
      onSuccess: () => { setDraft(null); toast('قوانین سراسری ذخیره شد و برای همهٔ سازمان‌ها اعمال می‌شود'); },
      onError: (e) => toast(errMsg(e), 'error'),
    });
  };

  const row = (last?: boolean): React.CSSProperties => ({ minHeight: 60, display: 'flex', alignItems: 'center', gap: 12, borderBottom: last ? 0 : '1px dashed var(--divider)' });
  const lbl = (title: string, sub: string, htmlFor?: string) => (
    <label htmlFor={htmlFor} style={{ flex: 1, display: 'flex', flexDirection: 'column', lineHeight: 1.25, gap: 2 }}><span style={{ fontSize: 13, fontWeight: 600 }}>{title}</span><span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>{sub}</span></label>
  );
  return (
    <div className="card" style={{ width: 340, flex: 'none', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <CardHead title="قوانین سراسری">
        <Link href={routes.op.rules} style={{ marginRight: 'auto', fontSize: 13, fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: 4 }}>همهٔ قوانین<Icon d={IC.chevL} size={16} /></Link>
      </CardHead>
      {rules.isLoading ? <div style={{ padding: '0 20px 20px' }}><Skeleton h={220} /></div> : rules.isError ? <div style={{ padding: '0 20px 20px' }}><ErrorState message={errMsg(rules.error)} onRetry={() => rules.refetch()} /></div> : (
        <div style={{ padding: '0 20px', display: 'flex', flexDirection: 'column' }}>
          <div style={row()}>{lbl('حداقل مبلغ بسته', 'کمتر از این مبلغ ارسال نمی‌شود', 'min-pkg')}<NumField id="min-pkg" value={minPkg} onChange={(n) => set('r-pkg-min-amount', { value: n })} w={84} h={36} suffix="تومان" invalid={errs.pkg} /></div>
          <div style={row()}>{lbl('حداکثر قفل زمانی', 'سقف قفل زمانی بسته‌های سازمانی', 'max-lock')}<NumField id="max-lock" value={vestDays} onChange={(n) => set('r-pkg-max-vesting', { value: n })} w={44} h={36} suffix="ماه" invalid={errs.vest} /></div>
          <div style={row()}>{lbl('قفل خودکار وثیقه', 'هم‌زمان با تأیید وام یا خرید اقساطی')}<Sw on={!!cur['r-credit-auto-lock']?.enabled} onClick={() => set('r-credit-auto-lock', { enabled: !cur['r-credit-auto-lock']?.enabled })} label="قفل خودکار وثیقه" /></div>
          <div style={row(true)}>{lbl('امتیاز اعتباری حداقل برای وام', 'بازه ۳۰۰ تا ۹۰۰', 'min-score')}<NumField id="min-score" value={score} onChange={(n) => set('r-credit-min-score', { value: n })} w={56} h={36} suffix="امتیاز" invalid={errs.score} /></div>
        </div>
      )}
      <div style={{ marginTop: 'auto', height: 56, flex: 'none', boxSizing: 'border-box', padding: '0 20px', display: 'flex', alignItems: 'center', gap: 10, borderTop: '1px solid var(--divider)' }}>
        <button type="button" className="btnp" onClick={onSave} disabled={save.isPending || !rules.data} style={{ opacity: save.isPending ? 0.7 : 1 }}>{save.isPending ? 'در حال ذخیره…' : 'ذخیره قوانین'}</button>
        {draft && <button type="button" className="btnt" onClick={() => setDraft(null)} style={{ height: 32 }}>انصراف</button>}
        <span style={{ marginRight: 'auto', fontSize: 11, color: 'var(--text-secondary)', textAlign: 'left', lineHeight: 1.3 }}>
          {last ? <>آخرین تغییر: {jDayMonth(last.at)}<br />{last.by}</> : '—'}
        </span>
      </div>
    </div>
  );
}

