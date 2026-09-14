import { defineConfig, devices } from "@playwright/test";
export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: false,
  workers: 1,
  timeout: 60000,
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL || "http://127.0.0.1:5173",
    headless: true,
    channel: "chrome",
    trace: "retain-on-failure",
  },
  reporter: "list",
  projects: [{ name: "desktop", use: { ...devices["Desktop Chrome"] } }],
});
