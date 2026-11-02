'use client';
/**
 * /op/settings — kit settings page: section tabs →
 *   general · notifications                              settings groups (Switch, NumberInput, text) + sticky save bar
 *   users & roles                                        team table (invite dialog, activate / deactivate) + role matrix (save bar while edited)
 *   system status                                        service health table + incident history
 * Security (sign-in policy, sessions) and integrations (API keys, webhooks) are set by the development team in code, and
 * the panel language (always Persian) and time zone (always Tehran) are fixed — none of them is a setting here.
 */
import { useEffect, useMemo, useState } from 'react';
import { useOpSettings } from '@/api/op';
import {
  useInviteTeamMember, useRefreshSystemStatus, useSetTeamMemberStatus, useSystemStatus, useUpdateOpSettingsX,
  type Incident, type OpSettingsX, type OpTeamMember, type PermKey, type RoleKey, type ServiceHealth,
} from '@/api/op-system-extra';
import {
  ActionBar, Ava, Card, Chips, Dialog, Empty, ErrorBlock, Field, Ident, Note, NumInput, NumberInput, PageHeading, Pill,
  SettingRow, SettingsGroup, SkeletonCard, Switch, Table, Tabs, type Column, type Tone,
} from '@/components/panel/kit';
import { Icon } from '@/components/ui/Icon';
import { useToast } from '@/components/ui/Toast';
import { IC } from '@/components/op/system/ui';
import { dayTime, errMsg } from '@/components/op/system/fmt';
import { faDigits, jDate, money, time } from '@/lib/format';
import { routes } from '@/lib/routes';
import { FEATURES } from '@/lib/features';

type Tab = 'general' | 'users' | 'notif' | 'status';
const TABS: { key: Tab; label: string }[] = [
  { key: 'general', label: 'عمومی' }, { key: 'users', label: 'کاربران و نقش‌ها' }, { key: 'notif', label: 'اعلان‌ها' }, { key: 'status', label: 'وضعیت سیستم' },
];

export default function OpSettingsPage() {
  const q = useOpSettings();
  const status = useSystemStatus();
  const [tab, setTab] = useState<Tab>('general');
  const s = q.data as OpSettingsX | undefined;
  const issues = (status.data?.services ?? []).filter((x) => x.status !== 'ok');
  const down = issues.some((x) => x.status === 'down');
  return (
    <>
      <PageHeading title="تنظیمات" sub="پلتفرم، تیم بهره‌بردار، اعلان‌ها و پایش سرویس‌ها">
        <span className="mute" style={{ fontSize: 12.5 }}>نسخهٔ پلتفرم <span className="num ltr" style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{faDigits(s?.platformVersion ?? '—', true)}</span></span>
      </PageHeading>

      <Tabs label="بخش‌های تنظیمات" size="lg" value={tab} onChange={setTab}
        items={TABS.map((t) => (t.key === 'status' && issues.length ? { ...t, count: issues.length, hot: down } : t))} />

      {tab === 'status' ? <StatusTab />
        : q.isLoading ? <SkeletonCard h={360} />
        : q.isError || !s ? <ErrorBlock error={q.error} message={errMsg(q.error)} onRetry={() => q.refetch()} />
        : tab === 'users' ? <UsersTab s={s} />
        : <PanelTab key={tab} tab={tab} s={s} />}
    </>
  );
}

// ───────────────────────── Users & roles ─────────────────────────
const ROLES: Record<RoleKey, { role: string; short: string; tone: Tone }> = {
  pm: { role: 'مدیر محصول', short: 'محصول', tone: 'primary' }, fin: { role: 'مالی', short: 'مالی', tone: 'neutral' },
  risk: { role: 'ریسک', short: 'ریسک', tone: 'neutral' }, sup: { role: 'پشتیبانی', short: 'پشتیبانی', tone: 'neutral' },
};
const ROLE_KEYS: RoleKey[] = ['pm', 'fin', 'risk', 'sup'];
const PERMS: [PermKey, string][] = [
  ['orgs', 'مشاهده سازمان‌ها'], ['contracts', 'ویرایش قراردادها'], ['requests', 'تأیید درخواست‌ها'], ['funds', 'مدیریت صندوق‌ها'],
  ['rules', 'تغییر قوانین و ریسک'], ['legal', 'مسدود کردن و رفع مسدودی'], ['users', 'مشاهده‌ی کاربران'],
];
const OWNER_ID = 'op-301';
const memberStatus = (m: OpTeamMember): { label: string; tone: Tone } => (m.status === 'inactive' ? { label: 'غیرفعال', tone: 'neutral' } : m.status === 'invited' ? { label: 'دعوت‌شده', tone: 'warning' } : { label: 'فعال', tone: 'success' });
const EMAIL = /^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i;

function UsersTab({ s }: { s: OpSettingsX }) {
  const toast = useToast();
  const setStatus = useSetTeamMemberStatus();
  const save = useUpdateOpSettingsX();
  const [invite, setInvite] = useState(false);
  const server = useMemo(() => s.roleMatrix ?? ({} as NonNullable<OpSettingsX['roleMatrix']>), [s.roleMatrix]);
  const [mx, setMx] = useState(server);
  useEffect(() => setMx(server), [server]);
  const changed = PERMS.reduce((n, [p]) => n + ROLE_KEYS.filter((k) => k !== 'pm' && !!mx[p]?.[k] !== !!server[p]?.[k]).length, 0);
  const team = s.team;
  const roleOf = (m: OpTeamMember): RoleKey => m.roleKey ?? (ROLE_KEYS.find((k) => ROLES[k].role === m.role) ?? 'sup');

  const toggleUser = (m: OpTeamMember) => {
    if (m.id === OWNER_ID) return toast('مالک پنل را نمی‌توان غیرفعال کرد', 'error');
    const next = m.status === 'inactive' ? 'active' : 'inactive';
    setStatus.mutate({ id: m.id, status: next }, { onSuccess: () => toast(next === 'active' ? `${m.name} فعال شد` : m.status === 'invited' ? `دعوت ${m.name} لغو شد` : `${m.name} غیرفعال شد`), onError: (e) => toast(errMsg(e), 'error') });
  };
  const saveMatrix = () => {
    if (!changed) return toast('تغییری برای ذخیره وجود ندارد', 'info');
    save.mutate({ roleMatrix: mx }, { onSuccess: () => toast('ماتریس نقش‌ها ذخیره شد'), onError: (e) => toast(errMsg(e), 'error') });
  };

  const teamCols: Column<OpTeamMember>[] = [
    { key: 'who', label: 'کاربر', width: 'minmax(0, 1.6fr)', render: (m) => <Ident lead={<Ava letter={m.name[0]} id={m.id} />} title={m.name} sub={m.email} subLtr /> },
    { key: 'role', label: 'نقش', width: '120px', render: (m) => { const r = ROLES[roleOf(m)]; return <Pill tone={r.tone}>{r.role}</Pill>; } },
    { key: 'st', label: 'وضعیت', width: '100px', render: (m) => { const st = memberStatus(m); return <Pill tone={st.tone} dot>{st.label}</Pill>; } },
    { key: 'last', label: 'آخرین ورود', width: '120px', render: (m) => <span className="num sm">{m.lastLoginAt ? dayTime(m.lastLoginAt) : '—'}</span> },
    {
      key: 'act', label: '', width: '40px', align: 'end', render: (m) => {
        const on = m.status !== 'inactive';
        const busy = setStatus.isPending && setStatus.variables?.id === m.id;
        const aria = on ? (m.status === 'invited' ? 'لغو دعوت ' : 'غیرفعال‌سازی ') + m.name : 'فعال‌سازی ' + m.name;
        return <button type="button" className="nm-ib" aria-label={aria} title={aria} disabled={busy} onClick={() => toggleUser(m)}><Icon d={on ? IC.ban : IC.check} size={18} /></button>;
      },
    },
  ];
  const matrixCols: Column<[PermKey, string]>[] = [
    { key: 'perm', label: 'دسترسی', width: 'minmax(0, 1.6fr)', render: ([, label]) => <span className="el" style={{ fontWeight: 500 }}>{label}</span> },
    ...ROLE_KEYS.map((k): Column<[PermKey, string]> => ({
      key: k, label: ROLES[k].short, width: '96px', align: 'center', render: ([p, label]) => {
        const locked = k === 'pm';
        const on = locked ? true : !!mx[p]?.[k];
        return (
          <button type="button" className="nm-tsel" role="checkbox" aria-checked={on} aria-label={`${ROLES[k].role} — ${label}`} disabled={locked}
            style={locked ? { opacity: 0.55, cursor: 'not-allowed' } : undefined}
            onClick={() => setMx({ ...mx, [p]: { ...(mx[p] ?? {}), [k]: !on } } as typeof mx)}>
            {on && <Icon d={IC.check} size={12} strokeWidth={3} />}
          </button>
        );
      },
    })),
  ];

  return (
    <>
      <Card flush title="کاربران پنل بهره‌بردار" count={team.length}
        actions={<button type="button" className="nm-btn sm" onClick={() => setInvite(true)}><Icon d={IC.plus} size={15} strokeWidth={2} />افزودن کاربر</button>}>
        <Table columns={teamCols} rows={team} rowKey={(m) => m.id} rowLabel={(m) => m.name} minWidth={640}
          empty={<Empty icon={IC.users} title="کاربری برای پنل بهره‌بردار ثبت نشده است" />} />
        <div className="nm-tfoot">
          <Icon d={IC.shield} size={16} />
          <span>{s.twoFactorRequired ? 'ورود دومرحله‌ای برای همهٔ کاربران پنل اجباری است.' : 'ورود دومرحله‌ای اختیاری است؛ از تب «امنیت» آن را اجباری کنید.'}</span>
        </div>
      </Card>

      <Card flush title="ماتریس نقش‌ها" actions={changed > 0 ? <Pill tone="warning" dot>ذخیره‌نشده</Pill> : undefined}>
        <Table columns={matrixCols} rows={PERMS} rowKey={([p]) => p} rowLabel={([, label]) => label} minWidth={560} />
        <div className="nm-tfoot">
          <Icon d={IC.info} size={16} />
          <span>نقش «مدیر محصول» همهٔ دسترسی‌ها را دارد و قابل ویرایش نیست؛ برای تغییر مالکیت از پشتیبانی نمادنو کمک بگیرید.</span>
        </div>
      </Card>

      {changed > 0 && (
        <ActionBar actions={(
          <>
            <button type="button" className="nm-btn ghost" onClick={() => setMx(server)}>لغو تغییرات</button>
            <button type="button" className="nm-btn" onClick={saveMatrix} disabled={save.isPending}><Icon d={IC.check} size={16} strokeWidth={2.2} />{save.isPending ? 'در حال ذخیره…' : 'ذخیره ماتریس نقش‌ها'}</button>
          </>
        )}>
          <Pill tone="warning" dot>{faDigits(changed)} تغییر ذخیره‌نشده در ماتریس نقش‌ها</Pill>
        </ActionBar>
      )}

      {invite && <InviteDialog onClose={() => setInvite(false)} />}
    </>
  );
}

function InviteDialog({ onClose }: { onClose: () => void }) {
  const toast = useToast();
  const inviteM = useInviteTeamMember();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<RoleKey>('sup');
  const [err, setErr] = useState('');
  const submit = () => {
    if (name.trim().length < 3) return setErr('نام و نام خانوادگی را کامل وارد کنید.');
    if (!EMAIL.test(email.trim())) return setErr('ایمیل سازمانی معتبر نیست.');
    inviteM.mutate({ name: name.trim(), email: email.trim(), roleKey: role }, {
      onSuccess: () => { toast(`دعوت با نقش «${ROLES[role].role}» برای ${name.trim()} ارسال شد`); onClose(); },
      onError: (e) => setErr(errMsg(e)),
    });
  };
  return (
    <Dialog
      open onClose={onClose} width={540} label="افزودن کاربر به پنل بهره‌بردار" title="افزودن کاربر به پنل بهره‌بردار"
      footer={(
        <>
          <button type="button" className="nm-btn ghost" onClick={onClose}>انصراف</button>
          <button type="button" className="nm-btn" onClick={submit} disabled={inviteM.isPending}><Icon d={IC.mail} size={16} />{inviteM.isPending ? 'در حال ارسال…' : 'ارسال دعوت'}</button>
        </>
      )}
    >
      <div className="nm-grid c2" style={{ gap: 12 }}>
        <Field label="نام و نام خانوادگی" htmlFor="inv-name">
          <span className="nm-in" style={{ width: '100%' }}><input id="inv-name" value={name} placeholder="مثلاً نیلوفر امینی" onChange={(e) => { setName(e.target.value); setErr(''); }} /></span>
        </Field>
        <Field label="ایمیل سازمانی" htmlFor="inv-mail">
          <span className="nm-in" style={{ width: '100%' }}><input id="inv-mail" dir="ltr" value={email} placeholder="name@namadno.ir" onChange={(e) => { setEmail(e.target.value); setErr(''); }} /></span>
        </Field>
      </div>
      <Field label="نقش">
        <Chips label="نقش" value={role} onChange={setRole} options={ROLE_KEYS.map((k) => ({ key: k, label: ROLES[k].role }))} />
      </Field>
      <Note tone="info">لینک دعوت ۴۸ ساعت اعتبار دارد و فعال‌سازی ورود دومرحله‌ای در اولین ورود اجباری است.</Note>
      {err && <Note tone="err">{err}</Note>}
    </Dialog>
  );
}

// ───────────────────────── Settings sections ─────────────────────────
type Draft = Partial<OpSettingsX>;
type Row =
  | { kind: 'text'; key: string; label: string; sub: string; w: number; ltr?: boolean; get: (d: OpSettingsX) => string; set: (v: string) => Draft; validate?: (v: string, d: OpSettingsX) => string | null }
  | { kind: 'num'; key: string; label: string; sub: string; w: number; suffix: string; min: number; max: number; get: (d: OpSettingsX) => number; set: (v: number) => Draft }
  | { kind: 'switch'; key: string; label: string; sub: string; get: (d: OpSettingsX) => boolean; set: (v: boolean, d: OpSettingsX) => Draft };
type PanelKey = Exclude<Tab, 'users' | 'status'>;
interface GroupDef { title: string; footer?: string; rows: Row[] }

const NOTIFY_DEF = { requests: true, risk: true, legal: true, services: true, orgs: false };
const notifySw = (key: keyof typeof NOTIFY_DEF, label: string, sub: string): Row => ({
  kind: 'switch', key: 'notify.' + key, label, sub, get: (d) => (d.notify ?? NOTIFY_DEF)[key], set: (v, d) => ({ notify: { ...(d.notify ?? NOTIFY_DEF), [key]: v } }),
});
const faToEn = (v: string) => v.replace(/[۰-۹]/g, (c) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(c)));
const PANELS: Record<PanelKey, { title: string; groups: GroupDef[] }> = {
  general: { title: 'تنظیمات عمومی', groups: [
    { title: 'پلتفرم', footer: 'زبان پنل‌ها و اپ همیشه فارسی و زمان‌ها به وقت تهران است.', rows: [
      { kind: 'text', key: 'platformName', label: 'نام نمایشی پلتفرم', sub: 'در اپ و ایمیل‌ها نشان داده می‌شود', w: 160, get: (d) => d.platformName, set: (v) => ({ platformName: v }), validate: (v) => (v.trim().length < 2 ? 'نام نمایشی پلتفرم الزامی است.' : null) },
      { kind: 'text', key: 'navTime', label: 'ساعت به‌روزرسانی NAV', sub: 'به وقت تهران · پس از پایان معاملات', w: 80, ltr: true, get: (d) => faDigits(d.navTime ?? '14:00'), set: (v) => ({ navTime: faToEn(v) }), validate: (v) => (/^([01]\d|2[0-3]):[0-5]\d$/.test(faToEn(v)) ? null : 'ساعت به‌روزرسانی NAV باید به شکل ۱۴:۰۰ باشد.') },
    ] },
    { title: 'نگهداری', rows: [
      { kind: 'switch', key: 'maintenance', label: 'حالت نگهداری', sub: 'اپ کاربران فقط‌خواندنی می‌شود', get: (d) => d.maintenance, set: (v) => ({ maintenance: v }) },
    ] },
  ] },
  notif: { title: 'اعلان‌ها', groups: [
    { title: 'رویدادها', footer: 'چه رویدادهایی به تیم بهره‌بردار اطلاع داده شود', rows: [
      ...(FEATURES.orgCredit ? [notifySw('requests', 'درخواست جدید نیازمند تأیید', 'وام، خرید اقساطی و افزایش اعتبار')] : []),
      notifySw('risk', 'هشدار ریسک بحرانی', 'امتیاز ریسک بالای ۸۰'),
      notifySw('legal', 'مسدودی', 'مسدود شدن حساب یا دارایی، دستور رفع یا رفع مسدودی'),
      notifySw('services', 'اختلال سرویس', 'از پایش سلامت سرویس‌ها'),
      notifySw('orgs', 'سازمان جدید', 'ثبت یا عقد قرارداد'),
    ] },
    { title: 'گزارش روزانه', rows: [
      { kind: 'text', key: 'dailyEmail', label: 'ایمیل گزارش روزانه', sub: 'خلاصهٔ AUM و درخواست‌ها هر صبح', w: 180, ltr: true, get: (d) => d.dailyEmail ?? '', set: (v) => ({ dailyEmail: v }), validate: (v) => (v.trim() && !EMAIL.test(v.trim()) ? 'ایمیل گزارش روزانه معتبر نیست.' : null) },
    ] },
  ] },
};

function PanelTab({ tab, s }: { tab: PanelKey; s: OpSettingsX }) {
  const toast = useToast();
  const save = useUpdateOpSettingsX();
  const panel = PANELS[tab];
  const [draft, setDraft] = useState<Draft>({});
  const [err, setErr] = useState('');
  const cur: OpSettingsX = { ...s, ...draft };
  const dirty = Object.keys(draft).length > 0;
  const apply = (d: Draft) => { setDraft({ ...draft, ...d }); setErr(''); };
  const rows = panel.groups.flatMap((g) => g.rows);

  const onSave = () => {
    for (const r of rows) {
      if (r.kind === 'text' && r.validate) { const m = r.validate(r.get(cur), cur); if (m) return setErr(m); }
      if (r.kind === 'num') { const v = r.get(cur); if (!(v >= r.min && v <= r.max)) return setErr(`«${r.label}» باید بین ${money(r.min)} تا ${money(r.max)} ${r.suffix} باشد.`); }
    }
    if (!dirty) return toast('تغییری برای ذخیره وجود ندارد', 'info');
    save.mutate(draft, { onSuccess: () => { setDraft({}); toast(`تنظیمات «${panel.title}» ذخیره شد`); }, onError: (e) => setErr(errMsg(e)) });
  };
  const control = (r: Row) => {
    const id = 'st-' + r.key;
    switch (r.kind) {
      case 'text':
        return <NumInput text id={id} label={r.label} ltr={r.ltr} width={r.w} value={r.get(cur)} onChange={(v) => apply(r.set(v))} />;
      case 'num': {
        const v = r.get(cur);
        return <NumberInput id={id} label={r.label} width={r.w} suffix={r.suffix} value={v} onChange={(n) => apply(r.set(n))} invalid={!(v >= r.min && v <= r.max)} />;
      }
      case 'switch':
        return <Switch on={r.get(cur)} onChange={() => apply(r.set(!r.get(cur), cur))} label={r.label} />;
    }
  };
  const subOf = (r: Row) => r.sub;

  return (
    <>
      <div className="nm-grid c2">
        {[0, 1].map((col) => (
          <div key={col} className="nm-stack">
            {panel.groups.filter((_, i) => i % 2 === col).map((g) => (
              <SettingsGroup key={g.title} title={g.title} footer={g.footer}>
                {g.rows.map((r) => (
                  <SettingRow key={r.key} label={r.label} desc={subOf(r) || undefined} htmlFor={r.kind === 'text' || r.kind === 'num' ? 'st-' + r.key : undefined}>
                    {control(r)}
                  </SettingRow>
                ))}
              </SettingsGroup>
            ))}
          </div>
        ))}
      </div>

      {err && <Note tone="err">{err}</Note>}

      <ActionBar actions={(
        <>
          {dirty && <button type="button" className="nm-btn ghost" onClick={() => { setDraft({}); setErr(''); }}>لغو تغییرات</button>}
          <button type="button" className="nm-btn" onClick={onSave} disabled={save.isPending}><Icon d={IC.check} size={16} strokeWidth={2.2} />{save.isPending ? 'در حال ذخیره…' : 'ذخیره'}</button>
        </>
      )}>
        {dirty ? <Pill tone="warning" dot>تغییرات ذخیره‌نشده</Pill> : <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}><Icon d={IC.info} size={16} />تغییرات این بخش پس از ذخیره اعمال می‌شود</span>}
      </ActionBar>

    </>
  );
}

// ───────────────────────── System status ─────────────────────────
const SVC: Record<ServiceHealth['status'], { label: string; tone: Tone }> = { ok: { label: 'سالم', tone: 'success' }, slow: { label: 'کند', tone: 'warning' }, down: { label: 'اختلال', tone: 'error' } };
const SEV: Record<Incident['severity'], { label: string; tone: Tone }> = { high: { label: 'بالا', tone: 'error' }, medium: { label: 'متوسط', tone: 'warning' }, low: { label: 'کم', tone: 'neutral' } };

function StatusTab() {
  const toast = useToast();
  const q = useSystemStatus();
  const refresh = useRefreshSystemStatus();
  const st = q.data;
  if (q.isLoading) return <SkeletonCard h={360} />;
  if (q.isError || !st) return <ErrorBlock error={q.error} message={errMsg(q.error)} onRetry={() => q.refetch()} />;
  const down = st.services.filter((x) => x.status === 'down').length;
  const slow = st.services.filter((x) => x.status === 'slow').length;

  const svcCols: Column<ServiceHealth>[] = [
    { key: 'svc', label: 'سرویس', width: 'minmax(0, 1.6fr)', render: (x) => <Ident title={x.name} sub={x.sub} /> },
    { key: 'lat', label: 'تأخیر', width: '96px', render: (x) => <span className="num ltr sm">{x.latencyMs === null ? '—' : faDigits(x.latencyMs) + 'ms'}</span> },
    { key: 'up', label: 'دسترس‌پذیری ۳۰ روز', width: '136px', render: (x) => <span className="num">{faDigits(x.uptime, true)}٪</span> },
    { key: 'st', label: 'وضعیت', width: '96px', render: (x) => <Pill tone={SVC[x.status].tone} dot>{SVC[x.status].label}</Pill> },
  ];
  const incCols: Column<Incident>[] = [
    { key: 'at', label: 'تاریخ', width: '96px', render: (i) => <span className="num sm">{jDate(i.at)}</span> },
    { key: 'title', label: 'رخداد', width: 'minmax(0, 1.6fr)', render: (i) => <Ident title={i.title} sub={i.sub} /> },
    { key: 'svc', label: 'سرویس', width: 'minmax(0, 1fr)', render: (i) => <span className="el mute">{i.service}</span> },
    { key: 'sev', label: 'شدت', width: '80px', render: (i) => <Pill tone={SEV[i.severity].tone}>{SEV[i.severity].label}</Pill> },
    { key: 'dur', label: 'مدت', width: '88px', render: (i) => <span className="num">{i.duration}</span> },
    { key: 'state', label: 'وضعیت', width: '100px', render: (i) => <Pill tone={i.state === 'open' ? 'warning' : 'success'} dot>{i.state === 'open' ? 'در حال رفع' : 'رفع شد'}</Pill> },
  ];

  return (
    <>
      <Card flush title="سلامت سرویس‌ها" sub={`آخرین بررسی ${time(st.checkedAt)}`}
        actions={(
          <>
            {down ? <Pill tone="error" dot>{faDigits(down)} اختلال</Pill> : slow ? <Pill tone="warning" dot>{faDigits(slow)} کند</Pill> : <Pill tone="success" dot>همه سالم</Pill>}
            <button type="button" className="nm-btn sm ghost" disabled={refresh.isPending} title="به‌روزرسانی وضعیت سرویس‌ها"
              onClick={() => refresh.mutate({}, { onSuccess: () => toast('وضعیت سرویس‌ها به‌روزرسانی شد'), onError: (e) => toast(errMsg(e), 'error') })}>
              <Icon d={IC.refresh} size={15} />به‌روزرسانی
            </button>
          </>
        )}>
        {down > 0 && st.notice && <div style={{ padding: '0 20px 12px' }}><Note tone="err">{st.notice}</Note></div>}
        <Table columns={svcCols} rows={st.services} rowKey={(x) => x.id} rowLabel={(x) => x.name} minWidth={560} />
      </Card>

      <Card flush title="تاریخچه رخدادها" sub="۳۰ روز گذشته" more={{ label: 'ریسک و تقلب', href: routes.op.risk }}>
        <Table columns={incCols} rows={st.incidents} rowKey={(i) => i.id} rowLabel={(i) => i.title} minWidth={720}
          empty={<Empty icon={IC.shield} tone="success" title="رخدادی در ۳۰ روز گذشته ثبت نشده است" />} />
      </Card>
    </>
  );
}
