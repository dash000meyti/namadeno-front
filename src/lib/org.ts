import type { OrgPanelRole, RequestKind } from '@/types/domain';
import { FEATURES } from './features';

/** Organization-wide constants shared by the panels and the mock. */

/**
 * Every organization has this unit from the start (`OrgDepartment.isDefault`). An employee is never without a unit:
 * a new employee, an import row or a deleted unit's employees with no unit land here. It cannot be renamed or deleted.
 */
export const DEFAULT_UNIT = 'سایر';

/**
 * Request types the organization itself approves (org panel «درخواست‌ها», dashboard, employee page, badges).
 * Everything else (cash withdrawal, credit increase, installments, profile changes) is handled in the operator console.
 * Loans join when «تسهیلات و اعتبار» goes live (FEATURES.orgCredit).
 */
export const ORG_REQUEST_KINDS: RequestKind[] = ['milestone_release', ...(FEATURES.orgCredit ? (['loan'] as const) : [])];
export const isOrgRequest = (r: { kind: RequestKind }) => ORG_REQUEST_KINDS.includes(r.kind);

/** The three roles of people who use the organization panel (the label is also shown as `admins[].role`). */
export const ORG_ROLES: { key: OrgPanelRole; label: string; desc: string }[] = [
  { key: 'admin', label: 'مدیر', desc: 'دسترسی کامل، از جمله واحدها و کاربران پنل' },
  { key: 'approver', label: 'تأییدکننده', desc: 'تأیید نهایی بسته‌ها پیش از ارسال' },
  { key: 'specialist', label: 'کارشناس', desc: 'آماده‌سازی بسته‌ها و پیگیری کارکنان' },
];
export const roleLabel = (r?: OrgPanelRole) => ORG_ROLES.find((x) => x.key === r)?.label ?? 'کارشناس';
export const roleOfLabel = (label: string): OrgPanelRole => ORG_ROLES.find((x) => x.label === label)?.key ?? 'specialist';
