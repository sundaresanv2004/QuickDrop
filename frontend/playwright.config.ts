import { defineConfig, devices } from "@playwright/test"

// Run `npm run build` first. These tests use the production build because the
// security policy and Service Worker behave differently in development.
export default defineConfig({
  testDir: "./e2e",
  testMatch: "**/*.e2e.ts",
  timeout: 10 * 60 * 1000,
  workers: 1,
  reporter: "list",
  use: { baseURL: "http://localhost:3001", acceptDownloads: true },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
    { name: "webkit", use: { ...devices["Desktop Safari"] } },
  ],
  webServer: [
    {
      command: "npm run start -- -p 3001",
      url: "http://localhost:3001",
      reuseExistingServer: false,
    },
    {
      command: "uv --directory ../backend run uvicorn app.main:app --port 8000",
      url: "http://localhost:8000/api/health",
      reuseExistingServer: true,
    },
  ],
})
