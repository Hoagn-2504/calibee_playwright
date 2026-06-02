import { test, expect } from '@playwright/test';

test.use({ storageState: { cookies: [], origins: [] } });
test.describe.configure({ mode: 'serial' });

const requiredEnv = (name) => {
  if (!process.env[name]) throw new Error(`Missing required environment variable: ${name}`);
  return process.env[name];
};

const ADMIN_BASE_URL = process.env.ADMIN_BASE_URL || 'https://admin.calibee.vn';
const ADMIN_EMAIL = requiredEnv('ADMIN_EMAIL');
const ADMIN_PASSWORD = requiredEnv('ADMIN_PASSWORD');

const LIST_PAGES = [
  {
    name: 'Bookings',
    path: '/bookings',
    expectedHeaders: ['Service ID/Name', 'Customer', 'Status'],
  },
  {
    name: 'Customers',
    path: '/customers',
    expectedHeaders: ['ID/Tên khách hàng', 'Số điện thoại/Email'],
  },
  {
    name: 'Partners',
    path: '/workers',
    expectedHeaders: ['Collaborator ID/Name', 'Phone Number', 'Status'],
  },
  {
    name: 'Jobs',
    path: '/jobs',
    expectedHeaders: ['ID/Service Name', 'Khách hàng', 'Trạng thái'],
  },
  {
    name: 'Vouchers',
    path: '/promotions',
    expectedHeaders: ['ID', 'Name', 'Trạng thái'],
  },
  {
    name: 'Upcoming Jobs',
    path: '/upcomingjobs',
    expectedHeaders: ['Job ID', 'Khách hàng', 'Tên dịch vụ'],
  },
];

async function login(page) {
  await page.goto(`${ADMIN_BASE_URL}/login`, { waitUntil: 'domcontentloaded' });
  await page.getByRole('textbox', { name: 'Enter your registered work' }).fill(ADMIN_EMAIL);
  await page.getByRole('textbox', { name: 'Enter your password' }).fill(ADMIN_PASSWORD);
  await page.locator('button[type="submit"], form button').first().click();
  await expect(page).toHaveURL(`${ADMIN_BASE_URL}/`, { timeout: 15000 });
}

test('Các trang danh sách chính hiển thị bảng dữ liệu', async ({ page }) => {
  test.setTimeout(180000);
  await login(page);

  for (const pageConfig of LIST_PAGES) {
    await test.step(pageConfig.name, async () => {
      await page.goto(`${ADMIN_BASE_URL}${pageConfig.path}`, { waitUntil: 'domcontentloaded' });
      await expect(page).toHaveURL(new RegExp(`${pageConfig.path.replace('/', '\\/')}`), { timeout: 15000 });
      await expect(page.locator('#voyager-loader')).toBeHidden({ timeout: 15000 }).catch(() => {});

      const table = page.locator('table').first();
      await expect(table, `${pageConfig.name} phải có bảng dữ liệu`).toBeVisible({ timeout: 30000 });

      for (const header of pageConfig.expectedHeaders) {
        await expect(page.locator('table th').filter({ hasText: header }).first(), `${pageConfig.name} thiếu cột "${header}"`)
          .toBeVisible({ timeout: 15000 });
      }

      const rowCount = await page.locator('table tbody tr').count();
      expect(rowCount, `${pageConfig.name} phải render ít nhất 1 dòng trong bảng`).toBeGreaterThan(0);
    });
  }
});
