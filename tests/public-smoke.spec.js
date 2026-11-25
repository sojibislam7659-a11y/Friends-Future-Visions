import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";

const baseURL = "https://development-friends-future-visions-dev.sojibislam7659.workers.dev";
const localPublicData = readFileSync("public/public-data.js", "utf8");
const localPublicNav = readFileSync("public/public-nav.js", "utf8");

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


test("Unauthenticated visitor can view aggregate-only public Data", async ({ page }) => {
  const pageErrors = [];
  page.on("pageerror", error => pageErrors.push(error.message));
  // The development Worker is not auto-deployed from every branch push.
  // Route the current checked-out source modules into the live Dev HTML/API.
  await page.route("**/public-data.js", route => route.fulfill({ status: 200, contentType: "application/javascript", body: localPublicData }));
  await page.route("**/public-nav.js", route => route.fulfill({ status: 200, contentType: "application/javascript", body: localPublicNav }));

  const response = await page.goto(`${baseURL}/data.html`, { waitUntil: "domcontentloaded" });
  expect(response?.status()).toBe(200);
  await expect(page.locator("#publicData")).toContainText("সমিতির সামগ্রিক আর্থিক তথ্য", { timeout: 30000 });
  await expect(page.locator("#publicData")).toContainText("সদস্যভিত্তিক জমা, বকেয়া ও ব্যক্তিগত তথ্য প্রকাশ করা হয় না।");
  await expect(page.locator("#publicData")).not.toContainText("Member Contribution Matrix");
  await expect(page.locator("#publicData")).not.toContainText("Member ID");
  await expect(pageErrors, "Public Data page JavaScript errors detected").toEqual([]);

  await page.locator("#siteMenu").click();
  await expect(page.locator("#siteNav")).toContainText("DATA");
  await page.screenshot({ path: "test-results/development-public-data.png", fullPage: true });
});

test("Development public login and Data pages fit a mobile viewport", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`${baseURL}/login.html`, { waitUntil: "domcontentloaded" });
  await expect(page.locator("#loginForm")).toBeVisible();
  let dimensions = await page.evaluate(() => ({
    viewport: window.innerWidth,
    document: document.documentElement.scrollWidth
  }));
  expect(dimensions.document).toBeLessThanOrEqual(dimensions.viewport);

  await page.route("**/public-data.js", route => route.fulfill({ status: 200, contentType: "application/javascript", body: localPublicData }));
  await page.route("**/public-nav.js", route => route.fulfill({ status: 200, contentType: "application/javascript", body: localPublicNav }));
  await page.goto(`${baseURL}/data.html`, { waitUntil: "domcontentloaded" });
  await expect(page.locator("#publicData")).toContainText("সমিতির সামগ্রিক আর্থিক তথ্য", { timeout: 30000 });
  dimensions = await page.evaluate(() => ({
    viewport: window.innerWidth,
    document: document.documentElement.scrollWidth
  }));
  expect(dimensions.document).toBeLessThanOrEqual(dimensions.viewport);
  await page.screenshot({ path: "test-results/development-mobile-data.png", fullPage: true });
});
