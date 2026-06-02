import { test, expect } from './fixtures/admin.fixture.js';
import { adminConfig } from './support/env.js';

test.describe('Dashboard & Navigation', () => {
  test('Dashboard page is rendered', async ({ adminPage }) => {
    await expect(adminPage).toHaveTitle(/Calibee/i);
  });

  test('Admin can log out', async ({ adminPage }) => {
    const logoutForm = adminPage.locator('form[action*="logout"]').first();
    const logoutButton = logoutForm.locator('button[type="submit"], button').first();

    if (!await logoutButton.isVisible().catch(() => false)) {
      const profileMenu = adminPage.locator('li.dropdown.profile > a.dropdown-toggle').first();
      await expect(profileMenu).toBeVisible({ timeout: 15000 });
      await profileMenu.click({ force: true });
    }

    await expect(logoutForm).toHaveCount(1, { timeout: 10000 });
    const logoutResponsePromise = adminPage.waitForResponse(
      response => response.url().includes('/logout'),
      { timeout: 15000 }
    ).catch(() => null);

    await Promise.all([
      adminPage.waitForURL(/login|\/$/, { timeout: 15000 }).catch(() => {}),
      logoutButton.evaluate(button => button.click()),
    ]);
    await logoutResponsePromise;

    await adminPage.goto(`${adminConfig.baseUrl}/login`, { waitUntil: 'domcontentloaded' });
    await expect(adminPage.getByRole('textbox', { name: 'Enter your registered work' })).toBeVisible({ timeout: 15000 });
  });
});
