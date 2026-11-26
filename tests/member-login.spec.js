import { test, expect } from "@playwright/test";

const baseURL = "https://development-friends-future-visions-dev.sojibislam7659.workers.dev";

test("Development member sees the optional password prompt once, skips, and does not see it on the next login", async ({ page }) => {
  const email = process.env.DEV_TEST_EMAIL;
  const password = process.env.DEV_TEST_PASSWORD;
  test.skip(!email || !password, "Set DEV_TEST_EMAIL and DEV_TEST_PASSWORD to run authenticated member QA.");

  await page.setViewportSize({ width: 390, height: 844 });
  const pageErrors = [];
  page.on("pageerror", error => pageErrors.push(error.message));

  const signIn = async () => {
    await page.goto(`${baseURL}/login.html`, { waitUntil: "domcontentloaded" });
    await expect(page.locator("#loginForm")).toBeVisible();
    await page.locator("#email").fill(email);
    await page.locator("#password").fill(password);
    await page.locator("#loginButton").click();
  };

  await signIn();
  await page.waitForURL(
    url => url.pathname.includes("password-change") || url.pathname.includes("dashboard"),
    { timeout: 30000 }
  );
  await expect(page).toHaveURL(/password-change/);
  await expect(page.locator("#accountEmail")).not.toHaveText("ইমেইল যাচাই হচ্ছে…");
  await expect(page.locator("#savePasswordButton")).toBeVisible();
  await expect(page.locator("#newPassword")).toHaveAttribute("minlength", "12");
  await expect(page.locator("#confirmPassword")).toBeVisible();
  await expect(page.locator("#skipPasswordButton")).toBeVisible();

  // Skip must preserve the temporary-password flag but permanently dismiss this prompt.
  await page.locator("#skipPasswordButton").click();
  await expect(page).toHaveURL(/dashboard/, { timeout: 30000 });
  await expect(page.locator("#app")).toContainText("কমিটির যাচাইকৃত আর্থিক সারসংক্ষেপ", { timeout: 30000 });
  await page.locator("#mobileMenuBtn").click();
  await expect(page.locator("#logoutBtn")).toBeVisible();
  await page.locator("#logoutBtn").click();
  await expect(page).toHaveURL(/login/, { timeout: 30000 });

  // A fresh authenticated login must go directly to Dashboard, never show the prompt again.
  await signIn();
  await expect(page).toHaveURL(/dashboard/, { timeout: 30000 });
  await expect(page.locator("#app")).toContainText("কমিটির যাচাইকৃত আর্থিক সারসংক্ষেপ", { timeout: 30000 });
  await expect(page.locator("#promptContent")).toHaveCount(0);

  expect(pageErrors, "Browser JavaScript errors detected").toEqual([]);
  await page.screenshot({ path: "test-results/member-first-login-prompt-skipped-once.png", fullPage: true });
});

test("Development serves the dedicated first-login password page as its own asset", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  // Inspect the server-delivered HTML shell without allowing its auth module
  // to redirect an unauthenticated test browser to the login page.
  await page.route("**/password-change.js", route => route.abort());

  const response = await page.goto(`${baseURL}/password-change.html`, { waitUntil: "domcontentloaded" });
  expect(response?.status(), "Password-change HTML must be served directly, not SPA-fallback to index/login").toBe(200);
  await expect(page).toHaveTitle(/পাসওয়ার্ড পরিবর্তন/);
  await expect(page.locator("#promptLoading")).toBeVisible();
  await expect(page.locator("#promptContent")).toBeHidden();
  await expect(page.locator("#accountEmail")).toBeAttached();
  await expect(page.locator("#skipPasswordButton")).toBeAttached();

  const dimensions = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth
  }));
  expect(dimensions.scrollWidth, "Password page must not overflow horizontally on mobile").toBeLessThanOrEqual(dimensions.clientWidth);
});
