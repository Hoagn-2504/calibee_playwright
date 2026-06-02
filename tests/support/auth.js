import { expect } from '@playwright/test';
import { adminConfig } from './env.js';
import { LoginPage } from '../pages/LoginPage.js';

export const emptyStorageState = { cookies: [], origins: [] };

export async function loginAsAdmin(page) {
  const loginPage = new LoginPage(page, adminConfig.baseUrl);
  await loginPage.goto();
  await loginPage.submit(adminConfig.email, adminConfig.password);
  await expect(page).toHaveURL(`${adminConfig.baseUrl}/`, { timeout: 15000 });
  await expect(page.locator('#voyager-loader')).toBeHidden({ timeout: 15000 }).catch(() => {});
}
