import { defineConfig } from '@playwright/test';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
const viteCli = fileURLToPath(
  new URL(
    './bin/vite.js',
    pathToFileURL(createRequire(import.meta.url).resolve('vite/package.json')),
  ),
);
export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  retries: 0,
  outputDir: '../../.artifacts/phase-3a',
  reporter: 'list',
  use: {
    baseURL: 'http://127.0.0.1:4173',
    channel: 'chrome',
    trace: 'retain-on-failure',
  },
  projects: [
    {
      name: 'desktop-light',
      use: { viewport: { width: 1440, height: 1000 }, colorScheme: 'light' },
    },
    {
      name: 'desktop-dark',
      use: { viewport: { width: 1440, height: 1000 }, colorScheme: 'dark' },
    },
    {
      name: 'mobile-light',
      use: { viewport: { width: 390, height: 844 }, colorScheme: 'light' },
    },
    {
      name: 'mobile-dark',
      use: { viewport: { width: 390, height: 844 }, colorScheme: 'dark' },
    },
  ],
  webServer: {
    command: `"${process.execPath}" "${viteCli}" preview --host 127.0.0.1 --port 4173 --strictPort`,
    cwd: fileURLToPath(new URL('.', import.meta.url)),
    url: 'http://127.0.0.1:4173',
    reuseExistingServer: false,
  },
});
