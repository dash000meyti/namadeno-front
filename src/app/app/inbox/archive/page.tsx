'use client';
/** Accepted packages (design: app-inbox-archive) — one card per package, milestone progress, mixed → choose fund sheet. */
import { useState } from 'react';
import Link from 'next/link';
import { useInbox, usePortfolio } from '@/api/app';
import { AppHeader, HeaderIconButton } from '@/components/app/AppHeader';
import { BottomNav } from '@/components/app/BottomNav';
import { ErrorState, Scr, Skeleton } from '@/components/app/Screen';
import { Icon } from '@/components/ui/Icon';
import { Sheet } from '@/components/ui/Sheet';
import { PARTS, P, policyTag, splitPct, type PartKey } from '@/components/app/core/meta';
import { EmptyCard, InboxTabs } from '@/components/app/core/ui';
import { faDigits, jDate, money } from '@/lib/format';
import { now } from '@/lib/clock';
import { routes } from '@/lib/routes';
import type { InboxPackage, Lock, Portfolio } from '@/types/domain';

interface Row {
  pkg: InboxPackage;
  alloc: { key: PartKey; w: number; color: string }[];
  locked: number;
  free: number;
  cond: string;
  ms: boolean;
  msPct: number;
  mix: boolean;
  href: string;
}

function locksOf(pf: Portfolio | undefined, pkg: InboxPackage): Lock[] {
  return (pf?.holdings ?? []).flatMap((h) => h.locks).filter((l) => l.sourceId === pkg.packageId);
}

function buildRow(pkg: InboxPackage, pf: Portfolio | undefined): Row {
  const split = pkg.acceptedSplit ?? pkg.fixedSplit ?? { gold: 0, fixed: 0 };
  const alloc = PARTS.map((p) => ({ key: p.key, w: splitPct(split, p.key), color: p.color })).filter((a) => a.w > 0);
  const locks = locksOf(pf, pkg);
  const locked = Math.min(pkg.amount, locks.reduce((s, l) => s + l.amount, 0));
  const free = pkg.amount - locked;
  const lp = pkg.lockPolicy;
  const ms = lp.type === 'milestone';
  let msPct = 0;
  if (ms) {
    const steps = locks.find((l) => l.type === 'milestone')?.steps;
    msPct = steps ? steps.filter((s) => s.status === 'released').reduce((a, s) => a + s.sharePct, 0) : locked === 0 ? 100 : Math.round((free / pkg.amount) * 100);
  }
  const g = splitPct(split, 'gold');
  const fx = splitPct(split, 'fixed');
  const mainFund = g >= fx ? 'صندوق طلا' : 'صندوق درآمد ثابت';
  const cond = lp.type === 'none' ? 'همه آزاد' : lp.type === 'vesting' ? (locked > 0 ? 'آزاد در ' + jDate(lp.releaseAt) : 'همه آزاد شد') : 'در ' + mainFund;
  const mix = !ms && g > 0 && fx > 0;
  const onlyRial = g === 0 && fx === 0;
  const href = onlyRial ? routes.app.asset('rial') : fx > 0 && g === 0 ? routes.app.asset('fixed') : routes.app.asset('gold');
  return { pkg, alloc, locked, free, cond, ms, msPct, mix, href };
}

export default function InboxArchivePage() {
  const accepted = useInbox('accepted');
  const pending = useInbox('pending');
  const pf = usePortfolio();
  const [mixSel, setMixSel] = useState<Row | null>(null);

  const rows = (accepted.data ?? []).map((p) => buildRow(p, pf.data));
  const sumT = rows.reduce((s, r) => s + r.pkg.amount, 0);
  const sumL = rows.reduce((s, r) => s + r.locked, 0);
  const freePct = sumT ? Math.round(((sumT - sumL) / sumT) * 1000) / 10 : 100;
  const years = Array.from(new Set(rows.map((r) => jDate(r.pkg.acceptedAt ?? r.pkg.sentAt).slice(0, 4))));
  const yearLabel = years.length === 1 ? years[0] : jDate(now()).slice(0, 4);

  return (
    <>
      <Scr gap={10}>
        <InboxTabs active="accepted" pending={pending.data?.length} accepted={accepted.data?.length} />

        {accepted.isLoading ? (
          <>
            <Skeleton h={84} />
            <Skeleton h={88} />
            <Skeleton h={88} />
          </>
        ) : accepted.isError ? (
          <ErrorState message="دریافت فهرست ممکن نشد" onRetry={() => accepted.refetch()} />
        ) : rows.length === 0 ? (
          <EmptyCard d={P.inbox} tone="primary" title="هنوز بسته‌ای تأیید نکرده‌اید" text="بسته‌هایی که تأیید می‌کنید، با وضعیت آزاد و قفل‌شده‌شان اینجا می‌مانند." />
        ) : (
          <>
            {/* summary: free vs locked of confirmed packages */}
            <div className="card" style={{ boxSizing: 'border-box', padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 8, flex: 'none' }}>
              <div style={{ height: 22, display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>دریافتی‌های تأیید‌شده {years.length <= 1 ? yearLabel : ''}</span>
                <span className="num" style={{ marginRight: 'auto', fontSize: 16, whiteSpace: 'nowrap' }}>{money(sumT)} <span style={{ fontSize: 11, fontWeight: 400, color: 'var(--text-secondary)' }}>تومان</span></span>
              </div>
              <div className="lkbar" role="img" aria-label={`آزاد ${money(sumT - sumL)} · قفل ${money(sumL)}`}>
                {sumT - sumL > 0 && <span className="f" style={sumL > 0 ? { width: `${freePct}%` } : { flex: 1 }} />}
                {sumL > 0 && <span className="l" style={{ flex: 1 }} />}
              </div>
              <div className="lkleg">
                <span><span className="lkdot" />آزاد <b>{money(sumT - sumL)}</b></span>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}><Icon d={P.lock} size={12} />قفل <b>{money(sumL)}</b></span>
              </div>
            </div>

            {/* confirmed packages: one card each */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12, flex: 'none' }}>
              {rows.map((r) => <ArchiveCard key={r.pkg.id} r={r} onMix={() => setMixSel(r)} />)}
            </div>
          </>
        )}
      </Scr>

      <Sheet
        open={!!mixSel}
        onClose={() => setMixSel(null)}
        title={mixSel?.pkg.title}
        subtitle={mixSel ? <span className="num">{money(mixSel.pkg.amount)} تومان · ترکیبی</span> : undefined}
        padding="0 16px 28px"
      >
        {mixSel && <MixSheetBody r={mixSel} />}
      </Sheet>

      <AppHeader title="دریافتی‌ها" actions={<HeaderIconButton first icon="clock" href={routes.app.history('inbox')} label="تاریخچه کامل" />} />
      <BottomNav active="inbox" />
    </>
  );
}

function ArchiveCard({ r, onMix }: { r: Row; onMix: () => void }) {
  const t = policyTag(r.pkg.lockPolicy);
  const date = jDate(r.pkg.acceptedAt ?? r.pkg.sentAt);
  const allocAria = r.alloc.map((a) => `${PARTS.find((p) => p.key === a.key)?.short} ${faDigits(a.w)}٪`).join(' · ');
  const msAria = `آزاد شده ${money(r.free)} از ${money(r.pkg.amount)}`;
  const inner = (
    <>
      <span style={{ width: 40, height: 40, borderRadius: 12, background: 'var(--soft-primary)', color: 'var(--primary-text)', display: 'grid', placeItems: 'center', fontSize: 16, fontWeight: 800, flex: 'none' }}>{r.pkg.orgName.charAt(0)}</span>
      <span className="col" style={{ flex: 1, gap: 10, lineHeight: 1.3 }}>
        <span style={{ fontSize: 14, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{r.pkg.title}</span>
        <span className="num" style={{ fontSize: 11, fontWeight: 400, color: 'var(--text-secondary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{date} · {r.cond}</span>
        {r.ms ? (
          <span role="img" aria-label={msAria} style={{ display: 'block', width: 120, height: 6, borderRadius: 3, overflow: 'hidden', background: 'repeating-linear-gradient(135deg, var(--warning-main) 0 2px, rgb(var(--warning-main-rgb) / .2) 2px 5px)' }}>
            <span style={{ display: 'block', width: `${r.msPct}%`, height: '100%', borderRadius: 3, background: 'var(--warning-main)' }} />
          </span>
        ) : (
          <span role="img" aria-label={allocAria} style={{ height: 6, display: 'flex', width: 120, borderRadius: 3, overflow: 'hidden' }}>
            {r.alloc.map((a) => <span key={a.key} style={{ flex: a.w, height: 6, background: a.color }} />)}
          </span>
        )}
      </span>
      {r.ms ? (
        <span className="col" aria-label={msAria} style={{ alignItems: 'flex-start', gap: 6, flex: 'none', lineHeight: 1.35 }}>
          <span className="num" style={{ fontSize: 12, color: 'var(--text-secondary)', textDecoration: 'line-through', whiteSpace: 'nowrap' }}>{money(r.pkg.amount)}</span>
          <span className="num" style={{ fontSize: 15, fontWeight: 500, whiteSpace: 'nowrap' }}>{money(r.free)}</span>
          <span className="num" style={{ fontSize: 12, fontWeight: 700, color: 'var(--primary-text)', whiteSpace: 'nowrap' }}>{faDigits(r.msPct)}٪ آزاد شده</span>
        </span>
      ) : (
        <span className="col" style={{ alignItems: 'flex-start', gap: 10, flex: 'none' }}>
          <span className="num" style={{ fontSize: 15, fontWeight: 400, whiteSpace: 'nowrap' }}>{money(r.pkg.amount)}</span>
          <span className="lktype" style={{ height: 20, padding: '0 6px', background: t.bg, color: t.fg }}><Icon d={t.d} size={12} />{t.label}</span>
        </span>
      )}
    </>
  );
  const rowStyle = { boxSizing: 'border-box', padding: '12px 0', display: 'flex', alignItems: 'center', gap: 14, color: 'var(--text-primary)', textDecoration: 'none' } as const;
  return (
    <div className="card" style={{ padding: '0 14px', display: 'flex', flexDirection: 'column' }}>
      {r.mix ? (
        <button aria-haspopup="dialog" onClick={onMix} style={{ ...rowStyle, width: '100%', border: 0, background: 'transparent', fontFamily: 'inherit', textAlign: 'right', cursor: 'pointer' }}>{inner}</button>
      ) : (
        <Link href={r.href} style={rowStyle}>{inner}</Link>
      )}
    </div>
  );
}

function MixSheetBody({ r }: { r: Row }) {
  const split = r.pkg.acceptedSplit ?? r.pkg.fixedSplit;
  const parts = PARTS.filter((p) => p.key !== 'rial' && splitPct(split, p.key) > 0).map((p) => ({ ...p, w: splitPct(split, p.key), v: Math.round((r.pkg.amount * splitPct(split, p.key)) / 100) }));
  return (
    <>
      <span role="img" aria-label={parts.map((p) => `${p.short} ${faDigits(p.w)}٪`).join(' · ')} style={{ height: 8, display: 'flex', borderRadius: 4, overflow: 'hidden', flex: 'none' }}>
        {parts.map((p) => <span key={p.key} style={{ flex: p.w, background: p.color }} />)}
      </span>
      <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)' }}>کدام صندوق را می‌خواهید ببینید؟</span>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {parts.map((p) => (
          <Link key={p.key} href={routes.app.asset(p.key)} style={{ minHeight: 64, boxSizing: 'border-box', padding: '12px 14px', borderRadius: 14, border: '1px solid var(--outline-border)', display: 'flex', alignItems: 'center', gap: 12, color: 'var(--text-primary)', textDecoration: 'none' }}>
            <span style={{ width: 40, height: 40, borderRadius: 12, background: p.soft, color: p.fg, display: 'grid', placeItems: 'center', flex: 'none' }}><Icon d={p.icon} size={20} /></span>
            <span style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 4, lineHeight: 1.35 }}>
              <span style={{ fontSize: 14, fontWeight: 600 }}>{p.name}</span>
              <span className="num" style={{ fontSize: 12, color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>{money(p.v)} تومان</span>
            </span>
            <span className="lbl" style={{ background: p.soft, color: p.fg }}>{faDigits(p.w)}٪</span>
            <Icon d={P.chevLeft} size={18} style={{ color: 'var(--text-disabled)' }} />
          </Link>
        ))}
      </div>
    </>
  );
}
