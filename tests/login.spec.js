import { test, expect } from './fixtures/admin.fixture.js';
import { adminConfig } from './support/env.js';
import { LoginPage } from './pages/LoginPage.js';

const cases = [
  {
    name: 'success',
    email: adminConfig.email,
    password: adminConfig.password,
    success: true,
  },
  {
    name: 'wrong password',
    email: adminConfig.email,
    password: '123',
    success: false,
    expectedError: 'auth.failed',
  },
  {
    name: 'wrong email',
    email: 'fake@gmail.com',
    password: adminConfig.password,
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
    const loginPage = new LoginPage(page, adminConfig.baseUrl);

    await loginPage.goto();
    await loginPage.submit(c.email, c.password);

    if (c.success) {
      await expect(page).toHaveURL(`${adminConfig.baseUrl}/`, { timeout: 15000 });
      return;
    }

    await expect(page.getByText(c.expectedError).first()).toBeVisible({ timeout: 10000 });
    await expect(page).toHaveURL(/login/);
  });
}
