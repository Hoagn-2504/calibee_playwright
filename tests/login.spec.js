import { test, expect } from '@playwright/test';

test.use({ storageState: { cookies: [], origins: [] } });

const requiredEnv = (name) => {
  if (!process.env[name]) throw new Error(`Missing required environment variable: ${name}`);
  return process.env[name];
};
const ADMIN_BASE_URL = process.env.ADMIN_BASE_URL || 'https://admin.calibee.vn';
const ADMIN_EMAIL = requiredEnv('ADMIN_EMAIL');
const ADMIN_PASSWORD = requiredEnv('ADMIN_PASSWORD');
const LOGIN_URL = `${ADMIN_BASE_URL}/login`;

const cases = [
  {
    name: 'success',
    email: ADMIN_EMAIL,
    password: ADMIN_PASSWORD,
    success: true,
  },
  {
    name: 'wrong password',
    email: ADMIN_EMAIL,
    password: '123',
    success: false,
    expectedError: 'auth.failed',
  },
  {
    name: 'wrong email',
    email: 'fake@gmail.com',
    password: ADMIN_PASSWORD,
    success: false,
    expectedError: 'auth.failed',
  },
  {
    name: 'empty login',
    email: '',
    password: '',
    success: false,
    expectedError: 'validation.required',
  },
];

for (const c of cases) {
  test(`Login ${c.name}`, async ({ page }) => {
    await page.goto(LOGIN_URL, { waitUntil: 'networkidle' });

    await page.getByRole('textbox', { name: 'Enter your registered work' }).fill(c.email);
    await page.getByRole('textbox', { name: 'Enter your password' }).fill(c.password);
    await page.locator('button[type="submit"], form button').first().click();

    if (c.success) {
      await expect(page).toHaveURL(`${ADMIN_BASE_URL}/`, { timeout: 15000 });
      return;
    }

    await expect(page.getByText(c.expectedError).first()).toBeVisible({ timeout: 10000 });
    await expect(page).toHaveURL(/login/);
  });
}
