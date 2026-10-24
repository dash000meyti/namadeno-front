'use client';
/**
 * Employee inspector of the employees list (kit Inspector — replaces the old fixed side panel):
 * identity → key numbers → pending milestone → assets with the free/locked split → mix → latest packages; actions in the footer.
 * Also exports the employee status tones and the per-employee package status used by the employee screens.
 */
import Link from 'next/link';
import { useOrgEmployee } from '@/api/org';
import type { EmpFacts } from '@/api/org-people-extra';
import type { Employee, OrgPackage } from '@/types/domain';
import { Allocation, Ava, BigNum, Empty, FreeLocked, Inspector, KV, KeyStats, List, ListRow, Note, Pill, Section, Tile, Who, type Tone } from '@/components/panel/kit';
import { Icon } from '@/components/ui/Icon';
import { LockTypeChip } from '@/components/ui/LockBar';
import { routes } from '@/lib/routes';
import { faDigits, jDayMonth, jMonthYear, money } from '@/lib/format';
import { EMP_STATUS, I, KIND_COLOR, million } from './shared';

/** Employee status → kit tone (labels: EMP_STATUS in ./shared). */
export const EMP_TONE: Record<Employee['status'], Tone> = { active: 'success', invited: 'warning', inactive: 'error' };

/** Status of one employee's share of a package: label, tone and a meta line (amount · date / milestone progress). */
export function pkgStatusFor(p: OrgPackage, employeeId: string): { label: string; tone: Tone; meta: string } {
  const r = p.recipients.find((x) => x.employeeId === employeeId);
  if (p.lockPolicy.type === 'milestone' && r?.status === 'accepted') {
    const steps = p.milestoneProgress ?? [];
    return { label: 'مرحله‌ای', tone: 'primary', meta: `${money(r.amount)} تومان · ${faDigits(steps.filter((s) => s.status === 'released').length)} از ${faDigits(steps.length)} مرحله آزاد` };
  }
  const date = p.sentAt ? jDayMonth(p.sentAt) : '';
  if (r?.status === 'pending') return { label: 'در انتظار تأیید', tone: 'warning', meta: `${money(r.amount)} تومان · ${date}` };
  if (r?.status === 'expired') return { label: 'منقضی', tone: 'neutral', meta: `${money(r.amount)} تومان · ${date}` };
  return { label: 'دریافت‌شده', tone: 'success', meta: `${money(r?.amount ?? p.amountPerPerson)} تومان · ${date}` };
}

/** Body of the «تعلیق حساب» confirmation (employees list and employee profile). */
export function SuspendNotice() {
  return (
    <>
      <span className="mute">با تعلیق، دسترسی کارمند به اپ محدود می‌شود، بسته‌های تأیید‌نشده به حساب سازمان بازمی‌گردند و درخواست‌های وام و اعتبار جدید مسدود می‌شوند. دارایی‌های فعلی او دست‌نخورده می‌ماند.</span>
      <Note tone="warn">تسهیلات فعال کارمند طبق قرارداد ادامه می‌یابد؛ در صورت ۲ قسط معوق، وثیقه نقد می‌شود.</Note>
    </>
  );
}

const inMillion = (n: number) => (n ? `${million(n)} میلیون` : '—');

export function EmployeeInspector({ emp, facts, onClose, onSuspend, onReactivate, onSendPackage, sending, busy }: {
  emp: Employee; facts?: EmpFacts; onClose: () => void; onSuspend: () => void; onReactivate: () => void; onSendPackage: () => void;
  /** a package draft is being created */ sending?: boolean;
  /** a status change is in flight */ busy?: boolean;
}) {
  const detail = useOrgEmployee(emp.id);
  const inactive = emp.status === 'inactive';
  const portfolio = facts?.portfolio ?? emp.portfolioValue;
  const locked = facts?.locked ?? emp.lockedValue;
  const free = Math.max(0, portfolio - locked);
  const pkgs = (detail.data?.packages ?? []).filter((p) => p.sentAt).sort((a, b) => (b.sentAt ?? '').localeCompare(a.sentAt ?? '')).slice(0, 3);
  const ms = facts?.pendingMilestone;
  const alloc = facts?.allocation;

  return (
    <Inspector
      open onClose={onClose} title="پروفایل کارمند" label={`پروفایل ${emp.fullName}`} href={routes.org.employee(emp.id)} hrefLabel="پروفایل کامل"
      footer={(
        <>
          <button type="button" className="nm-btn" disabled={sending || inactive} onClick={onSendPackage}><Icon d={I.pkg} size={17} />{sending ? 'در حال آماده‌سازی…' : 'ارسال بسته'}</button>
          {!inactive
            ? <button type="button" className="nm-btn line danger" onClick={onSuspend}><Icon d={I.ban} size={17} />تعلیق حساب</button>
            : <button type="button" className="nm-btn line ok" disabled={busy} onClick={onReactivate}><Icon d={I.check} size={17} />رفع تعلیق</button>}
        </>
      )}
    >
      <Who
        lead={<Ava letter={emp.avatarLetter} id={emp.id} size="lg" />}
        title={emp.fullName}
        sub={<>واحد {emp.department} · کد پرسنلی <span className="num">{faDigits(emp.employeeCode)}</span></>}
        pills={<Pill tone={EMP_TONE[emp.status]} dot>{EMP_STATUS[emp.status].label}</Pill>}
      />
      <KeyStats items={[['عضو از', jMonthYear(emp.joinedAt)], ['وام فعال', inMillion(facts?.loanActive ?? 0)], ['اعتبار کارت', inMillion(facts?.cardLimit ?? 0)]]} />

      {ms && (
        <Note tone="info" icon={I.flag} action={<Link href={routes.org.package(ms.packageId)} className="nm-btn sm text">بررسی</Link>}>
          مرحله {faDigits(ms.stepIndex)} {ms.packageTitle} در انتظار تأیید شما
        </Note>
      )}

      <Section title="دارایی‌ها" action={<BigNum value={money(portfolio)} unit="تومان" />}>
        <FreeLocked free={free} locked={locked} />
        {locked > 0 && !!facts?.locks.length && (
          <KV rows={facts.locks.map((l) => [<LockTypeChip key={l.type} type={l.type} long />, <span key="a" className="num">{money(l.amount)}</span>])} />
        )}
      </Section>

      {alloc && portfolio > 0 && (
        <Section title="ترکیب دارایی">
          <Allocation compact items={[
            { label: 'طلا', value: alloc.gold, color: KIND_COLOR.gold },
            { label: 'درآمد ثابت', value: alloc.fixed, color: KIND_COLOR.fixed },
            { label: 'ریال و سایر', value: alloc.other, color: KIND_COLOR.rial },
          ]} />
        </Section>
      )}

      <Section title="آخرین بسته‌ها" action={<Link href={routes.org.packages} className="nm-more">همه<Icon d={I.chevL} size={14} /></Link>}>
        {detail.isLoading ? <span className="mute" style={{ fontSize: 12.5 }}>در حال دریافت…</span>
          : !pkgs.length ? <Empty icon={I.pkg} title="هنوز بسته‌ای برای این کارمند ارسال نشده است" />
          : (
            <List>
              {pkgs.map((p) => {
                const s = pkgStatusFor(p, emp.id);
                return <ListRow key={p.id} href={routes.org.package(p.id)} lead={<Tile d={I.pkg} tone="primary" />} title={p.title} sub={<span className="num">{s.meta}</span>} trail={<Pill tone={s.tone}>{s.label}</Pill>} />;
              })}
            </List>
          )}
      </Section>
    </Inspector>
  );
}
