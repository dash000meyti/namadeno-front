/**
 * Area-specific seed additions. Each area owns one file and may add data to the DB
 * (usually under db.extra.<key>). Core entities live in core.ts / platform.ts.
 */
import type { MockDB } from '../db';
import { seed_appCore } from './extra-app-core';
import { seed_appMoney } from './extra-app-money';
import { seed_appCredit } from './extra-app-credit';
import { seed_orgPeople } from './extra-org-people';
import { seed_orgPackages } from './extra-org-packages';
import { seed_opCore } from './extra-op-core';
import { seed_opSystem } from './extra-op-system';
import { seed_site } from './extra-site';

export const extraSeeds: ((db: MockDB) => void)[] = [seed_appCore, seed_appMoney, seed_appCredit, seed_orgPeople, seed_orgPackages, seed_opCore, seed_opSystem, seed_site];
