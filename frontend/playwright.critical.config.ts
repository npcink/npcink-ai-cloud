import { readFileSync } from 'node:fs';
import { defineConfig } from '@playwright/test';
import base from './playwright.config';

// This profile builds its own loopback frontend, never an operator URL.
if (process.env.NPCINK_CLOUD_CRITICAL_OFFLINE !== '1'
  || process.env.NPCINK_CLOUD_FRONTEND_BASE_URL
  || process.env.CLOUD_API_BASE_URL !== 'http://127.0.0.1:9') {
  throw new Error('Use verify:local -- --critical for the isolated browser profile');
}
const server = base.webServer;
if (!server || Array.isArray(server)) {
  throw new Error('Critical profile requires one managed loopback frontend');
}
const manifest = JSON.parse(readFileSync(
  new URL('../config/critical-regression-v1.json', import.meta.url), 'utf8'
)) as { browser_files: string[]; browser_titles: string[] };
const escapeRegex = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export default defineConfig({
  ...base,
  testMatch: manifest.browser_files.map((name) => `**/${name}`),
  grep: new RegExp(`(?:^| )(${manifest.browser_titles.map(escapeRegex).join('|')})$`),
  forbidOnly: true,
  retries: 0,
  workers: 1,
  use: { ...base.use, serviceWorkers: 'block' },
  webServer: { ...server, reuseExistingServer: false },
});
