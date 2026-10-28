import { defineConfig } from '@playwright/test';

// Prérequis : MariaDB (docker compose up -d db), API (npm run dev:server) et Vite (npm run dev:web).
export default defineConfig({
  testDir: 'e2e',
  timeout: 180_000,
  fullyParallel: false,
  use: {
    baseURL: process.env.E2E_BASE_URL ?? 'http://localhost:5180',
    channel: process.env.E2E_CHANNEL ?? 'chrome',
    viewport: { width: 1440, height: 1000 },
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure'
  }
});
