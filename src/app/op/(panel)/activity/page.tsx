'use client';
/**
 * /op/activity — «فعالیت‌ها»: who did what across Namadno (users, organizations, «سامانه» = the Namadno team and automatic actions).
 * Kit list page: 14-day trend (stacked by actor) → list card (actor tabs, category and organization selects, search,
 * server-paged table) → Inspector with details and links. Deep links: ?user=<id> (removable chip) and ?org=<id>
 * (pre-selects the organization filter). Data: useOpActivity (src/api/op-treasury-extra.ts).
 */
import { Suspense, useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useOpOrganizations, useOpUsers } from '@/api/op';
import { useOpActivity, useTreasuryPositions, type ActivityCategory, type ActivityEvent, type ActivityPage } from '@/api/op-treasury-extra';
import {
  Bars, Card, Empty, Ident, Inspector, KV, KeyStats, Legend, List, ListRow, PageHeading, Pill, SearchField, Section, Select,
  SkeletonCard, Table, TableFoot, Tabs, Tile, Toolbar, Who, type Column,
} from '@/components/panel/kit';
import { Icon } from '@/components/ui/Icon';
import { ACTOR, CATEGORY, TI, amt, fundUi, unitsText } from '@/components/op/treasury/ui';
import { ACTOR_COL, ACTOR_GROUP, ACTOR_KINDS, CAT_ICON, REF_META, actorHref, actorLead, actorSub } from '@/components/op/activity/meta';
import { dayTime } from '@/components/op/system/fmt';
import { faDigits, jDate, jDayMonth, money, time } from '@/lib/format';
import { routes } from '@/lib/routes';

const PAGE = 12;
const HEAD = { title: 'فعالیت‌ها', crumbs: [{ label: 'پایش' }], sub: 'چه کسی چه کرد: کاربران، سازمان‌ها، تیم نمادنو و سامانه' };
const CLOSE = 'M6 6l12 12M18 6L6 18';
const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);
/** Events of one actor group on a day (the «سامانه» group adds the Namadno team's and automatic events). */
const inGroup = (d: ActivityPage['daily'][number], k: (typeof ACTOR_KINDS)[number]) => sum(ACTOR_GROUP[k].map((x) => d[x]));

export default function OpActivityPage() {
  return (
    <Suspense fallback={<><PageHeading {...HEAD} /><SkeletonCard h={200} /><SkeletonCard h={420} /></>}>
      <ActivityInner />
    </Suspense>
  );
}

function ActivityInner() {
  const sp = useSearchParams();
  const router = useRouter();
  const userId = sp.get('user') ?? undefined;
  const org = sp.get('org') ?? 'all';
  const [actor, setActor] = useState<(typeof ACTOR_KINDS)[number] | 'all'>('all');
  const [cat, setCat] = useState<ActivityCategory | 'all'>('all');
  const [q, setQ] = useState('');
  const [dq, setDq] = useState('');
  const [sel, setSel] = useState<ActivityEvent | null>(null);
  useEffect(() => { const t = setTimeout(() => setDq(q.trim()), 300); return () => clearTimeout(t); }, [q]);
  // page 1 whenever a filter changes (derived, so no extra request for the old offset)
  const fkey = `${actor}|${cat}|${org}|${dq}|${userId ?? ''}`;
  const [pg, setPg] = useState({ key: fkey, page: 1 });
  const page = pg.key === fkey ? pg.page : 1;
  const setPage = (p: number) => setPg({ key: fkey, page: p });

  const act = useOpActivity({ actor: actor === 'all' ? 'all' : ACTOR_GROUP[actor], category: cat, orgId: org === 'all' ? undefined : org, userId, q: dq || undefined, limit: PAGE, offset: (page - 1) * PAGE });
  const orgs = useOpOrganizations();
  const users = useOpUsers();
  const positions = useTreasuryPositions();
  // keep the last page on screen while the next one loads (server paging)
  const [kept, setKept] = useState<ActivityPage | undefined>();
  useEffect(() => { if (act.data) setKept(act.data); }, [act.data]);
  const data = act.data ?? kept;

  const userName = useMemo(() => new Map((users.data ?? []).map((u) => [u.id, u.fullName])), [users.data]);
  const orgName = (id: string) => (orgs.data ?? []).find((o) => o.id === id)?.name ?? id;
  const fundName = (id: string) => (positions.data ?? []).find((p) => p.fundId === id)?.shortName ?? id;

  const setParam = (k: 'user' | 'org', v: string | null) => {
    const p = new URLSearchParams(sp.toString());
    if (v) p.set(k, v); else p.delete(k);
    const s = p.toString();
    router.replace(s ? `${routes.op.activity}?${s}` : routes.op.activity, { scroll: false });
  };
  const filtered = actor !== 'all' || cat !== 'all' || org !== 'all' || !!userId || !!dq;
  const clear = () => { setActor('all'); setCat('all'); setQ(''); setDq(''); router.replace(routes.op.activity, { scroll: false }); };

  const counts = data?.counts;
  const total = data?.total ?? 0;
  const pages = Math.max(1, Math.ceil(total / PAGE));
  const daily = data?.daily ?? [];
  const who = userId ? userName.get(userId) ?? userId : '';

  const cols: Column<ActivityEvent>[] = [
    { key: 'at', label: 'زمان', width: '112px', render: (e) => <span className="num" style={{ fontSize: 12.5 }}>{dayTime(e.at, true)}</span> },
    { key: 'who', label: 'انجام‌دهنده', width: 'minmax(0, 1.1fr)', render: (e) => <Ident lead={actorLead(e)} title={e.actor.name} sub={actorSub(e)} /> },
    { key: 'what', label: 'رویداد', width: 'minmax(0, 2fr)', col: true, render: (e) => <><b className="el" style={{ fontWeight: 600, maxWidth: '100%' }}>{e.title}</b>{e.sub && <span className="sm el" style={{ maxWidth: '100%' }}>{e.sub}</span>}</> },
    { key: 'cat', label: 'دسته', width: '96px', render: (e) => <Pill tone={e.tone} dot>{CATEGORY[e.category]}</Pill> },
    { key: 'amount', label: 'مبلغ (تومان)', width: '112px', render: (e) => (e.amount != null ? <span className="num">{amt(e.amount)}</span> : <span style={{ color: 'var(--text-disabled)' }}>—</span>) },
  ];

  return (
    <>
      <PageHeading {...HEAD} />

      <Card
        title="روند ۱۴ روز اخیر" sub="تعداد رویدادها به تفکیک انجام‌دهنده"
        actions={<Legend items={ACTOR_KINDS.map((k) => ({ label: ACTOR[k].label, color: ACTOR_COL[k], value: faDigits(sum(daily.map((d) => inGroup(d, k)))) }))} />}
      >
        {data
          ? <Bars data={daily.map((d) => ({ label: jDayMonth(d.date), values: ACTOR_KINDS.map((k) => inGroup(d, k)) }))} series={ACTOR_KINDS.map((k) => ({ name: ACTOR[k].label, color: ACTOR_COL[k] }))} height={150} label="تعداد رویدادهای ۱۴ روز اخیر به تفکیک انجام‌دهنده" />
          : <SkeletonCard h={150} />}
      </Card>

      <Card flush>
        <Toolbar>
          <Tabs label="انجام‌دهنده" value={actor} onChange={setActor} items={[
            { key: 'all' as const, label: 'همه', count: counts?.all },
            ...ACTOR_KINDS.map((k) => ({ key: k, label: ACTOR[k].label, count: counts ? sum(ACTOR_GROUP[k].map((x) => counts[x] ?? 0)) : undefined })),
          ]} />
          <span className="grow" />
          {userId && (
            <button type="button" className="nm-chip" aria-pressed="true" onClick={() => setParam('user', null)} aria-label={`برداشتن فیلتر کاربر ${who}`}>
              <Icon d={TI.user} size={14} />{who}<Icon d={CLOSE} size={13} />
            </button>
          )}
          <Select label="دسته" prefix="دسته" value={cat} onChange={setCat}
            options={[{ key: 'all' as const, label: 'همه' }, ...(Object.keys(CATEGORY) as ActivityCategory[]).map((k) => ({ key: k, label: CATEGORY[k] }))]} />
          <Select label="سازمان" prefix="سازمان" icon={TI.org} value={org} onChange={(v) => setParam('org', v === 'all' ? null : v)} align="end"
            options={[{ key: 'all', label: 'همه سازمان‌ها' }, ...(orgs.data ?? []).map((o) => ({ key: o.id, label: o.name })), ...(org !== 'all' && !(orgs.data ?? []).some((o) => o.id === org) ? [{ key: org, label: org }] : [])]} />
          <SearchField value={q} onChange={setQ} placeholder="جستجو در فعالیت‌ها" label="جستجوی فعالیت" width={200} />
        </Toolbar>
        <Table
          columns={cols} rows={data?.items ?? []} rowKey={(e) => e.id} rowLabel={(e) => `${e.actor.name} · ${e.title}`}
          onRowClick={(e) => setSel((s) => (s?.id === e.id ? null : e))} selectedKey={sel?.id ?? null}
          loading={!data && act.isLoading} error={!data && act.isError ? act.error : undefined} onRetry={() => act.refetch()}
          empty={<Empty icon={TI.activity} title="فعالیتی با این فیلترها پیدا نشد" action={filtered ? <button type="button" className="nm-btn sm ghost" onClick={clear}>پاک کردن فیلترها</button> : undefined} />}
          minWidth={860}
        />
        <TableFoot shown={data?.items.length ?? 0} total={total} unit="رویداد" page={Math.min(page, pages)} pages={pages} onPage={setPage} />
      </Card>

      {sel && (
        <ActivityInspector
          key={sel.id} e={sel} userName={(id) => userName.get(id)} orgName={orgName} fundName={fundName} onClose={() => setSel(null)}
          onUser={userId === sel.actor.id ? undefined : (id) => { setSel(null); setParam('user', id); }}
          onOrg={org === sel.orgId ? undefined : (id) => { setSel(null); setParam('org', id); }}
        />
      )}
    </>
  );
}

function ActivityInspector({ e, userName, orgName, fundName, onClose, onUser, onOrg }: {
  e: ActivityEvent; userName: (id: string) => string | undefined; orgName: (id: string) => string; fundName: (id: string) => string;
  onClose: () => void; onUser?: (id: string) => void; onOrg?: (id: string) => void;
}) {
  const a = e.actor;
  const aHref = actorHref(e);
  const refs = (e.refs ?? []).filter((r) => !(r.type === 'user' && r.id === a.id) && REF_META[r.type]);
  const orgId = e.orgId ?? (a.kind === 'org' ? a.id : undefined);
  const stats: [string, string][] = [['زمان', `${jDayMonth(e.at)} · ${time(e.at)}`]];
  if (e.amount != null) stats.push(['مبلغ', `${amt(e.amount)} تومان`]);
  if (e.units != null) stats.push(['واحد', unitsText(e.units)]);
  const showUser = a.kind === 'user' && a.id && onUser;
  const showOrg = orgId && onOrg;

  return (
    <Inspector
      open onClose={onClose} title="جزئیات فعالیت" label={`جزئیات فعالیت ${e.title}`} href={e.href} hrefLabel="مشاهده"
      footer={(showUser || showOrg) ? (
        <>
          {showUser && <button type="button" className="nm-btn ghost" onClick={() => onUser!(a.id!)}><Icon d={TI.activity} size={16} />فعالیت‌های این کاربر</button>}
          {showOrg && <button type="button" className="nm-btn ghost" onClick={() => onOrg!(orgId!)}><Icon d={TI.org} size={16} />فعالیت‌های این سازمان</button>}
        </>
      ) : undefined}
    >
      <Who
        lead={<Tile d={CAT_ICON[e.category]} tone={e.tone} size="xl" />} title={e.title} sub={e.sub}
        pills={<><Pill tone={e.tone} dot>{CATEGORY[e.category]}</Pill><Pill tone={ACTOR[a.kind].tone}>{ACTOR[a.kind].one}</Pill></>}
      />
      <KeyStats items={stats} />

      <Section title="انجام‌دهنده">
        <List>
          <ListRow href={aHref} lead={actorLead(e)} title={a.name} sub={actorSub(e)} trail={aHref ? <Icon d={TI.chevL} size={15} /> : undefined} />
        </List>
      </Section>

      {(orgId || e.fundId || refs.length > 0) && (
        <Section title="مرتبط">
          <List>
            {orgId && a.kind !== 'org' && <ListRow href={routes.op.organization(orgId)} lead={<Tile d={TI.org} tone="secondary" size="sm" />} title={e.orgName ?? orgName(orgId)} sub="سازمان" trail={<Icon d={TI.chevL} size={15} />} />}
            {e.fundId && <ListRow href={routes.op.fund(e.fundId)} lead={<Tile d={fundUi(e.fundId).d} tone={fundUi(e.fundId).tone} size="sm" />} title={`صندوق ${fundName(e.fundId)}`} sub={e.units != null ? `${unitsText(e.units)} واحد` : 'صندوق'} trail={<Icon d={TI.chevL} size={15} />} />}
            {refs.map((r) => {
              const m = REF_META[r.type];
              const href = m.href(r.id, e);
              const title = r.label ?? (r.type === 'user' ? userName(r.id) ?? r.id : r.id);
              return <ListRow key={r.type + r.id} href={href} lead={<Tile d={m.d} tone="neutral" size="sm" />} title={<span className={r.type === 'user' ? undefined : 'num ltr'}>{title}</span>} sub={m.label} trail={href ? <Icon d={TI.chevL} size={15} /> : undefined} />;
            })}
          </List>
        </Section>
      )}

      <Section title="ثبت">
        <KV rows={[
          ['تاریخ', <span key="d" className="num">{jDate(e.at)} · {time(e.at)}</span>],
          ['شناسه‌ی رویداد', <span key="i" className="num ltr">{e.id}</span>],
          ...(e.amount != null ? [['مبلغ دقیق', <span key="m" className="num">{money(e.amount)} تومان</span>] as [string, React.ReactNode]] : []),
        ]} />
      </Section>
    </Inspector>
  );
}
