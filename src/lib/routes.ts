/**
 * Single source of truth for in-app URLs. Every link/redirect uses these helpers
 * so the design's screen names map to stable routes.
 *
 *  design file                    → route
 *  app-login / app-signup         → /app/login, /app/signup
 *  app-assets                     → /app
 *  app-inbox / app-inbox-fixed    → /app/inbox (?open=<inboxId> expands a package)
 *  app-inbox-done / -archive      → /app/inbox/done?id=, /app/inbox/archive
 *  app-rial / app-gold / app-fixed→ /app/assets/rial | gold | fixed  (/app/assets/[kind] for other funds)
 *  app-convert                    → /app/convert?dir=buy|sell&fund=<fundId>
 *  app-done                       → /app/receipt?tx=<transactionId>
 *  org-*                          → /org/...    op-* → /op/...
 */
const q = (params: Record<string, string | number | undefined>) => {
  const s = Object.entries(params).filter(([, v]) => v !== undefined && v !== '').map(([k, v]) => `${k}=${encodeURIComponent(String(v))}`).join('&');
  return s ? `?${s}` : '';
};

export const routes = {
  site: {
    home: '/', blog: '/blog', post: (slug: string) => `/blog/${slug}`, about: '/about', business: '/business', faq: '/faq', contact: '/contact',
    security: '/security', careers: '/careers', terms: '/terms', privacy: '/privacy', map: '/map', designSystem: '/design-system',
  },
  app: {
    login: '/app/login', signup: '/app/signup', home: '/app', notifications: '/app/notifications', profile: '/app/profile', kyc: '/app/kyc', support: '/app/support',
    inbox: (open?: string) => `/app/inbox${q({ open })}`, inboxDone: (id: string) => `/app/inbox/done${q({ id })}`, inboxArchive: '/app/inbox/archive',
    funds: '/app/funds', deposit: (to?: string) => `/app/deposit${q({ to })}`, asset: (kind: string) => `/app/assets/${kind}`,
    convert: (dir: 'buy' | 'sell' = 'buy', fund = 'gold') => `/app/convert${q({ dir, fund })}`,
    withdraw: '/app/withdraw', receipt: (tx: string) => `/app/receipt${q({ tx })}`,
    history: (category?: string) => `/app/history${q({ category })}`, transaction: (id: string) => `/app/history/${id}`,
    credit: '/app/credit', score: '/app/credit/score', loan: '/app/credit/loan',
    loanConfirm: (amount: number, months: number, collateral: string) => `/app/credit/loan/confirm${q({ amount, months, collateral })}`,
    payInstallment: (loan?: string, inst?: string) => `/app/credit/pay${q({ loan, inst })}`,
    card: '/app/card', cardCharge: '/app/card/charge', cardOtp: '/app/card/otp', cardSettings: '/app/card/settings', cardSettle: '/app/card/settle',
    installment: '/app/installment', store: (id: string) => `/app/installment/store/${id}`,
    installmentPlan: (store: string, product?: string) => `/app/installment/plan${q({ store, product })}`,
    installmentConfirm: (p: { store: string; product?: string; months: number; down?: number; col?: string }) => `/app/installment/confirm${q(p)}`,
    installmentDone: (id: string) => `/app/installment/done${q({ id })}`,
  },
  org: {
    login: '/org/login', dashboard: '/org', employees: '/org/employees', employee: (id: string) => `/org/employees/${id}`, employeeNew: '/org/employees/new',
    packages: '/org/packages', package: (id: string) => `/org/packages/${id}`,
    newRecipients: (draft?: string) => `/org/packages/new${q({ draft })}`,
    newSettings: (draft: string) => `/org/packages/new/settings${q({ draft })}`,
    newReview: (draft: string) => `/org/packages/new/review${q({ draft })}`,
    newSent: (id: string) => `/org/packages/new/sent${q({ id })}`,
    credit: '/org/credit', requests: '/org/requests', reports: '/org/reports', contract: '/org/contract',
  },
  op: {
    login: '/op/login', overview: '/op', organizations: '/op/organizations', organization: (id: string) => `/op/organizations/${id}`, orgNew: '/op/organizations/new',
    funds: '/op/funds', fund: (id: string) => `/op/funds/${id}`, products: '/op/products', rules: '/op/rules',
    users: '/op/users', user: (id: string) => `/op/users/${id}`, requests: '/op/requests', risk: '/op/risk', reports: '/op/reports', settings: '/op/settings',
  },
};
