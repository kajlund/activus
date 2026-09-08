import { fileURLToPath } from 'node:url';
import { loadEnv } from 'vite';
import { defineConfig } from 'vitest/config';

export default defineConfig(({ command, mode }) => {
  const envDir = fileURLToPath(new URL('../../', import.meta.url));
  // Only the development proxy needs root environment values. Loading the
  // server's NODE_ENV here can otherwise switch a production build to dev mode.
  const env = command === 'serve' ? loadEnv(mode, envDir, 'PORT') : {};
  const port = process.env.PORT ?? env.PORT ?? '3000';
  return {
    envDir: command === 'serve' ? envDir : false,
    server: {
      port: 5173,
      strictPort: true,
      proxy: { '/api': { target: `http://localhost:${port}` } },
    },
    test: { environment: 'jsdom', include: ['test/**/*.test.ts'] },
  };
});
