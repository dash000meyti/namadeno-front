import type { MockDB } from '../db';
import { DB_VERSION } from '../db';
import { FUNDS, buildSara } from './core';
import {
  ARMAN_EMPLOYEES, ARMAN_PACKAGES, BLOG, FAQ, ORGANIZATIONS, PLATFORM_USERS, PRODUCTS, REQUESTS, RISK_ALERTS, RULES, STORES,
} from './platform';
import { extraSeeds } from './extra';

const clone = <T,>(x: T): T => JSON.parse(JSON.stringify(x));

export function buildSeed(): MockDB {
  const base: MockDB = {
    version: DB_VERSION,
    funds: clone(FUNDS),
    users: { 'u-1001': buildSara() },
    platformUsers: clone(PLATFORM_USERS),
    organizations: clone(ORGANIZATIONS),
    employees: { 'org-arman': clone(ARMAN_EMPLOYEES) },
    orgPackages: { 'org-arman': clone(ARMAN_PACKAGES) },
    requests: clone(REQUESTS),
    products: clone(PRODUCTS),
    rules: clone(RULES),
    riskAlerts: clone(RISK_ALERTS),
    stores: clone(STORES),
    faq: clone(FAQ),
    blog: clone(BLOG),
    extra: {},
    sessions: {},
    otp: {},
  };
  for (const apply of extraSeeds) apply(base);
  return base;
}
