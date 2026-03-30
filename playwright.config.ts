import { defineConfig } from '@playwright/test';

const PORT = 3003;
const BASE_URL = `http://127.0.0.1:${PORT}`;

export default defineConfig({
  testDir: './tests/e2e',
  testMatch: /.*\.e2e\.ts/,
  fullyParallel: false,
  workers: 1,
  timeout: 45_000,
  expect: {
    timeout: 10_000,
  },
  reporter: [['list']],
  outputDir: 'output/playwright',
  use: {
    baseURL: BASE_URL,
    headless: true,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'off',
  },
  webServer: {
    command: `pnpm exec next dev --port ${PORT}`,
    url: `${BASE_URL}/daa/login`,
    reuseExistingServer: false,
    timeout: 120_000,
    env: {
      DAA_PG_MEM: '1',
    },
  },
});
