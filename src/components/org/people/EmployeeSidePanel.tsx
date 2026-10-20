'use client';
/** «پروفایل کارمند» side panel of the employees list (design: org-employees, left aside). */
import Link from 'next/link';
import { Icon } from '@/components/ui/Icon';
import { useOrgEmployee } from '@/api/org';
import type { EmpFacts } from '@/api/org-people-extra';
import type { Employee, OrgPackage } from '@/types/domain';
import { routes } from '@/lib/routes';
import { faDigits, jDayMonth, money, pct } from '@/lib/format';
import { Chip, EMP_STATUS, jParts, FreeLockBar, FreeLockLegend, I, KIND_COLOR, LockChip, avOf, million, tone } from './shared';

export function pkgStatusFor(p: OrgPackage, employeeId: string) {
  const r = p.recipients.find((x) => x.employeeId === employeeId);
  if (p.lockPolicy.type === 'milestone' && r?.status === 'accepted') {
    const steps = p.milestoneProgress ?? [];
    return { label: 'مرحله‌ای', t: tone('primary'), icon: tone('primary'), meta: `${money(r.amount)} تومان · ${faDigits(steps.filter((s) => s.status === 'released').length)} از ${faDigits(steps.length)} مرحله آزاد` };
  }
  const date = p.sentAt ? jDayMonth(p.sentAt) : '';
  if (r?.status === 'pending') return { label: 'در انتظار تأیید', t: tone('warning'), icon: tone('warning'), meta: `${money(r.amount)} تومان · ${date}` };
  if (r?.status === 'expired') return { label: 'منقضی', t: tone('default'), icon: tone('default'), meta: `${money(r.amount)} تومان · ${date}` };
  return { label: 'دریافت‌شده', t: tone('success'), icon: tone('primary'), meta: `${money(r?.amount ?? p.amountPerPerson)} تومان · ${date}` };
}

export function EmployeeSidePanel({ emp, facts, onSuspend, onReactivate, onSendPackage, sending }: {
  emp: Employee; facts?: EmpFacts; onSuspend: () => void; onReactivate: () => void; onSendPackage: () => void; sending?: boolean;
}) {
  const detail = useOrgEmployee(emp.id);
  const [avBg, avFg] = avOf(emp.id);
  const st = EMP_STATUS[emp.status];
  const portfolio = facts?.portfolio ?? emp.portfolioValue;
  const locked = facts?.locked ?? emp.lockedValue;
  const free = Math.max(0, portfolio - locked);
  const pkgs = (detail.data?.packages ?? []).filter((p) => p.sentAt).sort((a, b) => (b.sentAt ?? '').localeCompare(a.sentAt ?? '')).slice(0, 3);
  const ms = facts?.pendingMilestone;
  const alloc = facts?.allocation;

  return (
    <aside className="glass" aria-label={`پروفایل ${emp.fullName}`} style={{ width: 360, flex: 'none', boxSizing: 'border-box', border: 0, borderRight: '1px solid var(--divider)', boxShadow: 'none', padding: 20, display: 'flex', flexDirection: 'column', gap: 16, overflowY: 'auto' }}>
      <div style={{ height: 32, display: 'flex', alignItems: 'center', gap: 8, flex: 'none' }}>
        <h6 style={{ margin: 0, fontSize: 14, fontWeight: 700, color: 'var(--text-secondary)' }}>پروفایل کارمند</h6>
        <span style={{ marginRight: 'auto', display: 'flex', gap: 2 }}>
          <Link href={routes.org.employee(emp.id)} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, height: 32, padding: '0 8px', borderRadius: 8, fontSize: 12, fontWeight: 600 }}>پروفایل کامل<Icon d={I.chevL} size={16} /></Link>
        </span>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 14, flex: 'none' }}>
        <span style={{ width: 56, height: 56, borderRadius: '50%', background: avBg, color: avFg, display: 'grid', placeItems: 'center', fontSize: 22, fontWeight: 700, flex: 'none', boxShadow: '0 0 0 3px var(--bg-paper)' }}>{emp.avatarLetter}</span>
        <span style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 3, lineHeight: 1.25 }}>
          <Link href={routes.org.employee(emp.id)} style={{ fontSize: 17, fontWeight: 700, color: 'inherit', textDecoration: 'none' }}>{emp.fullName}</Link>
          <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>واحد {emp.department} · کد پرسنلی <span className="num" style={{ fontWeight: 400 }}>{faDigits(emp.employeeCode)}</span></span>
          <span style={{ display: 'flex', gap: 6 }}>
            <Chip t={st.tone} style={{ height: 20, padding: '0 6px' }}>{st.label}</Chip>
            <Chip t="default" style={{ height: 20, padding: '0 6px' }}>عضو از {faDigits(jParts(emp.joinedAt).y)}</Chip>
          </span>
        </span>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: '12px 14px', borderRadius: 12, background: 'var(--bg-neutral)', flex: 'none' }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
          <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>دارایی کل</span>
          <span className="num" style={{ marginRight: 'auto', fontSize: 22, lineHeight: 1.1 }}>{money(portfolio)}</span>
          <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>تومان</span>
        </div>
        <FreeLockBar free={free} locked={locked} />
        <FreeLockLegend free={free} locked={locked} />
        {locked > 0 && !!facts?.locks.length && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {facts.locks.map((l) => (
              <span key={l.type} style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                <LockChip type={l.type} style={{ height: 20, padding: '0 6px' }} /><span className="num" style={{ fontSize: 11, fontWeight: 500 }}>{million(l.amount)} میلیون</span>
              </span>
            ))}
          </div>
        )}
        {alloc && portfolio > 0 && (
          <div style={{ display: 'flex', gap: 12, fontSize: 11, color: 'var(--text-secondary)', paddingTop: 6, borderTop: '1px dashed var(--divider)' }}>
            {[{ label: 'طلا', v: alloc.gold, c: KIND_COLOR.gold }, { label: 'درآمد ثابت', v: alloc.fixed, c: KIND_COLOR.fixed }, { label: 'ریال و سایر', v: alloc.other, c: KIND_COLOR.rial }].map((a) => (
              <span key={a.label} style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}><span style={{ width: 8, height: 8, borderRadius: 2, background: a.c }} />{a.label} <span className="num" style={{ fontWeight: 500, color: 'var(--text-primary)' }}>{pct(a.v)}</span></span>
            ))}
          </div>
        )}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, flex: 'none' }}>
        {[{ label: 'وام فعال', v: facts?.loanActive ?? 0 }, { label: 'اعتبار کارت', v: facts?.cardLimit ?? 0 }, { label: 'قفل‌شده', v: locked }].map((s) => (
          <div key={s.label} style={{ boxSizing: 'border-box', padding: 10, borderRadius: 10, border: '1px solid var(--divider)', display: 'flex', flexDirection: 'column', gap: 4, lineHeight: 1.2, minWidth: 0 }}>
            <span style={{ fontSize: 11, color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>{s.label}</span>
            <span style={{ display: 'flex', alignItems: 'baseline', gap: 3 }}><span className="num" style={{ fontSize: 16, fontWeight: 500 }}>{million(s.v)}</span><span style={{ fontSize: 10, color: 'var(--text-secondary)' }}>میلیون</span></span>
          </div>
        ))}
      </div>

      {ms && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px', borderRadius: 10, background: 'var(--soft-primary)', color: 'var(--primary-text)', fontSize: 12, flex: 'none' }}>
          <Icon d={I.flag} size={16} />
          <span style={{ flex: 1, minWidth: 0, lineHeight: 1.4 }}>مرحله {faDigits(ms.stepIndex)} {ms.packageTitle} در انتظار تأیید شما</span>
          <Link href={routes.org.package(ms.packageId)} style={{ fontWeight: 700, whiteSpace: 'nowrap' }}>بررسی</Link>
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, flex: 'none' }}>
        <div style={{ height: 20, display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 13, fontWeight: 700 }}>آخرین بسته‌ها</span>
          <Link href={routes.org.packages} style={{ marginRight: 'auto', fontSize: 12, fontWeight: 600 }}>همه</Link>
        </div>
        {detail.isLoading && <span style={{ fontSize: 12, color: 'var(--text-secondary)', padding: '12px 0' }}>در حال دریافت…</span>}
        {!detail.isLoading && !pkgs.length && <span style={{ fontSize: 12, color: 'var(--text-secondary)', padding: '12px 0' }}>هنوز بسته‌ای برای این کارمند ارسال نشده است.</span>}
        {pkgs.map((p, i) => {
          const s = pkgStatusFor(p, emp.id);
          return (
            <Link key={p.id} href={routes.org.package(p.id)} className="row-a" style={{ height: 52, display: 'flex', alignItems: 'center', gap: 10, borderBottom: `1px dashed ${i < pkgs.length - 1 ? 'var(--divider)' : 'transparent'}` }}>
              <span style={{ width: 32, height: 32, borderRadius: 8, background: s.icon[0], color: s.icon[1], display: 'grid', placeItems: 'center', flex: 'none' }}><Icon d={I.pkg} size={16} /></span>
              <span style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', lineHeight: 1.25 }}><span className="cell" style={{ fontSize: 13, fontWeight: 600 }}>{p.title}</span><span className="num" style={{ fontSize: 11, color: 'var(--text-secondary)', fontWeight: 400 }}>{s.meta}</span></span>
              <Chip t={s.t} style={{ padding: '0 6px' }}>{s.label}</Chip>
            </Link>
          );
        })}
      </div>

      <div style={{ marginTop: 'auto', display: 'flex', flexDirection: 'column', gap: 8, flex: 'none' }}>
        <button className="btn" disabled={sending || emp.status === 'inactive'} onClick={onSendPackage} style={{ height: 40, background: 'var(--primary-main)', color: 'var(--primary-contrast)', boxShadow: 'var(--shadow-primary)', opacity: sending || emp.status === 'inactive' ? 0.6 : 1 }}>
          <Icon d={I.pkg} size={18} />{sending ? 'در حال آماده‌سازی…' : 'ارسال بسته'}
        </button>
        {emp.status !== 'inactive' ? (
          <button className="btn" onClick={onSuspend} style={{ height: 40, background: 'transparent', color: 'var(--error-text)' }}><Icon d={I.ban} size={18} />تعلیق حساب</button>
        ) : (
          <>
            <span className="btn" style={{ height: 40, background: 'var(--soft-error)', color: 'var(--error-text)', cursor: 'default' }}>حساب تعلیق شده است</span>
            <button className="btn" onClick={onReactivate} style={{ height: 32, background: 'transparent', color: 'var(--text-secondary)', fontSize: 13 }}><Icon d={I.check} size={16} />رفع تعلیق</button>
          </>
        )}
      </div>
    </aside>
  );
}
