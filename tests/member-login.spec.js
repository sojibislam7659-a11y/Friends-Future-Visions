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

  // The first-login password prompt is optional and must never block Dashboard access.
  // Do not click Skip or change the test account's password automatically in CI.
  const promptShown = await page.waitForURL(
    url => /password-change(?:\\.html)?(?:$|[?#])/.test(url.pathname) || /dashboard(?:\\.html)?(?:$|[?#])/.test(url.pathname),
    { timeout: 30000 }
  ).then(() => /password-change(?:\\.html)?(?:$|[?#])/.test(new URL(page.url()).pathname)).catch(() => false);

  if (promptShown) {
    await expect(page.locator("#accountEmail")).not.toHaveText("ইমেইল যাচাই হচ্ছে…");
    await expect(page.locator("#savePasswordButton")).toBeVisible();
    await expect(page.locator("#newPassword")).toHaveAttribute("minlength", "12");
    await expect(page.locator("#confirmPassword")).toBeVisible();
    await expect(page.locator("#skipPasswordButton")).toBeVisible();
    await expect(page.locator("#skipPasswordButton")).toContainText("Dashboard");
    expect(pageErrors, "Browser JavaScript errors detected").toEqual([]);
    await page.screenshot({ path: "test-results/member-optional-password-prompt.png", fullPage: true });
    return;
  }

  await expect(page).toHaveURL(/dashboard(?:\\.html)?(?:$|[?#])/, { timeout: 30000 });
  await expect(page.locator("body")).toHaveAttribute("data-page", "dashboard");
  await expect(page.locator("#app")).toContainText("কমিটির যাচাইকৃত আর্থিক সারসংক্ষেপ", { timeout: 30000 });
  await expect(page.locator("#app")).not.toContainText("প্রবেশ যাচাই করা যায়নি");

  expect(pageErrors, "Browser JavaScript errors detected").toEqual([]);
  await page.screenshot({ path: "test-results/member-dashboard.png", fullPage: true });
});
