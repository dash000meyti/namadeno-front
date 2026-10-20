'use client';
/** /op/settings — design: op-settings.dc.html (general, team & roles, security, integrations, notifications, system status). */
import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { PageHeading } from '@/components/panel/PanelShell';
import { Icon } from '@/components/ui/Icon';
import { Skeleton, ErrorState } from '@/components/app/Screen';
import { useToast } from '@/components/ui/Toast';
import { useOpSettings } from '@/api/op';
import {
  useInviteTeamMember, useRefreshSystemStatus, useRevokeSessions, useRotateApiKey, useSetTeamMemberStatus, useSystemStatus, useUpdateOpSettingsX,
  type OpSettingsX, type OpTeamMember, type PermKey, type RoleKey,
} from '@/api/op-system-extra';
import { routes } from '@/lib/routes';
import { faDigits, jDate, money, time } from '@/lib/format';
import { dayTime, errMsg } from '@/components/op/system/fmt';
import { Chip, Confirm, DlgHead, FormError, IC, Lbl, Modal, NumField, Sw, TILE_TONES, TONES, type ToneKey } from '@/components/op/system/ui';

type Tab = 'general' | 'users' | 'security' | 'integ' | 'notif' | 'status';
const TABS: [Tab, string, string][] = [
  ['general', 'عمومی', IC.settings], ['users', 'کاربران و نقش‌ها', IC.users], ['security', 'امنیت', IC.key],
  ['integ', 'یکپارچه‌سازی', IC.code], ['notif', 'اعلان‌ها', IC.bell], ['status', 'وضعیت سیستم', IC.shield],
];
const ROLES: Record<RoleKey, { role: string; short: string; tone: ToneKey }> = {
  pm: { role: 'مدیر محصول', short: 'محصول', tone: 'primary' }, fin: { role: 'مالی', short: 'مالی', tone: 'success' },
  risk: { role: 'ریسک', short: 'ریسک', tone: 'warning' }, sup: { role: 'پشتیبانی', short: 'پشتیبانی', tone: 'info' },
};
const ROLE_KEYS: RoleKey[] = ['pm', 'fin', 'risk', 'sup'];
const PERMS: [PermKey, string][] = [
  ['orgs', 'مشاهده سازمان‌ها'], ['contracts', 'ویرایش قراردادها'], ['requests', 'تأیید درخواست‌ها'], ['funds', 'مدیریت صندوق‌ها'],
  ['rules', 'تغییر قوانین و ریسک'], ['legal', 'اعمال و رفع مسدودی قانونی'], ['users', 'مشاهده و تعلیق کاربران'],
];
const OWNER_ID = 'op-301';

export default function OpSettingsPage() {
  const q = useOpSettings();
  const [tab, setTab] = useState<Tab>('status');
  const s = q.data as OpSettingsX | undefined;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20, flex: 'none' }}>
      <PageHeading title="تنظیمات" crumbs={[{ label: 'بهره‌بردار', href: routes.op.overview }, { label: 'سیستم' }, { label: 'تنظیمات' }]}>
        <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>نسخهٔ پلتفرم <span className="num" dir="ltr" style={{ fontWeight: 500, color: 'var(--text-primary)' }}>{faDigits(s?.platformVersion ?? '—', true)}</span></span>
      </PageHeading>
      <div role="tablist" style={{ height: 40, flex: 'none', display: 'flex', alignItems: 'center', gap: 4, borderBottom: '1px solid var(--divider)', overflowX: 'auto' }}>
        {TABS.map(([k, l, d]) => (
          <button key={k} type="button" role="tab" aria-selected={tab === k} className={tab === k ? 'tab on' : 'tab'} onClick={() => setTab(k)} style={{ gap: 8, fontWeight: tab === k ? 700 : 500 }}>
            <Icon d={d} size={18} />{l}
          </button>
        ))}
      </div>
      {tab === 'status' ? <StatusTab /> : q.isLoading ? <Skeleton h={360} /> : q.isError || !s ? <ErrorState message={errMsg(q.error)} onRetry={() => q.refetch()} /> : tab === 'users' ? <UsersTab s={s} /> : <PanelTab key={tab} tab={tab} s={s} />}
    </div>
  );
}

// ───────────────────────── Users & roles ─────────────────────────
const UCOLS = 'minmax(0, 1fr) 104px 80px 104px 32px';
function UsersTab({ s }: { s: OpSettingsX }) {
  const toast = useToast();
  const setStatus = useSetTeamMemberStatus();
  const save = useUpdateOpSettingsX();
  const [invite, setInvite] = useState(false);
  const server = useMemo(() => s.roleMatrix ?? ({} as NonNullable<OpSettingsX['roleMatrix']>), [s.roleMatrix]);
  const [mx, setMx] = useState(server);
  useEffect(() => setMx(server), [server]);
  const dirty = JSON.stringify(mx) !== JSON.stringify(server);
  const team = s.team;
  const roleOf = (m: OpTeamMember): RoleKey => m.roleKey ?? (ROLE_KEYS.find((k) => ROLES[k].role === m.role) ?? 'sup');
  const toggleUser = (m: OpTeamMember) => {
    if (m.id === OWNER_ID) return toast('مالک پنل را نمی‌توان غیرفعال کرد', 'error');
    const next = m.status === 'inactive' ? 'active' : 'inactive';
    setStatus.mutate({ id: m.id, status: next }, { onSuccess: () => toast(next === 'active' ? `${m.name} فعال شد` : m.status === 'invited' ? `دعوت ${m.name} لغو شد` : `${m.name} غیرفعال شد`), onError: (e) => toast(errMsg(e), 'error') });
  };
  const saveMatrix = () => {
    if (!dirty) return toast('تغییری برای ذخیره وجود ندارد', 'info');
    save.mutate({ roleMatrix: mx }, { onSuccess: () => toast('ماتریس نقش‌ها ذخیره شد'), onError: (e) => toast(errMsg(e), 'error') });
  };
  return (
    <div style={{ display: 'flex', gap: 24, alignItems: 'flex-start' }}>
      <div className="card" style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <div style={{ height: 52, flex: 'none', boxSizing: 'border-box', padding: '0 20px', display: 'flex', alignItems: 'center', gap: 10 }}>
          <h6 style={{ margin: 0, fontSize: 16, fontWeight: 700, lineHeight: 1.2 }}>کاربران پنل بهره‌بردار</h6>
          <Lbl>{faDigits(team.length)} کاربر</Lbl>
          <button type="button" className="btnp" onClick={() => setInvite(true)} style={{ marginRight: 'auto', height: 32 }}><Icon d={IC.plus} size={16} strokeWidth={2} />افزودن کاربر</button>
        </div>
        <div style={{ overflowX: 'auto' }}>
          <div style={{ minWidth: 480 }}>
            <div style={{ height: 36, display: 'grid', gridTemplateColumns: UCOLS, alignItems: 'center', padding: '0 20px', background: 'var(--table-head)', color: 'var(--grey-600)', fontSize: 12, fontWeight: 700 }}>
              <span>کاربر</span><span>نقش</span><span>وضعیت</span><span>آخرین ورود</span><span />
            </div>
            {team.map((m, i) => {
              const r = ROLES[roleOf(m)];
              const [bg, fg] = TONES[TILE_TONES[i % 5]];
              const st = m.status === 'inactive' ? { l: 'غیرفعال', t: 'default' as ToneKey } : m.status === 'invited' ? { l: 'دعوت‌شده', t: 'warning' as ToneKey } : { l: 'فعال', t: 'success' as ToneKey };
              const on = m.status !== 'inactive';
              const busy = setStatus.isPending && setStatus.variables?.id === m.id;
              const aria = on ? (m.status === 'invited' ? 'لغو دعوت ' : 'غیرفعال‌سازی ') + m.name : 'فعال‌سازی ' + m.name;
              return (
                <div key={m.id} style={{ minHeight: 56, display: 'grid', gridTemplateColumns: UCOLS, alignItems: 'center', padding: '0 20px', borderBottom: '1px dashed var(--divider)', fontSize: 13 }}>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
                    <span style={{ width: 32, height: 32, borderRadius: '50%', background: bg, color: fg, display: 'grid', placeItems: 'center', fontSize: 13, fontWeight: 700, flex: 'none' }}>{m.name[0]}</span>
                    <span style={{ display: 'flex', flexDirection: 'column', lineHeight: 1.25, minWidth: 0 }}><span style={{ fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{m.name}</span><span dir="ltr" style={{ fontSize: 11, color: 'var(--text-secondary)', textAlign: 'right', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{m.email}</span></span>
                  </span>
                  <span><Lbl tone={r.tone} style={{ height: 22, padding: '0 6px', fontSize: 11 }}>{r.role}</Lbl></span>
                  <span><Lbl tone={st.t} style={{ height: 22, padding: '0 6px', fontSize: 11 }}>{st.l}</Lbl></span>
                  <span className="num" style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{m.lastLoginAt ? dayTime(m.lastLoginAt) : '—'}</span>
                  <span style={{ display: 'grid', placeItems: 'center' }}><button type="button" className="ibtn" aria-label={aria} title={aria} disabled={busy} onClick={() => toggleUser(m)} style={{ width: 28, height: 28, opacity: busy ? 0.5 : 1 }}><Icon d={on ? IC.ban : IC.check} size={18} /></button></span>
                </div>
              );
            })}
          </div>
        </div>
        <div style={{ marginTop: 'auto', minHeight: 44, flex: 'none', boxSizing: 'border-box', padding: '8px 20px', display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: 'var(--text-secondary)', borderTop: '1px solid var(--divider)' }}>
          <Icon d={IC.shield} size={16} />
          <span>{s.twoFactorRequired ? 'ورود دومرحله‌ای برای همهٔ کاربران پنل اجباری است.' : 'ورود دومرحله‌ای اختیاری است؛ از تب «امنیت» آن را اجباری کنید.'}</span>
        </div>
      </div>

      <div className="card" style={{ width: 400, flex: 'none', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <div style={{ height: 52, flex: 'none', boxSizing: 'border-box', padding: '0 20px', display: 'flex', alignItems: 'center', gap: 10 }}>
          <h6 style={{ margin: 0, fontSize: 16, fontWeight: 700, lineHeight: 1.2 }}>ماتریس نقش‌ها</h6>
          {dirty && <Lbl tone="warning" style={{ height: 20, padding: '0 6px', fontSize: 11 }}>ذخیره‌نشده</Lbl>}
          <button type="button" className="btnt" onClick={saveMatrix} disabled={save.isPending} style={{ marginRight: 'auto', height: 28, padding: '0 8px', fontSize: 12 }}>{save.isPending ? 'در حال ذخیره…' : 'ذخیره'}</button>
        </div>
        <div style={{ height: 36, flex: 'none', display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) repeat(4, 56px)', alignItems: 'center', padding: '0 20px', background: 'var(--table-head)', color: 'var(--grey-600)', fontSize: 11, fontWeight: 700 }}>
          <span>دسترسی</span>{ROLE_KEYS.map((k) => <span key={k} style={{ textAlign: 'center', whiteSpace: 'nowrap' }}>{ROLES[k].short}</span>)}
        </div>
        {PERMS.map(([p, label]) => (
          <div key={p} style={{ height: 40, flex: 'none', display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) repeat(4, 56px)', alignItems: 'center', padding: '0 20px', borderBottom: '1px dashed var(--divider)', fontSize: 12 }}>
            <span style={{ fontWeight: 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{label}</span>
            {ROLE_KEYS.map((k) => {
              const locked = k === 'pm';
              const on = locked ? true : !!mx[p]?.[k];
              return (
                <span key={k} style={{ display: 'grid', placeItems: 'center' }}>
                  <button type="button" className={on ? 'ck on' : 'ck'} aria-label={`${ROLES[k].role} — ${label}`} aria-pressed={on} disabled={locked} style={{ cursor: locked ? 'not-allowed' : 'pointer', opacity: locked ? 0.7 : 1 }}
                    onClick={() => setMx({ ...mx, [p]: { ...(mx[p] ?? {}), [k]: !on } } as typeof mx)}>
                    {on && <Icon d={IC.check} size={14} strokeWidth={3} />}
                  </button>
                </span>
              );
            })}
          </div>
        ))}
        <div style={{ padding: '12px 20px', fontSize: 11, color: 'var(--text-secondary)', lineHeight: 1.5 }}>نقش «مدیر محصول» همهٔ دسترسی‌ها را دارد و قابل ویرایش نیست؛ برای تغییر مالکیت از پشتیبانی نمادنو کمک بگیرید.</div>
      </div>

      {invite && <InviteModal onClose={() => setInvite(false)} />}
    </div>
  );
}

function InviteModal({ onClose }: { onClose: () => void }) {
  const toast = useToast();
  const inviteM = useInviteTeamMember();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<RoleKey>('sup');
  const [err, setErr] = useState('');
  const submit = () => {
    if (name.trim().length < 3) return setErr('نام و نام خانوادگی را کامل وارد کنید.');
    if (!/^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i.test(email.trim())) return setErr('ایمیل سازمانی معتبر نیست.');
    inviteM.mutate({ name: name.trim(), email: email.trim(), roleKey: role }, {
      onSuccess: () => { toast(`دعوت با نقش «${ROLES[role].role}» برای ${name.trim()} ارسال شد`); onClose(); },
      onError: (e) => setErr(errMsg(e)),
    });
  };
  return (
    <Modal open onClose={onClose} width={520} label="افزودن کاربر به پنل بهره‌بردار">
      <DlgHead title="افزودن کاربر به پنل بهره‌بردار" onClose={onClose} />
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px 16px' }}>
          <div className="fg"><label className="fl" htmlFor="inv-name">نام و نام خانوادگی</label><input id="inv-name" className="fi" value={name} placeholder="مثلاً نیلوفر امینی" onChange={(e: React.ChangeEvent<HTMLInputElement>) => { setName(e.target.value); setErr(''); }} /></div>
          <div className="fg"><label className="fl" htmlFor="inv-mail">ایمیل سازمانی</label><input id="inv-mail" className="fi" dir="ltr" value={email} placeholder="name@namadno.ir" onChange={(e: React.ChangeEvent<HTMLInputElement>) => { setEmail(e.target.value); setErr(''); }} /></div>
        </div>
        <div className="fg"><span className="fl">نقش</span><div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>{ROLE_KEYS.map((k) => <Chip key={k} on={role === k} onClick={() => setRole(k)} style={{ height: 30, padding: '0 12px' }}>{ROLES[k].role}</Chip>)}</div></div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, minHeight: 40, boxSizing: 'border-box', padding: '8px 12px', borderRadius: 8, background: 'var(--soft-info)', color: 'var(--info-text)', fontSize: 12, fontWeight: 500 }}>
          <Icon d={IC.info} size={18} style={{ flex: 'none' }} />
          <span>لینک دعوت ۴۸ ساعت اعتبار دارد و فعال‌سازی ورود دومرحله‌ای در اولین ورود اجباری است.</span>
        </div>
      </div>
      <FormError>{err}</FormError>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <button type="button" className="btnp" onClick={submit} disabled={inviteM.isPending} style={{ opacity: inviteM.isPending ? 0.7 : 1 }}><Icon d={IC.mail} size={16} />{inviteM.isPending ? 'در حال ارسال…' : 'ارسال دعوت'}</button>
        <button type="button" className="btno" onClick={onClose}>انصراف</button>
      </div>
    </Modal>
  );
}

// ───────────────────────── Generic panels ─────────────────────────
type Draft = Partial<OpSettingsX>;
type Row =
  | { kind: 'text'; key: string; label: string; sub: string; w: number; ltr?: boolean; readOnly?: boolean; get: (d: OpSettingsX) => string; set: (v: string) => Draft; validate?: (v: string, d: OpSettingsX) => string | null }
  | { kind: 'num'; key: string; label: string; sub: string; w: number; suffix: string; min: number; max: number; get: (d: OpSettingsX) => number; set: (v: number) => Draft }
  | { kind: 'switch'; key: string; label: string; sub: string; get: (d: OpSettingsX) => boolean; set: (v: boolean, d: OpSettingsX) => Draft }
  | { kind: 'chips'; key: string; label: string; sub: string; options: [string, string][]; get: (d: OpSettingsX) => string; set: (v: string) => Draft }
  | { kind: 'action'; key: string; label: string; sub: (d: OpSettingsX) => string; button: string; action: 'rotate' | 'revoke' };

const NOTIFY_DEF = { requests: true, risk: true, legal: true, services: true, orgs: false };
const notifySw = (key: keyof typeof NOTIFY_DEF, label: string, sub: string): Row => ({
  kind: 'switch', key: 'notify.' + key, label, sub, get: (d) => (d.notify ?? NOTIFY_DEF)[key], set: (v, d) => ({ notify: { ...(d.notify ?? NOTIFY_DEF), [key]: v } }),
});
const EMAIL = /^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i;
const PANELS: Record<Exclude<Tab, 'users' | 'status'>, { title: string; sub: string; rows: Row[] }> = {
  general: { title: 'تنظیمات عمومی', sub: 'نام، زبان و منطقهٔ زمانی پلتفرم', rows: [
    { kind: 'text', key: 'platformName', label: 'نام نمایشی پلتفرم', sub: 'در اپ و ایمیل‌ها نشان داده می‌شود', w: 140, get: (d) => d.platformName, set: (v) => ({ platformName: v }), validate: (v) => (v.trim().length < 2 ? 'نام نمایشی پلتفرم الزامی است.' : null) },
    { kind: 'chips', key: 'lang', label: 'زبان پیش‌فرض پنل', sub: 'زبان اپ کاربران از تنظیمات خودشان خوانده می‌شود', options: [['fa', 'فارسی'], ['en', 'English']], get: (d) => d.lang ?? 'fa', set: (v) => ({ lang: v as 'fa' | 'en' }) },
    { kind: 'text', key: 'timezone', label: 'منطقهٔ زمانی', sub: 'برای زمان‌بندی NAV و گزارش‌ها', w: 140, ltr: true, get: (d) => d.timezone ?? 'Asia/Tehran', set: (v) => ({ timezone: v }), validate: (v) => (/^[A-Za-z_]+\/[A-Za-z_]+$/.test(v.trim()) ? null : 'منطقهٔ زمانی معتبر نیست (مثلاً Asia/Tehran).') },
    { kind: 'text', key: 'navTime', label: 'ساعت به‌روزرسانی NAV', sub: 'پس از پایان معاملات', w: 72, ltr: true, get: (d) => faDigits(d.navTime ?? '14:00'), set: (v) => ({ navTime: v.replace(/[۰-۹]/g, (c) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(c))) }), validate: (v) => (/^([01]\d|2[0-3]):[0-5]\d$/.test(v.replace(/[۰-۹]/g, (c) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(c)))) ? null : 'ساعت به‌روزرسانی NAV باید به شکل ۱۴:۰۰ باشد.') },
    { kind: 'switch', key: 'maintenance', label: 'حالت نگهداری', sub: 'اپ کاربران فقط‌خواندنی می‌شود', get: (d) => d.maintenance, set: (v) => ({ maintenance: v }) },
  ] },
  security: { title: 'امنیت', sub: 'سیاست‌های ورود و نشست کاربران پنل', rows: [
    { kind: 'switch', key: 'twoFactorRequired', label: 'ورود دومرحله‌ای اجباری', sub: 'برای همهٔ کاربران پنل بهره‌بردار', get: (d) => d.twoFactorRequired, set: (v) => ({ twoFactorRequired: v }) },
    { kind: 'num', key: 'sessionMinutes', label: 'مهلت نشست بدون فعالیت', sub: 'پس از آن خروج خودکار', w: 56, suffix: 'دقیقه', min: 5, max: 240, get: (d) => d.sessionMinutes, set: (v) => ({ sessionMinutes: v }) },
    { kind: 'num', key: 'minPasswordLength', label: 'حداقل طول رمز', sub: 'همراه با حرف بزرگ و عدد', w: 56, suffix: 'کاراکتر', min: 8, max: 64, get: (d) => d.minPasswordLength ?? 12, set: (v) => ({ minPasswordLength: v }) },
    { kind: 'switch', key: 'ipRestrict', label: 'محدودسازی IP', sub: 'فقط از شبکهٔ دفتر و VPN', get: (d) => !!d.ipRestrict, set: (v) => ({ ipRestrict: v }) },
    { kind: 'action', key: 'sessions', label: 'نشست‌های فعال', sub: (d) => `${faDigits(d.activeSessions ?? 1)} نشست در ${faDigits(d.activeDevices ?? 1)} دستگاه`, button: 'خروج از همهٔ نشست‌ها', action: 'revoke' },
  ] },
  integ: { title: 'یکپارچه‌سازی', sub: 'API، وب‌هوک و اتصال سیستم‌های HR سازمان‌ها و فروشگاه‌های طرف قرارداد', rows: [
    { kind: 'text', key: 'apiKeyMasked', label: 'کلید API فعال', sub: '', w: 160, ltr: true, readOnly: true, get: (d) => d.apiKeyMasked ?? '—', set: () => ({}) },
    { kind: 'action', key: 'rotate', label: 'چرخش کلید', sub: () => 'کلید قبلی ۲۴ ساعت معتبر می‌ماند', button: 'ساخت کلید جدید', action: 'rotate' },
    { kind: 'switch', key: 'webhookEnabled', label: 'وب‌هوک رویدادها', sub: 'تأیید بسته، تغییر NAV، وضعیت درخواست', get: (d) => d.webhookEnabled !== false, set: (v) => ({ webhookEnabled: v }) },
    { kind: 'text', key: 'webhookUrl', label: 'آدرس وب‌هوک', sub: 'POST با امضای HMAC', w: 220, ltr: true, get: (d) => d.webhookUrl ?? '', set: (v) => ({ webhookUrl: v }), validate: (v, d) => (d.webhookEnabled !== false && !/^https:\/\/[^\s/]+\.[^\s]+$/.test(v.trim()) ? 'آدرس وب‌هوک باید با https:// شروع شود.' : null) },
    { kind: 'num', key: 'rateLimit', label: 'سقف فراخوانی', sub: 'به ازای هر کلید', w: 56, suffix: 'در دقیقه', min: 10, max: 10000, get: (d) => d.rateLimit ?? 600, set: (v) => ({ rateLimit: v }) },
  ] },
  notif: { title: 'اعلان‌ها', sub: 'چه رویدادهایی به تیم بهره‌بردار اطلاع داده شود', rows: [
    notifySw('requests', 'درخواست جدید نیازمند تأیید', 'وام، برداشت بالای سقف، تغییر قرارداد'),
    notifySw('risk', 'هشدار ریسک بحرانی', 'امتیاز ریسک بالای ۸۰'),
    notifySw('legal', 'مسدودی قانونی', 'ثبت، دستور رفع یا رفع مسدودی با شماره مرجع'),
    notifySw('services', 'اختلال سرویس', 'از پایش سلامت سرویس‌ها'),
    notifySw('orgs', 'سازمان جدید', 'ثبت یا عقد قرارداد'),
    { kind: 'text', key: 'dailyEmail', label: 'ایمیل گزارش روزانه', sub: 'خلاصهٔ AUM و درخواست‌ها هر صبح', w: 160, ltr: true, get: (d) => d.dailyEmail ?? '', set: (v) => ({ dailyEmail: v }), validate: (v) => (v.trim() && !EMAIL.test(v.trim()) ? 'ایمیل گزارش روزانه معتبر نیست.' : null) },
  ] },
};

function PanelTab({ tab, s }: { tab: Exclude<Tab, 'users' | 'status'>; s: OpSettingsX }) {
  const toast = useToast();
  const save = useUpdateOpSettingsX();
  const rotate = useRotateApiKey();
  const revoke = useRevokeSessions();
  const panel = PANELS[tab];
  const [draft, setDraft] = useState<Draft>({});
  const [confirm, setConfirm] = useState<'rotate' | 'revoke' | null>(null);
  const [err, setErr] = useState('');
  const cur: OpSettingsX = { ...s, ...draft };
  const dirty = Object.keys(draft).length > 0;
  const apply = (d: Draft) => { setDraft({ ...draft, ...d }); setErr(''); };

  const onSave = () => {
    for (const r of panel.rows) {
      if (r.kind === 'text' && r.validate) { const m = r.validate(r.get(cur), cur); if (m) return setErr(m); }
      if (r.kind === 'num') { const v = r.get(cur); if (!(v >= r.min && v <= r.max)) return setErr(`«${r.label}» باید بین ${money(r.min)} تا ${money(r.max)} ${r.suffix} باشد.`); }
    }
    if (!dirty) return toast('تغییری برای ذخیره وجود ندارد', 'info');
    save.mutate(draft, { onSuccess: () => { setDraft({}); toast(`تنظیمات «${panel.title}» ذخیره شد`); }, onError: (e) => setErr(errMsg(e)) });
  };
  const runAction = () => {
    const a = confirm;
    if (a === 'rotate') rotate.mutate({}, { onSuccess: () => { setConfirm(null); toast('کلید جدید ساخته شد؛ کلید قبلی تا ۲۴ ساعت معتبر است'); }, onError: (e) => { setConfirm(null); toast(errMsg(e), 'error'); } });
    if (a === 'revoke') revoke.mutate({}, { onSuccess: () => { setConfirm(null); toast('همهٔ نشست‌ها به‌جز نشست فعلی خاتمه یافت'); }, onError: (e) => { setConfirm(null); toast(errMsg(e), 'error'); } });
  };

  return (
    <div style={{ display: 'flex', gap: 24 }}>
      <div className="card" style={{ flex: 1, minWidth: 0, maxWidth: 640, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <div style={{ minHeight: 52, flex: 'none', boxSizing: 'border-box', padding: '8px 20px', display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <h6 style={{ margin: 0, fontSize: 16, fontWeight: 700, lineHeight: 1.2 }}>{panel.title}</h6>
          <span style={{ marginRight: 'auto', fontSize: 12, color: 'var(--text-secondary)' }}>{panel.sub}</span>
        </div>
        <div style={{ padding: '0 20px', display: 'flex', flexDirection: 'column' }}>
          {panel.rows.map((r) => {
            const sub = r.kind === 'action' ? r.sub(cur) : r.key === 'apiKeyMasked' ? `ساخته‌شده در ${cur.apiKeyCreatedAt ? jDate(cur.apiKeyCreatedAt) : '—'} · فقط‌خواندنی` : r.sub;
            return (
              <div key={r.key} style={{ minHeight: 56, display: 'flex', alignItems: 'center', gap: 12, borderTop: '1px dashed var(--divider)' }}>
                <span style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', lineHeight: 1.25 }}>
                  <label htmlFor={'st-' + r.key} style={{ fontSize: 13, fontWeight: 500, whiteSpace: 'nowrap' }}>{r.label}</label>
                  <span style={{ fontSize: 11, color: 'var(--text-secondary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{sub}</span>
                </span>
                {r.kind === 'text' && (
                  <span className="fld" style={{ height: 32, flex: 'none', background: r.readOnly ? 'var(--bg-neutral)' : undefined }}>
                    <input id={'st-' + r.key} aria-label={r.label} dir={r.ltr ? 'ltr' : 'rtl'} readOnly={r.readOnly} value={r.get(cur)} onChange={(e: React.ChangeEvent<HTMLInputElement>) => apply(r.set(e.target.value))} style={{ width: r.w, height: 30, padding: '0 8px', textAlign: r.ltr ? 'left' : 'right', color: r.readOnly ? 'var(--text-secondary)' : undefined }} />
                  </span>
                )}
                {r.kind === 'num' && <NumField id={'st-' + r.key} value={r.get(cur)} onChange={(n) => apply(r.set(n))} w={r.w} suffix={r.suffix} label={r.label} invalid={!(r.get(cur) >= r.min && r.get(cur) <= r.max)} />}
                {r.kind === 'switch' && <Sw on={r.get(cur)} onClick={() => apply(r.set(!r.get(cur), cur))} label={r.label} />}
                {r.kind === 'chips' && <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>{r.options.map(([v, l]) => <Chip key={v} on={r.get(cur) === v} onClick={() => apply(r.set(v))} style={{ height: 26 }}>{l}</Chip>)}</span>}
                {r.kind === 'action' && <button type="button" className="btno" onClick={() => setConfirm(r.action)} style={{ height: 32 }}>{r.button}</button>}
              </div>
            );
          })}
        </div>
        {err && <div style={{ padding: '8px 20px 0' }}><FormError>{err}</FormError></div>}
        <div style={{ marginTop: 12, height: 56, flex: 'none', boxSizing: 'border-box', padding: '0 20px', display: 'flex', alignItems: 'center', gap: 10, borderTop: '1px solid var(--divider)' }}>
          <button type="button" className="btnp" onClick={onSave} disabled={save.isPending} style={{ opacity: save.isPending ? 0.7 : 1 }}>{save.isPending ? 'در حال ذخیره…' : 'ذخیره'}</button>
          <button type="button" className="btnt" onClick={() => { setDraft({}); setErr(''); }} disabled={!dirty} style={{ opacity: dirty ? 1 : 0.5 }}>انصراف</button>
          {dirty && <Lbl tone="warning" style={{ marginRight: 'auto' }}>تغییرات ذخیره‌نشده</Lbl>}
        </div>
      </div>
      <Confirm open={confirm !== null} onClose={() => setConfirm(null)} busy={rotate.isPending || revoke.isPending} onConfirm={runAction} danger={confirm === 'revoke'}
        title={confirm === 'rotate' ? 'ساخت کلید API جدید' : 'خروج از همهٔ نشست‌ها'} confirmLabel={confirm === 'rotate' ? 'ساخت کلید جدید' : 'خروج از همهٔ نشست‌ها'}
        body={confirm === 'rotate' ? 'کلید فعلی تا ۲۴ ساعت معتبر می‌ماند؛ پس از آن، سیستم‌های HR و فروشگاه‌هایی که با کلید قبلی متصل‌اند باید کلید جدید را دریافت کنند.' : 'همهٔ کاربران پنل به‌جز نشست فعلی شما خارج می‌شوند و باید دوباره با ورود دومرحله‌ای وارد شوند.'} />
    </div>
  );
}

// ───────────────────────── System status ─────────────────────────
const SVC: Record<'ok' | 'slow' | 'down', { l: string; t: ToneKey; dot: string }> = {
  ok: { l: 'سالم', t: 'success', dot: '--success-main' }, slow: { l: 'کند', t: 'warning', dot: '--warning-main' }, down: { l: 'اختلال', t: 'error', dot: '--error-main' },
};
const SEV: Record<'high' | 'medium' | 'low', { l: string; t: ToneKey }> = { high: { l: 'بالا', t: 'error' }, medium: { l: 'متوسط', t: 'warning' }, low: { l: 'کم', t: 'default' } };
function StatusTab() {
  const toast = useToast();
  const q = useSystemStatus();
  const refresh = useRefreshSystemStatus();
  const st = q.data;
  if (q.isLoading) return <Skeleton h={360} />;
  if (q.isError || !st) return <ErrorState message={errMsg(q.error)} onRetry={() => q.refetch()} />;
  const down = st.services.filter((x) => x.status === 'down').length;
  const slow = st.services.filter((x) => x.status === 'slow').length;
  const ICOLS = '92px minmax(0, 1fr) 120px 72px 64px 88px';
  return (
    <div style={{ display: 'flex', gap: 24, alignItems: 'flex-start' }}>
      <div className="card" style={{ width: 420, flex: 'none', display: 'flex', flexDirection: 'column', overflow: 'hidden', paddingBottom: 16 }}>
        <div style={{ height: 52, flex: 'none', boxSizing: 'border-box', padding: '0 20px', display: 'flex', alignItems: 'center', gap: 10 }}>
          <h6 style={{ margin: 0, fontSize: 16, fontWeight: 700, lineHeight: 1.2 }}>سلامت سرویس‌ها</h6>
          {down ? <Lbl tone="warning">{faDigits(down)} اختلال</Lbl> : slow ? <Lbl tone="warning">{faDigits(slow)} کند</Lbl> : <Lbl tone="success">همه سالم</Lbl>}
          <button type="button" className="btnt" disabled={refresh.isPending} onClick={() => refresh.mutate({}, { onSuccess: () => toast('وضعیت سرویس‌ها به‌روزرسانی شد'), onError: (e) => toast(errMsg(e), 'error') })} style={{ marginRight: 'auto', height: 28, padding: '0 8px', fontSize: 12 }}>
            <Icon d={IC.refresh} size={16} /><span className="num">{time(st.checkedAt)}</span>
          </button>
        </div>
        <div style={{ height: 32, flex: 'none', display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 64px 72px 72px', alignItems: 'center', padding: '0 20px', background: 'var(--table-head)', color: 'var(--grey-600)', fontSize: 12, fontWeight: 700 }}>
          <span>سرویس</span><span>تأخیر</span><span>۳۰ روز</span><span>وضعیت</span>
        </div>
        {st.services.map((x) => {
          const m = SVC[x.status];
          return (
            <div key={x.id} style={{ minHeight: 48, flex: 'none', display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 64px 72px 72px', alignItems: 'center', padding: '0 20px', borderBottom: '1px dashed var(--divider)', fontSize: 13 }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
                <span style={{ width: 8, height: 8, borderRadius: '50%', background: `var(${m.dot})`, boxShadow: `0 0 0 3px ${TONES[m.t][0]}`, flex: 'none' }} />
                <span style={{ display: 'flex', flexDirection: 'column', lineHeight: 1.25, minWidth: 0 }}><span style={{ fontWeight: 500, whiteSpace: 'nowrap' }}>{x.name}</span><span style={{ fontSize: 11, color: 'var(--text-secondary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{x.sub}</span></span>
              </span>
              <span className="num" dir="ltr" style={{ fontSize: 12, color: 'var(--text-secondary)', textAlign: 'right' }}>{x.latencyMs === null ? '—' : faDigits(x.latencyMs) + 'ms'}</span>
              <span className="num" dir="ltr" style={{ fontSize: 12, textAlign: 'right' }}>{faDigits(x.uptime, true)}٪</span>
              <span><Lbl tone={m.t} style={{ height: 20, padding: '0 6px' }}>{m.l}</Lbl></span>
            </div>
          );
        })}
        {down > 0 && st.notice && (
          <div style={{ margin: '12px 20px 0', boxSizing: 'border-box', padding: '10px 12px', borderRadius: 8, background: 'var(--soft-error)', color: 'var(--error-text)', fontSize: 12, fontWeight: 500, lineHeight: 1.5, display: 'flex', gap: 10, alignItems: 'flex-start' }}>
            <Icon d={IC.alert} size={18} style={{ flex: 'none', marginTop: 1 }} /><span>{st.notice}</span>
          </div>
        )}
      </div>
      <div className="card" style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <div style={{ height: 52, flex: 'none', boxSizing: 'border-box', padding: '0 20px', display: 'flex', alignItems: 'center', gap: 10 }}>
          <h6 style={{ margin: 0, fontSize: 16, fontWeight: 700, lineHeight: 1.2 }}>تاریخچه رخدادها</h6>
          <Lbl>۳۰ روز گذشته</Lbl>
          <Link href={routes.op.risk} style={{ marginRight: 'auto', fontSize: 13, fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: 4 }}>ریسک و تقلب<Icon d={IC.chevL} size={16} /></Link>
        </div>
        <div style={{ overflowX: 'auto' }}>
          <div style={{ minWidth: 520 }}>
            <div style={{ height: 32, display: 'grid', gridTemplateColumns: ICOLS, alignItems: 'center', padding: '0 20px', background: 'var(--table-head)', color: 'var(--grey-600)', fontSize: 12, fontWeight: 700 }}>
              <span>تاریخ</span><span>رخداد</span><span>سرویس</span><span>شدت</span><span>مدت</span><span>وضعیت</span>
            </div>
            {st.incidents.map((i) => (
              <div key={i.id} style={{ minHeight: 48, display: 'grid', gridTemplateColumns: ICOLS, alignItems: 'center', padding: '0 20px', borderBottom: '1px dashed var(--divider)', fontSize: 13 }}>
                <span className="num" style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{jDate(i.at)}</span>
                <span style={{ display: 'flex', flexDirection: 'column', lineHeight: 1.25, minWidth: 0 }}><span style={{ fontWeight: 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{i.title}</span><span style={{ fontSize: 11, color: 'var(--text-secondary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{i.sub}</span></span>
                <span style={{ fontSize: 12, color: 'var(--text-secondary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{i.service}</span>
                <span><Lbl tone={SEV[i.severity].t} style={{ height: 20, padding: '0 6px', fontSize: 11 }}>{SEV[i.severity].l}</Lbl></span>
                <span className="num" style={{ fontSize: 12 }}>{i.duration}</span>
                <span><Lbl tone={i.state === 'open' ? 'warning' : 'success'} style={{ height: 20, padding: '0 6px', fontSize: 11 }}>{i.state === 'open' ? 'در حال رفع' : 'رفع شد'}</Lbl></span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
