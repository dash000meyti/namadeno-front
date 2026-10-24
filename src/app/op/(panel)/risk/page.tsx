'use client';
/**
 * /op/risk — risk & fraud. Kit list page: stats → section tabs
 *   flagged events   list card (status tabs, signal select, search, table) + 30-day alerts chart → alert inspector
 *                    (investigate / resolve / dismiss / reopen, review note)
 *   legal holds      list card (status tabs, search, table) → hold inspector (release with confirmation)
 *   detection rules  settings group with switches
 * Alerts and insights refresh every 30 seconds.
 */
import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import type { PlatformRule, RiskAlert } from '@/types/domain';
import { useOpRisk, useUpdateAlert, useUpdateRule } from '@/api/op';
import { useReleaseLegalHold, useRiskInsights, type LegalHold, type OpRiskAlert, type RiskInsights, type RiskSignal } from '@/api/op-system-extra';
import {
  Ava, Bars, Card, Confirm, Empty, ErrorBlock, Field, Ident, Inspector, KV, KeyStats, Legend, Meter, Note, PageHeading, Pill,
  SearchField, Section, Select, SettingRow, SettingsGroup, SkeletonCard, StatStrip, Switch, Table, TableFoot, Tabs, Tile, Toolbar, Who,
  usePaging, type Column, type Tone,
} from '@/components/panel/kit';
import { Icon } from '@/components/ui/Icon';
import { useToast } from '@/components/ui/Toast';
import { IC } from '@/components/op/system/ui';
import { dec, errMsg } from '@/components/op/system/fmt';
import { enDigits, faDigits, jDate, jDateTime, jDayMonth, money, relTime } from '@/lib/format';
import { now } from '@/lib/clock';
import { routes } from '@/lib/routes';

const SIGNALS: Record<RiskSignal, string> = { velocity: 'سرعت تراکنش', newdev: 'دستگاه جدید', big: 'مبلغ غیرمعمول', night: 'ساعت غیرمعمول', mule: 'الگوی حساب واسط' };
const STATUS: Record<RiskAlert['status'], { label: string; tone: Tone }> = {
  open: { label: 'باز', tone: 'error' },
  investigating: { label: 'در بررسی', tone: 'warning' },
  resolved: { label: 'حل‌شده', tone: 'success' },
  dismissed: { label: 'ردشده', tone: 'neutral' },
};
const SEVERITY: Record<RiskAlert['severity'], { label: string; tone: Tone }> = {
  critical: { label: 'بحرانی', tone: 'error' }, high: { label: 'بالا', tone: 'warning' }, medium: { label: 'متوسط', tone: 'info' }, low: { label: 'کم', tone: 'neutral' },
};
const LEGAL: Record<LegalHold['status'], { label: string; tone: Tone }> = {
  active: { label: 'فعال', tone: 'error' }, risk: { label: 'در بررسی ریسک', tone: 'info' }, pending: { label: 'در انتظار رفع', tone: 'warning' }, done: { label: 'رفع‌شده', tone: 'neutral' },
};
type View = 'events' | 'legal' | 'rules';
type AlertFilter = 'all' | 'open' | 'investigating' | 'closed';
const ALERT_TABS: { key: AlertFilter; label: string }[] = [{ key: 'all', label: 'همه' }, { key: 'open', label: 'باز' }, { key: 'investigating', label: 'در بررسی' }, { key: 'closed', label: 'بسته‌شده' }];
type HoldFilter = 'all' | 'live' | 'pending' | 'done';
const HOLD_TABS: { key: HoldFilter; label: string }[] = [{ key: 'all', label: 'همه' }, { key: 'live', label: 'فعال' }, { key: 'pending', label: 'در انتظار رفع' }, { key: 'done', label: 'رفع‌شده' }];
const SEV_SERIES = [{ name: 'متوسط', color: 'var(--chart-4)' }, { name: 'بالا', color: 'var(--warning-main)' }, { name: 'بحرانی', color: 'var(--error-main)' }];
const PAGE = 8;

const scoreTone = (s: number): Tone => (s >= 80 ? 'error' : s >= 50 ? 'warning' : 'success');
const scoreTxt = (s: number) => (s < 35 ? 'کم' : s < 65 ? 'متوسط' : 'زیاد');
const parseNote = (note?: string) => {
  if (!note?.startsWith('ref:')) return { ref: '', text: note ?? '' };
  const i = note.indexOf('|');
  return i < 0 ? { ref: note.slice(4), text: '' } : { ref: note.slice(4, i), text: note.slice(i + 1) };
};
const alertMatch = (a: OpRiskAlert, f: AlertFilter) => f === 'all' || (f === 'closed' ? a.status === 'resolved' || a.status === 'dismissed' : a.status === f);
const holdMatch = (h: LegalHold, f: HoldFilter) => f === 'all' || (f === 'live' ? h.status !== 'done' : h.status === f);
const dim = <span style={{ color: 'var(--text-disabled)' }}>—</span>;

export default function OpRiskPage() {
  const risk = useOpRisk();
  const insights = useRiskInsights();
  const [view, setView] = useState<View>('events');

  const refetchRisk = risk.refetch;
  const refetchInsights = insights.refetch;
  useEffect(() => {
    const t = setInterval(() => { refetchRisk(); refetchInsights(); }, 30_000);
    return () => clearInterval(t);
  }, [refetchRisk, refetchInsights]);

  const alerts = useMemo(() => (risk.data?.alerts ?? []) as OpRiskAlert[], [risk.data]);
  const rules = useMemo(() => risk.data?.rules ?? [], [risk.data]);
  const ins = insights.data;
  const holds = useMemo(() => ins?.legalHolds ?? [], [ins]);
  const openCount = alerts.filter((a) => a.status === 'open' || a.status === 'investigating').length;
  const liveHolds = holds.filter((h) => h.status !== 'done').length;
  const todayKey = now().toISOString().slice(0, 10);
  const newToday = alerts.filter((a) => a.createdAt.slice(0, 10) === todayKey).length;

  return (
    <>
      <PageHeading title="ریسک و تقلب" crumbs={[{ label: 'سیستم' }]} sub="رویدادهای مشکوک، مسدودی‌های قانونی و قوانین تشخیص در همه‌ی سازمان‌ها">
        <span className="mute" style={{ fontSize: 12.5 }}>به‌روزرسانی خودکار هر <span className="num">{faDigits(30)}</span> ثانیه</span>
        <Link href={routes.op.reports} className="nm-btn ghost"><Icon d={IC.reports} size={17} />گزارش ریسک</Link>
      </PageHeading>

      <StatStrip loading={risk.isLoading || insights.isLoading} items={[
        { label: 'هشدارهای باز', value: faDigits(openCount), unit: 'هشدار', note: `+${faDigits(newToday)} امروز`, trend: newToday ? 'warn' : undefined },
        {
          label: 'سطح ریسک پلتفرم', value: ins ? scoreTxt(ins.platformScore) : '—', unit: ins ? `${faDigits(ins.platformScore)} از ۱۰۰` : undefined,
          note: ins ? `${ins.platformScoreDelta < 0 ? '−' : '+'}${faDigits(Math.abs(ins.platformScoreDelta))} نسبت به هفته‌ی قبل` : undefined,
          trend: ins ? (ins.platformScoreDelta <= 0 ? 'up' : 'down') : undefined,
        },
        {
          label: 'تراکنش مشکوک امروز', value: ins ? faDigits(ins.suspiciousToday) : '—', unit: 'تراکنش',
          note: ins && ins.txToday ? `${dec((ins.suspiciousToday / ins.txToday) * 100, 2)}٪ از ${money(ins.txToday)} تراکنش` : undefined,
        },
      ]} />

      <Tabs label="بخش‌های ریسک و تقلب" size="lg" value={view} onChange={setView} items={[
        { key: 'events', label: 'رویدادهای پرچم‌گذاری‌شده', count: openCount, hot: true },
        { key: 'legal', label: 'مسدودی‌های قانونی', count: liveHolds },
        { key: 'rules', label: 'قوانین تشخیص' },
      ]} />

      {view === 'events' && (
        <>
          <AlertsCard alerts={alerts} rules={rules} openCount={openCount} loading={risk.isLoading} error={risk.isError ? risk.error : undefined} onRetry={() => risk.refetch()} />
          <AlertsChart ins={ins} loading={insights.isLoading} />
        </>
      )}
      {view === 'legal' && <HoldsCard holds={holds} loading={insights.isLoading} error={insights.isError ? insights.error : undefined} onRetry={() => insights.refetch()} />}
      {view === 'rules' && <RulesGroup rules={rules} loading={risk.isLoading} error={risk.isError ? risk.error : undefined} onRetry={() => risk.refetch()} />}
    </>
  );
}

// ───────────────────────── flagged events ─────────────────────────

function AlertsCard({ alerts, rules, openCount, loading, error, onRetry }: {
  alerts: OpRiskAlert[]; rules: PlatformRule[]; openCount: number; loading: boolean; error?: unknown; onRetry: () => void;
}) {
  const [status, setStatus] = useState<AlertFilter>('all');
  const [signal, setSignal] = useState<'all' | RiskSignal>('all');
  const [q, setQ] = useState('');
  const [sel, setSel] = useState<string | null>(null);

  const scoped = useMemo(() => {
    const text = q.trim();
    const needle = enDigits(text).toLowerCase();
    return alerts.filter((a) => (signal === 'all' || (a.signals ?? []).includes(signal))
      && (!text || a.id.toLowerCase().includes(needle) || (a.userName ?? '').includes(text) || a.title.includes(text) || (a.orgName ?? '').includes(text)));
  }, [alerts, signal, q]);
  const rows = scoped.filter((a) => alertMatch(a, status));
  const pg = usePaging(rows, PAGE, `${status}|${signal}|${q}`);
  const selAlert = alerts.find((a) => a.id === sel) ?? null;
  const filtered = status !== 'all' || signal !== 'all' || !!q;
  const clear = () => { setStatus('all'); setSignal('all'); setQ(''); };

  const columns: Column<OpRiskAlert>[] = [
    { key: 'id', label: 'شناسه', width: '80px', render: (a) => <span className="num ltr sm">{a.id}</span> },
    { key: 'who', label: 'کاربر / رویداد', width: 'minmax(0, 1.6fr)', render: (a) => <Ident lead={<Ava letter={(a.userName ?? '؟')[0]} id={a.userId ?? a.id} />} title={a.userName ?? '—'} sub={a.title} /> },
    { key: 'org', label: 'سازمان', width: 'minmax(0, 1fr)', render: (a) => <span className="el mute">{a.orgName ?? '—'}</span> },
    { key: 'amount', label: 'مبلغ (تومان)', width: '116px', render: (a) => (a.amount ? <span className="num">{money(a.amount)}</span> : dim) },
    { key: 'score', label: 'امتیاز ریسک', width: '92px', col: true, render: (a) => <><span className="num">{faDigits(a.score)}</span><Meter value={a.score / 100} tone={scoreTone(a.score)} width={60} thin label={`امتیاز ریسک ${faDigits(a.score)} از ۱۰۰`} /></> },
    { key: 'st', label: 'وضعیت', width: '92px', render: (a) => <Pill tone={STATUS[a.status].tone} dot>{STATUS[a.status].label}</Pill> },
  ];

  return (
    <>
      <Card flush>
        <Toolbar>
          <Tabs label="وضعیت هشدار" value={status} onChange={setStatus} items={ALERT_TABS.map((t) => ({ ...t, count: scoped.filter((a) => alertMatch(a, t.key)).length }))} />
          <span className="grow" />
          <Select label="نشانه‌ی ریسک" prefix="نشانه" value={signal} onChange={setSignal}
            options={[{ key: 'all', label: 'همه‌ی نشانه‌ها' }, ...(Object.keys(SIGNALS) as RiskSignal[]).map((k) => ({ key: k, label: SIGNALS[k], count: alerts.filter((a) => (a.signals ?? []).includes(k)).length }))]} />
          <SearchField value={q} onChange={setQ} placeholder="شناسه، کاربر یا رویداد" label="جستجوی هشدار" width={210} />
        </Toolbar>
        <Table
          columns={columns} rows={pg.rows} rowKey={(a) => a.id} rowLabel={(a) => `هشدار ${a.id} — ${a.userName ?? a.title}`}
          onRowClick={(a) => setSel((s) => (s === a.id ? null : a.id))} selectedKey={sel}
          loading={loading} error={error} onRetry={onRetry}
          empty={<Empty icon={IC.shield} title="با این فیلتر رویدادی یافت نشد" action={filtered ? <button type="button" className="nm-btn sm ghost" onClick={clear}>پاک کردن فیلترها</button> : undefined} />}
          minWidth={820}
        />
        <TableFoot shown={pg.rows.length} total={rows.length} unit="هشدار" page={pg.page} pages={pg.pages} onPage={pg.setPage}>
          <span>· <span className="num">{faDigits(openCount)}</span> هشدار باز</span>
        </TableFoot>
      </Card>
      {selAlert && <AlertInspector key={selAlert.id} a={selAlert} rules={rules} onClose={() => setSel(null)} />}
    </>
  );
}

function AlertsChart({ ins, loading }: { ins?: RiskInsights; loading: boolean }) {
  if (loading) return <SkeletonCard h={250} />;
  const daily = ins?.daily ?? [];
  const total = daily.reduce((s, d) => s + d.critical + d.high + d.medium, 0);
  const last = daily.length - 1;
  const data = daily.map((d, i) => ({ label: i % 5 === 0 || i === last ? jDayMonth(d.date) : '', values: [d.medium, d.high, d.critical] }));
  return (
    <Card title="هشدارها — ۳۰ روز" sub={`جمع ${faDigits(total)} هشدار`}
      actions={<Legend items={[{ label: 'بحرانی', color: 'var(--error-main)' }, { label: 'بالا', color: 'var(--warning-main)' }, { label: 'متوسط', color: 'var(--chart-4)' }]} />}>
      {daily.length
        ? <Bars data={data} series={SEV_SERIES} height={170} label={`نمودار هشدارهای ۳۰ روز اخیر به تفکیک شدت — جمع ${faDigits(total)}`} />
        : <Empty title="داده‌ای برای نمودار ثبت نشده است" />}
    </Card>
  );
}

function AlertInspector({ a, rules, onClose }: { a: OpRiskAlert; rules: PlatformRule[]; onClose: () => void }) {
  const toast = useToast();
  const update = useUpdateAlert();
  const { ref, text } = parseNote(a.note);
  const [note, setNote] = useState(text);
  const [err, setErr] = useState('');
  const s = STATUS[a.status];
  const sev = SEVERITY[a.severity];
  const rule = rules.find((r) => r.id === a.ruleId);
  const live = a.status === 'open' || a.status === 'investigating';
  const fullNote = (t: string) => (ref ? `ref:${ref}|${t}` : t);
  const go = (status: RiskAlert['status'], msg: string) => {
    if ((status === 'resolved' || status === 'dismissed') && note.trim().length < 3) return setErr('برای بستن هشدار، نتیجهٔ بررسی را در یادداشت بنویسید.');
    setErr('');
    update.mutate({ id: a.id, status, note: fullNote(note.trim()) }, { onSuccess: () => toast(msg), onError: (e) => setErr(errMsg(e)) });
  };
  const saveNote = () => update.mutate({ id: a.id, note: fullNote(note.trim()) }, { onSuccess: () => toast('یادداشت ذخیره شد'), onError: (e) => setErr(errMsg(e)) });
  const dirty = note.trim() !== text.trim();

  const details: [ReactNode, ReactNode][] = [
    ['زمان ثبت', <span key="t" className="num">{jDateTime(a.createdAt)}</span>],
    ['سازمان', a.orgName ?? '—'],
    ['قانون تشخیص', rule?.title ?? (ref ? 'ارجاع دستی' : '—')],
  ];
  if (ref) details.push(['ارجاع از', <Link key="r" href={routes.op.requests} className="ltr">{ref}</Link>]);

  return (
    <Inspector
      open onClose={onClose} label={`هشدار ${a.id}`} title={<>هشدار <span className="ltr">{a.id}</span></>}
      href={a.userId ? routes.op.user(a.userId) : undefined} hrefLabel="پروفایل کاربر"
      footer={live ? (
        <>
          {a.status === 'open' && <button type="button" className="nm-btn" disabled={update.isPending} onClick={() => go('investigating', `بررسی هشدار ${a.id} آغاز شد`)}><Icon d={IC.search} size={17} />شروع بررسی</button>}
          <button type="button" className={a.status === 'open' ? 'nm-btn line' : 'nm-btn'} disabled={update.isPending} onClick={() => go('resolved', `هشدار ${a.id} حل‌شده ثبت شد`)}><Icon d={IC.check} size={17} />حل شد</button>
          <button type="button" className="nm-btn ghost" disabled={update.isPending} onClick={() => go('dismissed', `هشدار ${a.id} رد شد (مثبت کاذب)`)}><Icon d={IC.x} size={17} />رد هشدار</button>
        </>
      ) : (
        <button type="button" className="nm-btn line" disabled={update.isPending} onClick={() => go('open', `هشدار ${a.id} دوباره باز شد`)}><Icon d={IC.refresh} size={17} />بازگشایی هشدار</button>
      )}
    >
      <Who
        lead={<Tile d={IC.risk} tone={sev.tone} size="lg" />}
        title={a.title}
        sub={[a.userName, a.orgName].filter(Boolean).join(' · ') || '—'}
        pills={<><Pill tone={sev.tone}>شدت {sev.label}</Pill><Pill tone={s.tone} dot>{s.label}</Pill></>}
      />
      <KeyStats items={[
        ['امتیاز ریسک', <span key="s" style={{ color: `var(--${scoreTone(a.score)}-text)` }}>{faDigits(a.score)} از ۱۰۰</span>],
        ['مبلغ (تومان)', a.amount ? money(a.amount) : '—'],
        ['ثبت', relTime(a.createdAt, now())],
      ]} />
      <Section title="جزئیات"><KV rows={details} /></Section>
      {!!a.signals?.length && (
        <Section title="نشانه‌ها">
          <div className="nm-chips">{a.signals.map((x) => <Pill key={x} tone="warning">{SIGNALS[x]}</Pill>)}</div>
        </Section>
      )}
      <Section>
        <Field label="یادداشت بررسی" htmlFor="al-note" error={err || undefined}>
          <textarea id="al-note" className="nm-ta" rows={4} value={note} onChange={(e) => { setNote(e.target.value); setErr(''); }} placeholder="نتیجهٔ بررسی، شماره تماس با کاربر، اقدام انجام‌شده…" />
        </Field>
        {dirty && <button type="button" className="nm-btn sm text" onClick={saveNote} disabled={update.isPending} style={{ alignSelf: 'flex-start' }}>ذخیره یادداشت</button>}
      </Section>
    </Inspector>
  );
}

// ───────────────────────── legal holds ─────────────────────────

function HoldsCard({ holds, loading, error, onRetry }: { holds: LegalHold[]; loading: boolean; error?: unknown; onRetry: () => void }) {
  const toast = useToast();
  const release = useReleaseLegalHold();
  const [lf, setLf] = useState<HoldFilter>('all');
  const [q, setQ] = useState('');
  const [sel, setSel] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<LegalHold | null>(null);

  const scoped = useMemo(() => {
    const text = q.trim();
    const needle = enDigits(text);
    return holds.filter((h) => !text || h.userName.includes(text) || h.holding.includes(text) || enDigits(h.reference).includes(needle));
  }, [holds, q]);
  const rows = scoped.filter((h) => holdMatch(h, lf));
  const pg = usePaging(rows, PAGE, `${lf}|${q}`);
  const live = holds.filter((h) => h.status !== 'done');
  const sum = live.reduce((s, h) => s + h.amount, 0);
  const selHold = holds.find((h) => h.id === sel) ?? null;

  const doRelease = () => {
    if (!confirm) return;
    const h = confirm;
    release.mutate({ id: h.id }, {
      onSuccess: () => { setConfirm(null); toast(`رفع مسدودی قانونی ${h.userName} · +${money(h.amount)} آزاد شد`); },
      onError: (e) => { setConfirm(null); toast(errMsg(e), 'error'); },
    });
  };

  const columns: Column<LegalHold>[] = [
    { key: 'who', label: 'کاربر / شماره مرجع', width: 'minmax(0, 1.2fr)', render: (h) => <Ident lead={<Ava letter={h.userName[0]} id={h.userId ?? h.id} />} title={h.userName} sub={<>مرجع <span className="num">{faDigits(h.reference)}</span></>} /> },
    { key: 'asset', label: 'دارایی / دلیل', width: 'minmax(0, 1.3fr)', col: true, render: (h) => <><b className="el" style={{ fontWeight: 600, maxWidth: '100%' }}>{h.holding}</b><span className="sm el" style={{ maxWidth: '100%' }}>{h.reason}</span></> },
    { key: 'amount', label: 'مبلغ مسدود (تومان)', width: '136px', col: true, render: (h) => <><span className="num">{money(h.amount)}</span><span className="sm num">{jDate(h.createdAt)}</span></> },
    { key: 'st', label: 'وضعیت', width: '116px', render: (h) => <Pill tone={LEGAL[h.status].tone} dot>{LEGAL[h.status].label}</Pill> },
    {
      key: 'act', label: '', width: '104px', align: 'end', render: (h) => (h.status === 'pending'
        ? <button type="button" className="nm-btn sm line" disabled={release.isPending} onClick={(e) => { e.stopPropagation(); setConfirm(h); }}>رفع مسدودی</button>
        : null),
    },
  ];

  return (
    <>
      <Card flush>
        <Toolbar>
          <Tabs label="وضعیت مسدودی" value={lf} onChange={setLf} items={HOLD_TABS.map((t) => ({ ...t, count: scoped.filter((h) => holdMatch(h, t.key)).length }))} />
          <span className="grow" />
          <SearchField value={q} onChange={setQ} placeholder="نام کاربر یا شماره مرجع" label="جستجوی مسدودی قانونی" width={220} />
        </Toolbar>
        <Table
          columns={columns} rows={pg.rows} rowKey={(h) => h.id} rowLabel={(h) => `مسدودی قانونی ${h.userName}`}
          onRowClick={(h) => setSel((s) => (s === h.id ? null : h.id))} selectedKey={sel}
          loading={loading} error={error} onRetry={onRetry}
          empty={<Empty icon={IC.lock} title="موردی یافت نشد" />}
          minWidth={760}
        />
        <TableFoot shown={pg.rows.length} total={rows.length} unit="مورد" page={pg.page} pages={pg.pages} onPage={pg.setPage}>
          <span>· <span className="num">{faDigits(live.length)}</span> مسدودی فعال · جمع <b className="num" style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{money(sum)}</b> تومان</span>
        </TableFoot>
      </Card>

      {selHold && (
        <Inspector
          key={selHold.id} open onClose={() => setSel(null)} label={`مسدودی قانونی ${selHold.userName}`} title="مسدودی قانونی"
          href={selHold.userId ? routes.op.user(selHold.userId) : undefined} hrefLabel="پروفایل کاربر"
          footer={selHold.status === 'pending' ? <button type="button" className="nm-btn" disabled={release.isPending} onClick={() => setConfirm(selHold)}><Icon d={IC.lock} size={17} />رفع مسدودی</button> : undefined}
        >
          <Who
            lead={<Ava letter={selHold.userName[0]} id={selHold.userId ?? selHold.id} size="lg" />}
            title={selHold.userName}
            sub={<>شماره مرجع <span className="num">{faDigits(selHold.reference)}</span></>}
            pills={<Pill tone={LEGAL[selHold.status].tone} dot>{LEGAL[selHold.status].label}</Pill>}
          />
          <KeyStats items={[
            ['مبلغ مسدود (تومان)', money(selHold.amount)],
            ['تاریخ ثبت', jDate(selHold.createdAt)],
            ...(selHold.releasedAt ? [['تاریخ رفع', jDate(selHold.releasedAt)] as [ReactNode, ReactNode]] : []),
          ]} />
          <Section title="جزئیات">
            <KV rows={[
              ['دارایی', selHold.holding],
              ['دلیل', <span key="r" title={selHold.reason}>{selHold.reason}</span>],
              ['شماره مرجع', <span key="n" className="num">{faDigits(selHold.reference)}</span>],
            ]} />
          </Section>
          {selHold.status === 'pending'
            ? <Note tone="info">دستور رفع از مرجع ثبت شده است. با رفع مسدودی، <b className="num">{money(selHold.amount)}</b> تومان از «{selHold.holding}» به بخش آزاد کاربر برمی‌گردد.</Note>
            : <Note tone="mute" icon={IC.lock}>ثبت و رفع مسدودی قانونی فقط با شماره مرجع ممکن است.</Note>}
        </Inspector>
      )}

      <Confirm open={!!confirm} onClose={() => setConfirm(null)} busy={release.isPending} onConfirm={doRelease} title="رفع مسدودی قانونی" confirmLabel="رفع مسدودی"
        body={confirm ? <>دستور رفع مرجع <b className="num">{faDigits(confirm.reference)}</b> برای {confirm.userName} ثبت شده است. با رفع مسدودی، <b className="num">{money(confirm.amount)}</b> تومان از «{confirm.holding}» به بخش آزاد کاربر برمی‌گردد.</> : null} />
    </>
  );
}

// ───────────────────────── detection rules ─────────────────────────

function RulesGroup({ rules, loading, error, onRetry }: { rules: PlatformRule[]; loading: boolean; error?: unknown; onRetry: () => void }) {
  const toast = useToast();
  const update = useUpdateRule();
  if (loading) return <SkeletonCard h={320} />;
  if (error) return <ErrorBlock error={error} message={errMsg(error)} onRetry={onRetry} />;
  const active = rules.filter((r) => r.enabled).length;
  const toggle = (r: PlatformRule) => update.mutate({ id: r.id, enabled: !r.enabled }, {
    onSuccess: () => toast(`قانون «${r.title}» ${r.enabled ? 'غیرفعال' : 'فعال'} شد`),
    onError: (e) => toast(errMsg(e), 'error'),
  });
  return (
    <SettingsGroup
      title={<span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}><Tile d={IC.risk} tone="error" size="sm" />قوانین تشخیص</span>}
      action={<Pill tone="success">{faDigits(active)} فعال از {faDigits(rules.length)}</Pill>}
    >
      {rules.length ? rules.map((r) => (
        <SettingRow key={r.id} label={r.title} desc={r.description}>
          <Switch on={r.enabled} label={r.title} disabled={update.isPending && update.variables?.id === r.id} onChange={() => toggle(r)} />
        </SettingRow>
      )) : <Empty icon={IC.risk} title="قانون تشخیصی تعریف نشده است" />}
    </SettingsGroup>
  );
}
