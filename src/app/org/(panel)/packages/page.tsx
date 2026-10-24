'use client';
/**
 * Organization — asset packages. Kit list page: key numbers → list card (status tabs, search, table, pager)
 * → inspector with the package summary. The monthly trend lives in Reports (the «ارسال امسال» number links there).
 */
import Link from 'next/link';
import { useMemo, useState } from 'react';
import { useOrgPackages } from '@/api/org';
import {
  Card, Empty, FreeLocked, Ident, Inspector, KV, KeyStats, Meter, PageHeading, Pill, SearchField, Section, StatStrip,
  Table, TableFoot, Tabs, Tile, Toolbar, Who, usePaging, type Column, type Stat, type Tone,
} from '@/components/panel/kit';
import { Icon } from '@/components/ui/Icon';
import { LockTag } from '@/components/org/packages/Stepper';
import { I, allocationText, effectiveStatus, jParts, milestoneStats, policySub, reasonMeta, splitCompact, statusLabel, type Tone as MetaTone } from '@/components/org/packages/meta';
import { routes } from '@/lib/routes';
import { JALALI_MONTHS, faDigits, jDate, money } from '@/lib/format';
import { now } from '@/lib/clock';
import type { OrgPackage } from '@/types/domain';

type TabKey = 'all' | 'draft' | 'sent' | 'completed' | 'cancelled';
const PAGE = 8;
const TABS: [TabKey, string][] = [['all', 'همه'], ['draft', 'پیش‌نویس'], ['sent', 'ارسال‌شده'], ['completed', 'تکمیل‌شده'], ['cancelled', 'لغوشده']];
const inTab = (x: OrgPackage, k: TabKey) => k === 'all' || effectiveStatus(x) === k;
const kt = (t: MetaTone): Tone => (t === 'default' ? 'neutral' : t);
/** «۱۸٫۶ میلیارد» */
const cmp = (n: number) => { const c = splitCompact(n); return `${c.value} ${c.unit}`.trim(); };

export default function OrgPackagesPage() {
  const { data, isLoading, isError, error, refetch } = useOrgPackages();
  const [tab, setTab] = useState<TabKey>('all');
  const [q, setQ] = useState('');
  const [sel, setSel] = useState<string | null>(null);

  const all = useMemo(() => data ?? [], [data]);
  const text = q.trim();
  const rows = useMemo(() => all.filter((x) => inTab(x, tab) && (!text || x.title.includes(text))), [all, tab, text]);
  const pg = usePaging(rows, PAGE, `${tab}|${text}`);
  const selPkg = all.find((x) => x.id === sel);

  // ───── key numbers (this month, waiting for acceptance, this year, acceptance rate) ─────
  const today = jParts(now());
  const sent = all.filter((x) => x.status !== 'draft' && x.status !== 'cancelled' && x.sentAt);
  const inMonth = (x: OrgPackage, dm: number) => { const p = jParts(x.sentAt!); let m = today.m - dm, y = today.y; if (m < 1) { m += 12; y -= 1; } return p.y === y && p.m === m; };
  const thisMonth = sent.filter((x) => inMonth(x, 0));
  const lastMonth = sent.filter((x) => inMonth(x, 1));
  const thisMonthSum = thisMonth.reduce((s, x) => s + x.total, 0);
  const lastMonthName = JALALI_MONTHS[(today.m + 10) % 12];
  const diff = thisMonth.length - lastMonth.length;
  const pendingRecipients = sent.filter((x) => x.status === 'sent').flatMap((x) => x.recipients.filter((r) => r.status === 'pending'));
  const pendingSum = pendingRecipients.reduce((s, r) => s + r.amount, 0);
  const yearSent = sent.filter((x) => jParts(x.sentAt!).y === today.y);
  const yearSum = splitCompact(yearSent.reduce((s, x) => s + x.total, 0));
  const yearRecipients = yearSent.reduce((s, x) => s + x.recipients.length, 0);
  const yearAccepted = yearSent.reduce((s, x) => s + x.recipients.filter((r) => r.status === 'accepted').length, 0);
  const acceptPct = yearRecipients ? Math.round((yearAccepted * 100) / yearRecipients) : 0;

  const stats: Stat[] = [
    {
      label: `ارسال ${JALALI_MONTHS[today.m - 1]}`, value: faDigits(thisMonth.length), unit: 'بسته',
      // nothing sent yet this month → show last month quietly instead of a negative delta
      ...(!thisMonth.length ? { note: `${lastMonthName}: ${faDigits(lastMonth.length)} بسته` }
        : { note: `${cmp(thisMonthSum)} تومان · ${diff === 0 ? 'برابر' : `${diff > 0 ? '+' : '−'}${faDigits(Math.abs(diff))}`} نسبت به ${lastMonthName}`, trend: diff > 0 ? 'up' as const : undefined }),
    },
    { label: 'در انتظار پذیرش کارکنان', value: faDigits(pendingRecipients.length), unit: 'بسته', note: pendingRecipients.length ? `${cmp(pendingSum)} تومان` : 'همه‌ی بسته‌ها پذیرفته شده‌اند', trend: pendingRecipients.length ? 'warn' : undefined },
    { label: 'ارسال امسال', value: yearSum.value, unit: `${yearSum.unit} تومان`.trim(), note: `${faDigits(yearSent.length)} بسته · ${money(yearRecipients)} گیرنده`, href: routes.org.reports },
    { label: 'نرخ پذیرش امسال', value: `${faDigits(acceptPct)}٪`, note: `${money(yearAccepted)} از ${money(yearRecipients)} بسته دریافت شد` },
  ];

  const columns: Column<OrgPackage>[] = [
    {
      key: 'title', label: 'بسته', width: 'minmax(0, 1.6fr)', render: (r) => {
        const rm = reasonMeta(r.reason);
        const per = r.amountPerPerson ? `${money(r.amountPerPerson)} هر نفر` : 'مبلغ تعیین نشده';
        return <Ident lead={<Tile d={I.pkg} tone={kt(rm.tone)} />} title={r.title} sub={`${rm.label} · ${per} · ${jDate(r.sentAt ?? r.createdAt)}`} />;
      },
    },
    { key: 'n', label: 'گیرندگان', width: '72px', render: (r) => <span className="num">{faDigits(r.recipients.length)} نفر</span> },
    { key: 'total', label: 'مبلغ کل', width: '104px', render: (r) => <span className="num" style={{ fontWeight: 600 }}>{r.total ? cmp(r.total) : '—'}</span> },
    {
      key: 'acc', label: 'پذیرش', width: '96px', col: true, render: (r) => {
        if (r.status === 'draft' || r.status === 'cancelled') return <span style={{ color: 'var(--text-disabled)' }}>—</span>;
        const n = r.recipients.length;
        const acc = r.recipients.filter((x) => x.status === 'accepted').length;
        return (<><span className="num sm">{faDigits(acc)} از {faDigits(n)}</span><Meter value={n ? acc / n : 0} tone={n && acc === n ? 'success' : 'primary'} width={72} thin /></>);
      },
    },
    { key: 'lock', label: 'سیاست قفل', width: '132px', col: true, render: (r) => (<><LockTag type={r.lockPolicy.type} />{r.lockPolicy.type !== 'none' && <span className="sm el" style={{ maxWidth: '100%' }}>{policySub(r)}</span>}</>) },
    { key: 'st', label: 'وضعیت', width: '144px', render: (r) => { const s = statusLabel(r); return <Pill tone={kt(s.tone)} dot>{s.text}</Pill>; } },
  ];

  const clear = () => { setTab('all'); setQ(''); };
  const empty = !all.length
    ? <Empty icon={I.pkg} title="هنوز بسته‌ای ارسال نشده است" action={<Link href={routes.org.newRecipients()} className="nm-btn sm">ارسال بسته دارایی</Link>} />
    : <Empty icon={text ? I.search : I.pkg} title={text ? 'بسته‌ای با این عنوان پیدا نشد' : 'بسته‌ای در این وضعیت نیست'} action={<button type="button" className="nm-btn sm ghost" onClick={clear}>نمایش همه‌ی بسته‌ها</button>} />;

  return (
    <>
      <PageHeading
        title="بسته‌های دارایی"
        crumbs={[{ label: 'عملیات' }]}
        sub={<>بسته‌هایی که تا <span className="num">۳۰</span> روز توسط کارمند تأیید نشوند، خودکار به حساب سازمان بازمی‌گردند · <Link href={routes.org.contract}>تنظیمات قرارداد</Link></>}
      >
        <Link href={routes.org.newRecipients()} className="nm-btn"><Icon d={I.plus} size={17} strokeWidth={2} />ارسال بسته جدید</Link>
      </PageHeading>

      <StatStrip loading={!data} items={stats} />

      <Card flush>
        <Toolbar>
          <Tabs label="وضعیت بسته" value={tab} onChange={setTab} items={TABS.map(([key, label]) => ({ key, label, count: all.filter((x) => inTab(x, key)).length }))} />
          <span className="grow" />
          <SearchField value={q} onChange={setQ} placeholder="جستجوی عنوان…" label="جستجوی بسته" width={220} />
        </Toolbar>
        <Table
          columns={columns} rows={pg.rows} rowKey={(r) => r.id} rowLabel={(r) => r.title}
          onRowClick={(r) => setSel((s) => (s === r.id ? null : r.id))} selectedKey={sel}
          loading={isLoading} error={isError ? error : undefined} onRetry={() => refetch()}
          empty={empty} minWidth={820}
        />
        <TableFoot shown={pg.rows.length} total={rows.length} unit="بسته" page={pg.page} pages={pg.pages} onPage={pg.setPage} />
      </Card>

      {selPkg && <PackageInspector key={selPkg.id} pkg={selPkg} onClose={() => setSel(null)} />}
    </>
  );
}

function PackageInspector({ pkg, onClose }: { pkg: OrgPackage; onClose: () => void }) {
  const rm = reasonMeta(pkg.reason);
  const st = statusLabel(pkg);
  const isDraft = pkg.status === 'draft';
  const live = !isDraft && pkg.status !== 'cancelled';
  const n = pkg.recipients.length;
  const acc = pkg.recipients.filter((r) => r.status === 'accepted').length;
  const pend = pkg.recipients.filter((r) => r.status === 'pending');
  const pendSum = pend.reduce((s, r) => s + r.amount, 0);
  const ms = pkg.lockPolicy.type === 'milestone' ? milestoneStats(pkg) : null;
  const released = ms ? Math.round((pkg.total * ms.relPct) / 100) : 0;
  const detail = routes.org.package(pkg.id);

  return (
    <Inspector
      open onClose={onClose} title="جزئیات بسته" label={`جزئیات بسته ${pkg.title}`} href={detail} hrefLabel="صفحه کامل"
      footer={isDraft ? (
        <>
          <Link href={detail} className="nm-btn ghost">جزئیات</Link>
          <Link href={routes.org.newSettings(pkg.id)} className="nm-btn">ادامه ارسال<Icon d={I.chevL} size={16} /></Link>
        </>
      ) : <Link href={detail} className="nm-btn ghost">جزئیات و گیرندگان<Icon d={I.chevL} size={16} /></Link>}
    >
      <Who
        lead={<Tile d={I.pkg} tone={kt(rm.tone)} size="xl" />}
        title={pkg.title}
        sub={<>{rm.label} · {pkg.sentAt ? 'ارسال' : 'ایجاد'} <span className="num">{jDate(pkg.sentAt ?? pkg.createdAt)}</span></>}
        pills={<><Pill tone={kt(st.tone)} dot>{st.text}</Pill><LockTag type={pkg.lockPolicy.type} /></>}
      />
      <KeyStats items={[
        ['گیرندگان', `${faDigits(n)} نفر`],
        ['هر نفر', pkg.amountPerPerson ? cmp(pkg.amountPerPerson) : '—'],
        ['جمع بسته', pkg.total ? cmp(pkg.total) : '—'],
      ]} />

      {live && (
        <Section title="پذیرش کارکنان" action={<span className="num" style={{ color: 'var(--text-primary)' }}>{faDigits(acc)} از {faDigits(n)} نفر</span>}>
          <Meter value={n ? acc / n : 0} tone={n && acc === n ? 'success' : 'primary'} label={`${faDigits(acc)} از ${faDigits(n)} نفر پذیرفته‌اند`} />
          <span className="mute" style={{ fontSize: 12.5 }}>{pend.length ? `${faDigits(pend.length)} نفر در انتظار پذیرش · ${cmp(pendSum)} تومان` : 'همه‌ی گیرندگان پذیرفته‌اند'}</span>
        </Section>
      )}

      {ms && live && (
        <Section title="آزادسازی مرحله‌ای" action={<span className="num" style={{ color: 'var(--text-primary)' }}>{faDigits(ms.relN)} از {faDigits(ms.steps.length)} مرحله</span>}>
          <FreeLocked free={released} locked={pkg.total - released} fmt={cmp} />
          {ms.pending && <span className="mute" style={{ fontSize: 12.5 }}>مرحله {faDigits(ms.pendingIdx)} «{ms.pending.title}» در انتظار تأیید شماست</span>}
        </Section>
      )}

      <Section title="مشخصات">
        <KV rows={[
          ['سیاست قفل', pkg.lockPolicy.type === 'none' ? 'بدون قفل · همه آزاد' : policySub(pkg)],
          ['تخصیص', allocationText(pkg)],
          ['برداشت نقدی', pkg.cashAllowed ? 'مجاز' : 'غیرمجاز'],
          ['ایجاد', <span key="c" className="num">{jDate(pkg.createdAt)}</span>],
          ['ارسال', <span key="s" className="num">{pkg.sentAt ? jDate(pkg.sentAt) : '—'}</span>],
          ['مهلت پذیرش', <span key="e" className="num">{pkg.expiresAt ? jDate(pkg.expiresAt) : '۳۰ روز پس از ارسال'}</span>],
        ]} />
      </Section>
    </Inspector>
  );
}
