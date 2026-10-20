'use client';
/** /op/risk — design: op-risk.dc.html (flagged events, legal holds, detection rules, 30-day alert chart; alert workflow investigate / resolve / dismiss). */
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { PageHeading } from '@/components/panel/PanelShell';
import { Icon } from '@/components/ui/Icon';
import { Skeleton, ErrorState } from '@/components/app/Screen';
import { useToast } from '@/components/ui/Toast';
import { useOpRisk, useUpdateAlert, useUpdateRule } from '@/api/op';
import { useReleaseLegalHold, useRiskInsights, type LegalHold, type OpRiskAlert, type RiskSignal } from '@/api/op-system-extra';
import type { RiskAlert } from '@/types/domain';
import { routes } from '@/lib/routes';
import { faDigits, jDate, jDayMonth, jDateTime, money } from '@/lib/format';
import { now } from '@/lib/clock';
import { bn, dec, errMsg, linePath } from '@/components/op/system/fmt';
import { Chip, Confirm, Drawer, FormError, IC, Kpi, Lbl, Seg, Sw, type ToneKey } from '@/components/op/system/ui';

const SIGNALS: Record<RiskSignal, string> = { velocity: 'سرعت تراکنش', newdev: 'دستگاه جدید', big: 'مبلغ غیرمعمول', night: 'ساعت غیرمعمول', mule: 'الگوی حساب واسط' };
const STATUS: Record<RiskAlert['status'], { label: string; tone: ToneKey }> = {
  open: { label: 'باز', tone: 'error' },
  investigating: { label: 'در بررسی', tone: 'warning' },
  resolved: { label: 'حل‌شده', tone: 'success' },
  dismissed: { label: 'ردشده', tone: 'default' },
};
const SEVERITY: Record<RiskAlert['severity'], { label: string; tone: ToneKey }> = {
  critical: { label: 'بحرانی', tone: 'error' }, high: { label: 'بالا', tone: 'warning' }, medium: { label: 'متوسط', tone: 'info' }, low: { label: 'کم', tone: 'default' },
};
const LEGAL: Record<LegalHold['status'], { label: string; tone: ToneKey }> = {
  active: { label: 'فعال', tone: 'error' }, risk: { label: 'در بررسی ریسک', tone: 'info' }, pending: { label: 'در انتظار رفع', tone: 'warning' }, done: { label: 'رفع‌شده', tone: 'default' },
};
const scoreCol = (s: number) => (s >= 80 ? '--error-main' : s >= 50 ? '--warning-main' : '--success-main');
const spark = (id: string, pts: [number, number][]) => { const line = linePath(pts); return { id, line, area: line + ' L80 40 L0 40 Z' }; };
const S1 = spark('a', [[0, 30], [10, 28], [20, 30], [30, 24], [40, 26], [50, 20], [60, 22], [70, 14], [80, 12]]);
const S2 = spark('b', [[0, 22], [10, 20], [20, 24], [30, 22], [40, 18], [50, 22], [60, 20], [70, 24], [80, 22]]);
const S3 = spark('c', [[0, 26], [10, 30], [20, 22], [30, 28], [40, 18], [50, 24], [60, 16], [70, 20], [80, 14]]);
const parseNote = (note?: string) => {
  if (!note?.startsWith('ref:')) return { ref: '', text: note ?? '' };
  const i = note.indexOf('|');
  return i < 0 ? { ref: note.slice(4), text: '' } : { ref: note.slice(4, i), text: note.slice(i + 1) };
};

export default function OpRiskPage() {
  const risk = useOpRisk();
  const insights = useRiskInsights();
  const [view, setView] = useState<'events' | 'legal'>('events');
  const [sel, setSel] = useState<string | null>(null);

  useEffect(() => {
    const t = setInterval(() => { risk.refetch(); insights.refetch(); }, 30_000);
    return () => clearInterval(t);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const alerts = (risk.data?.alerts ?? []) as OpRiskAlert[];
  const openList = alerts.filter((a) => a.status === 'open' || a.status === 'investigating');
  const ins = insights.data;
  const holds = ins?.legalHolds ?? [];
  const liveHolds = holds.filter((h) => h.status !== 'done');
  const todayKey = now().toISOString().slice(0, 10);
  const newToday = alerts.filter((a) => a.createdAt.slice(0, 10) === todayKey).length;
  const scoreTxt = (s: number) => (s < 35 ? 'کم' : s < 65 ? 'متوسط' : 'زیاد');
  const selAlert = alerts.find((a) => a.id === sel) ?? null;

  return (
    <>
      <PageHeading title="ریسک و تقلب" crumbs={[{ label: 'بهره‌بردار', href: routes.op.overview }, { label: 'سیستم', href: routes.op.settings }, { label: 'ریسک و تقلب' }]}>
        <Lbl tone="error">{faDigits(openList.length)} هشدار باز</Lbl>
        <Lbl style={{ gap: 4 }}><Icon d={IC.lock} size={12} strokeWidth={2} />{faDigits(liveHolds.length)} مسدودی قانونی فعال</Lbl>
        <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>به‌روزرسانی خودکار هر <span className="num">۳۰</span> ثانیه</span>
        <Link href={routes.op.reports} className="btno"><Icon d={IC.reports} size={18} />گزارش ریسک</Link>
      </PageHeading>

      <div style={{ flex: 'none', display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 24 }}>
        <Kpi title="هشدارهای باز" value={faDigits(openList.length)} unit="هشدار" delta={'+' + faDigits(newToday)} tone="error" note="امروز" spark={{ ...S1, col: '--error-main' }} />
        <Kpi title="امتیاز ریسک پلتفرم" value={ins ? scoreTxt(ins.platformScore) : '—'} unit={ins ? `${faDigits(ins.platformScore)} از ۱۰۰` : ''} delta={ins ? (ins.platformScoreDelta < 0 ? '−' : '+') + faDigits(Math.abs(ins.platformScoreDelta)) : ''} tone={ins && ins.platformScoreDelta <= 0 ? 'success' : 'error'} note="نسبت به هفتهٔ قبل" spark={{ ...S2, col: '--warning-main' }} />
        <Kpi title="تراکنش مشکوک امروز" value={ins ? faDigits(ins.suspiciousToday) : '—'} unit="تراکنش" delta={ins ? dec((ins.suspiciousToday / ins.txToday) * 100, 2) + '٪ کل' : ''} tone="warning" note={ins ? `از ${money(ins.txToday)} تراکنش` : ''} spark={{ ...S3, col: '--chart-1' }} />
      </div>

      <div style={{ flex: 'none', display: 'flex', gap: 24, alignItems: 'flex-start' }}>
        <div className="card" style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          {view === 'events'
            ? <EventsView alerts={alerts} openCount={openList.length} loading={risk.isLoading} error={risk.isError ? errMsg(risk.error) : ''} onRetry={() => risk.refetch()} onPick={setSel} view={view} setView={setView} legalCount={liveHolds.length} />
            : <LegalView holds={holds} loading={insights.isLoading} view={view} setView={setView} openCount={openList.length} />}
        </div>
        <div style={{ width: 300, flex: 'none', display: 'flex', flexDirection: 'column', gap: 24 }}>
          <RulesCard rules={risk.data?.rules ?? []} loading={risk.isLoading} />
          <ChartCard daily={ins?.daily ?? []} />
        </div>
      </div>

      {selAlert && <AlertDrawer key={selAlert.id} a={selAlert} onClose={() => setSel(null)} />}
    </>
  );
}

function ViewTabs({ view, setView, openCount, legalCount }: { view: 'events' | 'legal'; setView: (v: 'events' | 'legal') => void; openCount: number; legalCount: number }) {
  return (
    <>
      {([['events', 'رویدادهای پرچم‌گذاری‌شده', openCount, 'error'], ['legal', 'مسدودی‌های قانونی', legalCount, 'default']] as const).map(([k, l, c, tone]) => {
        const on = view === k;
        return (
          <button key={k} type="button" aria-pressed={on} onClick={() => setView(k)} style={{ height: 52, boxSizing: 'border-box', padding: '0 4px', marginLeft: 12, border: 0, borderBottom: `2px solid ${on ? 'var(--primary-main)' : 'transparent'}`, background: 'transparent', color: on ? 'var(--text-primary)' : 'var(--text-secondary)', fontFamily: 'inherit', fontSize: 15, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            {l}<Lbl tone={tone} style={{ height: 18, padding: '0 5px', fontSize: 10 }}>{faDigits(c)}</Lbl>
          </button>
        );
      })}
    </>
  );
}

const ECOLS = '68px minmax(0, 1fr) 92px 84px 96px 72px 52px';
function EventsView({ alerts, openCount, loading, error, onRetry, onPick, view, setView, legalCount }: { alerts: OpRiskAlert[]; openCount: number; loading: boolean; error: string; onRetry: () => void; onPick: (id: string) => void; view: 'events' | 'legal'; setView: (v: 'events' | 'legal') => void; legalCount: number }) {
  const [filt, setFilt] = useState<RiskSignal[]>([]);
  const [status, setStatus] = useState('all');
  const rows = alerts.filter((a) => (!filt.length || (a.signals ?? []).some((s) => filt.includes(s)))
    && (status === 'all' || (status === 'closed' ? a.status === 'resolved' || a.status === 'dismissed' : a.status === status)));
  return (
    <>
      <div style={{ minHeight: 52, flex: 'none', boxSizing: 'border-box', padding: '0 20px', display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <ViewTabs view={view} setView={setView} openCount={openCount} legalCount={legalCount} />
        <div style={{ marginRight: 'auto', display: 'flex', alignItems: 'center', gap: 4, flexWrap: 'wrap' }}>
          {(Object.keys(SIGNALS) as RiskSignal[]).map((k) => {
            const on = filt.includes(k);
            return <Chip key={k} on={on} onClick={() => setFilt(on ? filt.filter((x) => x !== k) : [...filt, k])} style={{ height: 26, padding: '0 8px', borderRadius: 999, fontSize: 11, minWidth: 0 }}>{SIGNALS[k]}</Chip>;
          })}
        </div>
      </div>
      <div style={{ flex: 'none', padding: '0 20px 10px', display: 'flex', alignItems: 'center', gap: 10 }}>
        <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>وضعیت</span>
        <Seg label="وضعیت هشدار" value={status} onChange={setStatus} track="var(--bg-neutral)" items={[{ key: 'all', label: 'همه' }, { key: 'open', label: 'باز' }, { key: 'investigating', label: 'در بررسی' }, { key: 'closed', label: 'بسته‌شده' }]} />
      </div>
      <div style={{ overflowX: 'auto' }}>
        <div style={{ minWidth: 560 }}>
          <div style={{ height: 36, display: 'grid', gridTemplateColumns: ECOLS, alignItems: 'center', padding: '0 20px', background: 'var(--table-head)', color: 'var(--grey-600)', fontSize: 12, fontWeight: 700 }}>
            <span>شناسه</span><span>کاربر / نوع</span><span>سازمان</span><span>مبلغ</span><span>امتیاز ریسک</span><span>وضعیت</span><span />
          </div>
          {loading && <div style={{ padding: 20 }}><Skeleton h={200} /></div>}
          {error && <div style={{ padding: 20 }}><ErrorState message={error} onRetry={onRetry} /></div>}
          {rows.map((a) => {
            const s = STATUS[a.status];
            const rc = scoreCol(a.score);
            return (
              <div key={a.id} style={{ minHeight: 52, display: 'grid', gridTemplateColumns: ECOLS, alignItems: 'center', padding: '0 20px', borderBottom: '1px dashed var(--divider)', fontSize: 13 }}>
                <span className="num" dir="ltr" style={{ fontSize: 11, textAlign: 'right', color: 'var(--text-secondary)' }}>{a.id}</span>
                <span style={{ display: 'flex', flexDirection: 'column', lineHeight: 1.25, minWidth: 0 }}>
                  {a.userId ? <Link href={routes.op.user(a.userId)} style={{ fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', color: 'var(--text-primary)' }}>{a.userName ?? '—'}</Link> : <span style={{ fontWeight: 600 }}>{a.userName ?? '—'}</span>}
                  <span style={{ fontSize: 11, color: 'var(--text-secondary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{a.title}</span>
                </span>
                <span style={{ fontSize: 12, color: 'var(--text-secondary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', paddingLeft: 8 }}>{a.orgName ?? '—'}</span>
                <span className="num" style={{ whiteSpace: 'nowrap', fontSize: 12 }}>{a.amount ? money(a.amount) : '—'}</span>
                <span style={{ display: 'flex', alignItems: 'center', gap: 8, paddingLeft: 12 }}>
                  <span className="num" style={{ fontSize: 12, width: 22, color: `var(${rc})` }}>{faDigits(a.score)}</span>
                  <span style={{ flex: 1, height: 6, borderRadius: 3, background: 'var(--progress-track)', overflow: 'hidden', display: 'flex' }}><span style={{ width: `${a.score}%`, background: `var(${rc})` }} /></span>
                </span>
                <span><Lbl tone={s.tone} style={{ height: 22, padding: '0 6px', fontSize: 11 }}>{s.label}</Lbl></span>
                <span><button type="button" className="btnt" onClick={() => onPick(a.id)} style={{ height: 28, padding: '0 8px', fontSize: 12 }}>بررسی</button></span>
              </div>
            );
          })}
          {!loading && !rows.length && <div style={{ height: 120, display: 'grid', placeItems: 'center', fontSize: 13, color: 'var(--text-secondary)' }}>با این فیلتر رویدادی یافت نشد</div>}
        </div>
      </div>
      <div style={{ marginTop: 'auto', height: 40, flex: 'none', boxSizing: 'border-box', padding: '0 20px', display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: 'var(--text-secondary)', borderTop: '1px solid var(--divider)' }}>
        <span>{faDigits(rows.length)} مورد · {faDigits(openCount)} هشدار باز</span>
        <Link href={routes.op.users} style={{ marginRight: 'auto', fontSize: 12, fontWeight: 600 }}>همهٔ کاربران</Link>
      </div>
    </>
  );
}

const LCOLS = 'minmax(0, 1fr) minmax(0, 1fr) 96px 100px 76px';
function LegalView({ holds, loading, view, setView, openCount }: { holds: LegalHold[]; loading: boolean; view: 'events' | 'legal'; setView: (v: 'events' | 'legal') => void; openCount: number }) {
  const toast = useToast();
  const release = useReleaseLegalHold();
  const [lf, setLf] = useState<'all' | 'live' | 'pending' | 'done'>('all');
  const [confirm, setConfirm] = useState<LegalHold | null>(null);
  const live = holds.filter((h) => h.status !== 'done');
  const sum = live.reduce((s, h) => s + h.amount, 0);
  const rows = holds.filter((h) => lf === 'all' || (lf === 'live' ? h.status !== 'done' : h.status === lf));
  const doRelease = () => {
    if (!confirm) return;
    const h = confirm;
    release.mutate({ id: h.id }, {
      onSuccess: () => { setConfirm(null); toast(`رفع مسدودی قانونی ${h.userName} · +${money(h.amount)} آزاد شد`); },
      onError: (e) => { setConfirm(null); toast(errMsg(e), 'error'); },
    });
  };
  return (
    <>
      <div style={{ minHeight: 52, flex: 'none', boxSizing: 'border-box', padding: '0 20px', display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <ViewTabs view={view} setView={setView} openCount={openCount} legalCount={live.length} />
        <div style={{ marginRight: 'auto', display: 'flex', alignItems: 'center', gap: 4 }}>
          {([['all', 'همه'], ['live', 'فعال'], ['pending', 'در انتظار رفع'], ['done', 'رفع‌شده']] as const).map(([k, l]) => <Chip key={k} on={lf === k} onClick={() => setLf(k)} style={{ height: 26, padding: '0 8px', borderRadius: 999, fontSize: 11, minWidth: 0 }}>{l}</Chip>)}
        </div>
      </div>
      <div style={{ overflowX: 'auto' }}>
        <div style={{ minWidth: 560 }}>
          <div style={{ height: 36, display: 'grid', gridTemplateColumns: LCOLS, columnGap: 8, alignItems: 'center', padding: '0 20px', background: 'var(--table-head)', color: 'var(--grey-600)', fontSize: 12, fontWeight: 700 }}>
            <span>کاربر / شماره مرجع</span><span>دارایی / دلیل</span><span>مبلغ مسدود</span><span>وضعیت</span><span />
          </div>
          {loading && <div style={{ padding: 20 }}><Skeleton h={200} /></div>}
          {rows.map((h) => {
            const s = LEGAL[h.status];
            return (
              <div key={h.id} style={{ minHeight: 50, display: 'grid', gridTemplateColumns: LCOLS, columnGap: 8, alignItems: 'center', padding: '0 20px', borderBottom: '1px dashed var(--divider)', fontSize: 13 }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
                  <span style={{ width: 28, height: 28, borderRadius: 8, background: 'var(--soft-error)', color: 'var(--error-text)', display: 'grid', placeItems: 'center', flex: 'none' }}><Icon d={IC.lock} size={14} strokeWidth={1.8} /></span>
                  <span style={{ display: 'flex', flexDirection: 'column', lineHeight: 1.3, minWidth: 0 }}>
                    {h.userId ? <Link href={routes.op.user(h.userId)} style={{ fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', color: 'var(--text-primary)' }}>{h.userName}</Link> : <span style={{ fontWeight: 600, whiteSpace: 'nowrap' }}>{h.userName}</span>}
                    <span className="num" style={{ fontSize: 11, color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>مرجع {faDigits(h.reference)}</span>
                  </span>
                </span>
                <span style={{ display: 'flex', flexDirection: 'column', lineHeight: 1.3, minWidth: 0 }}><span style={{ fontSize: 12, fontWeight: 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{h.holding}</span><span style={{ fontSize: 11, color: 'var(--text-secondary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{h.reason}</span></span>
                <span style={{ display: 'flex', flexDirection: 'column', lineHeight: 1.3 }}><span className="num" style={{ fontSize: 12, fontWeight: 500 }}>{money(h.amount)}</span><span className="num" style={{ fontSize: 11, color: 'var(--text-secondary)' }}>{jDate(h.createdAt)}</span></span>
                <span><Lbl tone={s.tone} style={{ height: 22, padding: '0 6px', fontSize: 11 }}>{s.label}</Lbl></span>
                <span>
                  {h.status === 'pending'
                    ? <button type="button" className="btno" onClick={() => setConfirm(h)} style={{ height: 28, padding: '0 8px', fontSize: 11 }}>رفع مسدودی</button>
                    : h.userId ? <Link href={routes.op.user(h.userId)} className="btnt" style={{ height: 28, padding: '0 8px', fontSize: 12 }}>جزئیات</Link> : <span style={{ fontSize: 12, color: 'var(--text-disabled)' }}>—</span>}
                </span>
              </div>
            );
          })}
          {!loading && !rows.length && <div style={{ height: 120, display: 'grid', placeItems: 'center', fontSize: 13, color: 'var(--text-secondary)' }}>موردی یافت نشد</div>}
        </div>
      </div>
      <div style={{ marginTop: 'auto', minHeight: 40, flex: 'none', boxSizing: 'border-box', padding: '0 20px', display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: 'var(--text-secondary)', borderTop: '1px solid var(--divider)', flexWrap: 'wrap' }}>
        <span style={{ whiteSpace: 'nowrap' }}>{faDigits(holds.length)} مورد اخیر · {faDigits(live.length)} مسدودی فعال · جمع <b className="num" style={{ fontWeight: 500, color: 'var(--text-primary)' }}>{sum >= 1e9 ? bn(sum) + ' میلیارد' : money(sum)}</b> تومان</span>
        <span style={{ marginRight: 'auto', whiteSpace: 'nowrap' }}>ثبت و رفع فقط با شماره مرجع</span>
      </div>
      <Confirm open={!!confirm} onClose={() => setConfirm(null)} busy={release.isPending} onConfirm={doRelease} title="رفع مسدودی قانونی" confirmLabel="رفع مسدودی"
        body={confirm ? <>دستور رفع مرجع <b className="num">{faDigits(confirm.reference)}</b> برای {confirm.userName} ثبت شده است. با رفع مسدودی، <b className="num">{money(confirm.amount)}</b> تومان از «{confirm.holding}» به بخش آزاد کاربر برمی‌گردد.</> : null} />
    </>
  );
}

function RulesCard({ rules, loading }: { rules: { id: string; title: string; description: string; enabled: boolean }[]; loading: boolean }) {
  const toast = useToast();
  const update = useUpdateRule();
  const active = rules.filter((r) => r.enabled).length;
  return (
    <div className="card" style={{ flex: 'none', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <div style={{ height: 48, flex: 'none', boxSizing: 'border-box', padding: '0 20px', display: 'flex', alignItems: 'center', gap: 10 }}>
        <h6 style={{ margin: 0, fontSize: 16, fontWeight: 700, lineHeight: 1.2 }}>قوانین تشخیص</h6>
        <Lbl tone="success" style={{ marginRight: 'auto' }}>{faDigits(active)} فعال</Lbl>
      </div>
      <div style={{ padding: '0 20px 4px', display: 'flex', flexDirection: 'column' }}>
        {loading && <Skeleton h={120} />}
        {rules.map((r) => (
          <div key={r.id} style={{ minHeight: 56, display: 'flex', alignItems: 'center', gap: 12, borderTop: '1px dashed var(--divider)' }}>
            <span style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', lineHeight: 1.25 }}><span style={{ fontSize: 13, fontWeight: 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{r.title}</span><span style={{ fontSize: 11, color: 'var(--text-secondary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={r.description}>{r.description}</span></span>
            <Sw on={r.enabled} label={r.title} disabled={update.isPending && update.variables?.id === r.id}
              onClick={() => update.mutate({ id: r.id, enabled: !r.enabled }, { onSuccess: () => toast(`قانون «${r.title}» ${r.enabled ? 'غیرفعال' : 'فعال'} شد`), onError: (e) => toast(errMsg(e), 'error') })} />
          </div>
        ))}
      </div>
    </div>
  );
}

function ChartCard({ daily }: { daily: { date: string; critical: number; high: number; medium: number }[] }) {
  const total = daily.reduce((s, d) => s + d.critical + d.high + d.medium, 0);
  const maxT = Math.max(1, ...daily.map((d) => d.critical + d.high + d.medium));
  const labels = daily.length ? [daily[0], daily[Math.floor(daily.length / 2)], daily[daily.length - 1]] : [];
  return (
    <div className="card" style={{ flex: 'none', boxSizing: 'border-box', padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 10, overflow: 'hidden' }}>
      <div style={{ height: 24, display: 'flex', alignItems: 'center', gap: 10 }}>
        <h6 style={{ margin: 0, fontSize: 16, fontWeight: 700, lineHeight: 1.2 }}>هشدارها — ۳۰ روز</h6>
        <span style={{ marginRight: 'auto', fontSize: 12, color: 'var(--text-secondary)' }}>جمع <span className="num" style={{ color: 'var(--text-primary)' }}>{faDigits(total)}</span></span>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, fontSize: 11, color: 'var(--text-secondary)' }}>
        {[['--error-main', 'بحرانی'], ['--warning-main', 'بالا'], ['--chart-4', 'متوسط']].map(([c, l]) => <span key={l} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><span style={{ width: 10, height: 10, borderRadius: 3, background: `var(${c})` }} />{l}</span>)}
      </div>
      <div dir="ltr" role="img" aria-label={`نمودار هشدارهای ۳۰ روز اخیر — جمع ${faDigits(total)}`} style={{ height: 96, flex: 'none', display: 'flex', alignItems: 'flex-end', gap: 3 }}>
        {daily.map((d) => (
          <div key={d.date} title={`${jDayMonth(d.date)} · بحرانی ${faDigits(d.critical)} · بالا ${faDigits(d.high)} · متوسط ${faDigits(d.medium)}`} style={{ flex: 1, height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', gap: 1 }}>
            <span style={{ height: `${Math.round((d.critical / maxT) * 100)}%`, borderRadius: '2px 2px 0 0', background: 'var(--error-main)' }} />
            <span style={{ height: `${Math.round((d.high / maxT) * 100)}%`, background: 'var(--warning-main)' }} />
            <span style={{ height: `${Math.round((d.medium / maxT) * 100)}%`, borderRadius: '0 0 2px 2px', background: 'var(--chart-4)' }} />
          </div>
        ))}
      </div>
      <div dir="ltr" style={{ height: 14, display: 'flex', justifyContent: 'space-between', fontSize: 11, lineHeight: '14px', color: 'var(--text-secondary)' }}>
        {labels.map((d) => <span key={d.date}>{jDayMonth(d.date)}</span>)}
      </div>
    </div>
  );
}

function AlertDrawer({ a, onClose }: { a: OpRiskAlert; onClose: () => void }) {
  const toast = useToast();
  const update = useUpdateAlert();
  const { ref, text } = parseNote(a.note);
  const [note, setNote] = useState(text);
  const [err, setErr] = useState('');
  const s = STATUS[a.status];
  const sev = SEVERITY[a.severity];
  const rc = scoreCol(a.score);
  const rules = useOpRisk().data?.rules ?? [];
  const rule = rules.find((r) => r.id === a.ruleId);
  const fullNote = (t: string) => (ref ? `ref:${ref}|${t}` : t);
  const go = (status: RiskAlert['status'], msg: string) => {
    if ((status === 'resolved' || status === 'dismissed') && note.trim().length < 3) return setErr('برای بستن هشدار، نتیجهٔ بررسی را در یادداشت بنویسید.');
    setErr('');
    update.mutate({ id: a.id, status, note: fullNote(note.trim()) }, { onSuccess: () => toast(msg), onError: (e) => setErr(errMsg(e)) });
  };
  const saveNote = () => update.mutate({ id: a.id, note: fullNote(note.trim()) }, { onSuccess: () => toast('یادداشت ذخیره شد'), onError: (e) => setErr(errMsg(e)) });
  const kv = (k: string, v: React.ReactNode) => (
    <div className="kv"><span className="k">{k}</span><span className="v num">{v}</span></div>
  );
  const dirty = note.trim() !== text.trim();
  return (
    <Drawer open onClose={onClose} width={420} label={`هشدار ${a.id}`}>
      <div style={{ flex: 'none', display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ display: 'flex', flexDirection: 'column', gap: 4, lineHeight: 1.3, minWidth: 0 }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}><h6 style={{ margin: 0, fontSize: 16, fontWeight: 700 }}>هشدار <span dir="ltr">{a.id}</span></h6><Lbl tone={sev.tone}>{sev.label}</Lbl><Lbl tone={s.tone}>{s.label}</Lbl></span>
          <span style={{ fontSize: 13, fontWeight: 600 }}>{a.title}</span>
        </span>
        <button type="button" className="ibtn" aria-label="بستن" onClick={onClose} style={{ marginRight: 'auto', width: 32, height: 32, flex: 'none' }}><Icon d={IC.x} size={18} /></button>
      </div>
      {a.userId && (
        <Link href={routes.op.user(a.userId)} style={{ flex: 'none', display: 'flex', alignItems: 'center', gap: 12, padding: 12, borderRadius: 12, background: 'var(--bg-neutral)', color: 'inherit', textDecoration: 'none' }}>
          <span style={{ width: 44, height: 44, borderRadius: '50%', background: 'var(--soft-error)', color: 'var(--error-text)', display: 'grid', placeItems: 'center', fontSize: 16, fontWeight: 700, flex: 'none' }}>{(a.userName ?? '؟')[0]}</span>
          <span style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', lineHeight: 1.35 }}><span style={{ fontSize: 14, fontWeight: 700 }}>{a.userName}</span><span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{a.orgName} · مشاهده پروفایل و دارایی‌ها</span></span>
          <Icon d={IC.chevL} size={18} style={{ color: 'var(--text-secondary)' }} />
        </Link>
      )}
      <div style={{ flex: 'none', padding: 12, borderRadius: 12, border: '1px solid var(--divider)', display: 'flex', flexDirection: 'column', gap: 8 }}>
        <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>امتیاز ریسک</span>
        <span style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}><span className="num" style={{ fontSize: 24, lineHeight: 1, color: `var(${rc})` }}>{faDigits(a.score)}</span><span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>از ۱۰۰</span></span>
        <span style={{ height: 6, borderRadius: 3, background: 'var(--progress-track)', overflow: 'hidden' }}><span style={{ display: 'block', height: '100%', width: `${a.score}%`, background: `var(${rc})`, borderRadius: 3 }} /></span>
      </div>
      <div style={{ flex: 'none', display: 'flex', flexDirection: 'column' }}>
        <span className="sec">جزئیات</span>
        {kv('زمان ثبت', jDateTime(a.createdAt))}
        {kv('سازمان', a.orgName ?? '—')}
        {kv('مبلغ', a.amount ? money(a.amount) + ' تومان' : '—')}
        {kv('قانون تشخیص', rule?.title ?? (ref ? 'ارجاع دستی' : '—'))}
        {ref && <div className="kv"><span className="k">ارجاع از</span><Link href={routes.op.requests} className="v" dir="ltr">{ref}</Link></div>}
      </div>
      {!!a.signals?.length && (
        <div style={{ flex: 'none', display: 'flex', flexDirection: 'column', gap: 6 }}>
          <span className="sec">نشانه‌ها</span>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>{a.signals.map((x) => <Lbl key={x} tone="warning">{SIGNALS[x]}</Lbl>)}</div>
        </div>
      )}
      <div className="fg" style={{ flex: 'none' }}>
        <label className="fl" htmlFor="al-note">یادداشت بررسی</label>
        <textarea id="al-note" rows={4} value={note} onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => { setNote(e.target.value); setErr(''); }} placeholder="نتیجهٔ بررسی، شماره تماس با کاربر، اقدام انجام‌شده…" style={{ boxSizing: 'border-box', width: '100%', border: '1px solid var(--outline-border)', borderRadius: 8, background: 'var(--bg-paper)', color: 'var(--text-primary)', fontFamily: 'inherit', fontSize: 13, lineHeight: 1.7, padding: '10px 12px', resize: 'none', outline: 0 }} />
        {dirty && <button type="button" className="btnt" onClick={saveNote} disabled={update.isPending} style={{ alignSelf: 'flex-start', height: 28, padding: '0 8px', fontSize: 12 }}>ذخیره یادداشت</button>}
      </div>
      <FormError>{err}</FormError>
      <div style={{ marginTop: 'auto', flex: 'none', display: 'flex', flexDirection: 'column', gap: 8 }}>
        {(a.status === 'open' || a.status === 'investigating') ? (
          <>
            {a.status === 'open' && <button type="button" className="btnp" disabled={update.isPending} onClick={() => go('investigating', `بررسی هشدار ${a.id} آغاز شد`)} style={{ height: 40, fontSize: 14 }}><Icon d={IC.search} size={18} />شروع بررسی</button>}
            <div style={{ display: 'flex', gap: 8 }}>
              <button type="button" className={a.status === 'open' ? 'btno' : 'btnp'} disabled={update.isPending} onClick={() => go('resolved', `هشدار ${a.id} حل‌شده ثبت شد`)} style={{ flex: 1, height: 40 }}><Icon d={IC.check} size={18} />حل شد</button>
              <button type="button" className="btno" disabled={update.isPending} onClick={() => go('dismissed', `هشدار ${a.id} رد شد (مثبت کاذب)`)} style={{ flex: 1, height: 40, color: 'var(--text-secondary)' }}><Icon d={IC.x} size={18} />رد هشدار</button>
            </div>
          </>
        ) : (
          <button type="button" className="btno" disabled={update.isPending} onClick={() => go('open', `هشدار ${a.id} دوباره باز شد`)} style={{ height: 40 }}><Icon d={IC.refresh} size={18} />بازگشایی هشدار</button>
        )}
      </div>
    </Drawer>
  );
}

