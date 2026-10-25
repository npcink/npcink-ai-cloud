import { defineConfig } from '@playwright/test';
import base from './playwright.config';

const port = Number(process.env.NPCINK_NAVIGATION_FRONTEND_PORT || 3317);
const backendPort = Number(process.env.NPCINK_NAVIGATION_BACKEND_PORT || 4317);
const origin = `http://127.0.0.1:${port}`;
const backend = `http://127.0.0.1:${backendPort}`;

// Build once with NEXT_PUBLIC_ENV=test pnpm --dir frontend run build, then run from the repo root:
// pnpm --dir frontend exec playwright test -c playwright.navigation.config.ts
// The .scenario.ts suffix keeps this disposable backend lane out of default/M4 discovery.
export default defineConfig({
  ...base,
  testMatch: '**/auth-navigation-handoff.scenario.ts',
  retries: 0,
  workers: 1,
  use: { ...base.use, baseURL: origin },
  webServer: [
    { command: 'node tests/e2e/helpers/navigation-backend.mjs', url: `${backend}/__health`,
      env: { NPCINK_NAVIGATION_BACKEND_PORT: String(backendPort) }, reuseExistingServer: false },
    { command: 'mkdir -p .next/standalone/frontend/.next && cp -R .next/static .next/standalone/frontend/.next/ && if [ -d public ]; then cp -R public .next/standalone/frontend/; fi && node .next/standalone/frontend/server.js',
      url: `${origin}/api/health`, reuseExistingServer: false,
      env: { NEXT_PUBLIC_ENV: 'test', NPCINK_CLOUD_SETUP_STATE_OVERRIDE: '',
        CLOUD_API_BASE_URL: backend, CLOUD_PUBLIC_BASE_URL: origin, NEXT_TELEMETRY_DISABLED: '1',
        HOSTNAME: '127.0.0.1', PORT: String(port) } },
  ],
});
