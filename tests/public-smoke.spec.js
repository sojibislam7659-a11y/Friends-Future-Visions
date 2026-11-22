import { test, expect } from "@playwright/test";

const baseURL = process.env.FFV_QA_BASE_URL || "https://development-friends-future-visions-dev.sojibislam7659.workers.dev";

test("Development login screen loads and exposes required controls", async ({ page }) => {
  const pageErrors = [];
  page.on("pageerror", error => pageErrors.push(error.message));

  const response = await page.goto(`${baseURL}/login.html`, { waitUntil: "domcontentloaded" });
  expect(response?.status()).toBe(200);
  await expect(page.locator("#loginForm")).toBeVisible();
  await expect(page.locator("#email")).toHaveAttribute("type", "email");
  await expect(page.locator("#password")).toHaveAttribute("type", "password");
  await expect(page.locator("#loginButton")).toBeVisible();
  await expect(page.locator("#forgotPasswordLink")).toBeVisible();
  expect(pageErrors, "Login page JavaScript errors detected").toEqual([]);

  await page.screenshot({ path: "test-results/development-login.png", fullPage: true });
});

test("Unauthenticated visitor cannot enter the Development dashboard", async ({ page }) => {
  const pageErrors = [];
  page.on("pageerror", error => pageErrors.push(error.message));

  await page.goto(`${baseURL}/dashboard.html`, { waitUntil: "domcontentloaded" });
  await expect(page).toHaveURL(/\/login(?:\.html)?(?:$|[?#])/, { timeout: 25000 });
  expect(pageErrors, "Dashboard JavaScript errors detected").toEqual([]);
});
