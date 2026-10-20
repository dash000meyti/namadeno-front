/**
 * Additional mock endpoints owned by the "app-core" area (auth, home, inbox, account screens).
 * Registered before the core handlers, so the overrides below replace the core behaviour.
 *
 * GET  /api/v1/me/kyc
 *      → 200 { level: 1|2|3, mobile, nationalId, fullName, birthDate?, fatherName?, registryOffice?,
 *               sejam?: { bourseCode, bankAccount, postalCode } }
 *      Identity details per completed KYC level (fatherName/registryOffice from level 2, sejam from level 3).
 *
 * POST /api/v1/me/kyc/level2            (override of the core endpoint — same contract, consistent data)
 *      body { birthDate: 'YYYY/MM/DD' (Jalali) }
 *      → 200 { level, fullName, fatherName, registryOffice }   · 422 bad_birth_date
 *
 * GET  /api/v1/me/security
 *      → 200 { passwordChangedAt: ISODate }
 *
 * POST /api/v1/me/password              (override — also records passwordChangedAt)
 *      body { current?: string, next: string }
 *      → 200 { ok: true, passwordChangedAt }   · 422 weak_password · 401 bad_current_password
 *
 * POST /api/v1/me/tickets               (override — the support agent replies to the first message)
 *      body { subject: string, text: string }
 *      → 200 Ticket (messages: [user message, agent auto-reply])
 */
import { http, type HttpHandler } from 'msw';
import type { Ticket } from '@/types/domain';
import { db, newId, userData } from '../db';
import { body, fail, latency, ok, p, who } from '../http';
import { now } from '@/lib/clock';
import { appCoreExtra } from '../seed/extra-app-core';

const me = (req: Request) => userData(who(req, 'employee').userId);
const latin = (s: string) => (s || '').replace(/[۰-۹]/g, (d) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d)));

function kycOf(userId: string) {
  const bag = appCoreExtra(db());
  if (!bag.kyc[userId]) {
    bag.kyc[userId] = { fatherName: 'محمد', registryOffice: 'تهران', sejam: { bourseCode: 'نمد10001', bankAccount: 'بانک ملت · 0000', postalCode: '1000000000' } };
  }
  return bag.kyc[userId];
}

export const appCoreHandlers: HttpHandler[] = [
  http.get(p('/me/kyc'), async ({ request }) => {
    await latency();
    const ud = me(request);
    const k = kycOf(ud.profile.id);
    const pr = ud.profile;
    return ok({
      level: pr.kycLevel,
      mobile: pr.mobile,
      nationalId: pr.nationalId,
      fullName: pr.fullName,
      birthDate: pr.kycLevel >= 2 ? pr.birthDate : undefined,
      fatherName: pr.kycLevel >= 2 ? k.fatherName : undefined,
      registryOffice: pr.kycLevel >= 2 ? k.registryOffice : undefined,
      sejam: pr.kycLevel >= 3 ? k.sejam : undefined,
    });
  }),

  http.post(p('/me/kyc/level2'), async ({ request }) => {
    await latency();
    const ud = me(request);
    const b = await body<{ birthDate: string }>(request);
    const bd = latin(b.birthDate || '').trim();
    const m = /^(1[34]\d\d)\/(\d{1,2})\/(\d{1,2})$/.exec(bd);
    if (!m || +m[2] < 1 || +m[2] > 12 || +m[3] < 1 || +m[3] > 31) return fail(422, 'bad_birth_date', 'تاریخ تولد معتبر نیست؛ به شکل ۱۳۷۰/۰۵/۱۲ وارد کنید.');
    const norm = `${m[1]}/${m[2].padStart(2, '0')}/${m[3].padStart(2, '0')}`;
    if (ud.profile.birthDate && ud.profile.birthDate !== norm) {
      return fail(422, 'birth_date_mismatch', 'تاریخ تولد با اطلاعات ثبت احوال برای این کد ملی مطابقت ندارد.');
    }
    ud.profile.birthDate = norm;
    if (ud.profile.kycLevel < 2) ud.profile.kycLevel = 2;
    const k = kycOf(ud.profile.id);
    return ok({ level: ud.profile.kycLevel, fullName: ud.profile.fullName, fatherName: k.fatherName, registryOffice: k.registryOffice });
  }),

  http.get(p('/me/security'), async ({ request }) => {
    await latency();
    const ud = me(request);
    const bag = appCoreExtra(db());
    const s = bag.security[ud.profile.id] ?? (bag.security[ud.profile.id] = { passwordChangedAt: ud.profile.joinedAt });
    return ok(s);
  }),

  http.post(p('/me/password'), async ({ request }) => {
    await latency();
    const ud = me(request);
    const b = await body<{ current?: string; next: string }>(request);
    if (b.current !== undefined && b.current.length < 4) return fail(401, 'bad_current_password', 'رمز فعلی اشتباه است.');
    if (!b.next || b.next.length < 8) return fail(422, 'weak_password', 'رمز عبور باید حداقل ۸ کاراکتر باشد.');
    ud.passwordSet = true;
    const bag = appCoreExtra(db());
    const at = now().toISOString();
    bag.security[ud.profile.id] = { passwordChangedAt: at };
    return ok({ ok: true, passwordChangedAt: at });
  }),

  http.post(p('/me/tickets'), async ({ request }) => {
    await latency();
    const ud = me(request);
    const b = await body<{ subject: string; text: string }>(request);
    if (!b.text || !b.text.trim()) return fail(422, 'empty_message', 'متن پیام را بنویسید.');
    const at = now().getTime();
    const t: Ticket = {
      id: 'SP-' + (4121 + ud.tickets.length),
      subject: b.subject || 'گفتگو با پشتیبانی',
      status: 'open',
      createdAt: new Date(at).toISOString(),
      messages: [
        { id: newId('m'), from: 'user', text: b.text.trim(), at: new Date(at).toISOString() },
        { id: newId('m'), from: 'agent', text: 'پیام شما ثبت شد؛ همکاران ما در کمتر از ۵ دقیقه پاسخ می‌دهند. پیگیری این گفتگو در «درخواست‌های من» هم در دسترس است.', at: new Date(at + 60_000).toISOString() },
      ],
    };
    ud.tickets.unshift(t);
    return ok(t);
  }),
];
