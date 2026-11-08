import { defineConfig, devices } from "@playwright/test";

// Separate ports, database name and data directory protect the developer's local data.
export default defineConfig({
  testDir: "./tests/e2e",
  testMatch: process.env.AEGIS_E2E_SUITE === "restart"
    ? "coordination-restart.spec.ts"
    : process.env.AEGIS_E2E_SUITE === "extended"
      ? ["recovery.spec.ts", "administrator.spec.ts", "team-pending-invitations.spec.ts"]
      : "critical.spec.ts",
  fullyParallel: false,
  workers: 1,
  timeout: 45_000,
  expect: { timeout: 15_000 },
  reporter: "list",
  use: { baseURL: "http://127.0.0.1:3100", trace: "retain-on-failure" },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: "node ../scripts/e2e.mjs",
    url: "http://127.0.0.1:3100",
    reuseExistingServer: false,
    gracefulShutdown: { signal: "SIGTERM", timeout: 10_000 },
    timeout: 180_000,
    env: {
      AEGIS_FRONTEND_PORT: "3100",
      AEGIS_E2E: "1",
      AEGIS_NEXT_DIST_DIR: ".next-e2e",
      NEXT_PUBLIC_APP_URL: "http://127.0.0.1:3100",
      NEXT_PUBLIC_SPACETIMEDB_HOST: "http://127.0.0.1:3101",
      NEXT_PUBLIC_SPACETIMEDB_DB_NAME: "aegis-e2e",
      SPACETIMEDB_DATA_DIR: ".spacetime/e2e",
    },
  },
});
