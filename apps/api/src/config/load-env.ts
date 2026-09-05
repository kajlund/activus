import { existsSync } from 'node:fs';

export function loadRootEnv() {
  // Same relative location from src/config and compiled dist/config.
  const envFile = new URL('../../../../.env', import.meta.url);
  if (existsSync(envFile)) process.loadEnvFile(envFile);
}
