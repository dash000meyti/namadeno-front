'use client';
/**
 * Shared pieces of the organization «بسته‌های دارایی» pages, built on the panel kit (docs/PANEL-KIT.md):
 *   WizardHeader  heading + Steps of the 3-step send wizard (recipients → settings → review; 4 = sent)
 *   StepMark      the numbered circle of a step (same look as kit Steps) for timelines in lists
 *   LockTag       lock-policy chip; «بدون قفل» stays neutral on the organization screens (meta.lockChip)
 */
import Link from 'next/link';
import type { ReactNode } from 'react';
import { PageHeading, Steps, type StepItem } from '@/components/panel/kit';
import { Icon } from '@/components/ui/Icon';
import { LockTypeChip } from '@/components/ui/LockBar';
import { routes } from '@/lib/routes';
import { faDigits } from '@/lib/format';
import type { LockPolicy } from '@/types/domain';
import { lockChip } from './meta';

export type StepState = 'done' | 'current' | 'pending';

/** Numbered circle of a step: done = check, current = filled ring, pending = quiet. */
export function StepMark({ state, n }: { state: StepState; n: number }) {
  return (
    <span className={'nm-step' + (state === 'done' ? ' done' : state === 'current' ? ' cur' : '')} aria-hidden="true">
      <i>{state === 'done' ? <Icon d="M5 12.5l4.5 4.5L19 7" size={14} strokeWidth={2.4} /> : faDigits(n)}</i>
    </span>
  );
}

export function LockTag({ type, long }: { type: LockPolicy['type']; long?: boolean }) {
  const c = lockChip(type, long);
  return <LockTypeChip type={type} long={long} style={{ background: c.bg, color: c.fg }} />;
}

/**
 * Header of the send wizard: title, crumbs, cancel, then the three steps.
 * `step` 1..3 is the current step, 4 = sent (all done). Done steps link back while the draft exists.
 */
export function WizardHeader({ step, draftId, recipientsSub, sub, hideCancel }: {
  step: 1 | 2 | 3 | 4;
  draftId?: string;
  recipientsSub?: string;
  sub?: ReactNode;
  hideCancel?: boolean;
}) {
  const live = !!draftId && step < 4;
  const steps: StepItem[] = [
    { label: 'گیرندگان', sub: recipientsSub ?? 'انتخاب کارکنان', href: live ? routes.org.newRecipients(draftId) : undefined },
    { label: 'تنظیمات بسته', sub: 'مبلغ، تخصیص، قفل', href: live && step === 3 && draftId ? routes.org.newSettings(draftId) : undefined },
    { label: 'بررسی و ارسال', sub: 'تأیید و ارسال به کارکنان' },
  ];
  return (
    <>
      <PageHeading title="ارسال بسته دارایی" crumbs={[{ label: 'بسته‌های دارایی', href: routes.org.packages }]} sub={sub}>
        {!hideCancel && <Link href={routes.org.packages} className="nm-btn ghost">انصراف</Link>}
      </PageHeading>
      <Steps steps={steps} current={step - 1} />
    </>
  );
}
