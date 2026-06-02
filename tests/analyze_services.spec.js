import { test, expect } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';
import { adminConfig } from './support/env.js';
import { emptyStorageState } from './support/auth.js';

test.use({ storageState: emptyStorageState });

const ADMIN_BASE_URL = adminConfig.baseUrl;
const ADMIN_EMAIL = adminConfig.email;
const ADMIN_PASSWORD = adminConfig.password;

test('Analyze and write form structures', async ({ page }) => {
  test.setTimeout(180000);

  await page.goto(`${ADMIN_BASE_URL}/login`);

  await page.getByRole('textbox', { name: 'Enter your registered work' }).fill(ADMIN_EMAIL);
  await page.getByRole('textbox', { name: 'Enter your password' }).fill(ADMIN_PASSWORD);
  await page.locator('button[type="submit"], form button').first().click();
  await expect(page).toHaveURL(`${ADMIN_BASE_URL}/`, { timeout: 15000 });

  const services = [
    'basic_cleaning',
    'subscription_service',
    'deep_cleaning',
    'air_condition',
    'sofa_service',
    'cooking_service',
    'elderly_care',
    'baby_service',
    'cleaning_after_construction',
    'electrical_service',
    'plumbing_service',
    'furniture_service',
    'locksmith',
    'paint_house_service',
    'pest_control',
  ];

  const results = {};

  for (const code of services) {
    await page.goto(`${ADMIN_BASE_URL}/bookings/create?service=${code}`);
    await expect(page.locator('#voyager-loader')).toBeHidden({ timeout: 15000 }).catch(() => {});
    await expect(page.locator('#btnCustomerChoice')).toBeVisible({ timeout: 15000 });

    const dropdowns = await page.evaluate(() => {
      const elements = Array.from(document.querySelectorAll('.btn-show-dropdown'));
      return elements.map(el => ({
        id: el.id,
        text: el.textContent?.trim(),
        dropdownListId: el.getAttribute('dropdown-list-id'),
      }));
    });

    const optionLabels = await page.evaluate(() => {
      const labels = Array.from(document.querySelectorAll('.form-check-label, label'));
      return Array.from(new Set(labels.map(label => label.textContent?.trim()).filter(Boolean)));
    });

    results[code] = {
      dropdowns,
      optionLabels,
    };
  }

  const outputPath = path.resolve(process.cwd(), 'tests', 'service_structures.json');
  fs.writeFileSync(outputPath, JSON.stringify(results, null, 2), 'utf-8');
  console.log(`Structures written to ${outputPath}`);
});
