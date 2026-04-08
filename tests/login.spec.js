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
    expectedError: "auth.failed",
  },
  {
    name: "wrong email",
    email: "fake@gmail.com",
    password: "Abc123",
    success: false,
    expectedError: "auth.failed",
  },
  {
    name: "empty login",
    email: "",
    password: "",
    success: false,
    expectedError: "validation.required", 
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
      // Nhánh thành công
      await page.getByRole("button", { name: "Đăng nhập" }).click();
      await expect(page).toHaveURL("https://admin.calibee.vn/", {
        timeout: 15000,
      });
    } else {
      // Nhánh thất bại (sai pass, sai email, để trống)
      await page.getByRole("button", { name: "Đăng nhập" }).click();

      // Kiểm tra linh hoạt theo từng expectedError tương ứng
      await expect(page.getByText(c.expectedError).first()).toBeVisible({
        timeout: 10000,
      });

      await expect(page).toHaveURL(/login/);
    }
  });
}
