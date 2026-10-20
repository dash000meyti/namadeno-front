'use client';
/** Horizontal stepper used by the send wizard (3 steps) and the package detail status (4 steps). */
import Link from 'next/link';
import { Fragment } from 'react';
import { Icon } from '@/components/ui/Icon';
import { PageHeading } from '@/components/panel/PanelShell';
import { routes } from '@/lib/routes';
import { faDigits } from '@/lib/format';
import { useOrgCrumb } from './ui';

export interface StepDef { label: string; sub: string; state: 'done' | 'current' | 'pending'; href?: string; numSub?: boolean }

export function Stepper({ steps, emphasizeDone = false }: { steps: StepDef[]; emphasizeDone?: boolean }) {
  return (
    <div style={{ height: 40, flex: 'none', display: 'flex', alignItems: 'center', gap: 12, padding: '0 8px' }}>
      {steps.map((s, i) => {
        const done = s.state === 'done';
        const cur = s.state === 'current';
        const inner = (
          <>
            <span style={{ width: 28, height: 28, borderRadius: '50%', display: 'grid', placeItems: 'center', flex: 'none', background: done || cur ? 'var(--primary-main)' : 'var(--step-pending)', color: done || cur ? '#FFFFFF' : 'var(--step-pending-text)', fontSize: 12, fontWeight: 700, boxShadow: cur ? '0 0 0 4px var(--soft-primary)' : 'none' }}>
              {done ? <Icon d="M5 12.5l4.5 4.5L19 7" size={16} strokeWidth={2.2} /> : <span>{faDigits(i + 1)}</span>}
            </span>
            <span style={{ display: 'flex', flexDirection: 'column', lineHeight: 1.2 }}>
              <span style={{ fontSize: 13, fontWeight: cur ? 700 : done ? 600 : emphasizeDone ? 600 : 500, color: cur ? 'var(--primary-text)' : done || emphasizeDone ? 'var(--text-primary)' : 'var(--text-secondary)', whiteSpace: 'nowrap' }}>{s.label}</span>
              <span className={s.numSub ? 'num' : undefined} style={{ fontSize: 11, color: 'var(--text-secondary)', whiteSpace: 'nowrap', fontWeight: 400 }}>{s.sub}</span>
            </span>
          </>
        );
        return (
          <Fragment key={i}>
            {s.href && !cur ? (
              <Link href={s.href} style={{ display: 'flex', alignItems: 'center', gap: 10, flex: 'none', color: 'inherit', textDecoration: 'none' }}>{inner}</Link>
            ) : (
              <div aria-current={cur ? 'step' : undefined} style={{ display: 'flex', alignItems: 'center', gap: 10, flex: 'none' }}>{inner}</div>
            )}
            {i < steps.length - 1 && <span style={{ flex: 1, height: 2, borderRadius: 1, background: done ? 'var(--primary-main)' : 'var(--divider)' }} />}
          </Fragment>
        );
      })}
    </div>
  );
}

/**
 * Shared header of the send wizard: title + breadcrumb + «مرحله n از ۳» + cancel + the 3-step stepper.
 * `step` 1..3 is the current step, 4 = sent (all done).
 */
export function WizardHeader({ step, crumb, draftId, recipientsSub, badge, badgeTone = 'default', hideCancel }: {
  step: 1 | 2 | 3 | 4;
  crumb: string;
  draftId?: string;
  recipientsSub?: string;
  badge?: string;
  badgeTone?: 'default' | 'success';
  hideCancel?: boolean;
}) {
  const orgCrumb = useOrgCrumb();
  const st = (n: number): StepDef['state'] => (n < step ? 'done' : n === step ? 'current' : 'pending');
  const steps: StepDef[] = [
    { label: 'گیرندگان', sub: step === 1 ? 'مرحله فعلی' : recipientsSub ?? 'انتخاب کارکنان', state: st(1), href: draftId && step < 4 ? routes.org.newRecipients(draftId) : undefined },
    { label: 'تنظیمات بسته', sub: step === 2 ? 'مرحله فعلی' : 'مبلغ، تخصیص، قفل', state: st(2), href: draftId && step < 4 && step !== 1 ? routes.org.newSettings(draftId) : undefined },
    { label: 'بررسی و ارسال', sub: step === 3 ? 'مرحله فعلی' : 'تأیید و ارسال به کارکنان', state: st(3) },
  ];
  return (
    <>
      <PageHeading title="ارسال بسته دارایی" crumbs={[orgCrumb, { label: 'بسته‌های دارایی', href: routes.org.packages }, { label: crumb }]}>
        <span className="lbl" style={{ background: badgeTone === 'success' ? 'var(--soft-success)' : 'var(--soft-default)', color: badgeTone === 'success' ? 'var(--success-text)' : 'var(--default-text)' }}>
          {badge ?? `مرحله ${faDigits(Math.min(step, 3))} از ۳`}
        </span>
        {!hideCancel && <Link href={routes.org.packages} className="btn" style={{ background: 'transparent', color: 'var(--text-secondary)', padding: '0 10px', textDecoration: 'none' }}>انصراف</Link>}
      </PageHeading>
      <Stepper steps={steps} />
    </>
  );
}
