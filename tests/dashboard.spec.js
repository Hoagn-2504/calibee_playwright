import { test, expect } from '@playwright/test';

test.use({ storageState: { cookies: [], origins: [] } });

const requiredEnv = (name) => {
  if (!process.env[name]) throw new Error(`Missing required environment variable: ${name}`);
  return process.env[name];
};
const ADMIN_BASE_URL = process.env.ADMIN_BASE_URL || 'https://admin.calibee.vn';
const ADMIN_EMAIL = requiredEnv('ADMIN_EMAIL');
const ADMIN_PASSWORD = requiredEnv('ADMIN_PASSWORD');

async function login(page) {
  await page.goto(`${ADMIN_BASE_URL}/login`, { waitUntil: 'domcontentloaded' });
  await page.getByRole('textbox', { name: 'Enter your registered work' }).fill(ADMIN_EMAIL);
  await page.getByRole('textbox', { name: 'Enter your password' }).fill(ADMIN_PASSWORD);
  await page.locator('button[type="submit"], form button').first().click();
  await expect(page).toHaveURL(`${ADMIN_BASE_URL}/`, { timeout: 15000 });
}

test.describe('Dashboard & Navigation', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  test('Kiểm tra trang Dashboard hiển thị đúng', async ({ page }) => {
    await expect(page).toHaveTitle(/Calibee/i);
  });

  test('Chức năng đăng xuất', async ({ page }) => {
    const logoutForm = page.locator('form[action*="logout"]').first();

    if (!await logoutForm.count()) {
      const profileMenu = page.locator('li.dropdown.profile > a, img[alt="profile Pic"]').first();
      await expect(profileMenu).toBeVisible({ timeout: 15000 });
      await profileMenu.click({ force: true });
    }

    await expect(logoutForm).toHaveCount(1, { timeout: 10000 });
    await logoutForm.evaluate(form => form.submit());
    await expect(page).toHaveURL(/login/, { timeout: 15000 });
  });
});
