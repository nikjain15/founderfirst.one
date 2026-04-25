// @ts-check
import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/e2e",
  testMatch: /.*\.spec\.js$/,
  timeout: 60_000,
  expect: { timeout: 8_000 },
  fullyParallel: false,
  workers: 1,
  reporter: [["list"]],
  use: {
    baseURL: "http://localhost:5173",
    viewport: { width: 414, height: 896 },
    actionTimeout: 8_000,
    navigationTimeout: 15_000,
    video: "off",
    screenshot: "only-on-failure",
    launchOptions: {
      executablePath: "/tmp/chrome-for-testing/chrome-linux64/chrome",
      args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage"],
    },
  },
  projects: [
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 414, height: 896 },
        launchOptions: {
          executablePath: "/tmp/chrome-for-testing/chrome-linux64/chrome",
          args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage"],
        },
      },
    },
  ],
});
