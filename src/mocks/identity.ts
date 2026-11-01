/**
 * One Namadno account per person, shared by the app and the organization panel.
 *   - the account is the person (`UserProfile` / `Employee.id`, found by national ID);
 *   - membership of an organization is an `Employee` record;
 *   - organization-panel access is an entry in `Organization.admins` keyed by the same account id.
 * Used by the auth, org-people, op-core and app handlers so every surface reads the same people.
 */
import type { Employee, Organization, OrgPanelRole, OrgPanelUser, PanelAccess } from '@/types/domain';
import { db, newId } from './db';
import { enDigits } from '@/lib/format';
import { DEFAULT_UNIT, roleLabel } from '@/lib/org';
import { now } from '@/lib/clock';

export const digits = (s: string) => enDigits(String(s ?? '')).replace(/\D/g, '');

/** Panel member with this national ID (any organization). */
export function panelMemberByNid(nid: string): { org: Organization; admin: OrgPanelUser } | undefined {
  for (const org of db().organizations) {
    const admin = org.admins.find((a) => a.nationalId === nid);
    if (admin) return { org, admin };
  }
  return undefined;
}

/** A person (account or invited member) with this national ID, wherever they are recorded. */
export function personByNid(nid: string): { id: string; name: string; mobile: string; hasAccount: boolean } | undefined {
  for (const ud of Object.values(db().users)) if (ud.profile.nationalId === nid) return { id: ud.profile.id, name: ud.profile.fullName, mobile: ud.profile.mobile, hasAccount: true };
  for (const pu of db().platformUsers) if (pu.nationalId === nid) return { id: pu.id, name: pu.fullName, mobile: pu.mobile, hasAccount: pu.status !== 'invited' };
  for (const list of Object.values(db().employees)) {
    const e = list.find((x) => x.nationalId === nid);
    if (e) return { id: e.id, name: e.fullName, mobile: e.mobile, hasAccount: e.status !== 'invited' };
  }
  return undefined;
}

/** Organization-panel access of an account (computed from `Organization.admins`). */
export function panelAccessOf(userId: string): PanelAccess | undefined {
  for (const o of db().organizations) {
    const a = o.admins.find((x) => x.id === userId);
    if (a) return { orgId: o.id, orgName: o.name, panelRole: a.panelRole ?? 'specialist', status: a.status };
  }
  return undefined;
}

/** Panel entry for an employee of the organization. */
export function panelUserOf(e: Employee, panelRole: OrgPanelRole): OrgPanelUser {
  return { id: e.id, name: e.fullName, role: roleLabel(panelRole), panelRole, nationalId: e.nationalId, mobile: e.mobile, status: e.status === 'invited' ? 'invited' : 'active' };
}

/**
 * Operator adds a panel member by national ID: the existing account is reused (immediate access), otherwise an account
 * is opened as «invited» (activation SMS). The person also becomes a member of the organization in the default unit.
 */
export function addPanelMember(o: Organization, input: { name: string; nationalId: string; mobile: string; panelRole: OrgPanelRole }): OrgPanelUser {
  const list = (db().employees[o.id] ??= []);
  let e = list.find((x) => x.nationalId === input.nationalId);
  if (!e) {
    const known = personByNid(input.nationalId);
    const fullName = input.name.trim() || known?.name || 'همکار تازه';
    e = {
      id: known?.id ?? newId('u'), fullName, nationalId: input.nationalId, mobile: input.mobile || known?.mobile || '', employeeCode: String(1080 + list.length),
      department: DEFAULT_UNIT, jobTitle: '', status: known?.hasAccount ? 'active' : 'invited', joinedAt: now().toISOString(),
      totalReceived: 0, portfolioValue: 0, lockedValue: 0, avatarLetter: fullName[0],
    };
    list.unshift(e);
  }
  const existing = o.admins.find((a) => a.id === e!.id);
  if (existing) return existing;
  const u = panelUserOf(e, input.panelRole);
  o.admins.push(u);
  return u;
}

/** Activation (first password) or password reset of the account: an invited member becomes active everywhere. */
export function activateAccount(userId: string) {
  for (const o of db().organizations) {
    const a = o.admins.find((x) => x.id === userId);
    if (a) a.status = 'active';
    const e = db().employees[o.id]?.find((x) => x.id === userId);
    if (e && e.status === 'invited') e.status = 'active';
  }
  const pu = db().platformUsers.find((x) => x.id === userId);
  if (pu && pu.status === 'invited') pu.status = 'active';
}
