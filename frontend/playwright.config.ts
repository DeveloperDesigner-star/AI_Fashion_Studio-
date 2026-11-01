import { defineConfig, devices } from '@playwright/test'

const PORT = Number(process.env.E2E_PORT ?? 5174)
const baseURL = process.env.E2E_BASE_URL ?? `http://127.0.0.1:${PORT}`

// Constrained environments (containers without a Playwright browser install) can
// point the runner at an existing Chromium build. CI keeps the default managed
// browser so the config stays portable.
const executablePath = process.env.E2E_EXECUTABLE_PATH
const extraArgs = process.env.E2E_BROWSER_ARGS?.split(' ').filter(Boolean) ?? []

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : [['list']],
  use: {
    baseURL,
    trace: 'on-first-retry',
    launchOptions: {
      ...(executablePath ? { executablePath } : {}),
      args: extraArgs,
    },
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: process.env.E2E_BASE_URL
    ? undefined
    : {
        command: `npm run dev -- --port ${PORT} --strictPort`,
        url: baseURL,
        reuseExistingServer: !process.env.CI,
        timeout: 120_000,
      },
})
