'use client';
/**
 * Organization-panel access — one dialog for every place that grants or changes it (contract settings «کاربران پنل»,
 * the employees inspector). One Namadno account per person: a member signs in with their national ID and the password
 * of their own Namadno account, so access is given by choosing one of the organization's employees and a role.
 *   - add   (no person): pick an employee without access (not suspended) + role → «دادن دسترسی»
 *   - grant (a person without access): the same with that person fixed (no picker)
 *   - edit  (a person with access): change the role («ذخیره») or «برداشتن دسترسی» (Confirm)
 * Only the organization's administrator may use it (callers hide it for other roles; the mock answers 403 forbidden_role).
 */
import Link from 'next/link';
import { useState } from 'react';
import { useOrgEmployees, useOrgMe } from '@/api/org';
import { useGrantPanelAccess, useRevokePanelAccess, useUpdatePanelAccess } from '@/api/org-people-extra';
import type { Employee, OrgPanelRole, OrgPanelUser } from '@/types/domain';
import { Ava, Confirm, Dialog, Empty, Field, List, ListRow, Note, Pill, SearchField, SkeletonRows, Tile, type Tone } from '@/components/panel/kit';
import { useToast } from '@/components/ui/Toast';
import { ORG_ROLES, roleLabel } from '@/lib/org';
import { enDigits, maskNationalId } from '@/lib/format';
import { routes } from '@/lib/routes';
import { I, errMsg } from './shared';

/** Tone and icon of each panel role (same tones as the «کاربران پنل» list). */
export const PANEL_ROLE_TONE: Record<OrgPanelRole, Tone> = { admin: 'primary', approver: 'success', specialist: 'info' };
const ROLE_ICON: Record<OrgPanelRole, string> = { admin: I.shield, approver: I.check, specialist: I.user };

const NOTE_SIGN_IN = 'این همکار با کد ملی و رمز حساب نمادنوی خودش وارد پنل می‌شود.';
const NOTE_INVITED = 'هنوز حساب نمادنوی خود را فعال نکرده؛ پیامک فعال‌سازی برایش فرستاده می‌شود و پس از ساختن رمز وارد می‌شود.';

/** «واحد · کد ملی ۰۰۱•••••۷۸» */
function personSub(nationalId: string, unit?: string) {
  return <>{unit ? `${unit} · ` : ''}کد ملی <span className="num ltr">{maskNationalId(nationalId)}</span></>;
}

export function PanelAccessDialog({ open, ...rest }: {
  open: boolean; onClose: () => void;
  /** A fixed person: edit their access, or grant it when they have none. */
  employee?: Employee;
  /** A panel member by id (the «کاربران پنل» list) — used when the caller has no `Employee` record at hand. */
  memberId?: string;
}) {
  // mounted per opening, so every opening starts from a clean state
  return open ? <AccessBody {...rest} /> : null;
}

function AccessBody({ onClose, employee, memberId }: { onClose: () => void; employee?: Employee; memberId?: string }) {
  const toast = useToast();
  const me = useOrgMe();
  const all = useOrgEmployees();
  const grant = useGrantPanelAccess();
  const update = useUpdatePanelAccess();
  const revoke = useRevokePanelAccess();
  const [q, setQ] = useState('');
  const [picked, setPicked] = useState<string | null>(null);
  const [role, setRole] = useState<OrgPanelRole | null>(null);
  const [err, setErr] = useState('');
  const [confirm, setConfirm] = useState(false);

  const admins = me.data?.organization.admins ?? [];
  const employees = all.data ?? [];
  const fixedId = employee?.id ?? memberId;
  const member: OrgPanelUser | undefined = fixedId ? admins.find((a) => a.id === fixedId) : undefined;
  const fixedEmp = fixedId ? employee ?? employees.find((e) => e.id === fixedId) : undefined;
  const mode: 'add' | 'grant' | 'edit' = member ? 'edit' : fixedId ? 'grant' : 'add';
  const curRole: OrgPanelRole = role ?? member?.panelRole ?? 'specialist';

  // add mode: employees without access who are not suspended, searched by name, personnel code or national ID
  const candidates = employees.filter((e) => e.status !== 'inactive' && !admins.some((a) => a.id === e.id));
  const term = enDigits(q.trim());
  const shown = term ? candidates.filter((e) => e.fullName.includes(term) || e.employeeCode.includes(term) || e.nationalId.includes(term)) : candidates;
  const target: Employee | undefined = mode === 'add' ? candidates.find((e) => e.id === picked) : fixedEmp;
  const name = member?.name ?? target?.fullName ?? '';
  const invited = member ? member.status === 'invited' : target?.status === 'invited';
  const busy = grant.isPending || update.isPending || revoke.isPending;

  const pickRole = (r: OrgPanelRole) => { setErr(''); setRole(r); };
  const doGrant = () => {
    if (busy) return;
    if (!target) { setErr('یک همکار را از فهرست انتخاب کنید.'); return; }
    grant.mutate({ employeeId: target.id, panelRole: curRole }, {
      onSuccess: () => { toast(`دسترسی پنل ${target.fullName} داده شد`); onClose(); },
      onError: (e) => setErr(errMsg(e)),
    });
  };
  const doUpdate = () => {
    if (!member || busy) return;
    update.mutate({ id: member.id, panelRole: curRole }, {
      onSuccess: () => { toast(`نقش پنل ${member.name} به ${roleLabel(curRole)} تغییر کرد`); onClose(); },
      onError: (e) => setErr(errMsg(e)),
    });
  };
  const doRevoke = () => {
    if (!member || busy) return;
    revoke.mutate(member.id, {
      onSuccess: () => { toast(`دسترسی پنل ${member.name} برداشته شد`); onClose(); },
      onError: (e) => { setConfirm(false); setErr(errMsg(e)); },
    });
  };

  if (confirm && member) {
    return (
      <Confirm
        open onClose={() => setConfirm(false)} onConfirm={doRevoke} danger busy={revoke.isPending}
        title={`برداشتن دسترسی پنل ${member.name}؟`} confirmLabel={revoke.isPending ? 'در حال برداشتن…' : 'برداشتن دسترسی'}
        body={<span className="mute">{member.name} دیگر نمی‌تواند وارد پنل سازمان شود. حساب نمادنو، دارایی‌ها و عضویت او در کارکنان دست‌نخورده می‌ماند و هر زمان می‌توانید دوباره دسترسی بدهید.</span>}
      />
    );
  }

  const roles = (
    <Field label="نقش در پنل">
      <List>
        {ORG_ROLES.map((r) => (
          <ListRow
            key={r.key} onClick={() => pickRole(r.key)} pressed={curRole === r.key} label={`نقش ${r.label}: ${r.desc}`}
            lead={<Tile d={ROLE_ICON[r.key]} tone={PANEL_ROLE_TONE[r.key]} />} title={r.label} sub={r.desc}
          />
        ))}
      </List>
    </Field>
  );

  const fixedPerson = mode !== 'add' && (
    <List>
      <ListRow
        lead={<Ava letter={name[0] ?? '؟'} id={fixedId} />} title={name}
        sub={personSub(member?.nationalId ?? fixedEmp?.nationalId ?? '', fixedEmp?.department)}
        trail={member
          ? <Pill tone={PANEL_ROLE_TONE[member.panelRole ?? 'specialist']}>{member.role}</Pill>
          : invited ? <Pill tone="warning">فعال‌سازی نشده</Pill> : undefined}
      />
    </List>
  );

  const signInNote = (mode !== 'add' || target) && (invited ? <Note tone="warn">{NOTE_INVITED}</Note> : <Note tone="info">{NOTE_SIGN_IN}</Note>);

  return (
    <Dialog
      open onClose={onClose} width={520}
      icon={<Tile d={I.shield} tone="secondary" size="lg" />}
      title={mode === 'add' ? 'افزودن کاربر پنل' : mode === 'grant' ? 'دادن دسترسی پنل' : `دسترسی پنل ${name}`}
      sub={mode === 'add'
        ? 'یکی از کارکنان سازمان را انتخاب کنید و نقشش را در پنل تعیین کنید.'
        : mode === 'grant' ? `نقش ${name} را در پنل سازمان انتخاب کنید.` : 'نقش را تغییر دهید یا دسترسی را بردارید.'}
      footer={mode === 'edit' ? (
        <>
          <button type="button" className="nm-btn text" style={{ marginLeft: 'auto', color: 'var(--error-text)' }} disabled={busy} onClick={() => { setErr(''); setConfirm(true); }}>برداشتن دسترسی</button>
          <button type="button" className="nm-btn ghost" onClick={onClose}>انصراف</button>
          <button type="button" className="nm-btn" onClick={doUpdate} disabled={busy || curRole === (member?.panelRole ?? 'specialist')}>{update.isPending ? 'در حال ذخیره…' : 'ذخیره'}</button>
        </>
      ) : (
        <>
          <button type="button" className="nm-btn ghost" onClick={onClose}>انصراف</button>
          <button type="button" className="nm-btn" onClick={doGrant} disabled={busy || (mode === 'grant' && !target)}>{grant.isPending ? 'در حال ثبت…' : 'دادن دسترسی'}</button>
        </>
      )}
    >
      {mode === 'add' ? (
        <div className="nm-col" style={{ gap: 10 }}>
          <SearchField value={q} onChange={setQ} placeholder="نام، کد پرسنلی یا کد ملی" label="جستجوی همکار" width="100%" />
          <div style={{ maxHeight: 264, overflowY: 'auto', marginInline: -4, paddingInline: 4 }}>
            {all.isLoading || me.isLoading ? <SkeletonRows n={3} /> : shown.length ? (
              <List>
                {shown.map((e) => (
                  <ListRow
                    key={e.id} onClick={() => { setErr(''); setPicked((p) => (p === e.id ? null : e.id)); }} pressed={picked === e.id}
                    label={`${e.fullName}، واحد ${e.department}`}
                    lead={<Ava letter={e.avatarLetter} id={e.id} size="sm" />}
                    title={e.fullName}
                    sub={personSub(e.nationalId, e.department)}
                    trail={e.status === 'invited' ? <Pill tone="warning">فعال‌سازی نشده</Pill> : undefined}
                  />
                ))}
              </List>
            ) : (
              <Empty icon={I.search} title={term ? 'همکاری با این مشخصات پیدا نشد' : 'همه‌ی همکاران فعال به پنل دسترسی دارند'} />
            )}
          </div>
          <span className="nm-help">
            اگر در فهرست نیست، اول او را در «کارکنان» اضافه کنید. <Link href={routes.org.employeeNew} style={{ fontWeight: 600, color: 'var(--primary-text)' }}>افزودن کارمند</Link>
          </span>
        </div>
      ) : fixedPerson}

      {roles}
      {signInNote}
      {err && <Note tone="err">{err}</Note>}
    </Dialog>
  );
}

/** «پنل · مدیر» — small pill for an employee who has panel access (employees list, inspector). */
export function PanelRolePill({ member }: { member: OrgPanelUser }) {
  return <Pill tone={PANEL_ROLE_TONE[member.panelRole ?? 'specialist']}>پنل · {member.role || roleLabel(member.panelRole)}</Pill>;
}

/** Faint hint used where the viewer is not the organization's administrator. */
export const PANEL_ADMIN_ONLY = 'دسترسی‌ها را فقط مدیر سازمان تغییر می‌دهد.';
