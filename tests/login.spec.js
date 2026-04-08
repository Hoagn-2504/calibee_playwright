import { test, expect } from "@playwright/test";

const URL = "https://admin.calibee.vn/login";

const cases = [
  {
    name: "success",
    email: "hoangvu25042004@gmail.com",
    password: "Abc123",
    success: true,
  },
  {
    name: "wrong password",
    email: "hoangvu25042004@gmail.com",
    password: "123",
    success: false,
  },
  {
    name: "wrong email",
    email: "fake@gmail.com",
    password: "Abc123",
    success: false,
  },
];

for (const c of cases) {
  test(`Login ${c.name}`, async ({ page }) => {
    await page.goto(URL, { waitUntil: "networkidle" });

    await page
      .getByRole("textbox", { name: "Enter your registered work" })
      .fill(c.email);

    await page
      .getByRole("textbox", { name: "Enter your password" })
      .fill(c.password);

    if (c.success) {
      // CÁCH MỚI: Chỉ cần click, sau đó dùng expect để check URL.
      // Playwright sẽ tự động chờ cho đến khi URL khớp, tối đa 15s.
      await page.getByRole("button", { name: "Đăng nhập" }).click();

      await expect(page).toHaveURL("https://admin.calibee.vn/", {
        timeout: 15000,
      });
    } else {
      await page.getByRole("button", { name: "Đăng nhập" }).click();

      // KHẮC PHỤC STRICT MODE: Thêm .first() vào cuối locator
      // KHẮC PHỤC TIMEOUT: Tăng thời gian chờ lên 10s đề phòng backend phản hồi chậm
      await expect(page.getByText("auth.failed").first()).toBeVisible({
        timeout: 10000,
      });

      await expect(page).toHaveURL(/login/);
    }
  });
}
