export class LoginPage {
  constructor(page, baseUrl) {
    this.page = page;
    this.baseUrl = baseUrl;
    this.emailInput = page.getByRole('textbox', { name: 'Enter your registered work' });
    this.passwordInput = page.getByRole('textbox', { name: 'Enter your password' });
    this.submitButton = page.locator('button[type="submit"], form button').first();
  }

  async goto() {
    await this.page.goto(`${this.baseUrl}/login`, { waitUntil: 'domcontentloaded' });
  }

  async submit(email, password) {
    await this.emailInput.fill(email);
    await this.passwordInput.fill(password);
    await this.submitButton.click();
  }
}
