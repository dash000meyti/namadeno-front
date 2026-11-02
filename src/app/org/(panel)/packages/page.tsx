'use client';
/**
 * Organization — asset packages. Kit list page: key numbers → list card (status tabs, search, table, pager)
 * → inspector with the package summary. The monthly trend lives in Reports (the «ارسال امسال» number links there).
 * «در صف» = the queue (nothing reaches the recipients or is blocked meanwhile): packages registered with a deposit receipt
 * («در انتظار تأیید واریز», until Namadno approves it — the inspector shows the latest receipt from GET /org/account) and paid
 * packages waiting for Namadno's fund stock («در انتظار تأمین موجودی», sent automatically at the latest by `stockEta`).
 */
import Link from 'next/link';
import { useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { useOrgPackages } from '@/api/org';
import { useOrgAccount } from '@/api/org-money-extra';
import {
  Card, Empty, FreeLocked, Ident, Inspector, KV, KeyStats, Meter, Note, PageHeading, Pill, SearchField, Section, StatStrip,
  Table, TableFoot, Tabs, Tile, Toolbar, Who, usePaging, type Column, type Stat, type Tone,
} from '@/components/panel/kit';
import { Icon } from '@/components/ui/Icon';
import { ReceiptThumb } from '@/components/ui/Receipt';
import { entryState, latestReceiptFor } from '@/components/org/money/meta';
import { LockTag } from '@/components/org/packages/Stepper';
import { I, allocationText, effectiveStatus, isQueued, jParts, milestoneStats, perPersonText, policySub, reasonMeta, splitCompact, statusLabel, type Tone as MetaTone } from '@/components/org/packages/meta';
import { LOCK_META } from '@/lib/locks';
import { routes } from '@/lib/routes';
import { JALALI_MONTHS, faDigits, jDate, jDateTime, money } from '@/lib/format';
import { now } from '@/lib/clock';
import type { OrgPackage } from '@/types/domain';

/** `queued` = «در صف»: waiting for the receipt approval (`awaiting_payment`) or for Namadno's stock (`awaiting_stock`). */
type TabKey = 'all' | 'draft' | 'queued' | 'sent' | 'completed' | 'cancelled';
const PAGE = 8;
const TABS: [TabKey, string][] = [['all', 'همه'], ['draft', 'پیش‌نویس'], ['queued', 'در صف'], ['sent', 'ارسال‌شده'], ['completed', 'تکمیل‌شده'], ['cancelled', 'لغوشده']];
const inTab = (x: OrgPackage, k: TabKey) => k === 'all' || (k === 'queued' ? isQueued(x) : effectiveStatus(x) === k);
/** When the package was registered (sent, submitted with a receipt, queued for stock, or created). */
const regAt = (x: OrgPackage) => x.sentAt ?? x.submittedAt ?? x.stockQueuedAt ?? x.createdAt;
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
    { label: 'ارسال امسال', value: yearSum.value, unit: `${yearSum.unit} تومان`.trim(), note: `${faDigits(yearSent.length)} بسته · ${money(yearRecipients)} گیرنده`, href: routes.org.dashboard },
    { label: 'نرخ پذیرش امسال', value: `${faDigits(acceptPct)}٪`, note: `${money(yearAccepted)} از ${money(yearRecipients)} بسته دریافت شد` },
  ];

  const columns: Column<OrgPackage>[] = [
    {
      key: 'title', label: 'بسته', width: 'minmax(0, 1.6fr)', render: (r) => {
        const rm = reasonMeta(r.reason);
        const pp = perPersonText(r, money);
        const per = pp ? `${pp} هر نفر` : 'مبلغ تعیین نشده';
        return <Ident lead={<Tile d={I.pkg} tone={kt(rm.tone)} />} title={r.title} sub={`${rm.label} · ${per} · ${jDate(regAt(r))}`} />;
      },
    },
    { key: 'n', label: 'گیرندگان', width: '72px', render: (r) => <span className="num">{faDigits(r.recipients.length)} نفر</span> },
    { key: 'total', label: 'مبلغ کل', width: '104px', render: (r) => <span className="num" style={{ fontWeight: 600 }}>{r.total ? cmp(r.total) : '—'}</span> },
    {
      key: 'acc', label: 'پذیرش', width: '96px', col: true, render: (r) => {
        if (r.status === 'draft' || r.status === 'cancelled' || isQueued(r)) return <span style={{ color: 'var(--text-disabled)' }}>—</span>;
        const n = r.recipients.length;
        const acc = r.recipients.filter((x) => x.status === 'accepted').length;
        return (<><span className="num sm">{faDigits(acc)} از {faDigits(n)}</span><Meter value={n ? acc / n : 0} tone={n && acc === n ? 'success' : 'primary'} width={72} thin /></>);
      },
    },
    { key: 'lock', label: 'شیوه‌ی دریافت', width: '132px', col: true, render: (r) => (<><LockTag type={r.lockPolicy.type} />{r.lockPolicy.type !== 'none' && <span className="sm el" style={{ maxWidth: '100%' }}>{policySub(r)}</span>}</>) },
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
          <Tabs
            label="وضعیت بسته" value={tab} onChange={setTab}
            items={TABS.map(([key, label]) => {
              const count = all.filter((x) => inTab(x, key)).length;
              return { key, label, count, hot: key === 'queued' && count > 0 };
            })}
          />
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
  const awaiting = pkg.status === 'awaiting_payment';
  /** Paid, waiting for Namadno's fund stock: sent automatically at the latest by `stockEta`. */
  const stockWait = pkg.status === 'awaiting_stock';
  const live = !isDraft && !isQueued(pkg) && pkg.status !== 'cancelled';
  const acct = useOrgAccount();
  const rc = latestReceiptFor(acct.data?.entries, pkg.id);
  const rcState = rc ? entryState(rc) : undefined;
  const n = pkg.recipients.length;
  const acc = pkg.recipients.filter((r) => r.status === 'accepted').length;
  const pend = pkg.recipients.filter((r) => r.status === 'pending');
  const pendSum = pend.reduce((s, r) => s + r.amount, 0);
  const ms = pkg.lockPolicy.type === 'milestone' ? milestoneStats(pkg) : null;
  const released = ms ? Math.round((pkg.total * ms.relPct) / 100) : 0;
  const reclaimed = ms ? Math.round((pkg.total * ms.backPct) / 100) : 0; // returned to the organization («بازپس‌گیری»)
  const detail = routes.org.package(pkg.id);

  return (
    <Inspector
      open onClose={onClose} title="جزئیات بسته" label={`جزئیات بسته ${pkg.title}`} href={detail} hrefLabel="صفحه کامل"
      footer={isDraft ? (
        <>
          <Link href={detail} className="nm-btn ghost">جزئیات</Link>
          <Link href={routes.org.newSettings(pkg.id)} className="nm-btn">ادامه ارسال<Icon d={I.chevL} size={16} /></Link>
        </>
      ) : awaiting ? (
        <Link href={detail} className={rc?.status === 'rejected' ? 'nm-btn' : 'nm-btn ghost'}>{rc?.status === 'rejected' ? 'بارگذاری فیش تازه' : 'جزئیات و فیش واریز'}<Icon d={I.chevL} size={16} /></Link>
      ) : <Link href={detail} className="nm-btn ghost">جزئیات و گیرندگان<Icon d={I.chevL} size={16} /></Link>}
    >
      <Who
        lead={<Tile d={I.pkg} tone={kt(rm.tone)} size="xl" />}
        title={pkg.title}
        sub={<>{rm.label} · {pkg.sentAt ? 'ارسال' : isQueued(pkg) ? 'ثبت' : 'ایجاد'} <span className="num">{jDate(regAt(pkg))}</span></>}
        pills={<><Pill tone={kt(st.tone)} dot>{st.text}</Pill><LockTag type={pkg.lockPolicy.type} /></>}
      />
      <KeyStats items={[
        ['گیرندگان', `${faDigits(n)} نفر`],
        ['هر نفر', perPersonText(pkg, cmp) || '—'],
        ['جمع بسته', pkg.total ? cmp(pkg.total) : '—'],
      ]} />

      {awaiting && (
        <Section title="فیش واریز" action={rcState && <Pill tone={rcState.tone}>{rc?.status === 'expected' ? 'در انتظار تأیید نمادنو' : rcState.label}</Pill>}>
          {rc && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <ReceiptThumb receipt={rc.receipt} size={44} />
              <span style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
                <b className="num" style={{ fontSize: 13.5 }}>{money(rc.amount)} تومان</b>
                <span className="mute num" style={{ fontSize: 12 }}>{jDate(rc.at)}{rc.note ? ` · ${faDigits(rc.note)}` : ''}</span>
              </span>
            </div>
          )}
          <span className="mute" style={{ fontSize: 12.5, lineHeight: 1.7 }}>
            {rc?.status === 'rejected'
              ? <span style={{ color: 'var(--error-text)' }}>فیش رد شد{rc.rejectReason ? `: ${rc.rejectReason}` : ''} · در صفحه‌ی بسته فیش تازه بارگذاری کنید.</span>
              : 'همکاران هنوز از این بسته باخبر نشده‌اند؛ پس از تأیید فیش توسط نمادنو برای آن‌ها ارسال می‌شود.'}
          </span>
        </Section>
      )}

      {stockWait && (
        <Note tone="info" icon={I.clock}>
          پرداخت شده · موجودی صندوق نمادنو در حال تأمین است؛ حداکثر تا <span className="num">{pkg.stockEta ? jDateTime(pkg.stockEta) : '—'}</span> برای همکاران ارسال می‌شود.
        </Note>
      )}

      {live && (
        <Section title="پذیرش کارکنان" action={<span className="num" style={{ color: 'var(--text-primary)' }}>{faDigits(acc)} از {faDigits(n)} نفر</span>}>
          <Meter value={n ? acc / n : 0} tone={n && acc === n ? 'success' : 'primary'} label={`${faDigits(acc)} از ${faDigits(n)} نفر پذیرفته‌اند`} />
          <span className="mute" style={{ fontSize: 12.5 }}>{pend.length ? `${faDigits(pend.length)} نفر در انتظار پذیرش · ${cmp(pendSum)} تومان` : 'همه‌ی گیرندگان پذیرفته‌اند'}</span>
        </Section>
      )}

      {ms && live && (
        <Section title={LOCK_META.milestone.label} action={<span className="num" style={{ color: 'var(--text-primary)' }}>{faDigits(ms.relN)} از {faDigits(ms.steps.length)} مرحله</span>}>
          <FreeLocked free={released} locked={pkg.total - released - reclaimed} fmt={cmp} />
          {ms.pending && <span className="mute" style={{ fontSize: 12.5 }}>مرحله {faDigits(ms.pendingIdx)} «{ms.pending.title}» در انتظار تأیید شماست</span>}
        </Section>
      )}

      <Section title="مشخصات">
        <KV rows={[
          ['شیوه‌ی دریافت', pkg.lockPolicy.type === 'none' ? LOCK_META.none.label : `${LOCK_META[pkg.lockPolicy.type].label} · ${policySub(pkg)}`],
          ['تخصیص', allocationText(pkg)],
          ['ایجاد', <span key="c" className="num">{jDate(pkg.createdAt)}</span>],
          ...(awaiting ? [['ثبت با فیش واریز', <span key="w" className="num">{pkg.submittedAt ? jDate(pkg.submittedAt) : '—'}</span>] as [string, ReactNode]] : []),
          ...(stockWait ? [['ثبت', <span key="w" className="num">{jDate(pkg.stockQueuedAt ?? pkg.submittedAt ?? pkg.createdAt)}</span>] as [string, ReactNode]] : []),
          ['ارسال', <span key="s" className="num">{pkg.sentAt ? jDate(pkg.sentAt) : awaiting ? 'پس از تأیید فیش' : stockWait && pkg.stockEta ? `تا ${jDateTime(pkg.stockEta)}` : '—'}</span>],
          ['مهلت پذیرش', <span key="e" className="num">{pkg.expiresAt ? jDate(pkg.expiresAt) : '۳۰ روز پس از ارسال'}</span>],
        ]} />
      </Section>
    </Inspector>
  );
}
