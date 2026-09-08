import { defineConfig } from '@playwright/test';
import base from './playwright.config.js';

// Optional second installed browser; keep the normal Chrome prerequisite unchanged.
export default defineConfig({
  ...base,
  testMatch: 'hardening.spec.ts',
  outputDir: '../../.artifacts/phase-3f-edge',
  projects: ['light', 'dark'].map((theme) => ({
    name: `edge-${theme}`,
    use: {
      channel: 'msedge',
      viewport: { width: 1440, height: 1000 },
      colorScheme: theme as 'light' | 'dark',
    },
  })),
});
