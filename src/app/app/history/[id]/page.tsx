'use client';
/** /app/history/[id] — design: app-transaction (transaction detail). */
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useHolding, useTransaction } from '@/api/app';
import { AppHeader } from '@/components/app/AppHeader';
import { BottomNav } from '@/components/app/BottomNav';
import { ErrorState, Scr, Skeleton } from '@/components/app/Screen';
import { Icon } from '@/components/ui/Icon';
import { LOCK_META } from '@/lib/locks';
import { faDigits, jDateTime, jDayMonth, money, pct, signedMoney, time, units as fmtUnits } from '@/lib/format';
import { routes } from '@/lib/routes';
import type { Lock } from '@/types/domain';
import { CATEGORY_LABEL, D, STATUS_LABEL, TONE, assetMeta, downloadText, milestoneProgress, receiptText, stepView, txVisual } from '@/components/app/money/lib';
import '@/components/app/money/money.css';

export default function TransactionPage() {
  const params = useParams<{ id: string }>();
  const id = Array.isArray(params.id) ? params.id[0] : params.id;
  const q = useTransaction(id ?? '');
  const tx = q.data;
  const hq = useHolding(tx?.lockType === 'milestone' && tx.holdingKind ? tx.holdingKind : 'gold');
  const msLock: Lock | undefined = tx?.lockType === 'milestone' ? hq.data?.holding.locks.find((l) => l.type === 'milestone') : undefined;

  const header = <AppHeader title="جزئیات تراکنش" back={routes.app.history()} />;

  if (!tx) {
    return (
      <div className="pg-money">
        <Scr gap={12}>
          {q.isError ? <ErrorState message={q.error?.message} onRetry={() => void q.refetch()} /> : <><Skeleton h={190} /><Skeleton h={80} /><Skeleton h={240} /></>}
        </Scr>
        {header}
        <BottomNav active="history" />
      </div>
    );
  }

  const v = txVisual(tx);
  const isLockEvent = !!tx.lockEvent && tx.category !== 'inbox';
  const released = tx.lockEvent === 'released';
  const headAmount = isLockEvent ? (released ? '+' : '') + money(Math.abs(tx.amount)) : signedMoney(tx.amount);
  const headColor = isLockEvent ? v.amountColor : tx.amount > 0 ? 'var(--success-text)' : 'var(--text-primary)';
  const place = tx.holdingKind ? assetMeta(tx.holdingKind).name : tx.subtitle;
  const lm = tx.lockType ? LOCK_META[tx.lockType] : undefined;
  const statusLabel = isLockEvent ? (released ? 'آزاد شد' : 'قفل شد') : STATUS_LABEL[tx.status].label;
  const statusTone = isLockEvent ? (released ? TONE.success : TONE.info) : TONE[STATUS_LABEL[tx.status].tone];

  const when = `${jDayMonth(tx.at)} · ${time(tx.at)}`;
  const labels = isLockEvent ? (released ? ['تأیید سازمان', 'آزادسازی', 'قابل استفاده'] : ['ثبت', 'قفل', 'فعال']) : ['ثبت', 'تأیید', 'تسویه'];
  const steps = labels.map((label, i) => {
    const last = i === labels.length - 1;
    const state: 'done' | 'pending' | 'failed' = last && tx.status === 'pending' ? 'pending' : last && tx.status === 'failed' ? 'failed' : 'done';
    return { label, when: state === 'pending' ? 'در انتظار' : state === 'failed' ? 'ناموفق' : when, state };
  });

  const rows: { k: string; v: string; ltr?: boolean; chip?: boolean; ico?: string }[] = isLockEvent
    ? [
        ...(lm ? [{ k: 'نوع قفل', v: lm.label, chip: true, ico: lm.d }] : []),
        { k: 'دارایی', v: place + (tx.units ? '، ' + fmtUnits(Math.abs(tx.units)) + ' واحد' : '') },
        { k: released ? 'مبلغ آزادشده' : 'مبلغ قفل‌شده', v: money(Math.abs(tx.amount)) + ' تومان' },
        { k: released ? 'شرح' : 'شرط آزادسازی', v: tx.subtitle },
        ...(msLock ? [{ k: 'باقی‌مانده قفل', v: money(msLock.amount) + ' تومان' }] : []),
        { k: 'کد پیگیری', v: tx.trackingCode, ltr: true },
      ]
    : [
        { k: 'کد پیگیری', v: tx.trackingCode, ltr: true },
        { k: 'دسته‌بندی', v: CATEGORY_LABEL[tx.category], chip: true },
        ...(tx.holdingKind ? [{ k: 'دارایی', v: assetMeta(tx.holdingKind).name }] : []),
        ...(tx.units ? [{ k: 'واحد', v: fmtUnits(tx.units) }] : []),
        { k: 'شرح', v: tx.subtitle },
        ...(tx.details ?? []).map((d) => ({ k: d.label, v: d.value, ltr: /^IR/.test(d.value) || /^T\+/.test(d.value) })),
        ...(lm ? [{ k: 'قفل', v: lm.label, chip: true, ico: lm.d }] : []),
      ];

  return (
    <div className="pg-money">
      <Scr gap={12}>
        {/* head */}
        <div className="card" style={{ boxSizing: 'border-box', padding: '14px 16px 12px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 7, lineHeight: 1.2, flex: 'none' }}>
          <span style={{ width: 56, height: 56, borderRadius: '50%', background: v.bg, color: v.fg, display: 'grid', placeItems: 'center' }}><Icon d={v.d} size={26} /></span>
          <span className="num" style={{ fontSize: 32, whiteSpace: 'nowrap', paddingTop: 4, color: headColor }}>{headAmount} <span style={{ fontSize: 13, fontWeight: 400, color: 'var(--text-secondary)' }}>تومان</span></span>
          <span style={{ fontSize: 15, fontWeight: 700, textAlign: 'center' }}>{tx.title}</span>
          <span className="num" style={{ fontSize: 12, fontWeight: 400, color: 'var(--text-secondary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '100%' }}>{jDateTime(tx.at)} · {place}</span>
          <span style={{ marginTop: 2, display: 'flex', alignItems: 'center', gap: 6 }}>
            {lm && <span className="lktype" style={{ height: 24, background: lm.bg, color: lm.fg }}><Icon d={lm.d} size={12} />{lm.label}</span>}
            <span className="lbl" style={{ background: statusTone[0], color: statusTone[1] }}>{statusLabel}</span>
          </span>
        </div>

        {/* milestone progress */}
        {msLock && <MilestoneCard lock={msLock} />}

        {/* timeline */}
        <div className="card" style={{ boxSizing: 'border-box', padding: '12px 14px 10px', display: 'flex', flexDirection: 'column', gap: 10, flex: 'none' }}>
          <div style={{ height: 48, display: 'flex', alignItems: 'flex-start' }}>
            {steps.map((s, i) => {
              const c = s.state === 'done' ? 'var(--success-main)' : s.state === 'pending' ? 'var(--warning-main)' : 'var(--error-main)';
              return (
                <div key={s.label} style={{ flex: 1, position: 'relative', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
                  {i > 0 && <span style={{ position: 'absolute', top: 11, right: 'calc(-50% + 16px)', left: 'calc(50% + 16px)', height: 2, borderRadius: 1, background: s.state === 'done' ? 'var(--success-main)' : 'var(--progress-track)' }} />}
                  <span style={{ width: 24, height: 24, boxSizing: 'border-box', borderRadius: '50%', background: s.state === 'pending' ? 'var(--soft-warning)' : c, color: s.state === 'pending' ? 'var(--warning-text)' : s.state === 'done' ? 'var(--success-contrast)' : '#FFFFFF', boxShadow: s.state === 'pending' ? 'inset 0 0 0 1.5px var(--warning-main)' : 'none', display: 'grid', placeItems: 'center' }}>
                    <Icon name={s.state === 'done' ? 'check' : s.state === 'pending' ? 'clock' : 'close'} size={14} strokeWidth={2.2} />
                  </span>
                  <span className="col" style={{ alignItems: 'center', gap: 3, lineHeight: 1 }}>
                    <span style={{ fontSize: 11, fontWeight: 600, whiteSpace: 'nowrap' }}>{s.label}</span>
                    <span className="num" style={{ fontSize: 10, fontWeight: 400, color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>{s.when}</span>
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        {/* details */}
        <div className="card" style={{ boxSizing: 'border-box', padding: '2px 14px', display: 'flex', flexDirection: 'column', flex: 'none' }}>
          {rows.map((r, i) => (
            <div key={r.k + i} className="row" style={{ minHeight: 40, gap: 8, borderBottom: `1px dashed ${i === rows.length - 1 ? 'transparent' : 'var(--divider)'}` }}>
              <span style={{ fontSize: 12, color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>{r.k}</span>
              {r.chip ? (
                <span className="chip" style={{ marginRight: 'auto', height: 24, padding: '0 8px', fontSize: 12, background: 'var(--soft-primary)', color: 'var(--primary-text)' }}>
                  {r.ico && <Icon d={r.ico} size={12} />}{r.v}
                </span>
              ) : (
                <span dir={r.ltr ? 'ltr' : 'rtl'} className="num" style={{ marginRight: 'auto', fontSize: 14, fontWeight: 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', minWidth: 0 }}>{r.v}</span>
              )}
            </div>
          ))}
        </div>

        <div style={{ marginTop: 'auto', height: 48, display: 'flex', gap: 8, flex: 'none' }}>
          <Link href={routes.app.support} style={{ flex: 1, height: 48, boxSizing: 'border-box', border: '1px solid var(--outline-border)', borderRadius: 8, color: 'var(--text-primary)', fontSize: 14, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, textDecoration: 'none' }}>
            <Icon d={D.report} size={18} />گزارش مشکل
          </Link>
          <button className="btn" onClick={() => downloadText(`receipt-${tx.trackingCode}.txt`, receiptText(tx))} style={{ flex: 1, height: 48, background: 'var(--primary-main)', color: 'var(--primary-contrast)', boxShadow: 'var(--shadow-primary)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
            <Icon name="download" size={18} />دانلود رسید
          </button>
        </div>
      </Scr>

      {header}
      <BottomNav active="history" />
    </div>
  );
}

function MilestoneCard({ lock }: { lock: Lock }) {
  const m = milestoneProgress(lock);
  const text = `${faDigits(m.releasedCount)} از ${faDigits(m.count)} مرحله · ${pct(m.releasedPct)} آزاد شده`;
  const steps = lock.steps ?? [];
  const nextIdx = steps.findIndex((s) => s.status !== 'released');
  const next = nextIdx >= 0 ? steps[nextIdx] : undefined;
  return (
    <div className="card" style={{ boxSizing: 'border-box', padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 8, flex: 'none' }}>
      <div style={{ minHeight: 20, display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ fontSize: 13, fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', minWidth: 0 }}>{lock.title}</span>
        <span className="num" style={{ marginRight: 'auto', fontSize: 12, fontWeight: 600, color: 'var(--primary-text)', whiteSpace: 'nowrap' }}>{text}</span>
      </div>
      <div role="img" aria-label={text} style={{ height: 6, display: 'flex', gap: 3 }}>
        {steps.map((s) => {
          const done = s.status === 'released';
          const wait = s.status === 'pending_approval';
          return <span key={s.id} style={{ flex: s.sharePct, height: 6, boxSizing: 'border-box', borderRadius: 3, background: done ? 'var(--primary-main)' : wait ? 'transparent' : 'var(--progress-track)', border: `1px solid ${done ? 'var(--primary-main)' : wait ? 'var(--warning-main)' : 'transparent'}` }} />;
        })}
      </div>
      <div className="lkleg">
        <span><span className="lkdot" />آزاد <b>{money(m.released)}</b></span>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}><Icon name="lock" size={12} />قفل <b>{money(lock.amount)}</b></span>
        <span className="num" style={{ marginRight: 'auto', fontWeight: 400 }}>از {money(m.total)}</span>
      </div>
      {next && (
        <div className="num" style={{ fontSize: 11, fontWeight: 400, color: 'var(--text-secondary)', lineHeight: 1.5 }}>
          بعدی: مرحله {faDigits(nextIdx + 1)} «{next.title}» ({pct(next.sharePct)})، {stepView(next).status}
        </div>
      )}
    </div>
  );
}

