import { test, expect } from "@playwright/test";

const baseURL = "https://development-friends-future-visions-dev.workers.dev";

test("Development member can sign in and load the member dashboard", async ({ page }) => {
  const email = process.env.DEV_TEST_EMAIL;
  const password = process.env.DEV_TEST_PASSWORD;

  expect(email, "Add DEV_TEST_EMAIL in GitHub Actions secrets").toBeTruthy();
  expect(password, "Add DEV_TEST_PASSWORD in GitHub Actions secrets").toBeTruthy();

  const pageErrors = [];
  page.on("pageerror", error => pageErrors.push(error.message));

  await page.goto(`${baseURL}/login.html`, { waitUntil: "domcontentloaded" });
  await expect(page.locator("#loginForm")).toBeVisible();
  await page.locator("#email").fill(email);
  await page.locator("#password").fill(password);
  await page.locator("#loginButton").click();

  await expect(page).toHaveURL(/dashboard\.html(?:$|[?#])/,{ timeout: 30000 });
  await expect(page.locator("body")).toHaveAttribute("data-page", "dashboard");
  await expect(page.locator("#app")).not.toContainText("লোড হচ্ছে…", { timeout: 30000 });
  await expect(page.locator("#app")).not.toContainText("প্রবেশ যাচাই করা যায়নি");

  expect(pageErrors, "Browser JavaScript errors detected").toEqual([]);
  await page.screenshot({ path: "test-results/member-dashboard.png", fullPage: true });
});
