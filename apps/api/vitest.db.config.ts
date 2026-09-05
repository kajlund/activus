import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['test/integration/**/*.test.ts'],
    fileParallelism: false,
    hookTimeout: 20000,
    testTimeout: 15000,
  },
});
