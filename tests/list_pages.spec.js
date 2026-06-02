import { test, expect } from './fixtures/admin.fixture.js';
import { adminConfig } from './support/env.js';
import { listPages } from './data/listPages.js';

test('Main list pages render data tables', async ({ adminPage }) => {
  test.setTimeout(180000);

  for (const pageConfig of listPages) {
    await test.step(pageConfig.name, async () => {
      await adminPage.goto(`${adminConfig.baseUrl}${pageConfig.path}`, { waitUntil: 'domcontentloaded' });
      await expect(adminPage).toHaveURL(new RegExp(`${pageConfig.path.replace('/', '\\/')}`), { timeout: 15000 });
      await expect(adminPage.locator('#voyager-loader')).toBeHidden({ timeout: 15000 }).catch(() => {});

      const table = adminPage.locator('table').first();
      await expect(table, `${pageConfig.name} should render a data table`).toBeVisible({ timeout: 30000 });

      for (const header of pageConfig.expectedHeaders) {
        await expect(
          adminPage.locator('table th').filter({ hasText: header }).first(),
          `${pageConfig.name} is missing "${header.toString()}" column`
        ).toBeVisible({ timeout: 15000 });
      }

      const rowCount = await adminPage.locator('table tbody tr').count();
      expect(rowCount, `${pageConfig.name} should render at least one table row`).toBeGreaterThan(0);
    });
  }
});
