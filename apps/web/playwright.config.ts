import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  reporter: "list",
  use: {
    baseURL: "http://127.0.0.1:5173",
    trace: "on-first-retry",
  },
  webServer: [
    {
      command: "bun --filter @overtide/api dev",
      port: 8787,
      reuseExistingServer: !process.env.CI,
      env: {
        DB_PATH: ":memory:",
        REDMINE_URL: "http://127.0.0.1:1",
        REDMINE_USERNAME: "e2e",
        REDMINE_PASSWORD: "e2e",
        REDMINE_TRACKER_REDEMPTION_ID: "1",
        REDMINE_ACTIVITY_OVERTIME_ID: "1",
        LOG_LEVEL: "warn",
      },
    },
    {
      command: "bun --filter @overtide/web dev",
      port: 5173,
      reuseExistingServer: !process.env.CI,
    },
  ],
});
