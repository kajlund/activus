import { defineConfig } from 'drizzle-kit';

// Generation/checking are offline. Applying migrations uses the validated CLI below.
export default defineConfig({
  dialect: 'postgresql',
  schema: './src/db/schema.ts',
  out: '../../drizzle',
  strict: true,
});
