import { test, expect } from "@playwright/test";

const baseURL = process.env.FFV_QA_BASE_URL || "https://development-friends-future-visions-dev.sojibislam7659.workers.dev";

test("Member can sign in and load the authenticated dashboard", async ({ page }) => {
  const email = process.env.DEV_TEST_EMAIL;
  const password = process.env.DEV_TEST_PASSWORD;
  test.skip(!email || !password, "Set DEV_TEST_EMAIL and DEV_TEST_PASSWORD to run authenticated member QA.");

  const pageErrors = [];
  page.on("pageerror", error => pageErrors.push(error.message));

  await page.goto(`${baseURL}/login.html`, { waitUntil: "domcontentloaded" });
  await expect(page.locator("#loginForm")).toBeVisible();
  await page.locator("#email").fill(email);
  await page.locator("#password").fill(password);
  await page.locator("#loginButton").click();

  await expect(page).toHaveURL(/dashboard(?:\.html)?(?:$|[?#])/, { timeout: 30000 });
  await expect(page.locator("body")).toHaveAttribute("data-page", "dashboard");
  await expect(page.locator("#app")).toContainText("কমিটির যাচাইকৃত আর্থিক সারসংক্ষেপ", { timeout: 30000 });
  await expect(page.locator("#app")).not.toContainText("প্রবেশ যাচাই করা যায়নি");

  expect(pageErrors, "Browser JavaScript errors detected").toEqual([]);
  await page.goto(`${baseURL}/data.html`, { waitUntil: "domcontentloaded" });
  await expect(page.locator("#publicData")).toContainText("Member Contribution Matrix", { timeout: 30000 });
  await expect(page.locator(".matrix-amount").first()).toBeDisabled();
  await expect(page.locator(".matrix-save-actions")).toHaveCount(0);
  await page.screenshot({ path: "test-results/member-data-matrix.png", fullPage: true });

  await page.screenshot({ path: "test-results/member-dashboard.png", fullPage: true });
});
