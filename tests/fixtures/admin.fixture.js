import { test as base } from '@playwright/test';
import { emptyStorageState, loginAsAdmin } from '../support/auth.js';

export const test = base.extend({
  page: async ({ page }, use) => {
    await page.context().clearCookies();
    await use(page);
  },

  adminPage: async ({ page }, use) => {
    await loginAsAdmin(page);
    await use(page);
  },
});

test.use({ storageState: emptyStorageState });

export { expect } from '@playwright/test';
