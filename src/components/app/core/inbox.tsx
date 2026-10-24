'use client';
/**
 * Inbox package cards (design: app-inbox = free allocation, app-inbox-fixed = fixed allocation).
 */
import { useState } from 'react';
import Link from 'next/link';
import { Icon } from '@/components/ui/Icon';
import { faDigits, jDate, jDayMonth, money, units } from '@/lib/format';
import { routes } from '@/lib/routes';
import type { AllocationSplit, Fund, InboxPackage } from '@/types/domain';
import { P, PARTS, policyNote, policyTag, splitPct, type PartKey } from './meta';
import { ErrorNote, FreeLockedBlock } from './ui';

const pctFa = (n: number) => faDigits(Math.round(n)) + '٪';

/** «۱۰۰٪ درآمد ثابت» / «۶۰٪ طلا · ۴۰٪ درآمد ثابت» */
export function splitDesc(s: AllocationSplit | undefined, long = false) {
  return PARTS.filter((p) => splitPct(s, p.key) > 0).map((p) => `${pctFa(splitPct(s, p.key))} ${long ? p.name : p.short}`).join(' · ');
}

function Avatar({ name, size }: { name: string; size: 40 | 44 }) {
  return (
    <span style={{ width: size, height: size, borderRadius: 12, background: 'var(--soft-primary)', color: 'var(--primary-text)', display: 'grid', placeItems: 'center', fontSize: size === 44 ? 18 : 16, fontWeight: 800, flex: 'none' }}>
      {name.trim().charAt(0)}
    </span>
  );
}

export function LockTag({ pkg, style }: { pkg: InboxPackage; style?: React.CSSProperties }) {
  const t = policyTag(pkg.lockPolicy);
  return (
    <span className="lktype" style={{ background: t.bg, color: t.fg, ...style }}>
      <Icon d={t.d} size={12} />{t.label}
    </span>
  );
}

/** Collapsed pending package row (64px). */
export function CollapsedPackage({ pkg, above }: { pkg: InboxPackage; above: boolean }) {
  const desc = pkg.allocationMode === 'free'
    ? `تخصیص آزاد · ${pkg.cashAllowed ? 'برداشت مجاز' : 'فقط صندوق'}`
    : `تخصیص ثابت ${splitDesc(pkg.fixedSplit)}`;
  return (
    <Link href={routes.app.inbox(pkg.id)} replace scroll={false} className="card" aria-label={`باز کردن ${pkg.title}`} style={{ boxSizing: 'border-box', height: 64, padding: '0 14px', display: 'flex', alignItems: 'center', gap: 12, color: 'var(--text-primary)', textDecoration: 'none', flex: 'none' }}>
      <Avatar name={pkg.orgName} size={40} />
      <span style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 2, lineHeight: 1.3 }}>
        <span style={{ fontSize: 14, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{pkg.title}</span>
        <span style={{ fontSize: 11, color: 'var(--text-secondary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          <span className="num" style={{ fontWeight: 400 }}>{money(pkg.amount)}</span> تومان · {desc}
        </span>
      </span>
      <LockTag pkg={pkg} />
      <Icon d={above ? P.chevDown : P.chevLeft} size={18} style={{ color: 'var(--text-disabled)' }} />
    </Link>
  );
}

function PackageHead({ pkg }: { pkg: InboxPackage }) {
  return (
    <div style={{ height: 48, display: 'flex', alignItems: 'center', gap: 12 }}>
      <Avatar name={pkg.orgName} size={44} />
      <span style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 3, lineHeight: 1.3 }}>
        <span style={{ fontSize: 15, fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{pkg.title}</span>
        <span style={{ fontSize: 12, color: 'var(--text-secondary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{pkg.orgName} · دریافت {jDayMonth(pkg.sentAt, true)}</span>
      </span>
      <span style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 2, lineHeight: 1.2 }}>
        <span className="num" style={{ fontSize: 20, whiteSpace: 'nowrap' }}>{money(pkg.amount)}</span>
        <span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>تومان</span>
      </span>
    </div>
  );
}

function RulesBox({ pkg, rules }: { pkg: InboxPackage; rules: { k: string; v: string; d: string; c: string }[] }) {
  return (
    <div style={{ boxSizing: 'border-box', padding: '6px 10px', borderRadius: 12, background: 'var(--bg-neutral)', display: 'flex', flexDirection: 'column' }}>
      {rules.map((r) => (
        <div key={r.k} style={{ height: 26, display: 'flex', alignItems: 'center', gap: 8 }}>
          <Icon d={r.d} size={16} style={{ color: r.c }} />
          <span style={{ fontSize: 12, lineHeight: 1.3, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            <span style={{ fontWeight: 600 }}>{r.k}</span> <span style={{ color: 'var(--text-secondary)' }}>{r.v}</span>
          </span>
        </div>
      ))}
      <div style={{ height: 32, display: 'flex', alignItems: 'center', gap: 8, borderTop: '1px dashed var(--divider)', marginTop: 2 }}>
        <LockTag pkg={pkg} />
        <span className="num" style={{ minWidth: 0, fontSize: 12, fontWeight: 400, color: 'var(--text-secondary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{policyNote(pkg.lockPolicy)}</span>
      </div>
    </div>
  );
}

function ConfirmNote() {
  return (
    <div style={{ height: 28, display: 'flex', alignItems: 'center', gap: 6, color: 'var(--text-secondary)' }}>
      <Icon d={P.info} size={14} />
      <span style={{ fontSize: 11, lineHeight: 1.3 }}>تا تأیید نکنید مبلغ به دارایی شما اضافه نمی‌شود.</span>
    </div>
  );
}

function Actions({ onAccept, busy, laterHref }: { onAccept: () => void; busy: boolean; laterHref: string }) {
  return (
    <div style={{ height: 44, display: 'flex', gap: 8 }}>
      <button className="btn" onClick={onAccept} aria-busy={busy || undefined} disabled={busy} style={{ flex: 1, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', boxSizing: 'border-box', background: 'var(--primary-main)', color: 'var(--primary-contrast)', boxShadow: 'var(--shadow-primary)', opacity: busy ? 0.72 : 1, cursor: busy ? 'progress' : 'pointer' }}>
        {busy ? 'در حال ثبت…' : 'تأیید و دریافت'}
      </button>
      <Link href={laterHref} className="btn" style={{ width: 76, padding: 0, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', boxSizing: 'border-box', background: 'transparent', color: 'var(--primary-text)', textDecoration: 'none' }}>بعداً</Link>
    </div>
  );
}

/** Free/reserved outcome of a split under the package's lock policy. Rial always lands free. */
export function outcome(pkg: InboxPackage, s: AllocationSplit) {
  let free = 0;
  let locked = 0;
  const freeN: string[] = [];
  const lockN: string[] = [];
  for (const p of PARTS) {
    const v = Math.round((pkg.amount * splitPct(s, p.key)) / 100);
    if (!v) continue;
    if (p.key !== 'rial' && pkg.lockPolicy.type !== 'none') { locked += v; lockN.push(p.short); } else { free += v; freeN.push(p.short); }
  }
  const lp = pkg.lockPolicy;
  const until = lp.type === 'vesting' ? ' · آزاد در ' + jDate(lp.releaseAt) : lp.type === 'milestone' ? ' · دریافت مرحله‌ای' : '';
  return { free, locked, freeNote: `${freeN.join(' و ') || '—'} · قابل برداشت`, lockNote: `${lockN.join(' و ') || '—'}${until}` };
}

// ───────────────────────── Free allocation (app-inbox) ─────────────────────────

type Mix = 'gold' | 'fixed' | 'half' | 'custom';
type K = 'g' | 'f' | 'r';

export function FreePackage({ pkg, onAccept, busy, error }: { pkg: InboxPackage; onAccept: (s: AllocationSplit) => void; busy: boolean; error?: unknown }) {
  const cash = pkg.cashAllowed;
  const [mix, setMix] = useState<Mix>('half');
  const [v, setV] = useState<Record<K, number>>(cash ? { g: 50, f: 30, r: 20 } : { g: 50, f: 50, r: 0 });

  const pcts: [number, number, number] = mix === 'gold' ? [100, 0, 0] : mix === 'fixed' ? [0, 100, 0] : mix === 'half' ? [50, 50, 0] : [v.g, v.f, cash ? v.r : 0];
  const split: AllocationSplit = { gold: pcts[0], fixed: pcts[1], ...(pcts[2] ? { rial: pcts[2] } : null) };

  const step = (k: K, delta: 1 | -1) => {
    setV((cur) => {
      const n = { ...cur };
      const keys: K[] = cash ? ['g', 'f', 'r'] : ['g', 'f'];
      const others = (k === 'r' ? ['g', 'f'] : ['r', k === 'g' ? 'f' : 'g']).filter((o) => keys.includes(o as K)) as K[];
      if (delta > 0) {
        for (const o of others) { if (n[o] >= 10) { n[o] -= 10; n[k] += 10; break; } }
      } else if (n[k] >= 10 && others.length) { n[k] -= 10; n[others[0]] += 10; }
      return n;
    });
  };

  const edit = mix === 'custom';
  const lockedFunds = pkg.lockPolicy.type !== 'none';
  const tag = policyTag(pkg.lockPolicy);
  const kOf: Record<PartKey, K> = { gold: 'g', fixed: 'f', rial: 'r' };
  const rows = PARTS.filter((p) => cash || p.key !== 'rial')
    .map((p, i) => ({ ...p, w: pcts[i], amount: Math.round((pkg.amount * pcts[i]) / 100), locked: p.key !== 'rial' && lockedFunds }))
    .filter((r) => edit || r.w > 0);

  const MIXES: [Mix, string, string, string[]][] = [
    ['gold', 'صندوق طلا', '۱۰۰٪ طلا', [PARTS[0].color]],
    ['fixed', 'درآمد ثابت', '۱۰۰٪ درآمد ثابت', [PARTS[1].color]],
    ['half', 'ترکیبی ۵۰/۵۰', '۵۰٪ طلا · ۵۰٪ درآمد ثابت', [PARTS[0].color, PARTS[1].color]],
    ['custom', 'دلخواه', cash ? 'طلا، درآمد ثابت و ریال' : 'طلا و درآمد ثابت', cash ? [PARTS[0].color, PARTS[1].color, PARTS[2].color] : [PARTS[0].color, PARTS[1].color]],
  ];

  const rules = [
    cash
      ? { k: 'برداشت نقدی:', v: 'مجاز', d: P.checkCircle, c: 'var(--success-text)' }
      : { k: 'برداشت نقدی:', v: 'ندارد · کل مبلغ در صندوق‌ها', d: P.info, c: 'var(--text-secondary)' },
    { k: 'تخصیص:', v: cash ? 'آزاد بین طلا / درآمد ثابت / ریال' : 'آزاد بین طلا / درآمد ثابت', d: P.sliders, c: 'var(--primary-text)' },
  ];
  const out = outcome(pkg, split);
  const sum = pcts[0] + pcts[1] + pcts[2];

  return (
    <div className="card" style={{ boxSizing: 'border-box', padding: 16, display: 'flex', flexDirection: 'column', gap: 10, flex: 'none' }}>
      <PackageHead pkg={pkg} />
      <RulesBox pkg={pkg} rules={rules} />

      {/* allocation composer */}
      <div style={{ height: 20, display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ fontSize: 13, fontWeight: 700 }}>تخصیص مبلغ</span>
        <span className="num" style={{ marginRight: 'auto', fontSize: 12, fontWeight: 500, color: sum === 100 ? 'var(--success-text)' : 'var(--error-text)' }}>جمع {pctFa(sum)}</span>
      </div>
      <div role="radiogroup" aria-label="نحوه تخصیص" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {MIXES.map(([key, label, sub, dots]) => {
          const on = key === mix;
          return (
            <div key={key} style={{ borderRadius: 12, border: `${on ? '2px' : '1px'} solid ${on ? 'var(--primary-main)' : 'var(--outline-border)'}`, background: 'transparent', boxShadow: on ? '0 0 0 3px rgb(var(--primary-main-rgb) / .12)' : 'none', overflow: 'hidden', transition: 'border-color .2s, box-shadow .2s, background .2s' }}>
              <button role="radio" aria-checked={on} onClick={() => setMix(key)} style={{ width: '100%', height: 48, boxSizing: 'border-box', padding: '0 12px', borderRadius: 0, border: 0, background: 'transparent', color: 'var(--text-primary)', fontFamily: 'inherit', textAlign: 'right', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ width: 18, height: 18, boxSizing: 'border-box', borderRadius: '50%', border: `2px solid ${on ? 'var(--primary-main)' : 'var(--grey-400)'}`, display: 'grid', placeItems: 'center', flex: 'none' }}>
                  <span style={{ width: 8, height: 8, borderRadius: '50%', background: on ? 'var(--primary-main)' : 'transparent' }} />
                </span>
                <span style={{ fontSize: 13.5, fontWeight: 700, whiteSpace: 'nowrap' }}>{label}</span>
                <span style={{ fontSize: 11.5, color: 'var(--text-secondary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', minWidth: 0 }}>{sub}</span>
                <span style={{ marginRight: 'auto', display: 'inline-flex', gap: 3, flex: 'none' }}>
                  {dots.map((c, i) => <span key={i} style={{ width: 8, height: 8, borderRadius: '50%', background: c }} />)}
                </span>
              </button>
              {on && (
                <div style={{ padding: '0 12px 12px', display: 'flex', flexDirection: 'column', gap: 4, borderTop: '1px dashed var(--divider)' }}>
                  {rows.map((r) => (
                    <div key={r.key} style={{ height: edit ? 44 : 32, display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ width: 8, height: 8, borderRadius: '50%', background: r.color, flex: 'none' }} />
                      <span style={{ flex: 1, minWidth: 0, display: 'flex', alignItems: 'center', gap: 4, fontSize: 13, fontWeight: 600, whiteSpace: 'nowrap' }}>
                        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{r.short}</span>
                        {r.locked && <Icon d={tag.d} size={12} title={tag.label} style={{ color: tag.fg }} />}
                      </span>
                      {edit ? (
                        <span dir="ltr" style={{ display: 'inline-flex', alignItems: 'center', gap: 2 }}>
                          <button aria-label={`کاهش سهم ${r.short}`} onClick={() => step(kOf[r.key], -1)} disabled={r.w < 10} style={{ width: 32, height: 32, border: '1px solid var(--outline-border)', borderRadius: 10, background: 'transparent', color: r.w < 10 ? 'var(--text-disabled)' : 'var(--text-primary)', display: 'grid', placeItems: 'center', cursor: r.w < 10 ? 'default' : 'pointer', padding: 0 }}>
                            <Icon d={P.minus} size={16} />
                          </button>
                          <span className="num" style={{ width: 34, textAlign: 'center', fontSize: 13.5, fontWeight: 500 }}>{pctFa(r.w)}</span>
                          <button aria-label={`افزایش سهم ${r.short}`} onClick={() => step(kOf[r.key], 1)} disabled={r.w >= 100} style={{ width: 32, height: 32, border: '1px solid var(--outline-border)', borderRadius: 10, background: 'transparent', color: r.w >= 100 ? 'var(--text-disabled)' : 'var(--text-primary)', display: 'grid', placeItems: 'center', cursor: r.w >= 100 ? 'default' : 'pointer', padding: 0 }}>
                            <Icon d={P.plus} size={16} />
                          </button>
                        </span>
                      ) : (
                        <span className="num" style={{ width: 40, textAlign: 'center', fontSize: 14, fontWeight: 600 }}>{pctFa(r.w)}</span>
                      )}
                      <span className="num" style={{ width: 70, textAlign: 'left', fontSize: 13, fontWeight: 400, color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>{money(r.amount)}</span>
                    </div>
                  ))}
                  <div style={{ height: 6, display: 'flex', gap: 2, marginTop: 4 }}>
                    {rows.filter((r) => r.w > 0).map((r) => <span key={r.key} style={{ flex: r.w, height: 6, borderRadius: 3, background: r.color }} />)}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* free vs locked after confirm */}
      <div style={{ boxSizing: 'border-box', padding: '10px 12px', borderRadius: 12, background: 'var(--bg-neutral)', display: 'flex', flexDirection: 'column', gap: 8 }}>
        <span style={{ fontSize: 12, fontWeight: 700 }}>پس از تأیید</span>
        <FreeLockedBlock free={out.free} locked={out.locked} freeNote={out.freeNote} lockNote={out.lockNote} fmt={money} />
      </div>
      <ConfirmNote />
      <ErrorNote error={error} />
      <Actions onAccept={() => onAccept(split)} busy={busy} laterHref={routes.app.home} />
    </div>
  );
}

// ───────────────────────── Fixed allocation (app-inbox-fixed) ─────────────────────────

export function FixedPackage({ pkg, funds, onAccept, busy, error }: { pkg: InboxPackage; funds?: Fund[]; onAccept: () => void; busy: boolean; error?: unknown }) {
  const s = pkg.fixedSplit ?? { gold: 0, fixed: 100 };
  const lp = pkg.lockPolicy;
  const rules = [
    {
      k: 'برداشت نقدی:',
      v: lp.type === 'none' ? 'با فروش واحدها، در هر زمان' : lp.type === 'vesting' ? `با فروش واحدها، پس از ${jDate(lp.releaseAt)}` : 'با فروش واحدها، پس از آزادسازی هر مرحله',
      d: lp.type === 'none' ? P.checkCircle : P.clock,
      c: lp.type === 'none' ? 'var(--success-text)' : 'var(--warning-text)',
    },
    { k: 'تخصیص:', v: 'ثابت — ' + splitDesc(s, true), d: P.sliders, c: 'var(--secondary-text)' },
  ];
  const rows = PARTS.map((p) => ({ ...p, w: splitPct(s, p.key), amount: Math.round((pkg.amount * splitPct(s, p.key)) / 100) }));
  const out = outcome(pkg, s);
  const nav = (id: string) => funds?.find((f) => f.id === id)?.nav;

  return (
    <div className="card" style={{ boxSizing: 'border-box', padding: '14px 14px 12px', display: 'flex', flexDirection: 'column', gap: 8, flex: 'none' }}>
      <PackageHead pkg={pkg} />
      <RulesBox pkg={pkg} rules={rules} />

      {/* locked composer */}
      <div style={{ height: 20, display: 'flex', alignItems: 'center', gap: 6 }}>
        <span style={{ fontSize: 13, fontWeight: 700 }}>تخصیص ثابت</span>
        <Icon d={P.sliders} size={14} style={{ color: 'var(--text-secondary)' }} />
        <span className="lbl" style={{ marginRight: 'auto', height: 20, padding: '0 6px', fontSize: 11, background: 'var(--soft-default)', color: 'var(--default-text)', fontWeight: 600 }}>تعیین‌شده توسط سازمان</span>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', opacity: 0.6 }} aria-disabled="true">
        {rows.map((r) => (
          <div key={r.key} style={{ height: 36, display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ width: 8, height: 8, borderRadius: '50%', background: r.color, flex: 'none' }} />
            <span style={{ flex: 1, minWidth: 0, fontSize: 13, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{r.short}</span>
            <span dir="ltr" style={{ display: 'inline-flex', alignItems: 'center', gap: 2 }}>
              <span style={{ width: 36, height: 36, boxSizing: 'border-box', border: '1px dashed var(--outline-border)', borderRadius: 10, color: 'var(--text-disabled)', display: 'grid', placeItems: 'center' }}><Icon d={P.minus} size={16} /></span>
              <span className="num" style={{ width: 40, textAlign: 'center', fontSize: 14, fontWeight: 500 }}>{pctFa(r.w)}</span>
              <span style={{ width: 36, height: 36, boxSizing: 'border-box', border: '1px dashed var(--outline-border)', borderRadius: 10, color: 'var(--text-disabled)', display: 'grid', placeItems: 'center' }}><Icon d={P.plus} size={16} /></span>
            </span>
            <span className="num" style={{ width: 78, textAlign: 'left', fontSize: 13, fontWeight: 400, color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>{money(r.amount)}</span>
          </div>
        ))}
      </div>
      <div style={{ height: 8, display: 'flex', gap: 2 }}>
        {rows.filter((r) => r.w > 0).map((r) => <span key={r.key} style={{ flex: r.w, height: 8, borderRadius: 3, background: r.color }} />)}
      </div>
      {rows.filter((r) => r.w > 0).map((r) => {
        const n = r.key === 'rial' ? undefined : nav(r.key);
        return (
          <div key={r.key} style={{ height: 16, display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>
            <span style={{ width: 8, height: 8, borderRadius: '50%', background: r.color }} />{r.name} <span className="num" style={{ fontWeight: 500, color: 'var(--text-primary)' }}>{pctFa(r.w)}</span>
            {n ? <span className="num" style={{ marginRight: 'auto', fontWeight: 400 }}>≈ {units(r.amount / n, 1)} واحد · NAV {money(n)}</span> : r.key === 'rial' ? <span style={{ marginRight: 'auto' }}>نقدی</span> : null}
          </div>
        );
      })}

      {/* free vs locked after confirm */}
      <div style={{ boxSizing: 'border-box', padding: '10px 12px', borderRadius: 12, background: 'var(--bg-neutral)', display: 'flex', flexDirection: 'column', gap: 8 }}>
        <span style={{ fontSize: 12, fontWeight: 700 }}>پس از تأیید</span>
        <FreeLockedBlock free={out.free} locked={out.locked} freeNote={out.freeNote} lockNote={out.lockNote} fmt={money} />
      </div>
      <div style={{ height: 20, display: 'flex', alignItems: 'center', gap: 6, color: 'var(--text-secondary)' }}>
        <Icon d={P.info} size={14} />
        <span style={{ fontSize: 11, lineHeight: 1.3 }}>تا تأیید نکنید مبلغ به دارایی شما اضافه نمی‌شود.</span>
      </div>
      <ErrorNote error={error} />
      <Actions onAccept={onAccept} busy={busy} laterHref={routes.app.home} />
    </div>
  );
}
