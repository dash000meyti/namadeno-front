/** Authentication for the three surfaces. OTP in the mock is always 12345. */
import { http } from 'msw';
import type { Session } from '@/types/domain';
import { db, DEMO_ORG_ID, DEMO_OPERATOR_ID, DEMO_USER_ID, newId } from '../db';
import { body, fail, latency, ok, p } from '../http';
import { activateAccount, digits, panelMemberByNid, personByNid } from '../identity';
import { nidOk } from '@/lib/format';
import { now } from '@/lib/clock';

export const MOCK_OTP = '12345';

function session(role: Session['role'], userId: string, orgId?: string): Session {
  const token = newId('tok') + Math.random().toString(36).slice(2, 10);
  db().sessions[token] = { role, userId, orgId };
  return { token, role, userId, orgId, expiresAt: new Date(now().getTime() + 12 * 3600_000).toISOString() };
}

const NO_ACCESS = 'این حساب به پنل سازمانی دسترسی ندارد؛ دسترسی را مدیر سازمان می‌دهد.';
const NOT_ACTIVE = 'حساب نمادنوی شما هنوز فعال نشده است؛ با «فراموشی رمز / فعال‌سازی» رمز خود را بسازید.';

const normMobile = (m: string) => (m || '').replace(/[۰-۹]/g, (d) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d))).replace(/\D/g, '');

export const authHandlers = [
  // Employee app ─────────
  http.post(p('/auth/otp/request'), async ({ request }) => {
    await latency();
    const b = await body<{ mobile: string; purpose: 'login' | 'signup' | 'reset' }>(request);
    const m = normMobile(b.mobile);
    if (!/^09\d{9}$/.test(m)) return fail(422, 'bad_mobile', 'شماره موبایل معتبر نیست.');
    db().otp[m] = { code: MOCK_OTP, purpose: b.purpose };
    return ok({ sent: true, ttl: 120, devCode: MOCK_OTP });
  }),
  http.post(p('/auth/otp/verify'), async ({ request }) => {
    await latency();
    const b = await body<{ mobile: string; code: string; purpose: 'login' | 'signup' | 'reset' }>(request);
    const m = normMobile(b.mobile);
    const code = normMobile(b.code);
    if (code !== MOCK_OTP) return fail(422, 'bad_code', 'کد تأیید اشتباه است.');
    if (b.purpose === 'login') return ok(session('employee', DEMO_USER_ID, DEMO_ORG_ID));
    return ok({ verified: true, mobile: m });
  }),
  http.post(p('/auth/login'), async ({ request }) => {
    await latency();
    const b = await body<{ mobile: string; password: string }>(request);
    if (!b.password || b.password.length < 4) return fail(401, 'bad_credentials', 'شماره موبایل یا رمز عبور اشتباه است.');
    return ok(session('employee', DEMO_USER_ID, DEMO_ORG_ID));
  }),
  http.post(p('/auth/signup'), async ({ request }) => {
    await latency();
    const b = await body<{ nationalId: string; mobile: string; password: string }>(request);
    if (!/^\d{10}$/.test(normMobile(b.nationalId))) return fail(422, 'bad_national_id', 'کد ملی معتبر نیست.');
    if (!b.password || b.password.length < 8) return fail(422, 'weak_password', 'رمز عبور باید حداقل ۸ کاراکتر باشد.');
    // The demo signs the new user into the demo account (the backend creates a real one).
    return ok(session('employee', DEMO_USER_ID, DEMO_ORG_ID));
  }),
  http.post(p('/auth/password/reset'), async ({ request }) => {
    await latency();
    const b = await body<{ mobile: string; code: string; password: string }>(request);
    if (normMobile(b.code) !== MOCK_OTP) return fail(422, 'bad_code', 'کد تأیید اشتباه است.');
    if (!b.password || b.password.length < 8) return fail(422, 'weak_password', 'رمز عبور باید حداقل ۸ کاراکتر باشد.');
    return ok(session('employee', DEMO_USER_ID, DEMO_ORG_ID));
  }),
  http.post(p('/auth/logout'), async ({ request }) => {
    await latency();
    const token = (request.headers.get('authorization') || '').replace(/^Bearer\s+/i, '');
    delete db().sessions[token];
    return ok({ ok: true });
  }),

  // Organization panel ─────────
  // The same Namadno account as the app: national ID + account password. Only members with panel access
  // (`Organization.admins`) may enter; an invited member first sets a password with the SMS code («فعال‌سازی»).
  http.post(p('/org/auth/login'), async ({ request }) => {
    await latency();
    const b = await body<{ nationalId: string; password: string }>(request);
    const nid = digits(b.nationalId);
    if (!nidOk(nid)) return fail(422, 'bad_national_id', 'کد ملی معتبر نیست.');
    // demo: any password of 6+ characters is accepted for a known person
    if (!b.password || b.password.length < 6) return fail(401, 'bad_credentials', 'کد ملی یا رمز عبور اشتباه است.');
    const hit = panelMemberByNid(nid);
    if (!hit) {
      if (personByNid(nid)) return fail(403, 'no_panel_access', NO_ACCESS);
      return fail(401, 'bad_credentials', 'کد ملی یا رمز عبور اشتباه است.');
    }
    if (hit.admin.status === 'invited') return fail(403, 'not_activated', NOT_ACTIVE);
    return ok(session('org_admin', hit.admin.id, hit.org.id));
  }),
  // «فراموشی رمز / فعال‌سازی»: a code to the mobile of the account
  http.post(p('/org/auth/otp'), async ({ request }) => {
    await latency();
    const b = await body<{ nationalId: string }>(request);
    const nid = digits(b.nationalId);
    if (!nidOk(nid)) return fail(422, 'bad_national_id', 'کد ملی معتبر نیست.');
    const hit = panelMemberByNid(nid);
    if (!hit) return fail(403, 'no_panel_access', NO_ACCESS);
    const mobile = hit.admin.mobile;
    if (!/^09\d{9}$/.test(mobile)) return fail(422, 'no_mobile', 'برای این حساب موبایلی ثبت نشده است؛ با پشتیبانی سازمانی تماس بگیرید.');
    db().otp[mobile] = { code: MOCK_OTP, purpose: 'reset' };
    return ok({ sent: true, ttl: 120, mobile: mobile.slice(0, 4) + '•••' + mobile.slice(-4), devCode: MOCK_OTP });
  }),
  // sets the account password (the app uses the same one), activates an invited member, signs in
  http.post(p('/org/auth/password/reset'), async ({ request }) => {
    await latency();
    const b = await body<{ nationalId: string; code: string; password: string }>(request);
    const hit = panelMemberByNid(digits(b.nationalId));
    if (!hit) return fail(403, 'no_panel_access', NO_ACCESS);
    if (normMobile(b.code) !== MOCK_OTP) return fail(422, 'bad_code', 'کد تأیید اشتباه است.');
    if (!/^(?=.*[A-Za-z\u0600-\u06FF])(?=.*[0-9۰-۹]).{8,}$/.test(b.password ?? '')) return fail(422, 'weak_password', 'رمز عبور باید حداقل ۸ نویسه و شامل حرف و عدد باشد.');
    activateAccount(hit.admin.id);
    return ok(session('org_admin', hit.admin.id, hit.org.id));
  }),

  // Operator console ─────────
  http.post(p('/op/auth/login'), async ({ request }) => {
    await latency();
    const b = await body<{ email: string; password: string; otp?: string }>(request);
    if (!b.email || !b.password) return fail(401, 'bad_credentials', 'ایمیل یا رمز عبور اشتباه است.');
    if (b.otp !== undefined && normMobile(b.otp) !== MOCK_OTP) return fail(422, 'bad_code', 'کد تأیید دومرحله‌ای اشتباه است.');
    return ok(session('operator', DEMO_OPERATOR_ID));
  }),
];
