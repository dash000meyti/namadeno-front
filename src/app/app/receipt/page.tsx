'use client';
/** /app/receipt?tx=<id> — design: app-done (operation receipt). */
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Suspense } from 'react';
import { usePortfolio, useTransaction } from '@/api/app';
import { AppHeader } from '@/components/app/AppHeader';
import { BottomNav } from '@/components/app/BottomNav';
import { ErrorState, Scr, Skeleton } from '@/components/app/Screen';
import { Icon } from '@/components/ui/Icon';
import { useToast } from '@/components/ui/Toast';
import { jDateTime, money, units as fmtUnits } from '@/lib/format';
import { routes } from '@/lib/routes';
import type { Transaction } from '@/types/domain';
import { STATUS_LABEL, TONE, assetMeta, downloadText, receiptText, shareText } from '@/components/app/money/lib';
import '@/components/app/money/money.css';

export default function ReceiptPage() {
  return (
    <Suspense fallback={null}>
      <ReceiptScreen />
    </Suspense>
  );
}

function sourceOf(tx: Transaction): string {
  if (tx.category === 'trade') return tx.amount < 0 ? 'کیف پول ریالی · بخش آزاد' : assetMeta(tx.holdingKind ?? 'gold').name + ' · بخش آزاد';
  if (tx.category === 'rial') return tx.amount < 0 ? 'کیف پول ریالی · بخش آزاد' : 'کارت بانکی · درگاه شاپرک';
  return tx.subtitle;
}

function ReceiptScreen() {
  const sp = useSearchParams();
  const id = sp.get('tx') ?? '';
  const q = useTransaction(id);
  const pf = usePortfolio();
  const toast = useToast();
  const tx = q.data;
  const rialFree = pf.data?.holdings.find((h) => h.kind === 'rial')?.free;

  const header = <AppHeader title="رسید عملیات" back={routes.app.home} backIcon="close" backLabel="بستن" />;

  if (!id || q.isError || !tx) {
    return (
      <div className="pg-money">
        <Scr gap={16}>
          {!id || q.isError ? (
            <ErrorState message={!id ? 'رسیدی برای نمایش انتخاب نشده است.' : q.error?.message} onRetry={id ? () => void q.refetch() : undefined} />
          ) : (
            <>
              <Skeleton h={150} />
              <Skeleton h={320} />
            </>
          )}
        </Scr>
        {header}
        <BottomNav active="assets" />
      </div>
    );
  }

  const st = STATUS_LABEL[tx.status];
  const ok = tx.status === 'success';
  const pending = tx.status === 'pending';
  const headTone = ok ? TONE.success : pending ? TONE.warning : TONE.error;
  const rows: { k: string; v: string; ltr?: boolean }[] = [
    { k: 'کد پیگیری', v: tx.trackingCode, ltr: true },
    { k: 'تاریخ', v: jDateTime(tx.at) },
    { k: 'شرح', v: tx.title },
    { k: 'منبع', v: sourceOf(tx) },
    ...(tx.units ? [{ k: 'واحد', v: fmtUnits(Math.abs(tx.units)) }] : []),
    ...(tx.details ?? []).map((d) => ({ k: d.label, v: d.value, ltr: /^IR/.test(d.value) || /^T\+/.test(d.value) })),
    ...(rialFree !== undefined ? [{ k: 'مانده آزاد کیف پول', v: money(rialFree) + ' تومان' }] : []),
  ];

  const onShare = async () => {
    const r = await shareText('رسید عملیات', receiptText(tx));
    if (r === 'copied') toast('متن رسید کپی شد');
    else if (r === 'failed') toast('اشتراک‌گذاری انجام نشد', 'error');
  };

  return (
    <div className="pg-money">
      <Scr gap={16}>
        {/* status block */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, paddingTop: 12, lineHeight: 1.2, flex: 'none' }}>
          <span className="mn-pop" style={{ width: 72, height: 72, borderRadius: '50%', background: headTone[0], color: headTone[1], display: 'grid', placeItems: 'center' }}>
            <Icon name={ok ? 'check' : pending ? 'clock' : 'close'} size={36} strokeWidth={2} />
          </span>
          <h2 style={{ margin: 0, fontSize: 20, fontWeight: 700 }}>{ok ? 'با موفقیت انجام شد' : pending ? 'درخواست شما ثبت شد' : 'عملیات ناموفق بود'}</h2>
          <span style={{ fontSize: 12, color: 'var(--text-secondary)', textAlign: 'center', lineHeight: 1.5 }}>
            {pending ? 'پس از تسویه، وضعیت در تاریخچه به‌روز می‌شود.' : 'عملیات شما ثبت شد و در تاریخچه قابل مشاهده است.'}
          </span>
        </div>

        {/* receipt */}
        <div className="card" style={{ position: 'relative', boxSizing: 'border-box', padding: '14px 16px 10px', display: 'flex', flexDirection: 'column', gap: 6, flex: 'none' }}>
          <div className="row" style={{ height: 24, gap: 8 }}>
            <Icon name="receipt" size={18} style={{ color: 'var(--text-secondary)' }} />
            <span style={{ fontSize: 13, fontWeight: 700 }}>رسید عملیات</span>
            <span className="lbl" style={{ marginRight: 'auto', background: TONE[st.tone][0], color: TONE[st.tone][1] }}>{st.label}</span>
          </div>
          <div className="col" style={{ gap: 2, lineHeight: 1.2, padding: '6px 0 8px', borderBottom: '1px dashed var(--divider)' }}>
            <span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>مبلغ</span>
            <span className="num" style={{ fontSize: 30, whiteSpace: 'nowrap' }}>{money(Math.abs(tx.amount))} <span style={{ fontSize: 13, fontWeight: 400, color: 'var(--text-secondary)' }}>تومان</span></span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            {rows.map((r, i) => (
              <div key={r.k + i} className="row" style={{ minHeight: 40, gap: 8, borderBottom: `1px dashed ${i === rows.length - 1 ? 'transparent' : 'var(--divider)'}` }}>
                <span style={{ fontSize: 12, color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>{r.k}</span>
                <span dir={r.ltr ? 'ltr' : 'rtl'} className="num" style={{ marginRight: 'auto', fontSize: 14, fontWeight: 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', minWidth: 0 }}>{r.v}</span>
              </div>
            ))}
          </div>
          <div style={{ height: 44, display: 'flex', gap: 8, paddingTop: 4 }}>
            <button onClick={() => void onShare()} style={{ flex: 1, height: 40, border: '1px solid var(--outline-border)', borderRadius: 8, background: 'transparent', color: 'var(--text-primary)', fontFamily: 'inherit', fontSize: 13, fontWeight: 600, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
              <Icon name="share" size={18} />اشتراک رسید
            </button>
            <button onClick={() => downloadText(`receipt-${tx.trackingCode}.txt`, receiptText(tx))} style={{ flex: 1, height: 40, border: '1px solid var(--outline-border)', borderRadius: 8, background: 'transparent', color: 'var(--text-primary)', fontFamily: 'inherit', fontSize: 13, fontWeight: 600, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
              <Icon name="download" size={18} />دانلود
            </button>
          </div>
        </div>

        <div style={{ marginTop: 'auto', display: 'flex', flexDirection: 'column', gap: 4, flex: 'none' }}>
          <Link href={routes.app.home} className="btn" style={{ height: 48, display: 'flex', alignItems: 'center', justifyContent: 'center', boxSizing: 'border-box', background: 'var(--primary-main)', color: 'var(--primary-contrast)', boxShadow: 'var(--shadow-primary)', fontSize: 15, textDecoration: 'none' }}>بازگشت به دارایی‌ها</Link>
          <Link href={routes.app.history()} style={{ height: 44, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, fontSize: 14, fontWeight: 600, color: 'var(--primary-text)', textDecoration: 'none' }}>
            مشاهده تاریخچه<Icon name="forward" size={16} />
          </Link>
        </div>
      </Scr>

      {header}
      <BottomNav active="assets" />
    </div>
  );
}
