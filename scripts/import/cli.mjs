// Root-workspace launcher: reuse the API's installed TypeScript runner and cwd.
import { createRequire } from 'node:module';
import { spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL, URL } from 'node:url';
import process from 'node:process';

const require = createRequire(
  new URL('../../apps/api/package.json', import.meta.url),
);
const result = spawnSync(
  process.execPath,
  [
    '--import',
    pathToFileURL(require.resolve('tsx')).href,
    fileURLToPath(
      new URL(
        '../../apps/api/src/modules/legacy-import/cli.ts',
        import.meta.url,
      ),
    ),
    ...process.argv.slice(2),
  ],
  { stdio: 'inherit', cwd: process.cwd(), windowsHide: true },
);
process.exitCode = result.status ?? 2;
