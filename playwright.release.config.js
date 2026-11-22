import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests",
  fullyParallel: false,
  forbidOnly: true,
  retries: 0,
  reporter: [["list"], ["html", { outputFolder: "playwright-release-report", open: "never" }]],
  use: {
    browserName: "chromium",
    headless: true,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "retain-on-failure"
  },
  outputDir: "playwright-release-results",
  webServer: {
    command: "npx --yes http-server public -p 4173 -c-1",
    url: "http://127.0.0.1:4173/login.html",
    reuseExistingServer: !process.env.CI,
    timeout: 30000
  }
});
