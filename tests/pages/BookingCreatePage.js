import { expect } from '@playwright/test';

export class BookingCreatePage {
  constructor(page, baseUrl) {
    this.page = page;
    this.baseUrl = baseUrl;
    this.customerChoiceButton = page.locator('#btnCustomerChoice');
    this.customerDropdown = page.locator('#dropdownListCustomer');
    this.loader = page.locator('#voyager-loader');
  }

  async goto(serviceCode) {
    await this.page.goto(`${this.baseUrl}/bookings/create?service=${serviceCode}`, {
      waitUntil: 'domcontentloaded',
    });
    await expect(this.customerChoiceButton).toBeVisible({ timeout: 15000 });
    await expect(this.loader).toBeHidden({ timeout: 15000 }).catch(() => {});
  }

  async selectCustomer(customerQuery) {
    await this.customerChoiceButton.click({ force: true });
    await expect(this.customerDropdown).toBeVisible({ timeout: 5000 });

    const configuredCustomer = this.page
      .locator('#dropdownListCustomer .dropdown-item-label')
      .getByText(customerQuery);

    if (await configuredCustomer.isVisible({ timeout: 3000 }).catch(() => false)) {
      await configuredCustomer.click({ force: true });
      await expect(this.loader).toBeHidden({ timeout: 15000 }).catch(() => {});
      return;
    }

    const firstAvailableCustomer = this.page
      .locator('#dropdownListCustomer .dropdown-item-label')
      .filter({ visible: true })
      .nth(1);

    await expect(
      firstAvailableCustomer,
      `Cannot find customer "${customerQuery}" and no fallback customer is available.`
    ).toBeVisible({ timeout: 5000 });
    await firstAvailableCustomer.click({ force: true });
    await expect(this.loader).toBeHidden({ timeout: 15000 }).catch(() => {});
  }
}
