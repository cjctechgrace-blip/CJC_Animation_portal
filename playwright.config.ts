import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/e2e",
  globalSetup: "./tests/global-setup.ts",
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: 0,
  reporter: [["list"]],
  timeout: 60_000,
  expect: { timeout: 10_000 },
  use: {
    baseURL: "http://localhost:3100",
    trace: "on-first-retry",
    headless: true,
  },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
  ],
  webServer: {
    command: "npm run start -- -p 3100",
    url: "http://localhost:3100",
    timeout: 120_000,
    reuseExistingServer: !process.env.CI,
    env: {
      // e2e always runs against local disk storage — a developer's .env with
      // real Bunny credentials must not make the suite depend on the network
      BUNNY_STREAM_LIBRARY_ID: "",
      BUNNY_STREAM_API_KEY: "",
      BUNNY_STREAM_CDN_HOST: "",
      // exercises the env-bootstrap admin path
      ADMIN_EMAIL: "bootstrap-admin@cjc.test",
      ADMIN_PASSWORD: "bootstrap-pass-123",
    },
  },
});
