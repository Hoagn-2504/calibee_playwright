import { test, expect } from "@playwright/test";

test.describe("Dashboard & Navigation", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("https://admin.calibee.vn/");
    
    if (page.url().includes("login")) {
      await page.getByRole("textbox", { name: "Enter your registered work" }).fill("hoangvu25042004@gmail.com");
      await page.getByRole("textbox", { name: "Enter your password" }).fill("Abc123");
      await page.getByRole("button", { name: "Đăng nhập" }).click();
      await expect(page).toHaveURL("https://admin.calibee.vn/", { timeout: 15000 });
    }
  });

  test("Kiểm tra trang Dashboard hiển thị đúng", async ({ page }) => {
    await expect(page).toHaveTitle(/Calibee/i);
  });

  test("Chức năng đăng xuất", async ({ page }) => {
    await page.locator('li.dropdown.profile > a').click();
    await page.locator('form[action*="logout"] button').evaluate(button => button.click());
    await expect(page).toHaveURL(/.*login/);
  });
});
