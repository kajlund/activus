import { fileURLToPath } from 'node:url';
import { loadEnv } from 'vite';
import { defineConfig } from 'vitest/config';

export default defineConfig(({ mode }) => {
  const envDir = fileURLToPath(new URL('../../', import.meta.url));
  const env = loadEnv(mode, envDir, '');
  const port = process.env.PORT ?? env.PORT ?? '3000';
  return {
    envDir,
    server: {
      port: 5173,
      strictPort: true,
      proxy: { '/api': { target: `http://localhost:${port}` } },
    },
    test: { environment: 'jsdom', include: ['test/**/*.test.ts'] },
  };
});
