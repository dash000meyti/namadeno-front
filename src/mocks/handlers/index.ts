import { authHandlers } from './auth';
import { appHandlers } from './app';
import { orgHandlers } from './org';
import { opHandlers } from './op';
import { publicHandlers, mockHandlers } from './public';
import { appCoreHandlers } from './app-core-extra';
import { appMoneyHandlers } from './app-money-extra';
import { appCreditHandlers } from './app-credit-extra';
import { orgPeopleHandlers } from './org-people-extra';
import { orgPackagesHandlers } from './org-packages-extra';
import { opCoreHandlers } from './op-core-extra';
import { opSystemHandlers } from './op-system-extra';
import { siteHandlers } from './site-extra';

/** Area-specific handlers come first so an area can add/override endpoints without touching core files. */
export const handlers = [
  ...appCoreHandlers, ...appMoneyHandlers, ...appCreditHandlers, ...orgPeopleHandlers, ...orgPackagesHandlers, ...opCoreHandlers, ...opSystemHandlers, ...siteHandlers,
  ...authHandlers, ...appHandlers, ...orgHandlers, ...opHandlers, ...publicHandlers, ...mockHandlers,
];
