import { defineConfig } from '@playwright/test';
import config from './playwright.config';

const channel = process.env.NPCINK_ISOLATED_CHANNEL || '';
const selection: Record<string, { testMatch: string; grep?: RegExp }> = {
  'pending-install': { testMatch: 'setup-first-install.spec.ts' },
  'complete-install': { testMatch: 'setup-complete-gate.spec.ts' },
  metadata: { testMatch: 'agent-workflow-metadata-smoke.spec.ts' },
  'optional-mobile': { testMatch: 'portal-login.spec.ts', grep: /optional mobile authentication visual observation/ },
};
if (!selection[channel] || !process.env.NPCINK_ISOLATED_OUTPUT) {
  throw new Error('Use the isolated channel runner; a channel and receipt directory are required');
}
export default defineConfig(config, {
  ...selection[channel],
  webServer: undefined,
  retries: 0,
  updateSnapshots: 'none',
  forbidOnly: true,
  outputDir: `${process.env.NPCINK_ISOLATED_OUTPUT}/results`,
  reporter: [['list'], ['json', { outputFile: `${process.env.NPCINK_ISOLATED_OUTPUT}/playwright.json` }]],
});
