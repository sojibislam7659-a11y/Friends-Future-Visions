import { test, expect } from "@playwright/test";

const baseURL = "https://development-friends-future-visions-dev.sojibislam7659.workers.dev";

test("Development member can sign in and load the member dashboard", async ({ page }) => {
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

  // A first-login member is correctly stopped at the mandatory password-rotation gate.
  // Do not change the test account's password automatically in CI.
  const rotationPanel = page.locator("#mandatoryPasswordPanel");
  const rotationShown = await rotationPanel.waitFor({ state: "visible", timeout: 10000 }).then(() => true).catch(() => false);
  if (rotationShown) {
    await expect(rotationPanel.locator("#mandatoryPasswordForm")).toBeVisible();
    await expect(rotationPanel.locator("#requiredNewPassword")).toHaveAttribute("minlength", "12");
    await expect(rotationPanel.locator("#requiredConfirmPassword")).toBeVisible();
    await expect(rotationPanel.locator("#requiredPasswordButton")).toBeVisible();
    expect(pageErrors, "Browser JavaScript errors detected").toEqual([]);
    await page.screenshot({ path: "test-results/member-required-password-rotation.png", fullPage: true });
    return;
  }

  await expect(page).toHaveURL(/dashboard(?:\\.html)?(?:$|[?#])/, { timeout: 30000 });
  await expect(page.locator("body")).toHaveAttribute("data-page", "dashboard");
  await expect(page.locator("#app")).toContainText("কমিটির যাচাইকৃত আর্থিক সারসংক্ষেপ", { timeout: 30000 });
  await expect(page.locator("#app")).not.toContainText("প্রবেশ যাচাই করা যায়নি");

  expect(pageErrors, "Browser JavaScript errors detected").toEqual([]);
  await page.screenshot({ path: "test-results/member-dashboard.png", fullPage: true });
});
