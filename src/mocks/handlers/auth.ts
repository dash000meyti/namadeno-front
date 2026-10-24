/** Authentication for the three surfaces. OTP in the mock is always 12345. */
import { http } from 'msw';
import type { Session } from '@/types/domain';
import { db, DEMO_ORG_ADMIN_ID, DEMO_ORG_ID, DEMO_OPERATOR_ID, DEMO_USER_ID, newId } from '../db';
import { body, fail, latency, ok, p, who } from '../http';
import { now } from '@/lib/clock';

export const MOCK_OTP = '12345';

function session(role: Session['role'], userId: string, orgId?: string): Session {
  const token = newId('tok') + Math.random().toString(36).slice(2, 10);
  db().sessions[token] = { role, userId, orgId };
  return { token, role, userId, orgId, expiresAt: new Date(now().getTime() + 12 * 3600_000).toISOString() };
}

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
  http.post(p('/org/auth/login'), async ({ request }) => {
    await latency();
    const b = await body<{ email: string; password: string }>(request);
    if (!b.email || !b.password) return fail(401, 'bad_credentials', 'ایمیل یا رمز عبور اشتباه است.');
    // Demo: a known panel e-mail (of any organization) signs in as that person; any other e-mail as the demo organization's specialist.
    const email = b.email.trim().toLowerCase();
    for (const o of db().organizations) {
      const admin = o.admins.find((a) => a.email.toLowerCase() === email);
      if (admin) return ok({ ...session('org_admin', admin.id, o.id), ...(admin.mustChangePassword ? { mustChangePassword: true } : {}) });
    }
    return ok(session('org_admin', DEMO_ORG_ADMIN_ID, DEMO_ORG_ID));
  }),
  // First login with a temporary password: set a new one (≥ 8 characters, letters and digits).
  http.post(p('/org/auth/password'), async ({ request }) => {
    await latency();
    const s = who(request, 'org_admin');
    const b = await body<{ password: string }>(request);
    if (!/^(?=.*[A-Za-z])(?=.*\d).{8,}$/.test(b.password ?? '')) return fail(422, 'weak_password', 'رمز عبور باید حداقل ۸ نویسه و شامل حرف و عدد باشد.');
    const admin = db().organizations.find((o) => o.id === s.orgId)?.admins.find((a) => a.id === s.userId);
    if (admin) delete admin.mustChangePassword;
    return ok({ ok: true });
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
