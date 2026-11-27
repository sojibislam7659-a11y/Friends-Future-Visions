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
  await page.locator("#loginButton").click({ noWaitAfter: true });

  await expect(page).toHaveURL(/dashboard(?:\.html)?(?:$|[?#])/, { timeout: 30000 });
  await expect(page.locator("body")).toHaveAttribute("data-page", "dashboard");
  if ((page.viewportSize()?.width || 9999) <= 600) {
    await expect(page.locator(".mobile-bottom-nav")).toBeVisible();
  }
  await expect(page.locator("#app")).toContainText("কমিটির যাচাইকৃত আর্থিক সারসংক্ষেপ", { timeout: 30000 });
  await expect(page.locator("#app")).not.toContainText("প্রবেশ যাচাই করা যায়নি");
  const statementCta = page.locator(".dashboard-statement-action a[href='statement.html']");
  await expect(statementCta).toBeVisible();
  await expect(statementCta).toContainText(/My Statement|আমার স্টেটমেন্ট/);

  expect(pageErrors, "Browser JavaScript errors detected").toEqual([]);
  await page.goto(`${baseURL}/data.html`, { waitUntil: "domcontentloaded" });
  await expect(page.locator("#publicData")).toContainText("Member Contribution Matrix", { timeout: 30000 });
  await expect(page.locator("#globalNoticeTicker")).toBeVisible();
  await expect(page.locator("#globalNoticeTickerText")).not.toBeEmpty();
  const tickerAnimation = await page.locator("#globalNoticeTickerText").evaluate((element) => {
    const style = getComputedStyle(element);
    return { name: style.animationName, duration: style.animationDuration };
  });
  expect(tickerAnimation.name).toBe("ffv-global-notice-marquee");
  expect(Number.parseFloat(tickerAnimation.duration)).toBeGreaterThan(0);
  await expect(page.locator(".matrix-amount").first()).toBeDisabled();
  await expect(page.locator(".matrix-save-actions")).toHaveCount(0);
  const matrixLayout = await page.locator(".matrix-wrap table.contribution-matrix").first().evaluate(table => ({
    headerCount: table.querySelectorAll("thead th").length,
    tableWidth: table.scrollWidth,
    wrapperWidth: table.parentElement.clientWidth
  }));
  expect(matrixLayout.headerCount).toBe(6);
  expect(matrixLayout.tableWidth).toBeLessThanOrEqual(matrixLayout.wrapperWidth + 1);
  await expect(page.locator(".matrix-display-name").first()).toBeVisible();
  if ((page.viewportSize()?.width || 9999) <= 600) {
    await expect(page.locator(".public-mobile-nav")).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
  }
  await page.screenshot({ path: `test-results/member-data-matrix-${page.viewportSize()?.width || "unknown"}.png`, fullPage: true });

  // Member detail and personal pages must stay within the authenticated member scope.
  await page.goto(`${baseURL}/member-profile.html?id=00000000-0000-0000-0000-000000000001`, { waitUntil: "domcontentloaded" });
  await expect(page.locator("#app")).toContainText("নিরাপত্তার কারণে অন্য সদস্যের Profile দেখার অনুমতি নেই।", { timeout: 30000 });

  await page.goto(`${baseURL}/member-profile.html`, { waitUntil: "domcontentloaded" });
  await expect(page.locator("#memberProfileContent")).toBeVisible({ timeout: 30000 });
  await expect(page.locator(".member-profile-summary")).toContainText("Total Deposit");
  await expect(page.locator(".member-profile-summary")).toContainText("Total Due");
  await expect(page.locator(".member-profile-summary")).not.toContainText("Status");
  await expect(page.locator(".private-document-preview-link, .private-document-pdf-preview")).toHaveCount(0);
  await expect(page.locator("#toggleMemberEditor")).toHaveCount(0);
  await expect(page.locator("#memberFieldEditor")).toHaveCount(0);
  await page.locator("#profileMenuBtn").click();
  await expect(page.locator("#profileSidebar .member-statement-nav-link")).toBeVisible();
  await page.locator("#profileCloseMenu").click();

  await page.goto(`${baseURL}/member.html`, { waitUntil: "domcontentloaded" });
  await expect(page.locator("#pageContent")).toContainText("Total Deposit", { timeout: 30000 });
  await expect(page.locator("#pageContent")).toContainText("Total Due");
  await expect(page.locator("#pageContent")).toContainText("আপনার পরিচয়পত্র");
  await expect(page.locator("#pageContent .member-profile-summary")).not.toContainText("Status");

  await page.goto(`${baseURL}/personal-due.html`, { waitUntil: "domcontentloaded" });
  await expect(page.locator("body")).toHaveAttribute("data-page", "personal-due");
  await expect(page.locator("#app")).not.toContainText("প্রবেশ যাচাই করা যায়নি", { timeout: 30000 });

  await page.goto(`${baseURL}/proof.html`, { waitUntil: "domcontentloaded" });
  await expect(page.locator("body")).toHaveAttribute("data-page", "proof");
  await expect(page.locator("#proofUploadForm")).toHaveCount(0);
  await expect(page.locator("#proofMetaForm")).toHaveCount(0);

  await page.goto(`${baseURL}/payment.html`, { waitUntil: "domcontentloaded" });
  await expect(page.locator("body")).toHaveAttribute("data-page", "payment");
  await expect(page.locator("#app")).not.toContainText("প্রবেশ যাচাই করা যায়নি", { timeout: 30000 });

  await page.screenshot({ path: `test-results/member-dashboard-${page.viewportSize()?.width || "unknown"}.png`, fullPage: true });
});
