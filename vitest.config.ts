import { defineConfig } from 'vitest/config';
import { cloudflareTest, readD1Migrations } from '@cloudflare/vitest-plugin';
export default defineConfig({
  plugins: [
    cloudflareTest({
      main: './worker/index.ts',
      miniflare: {
        compatibilityDate: '2026-10-01',
        compatibilityFlags: ['nodejs_compat'],
        d1Databases: ['DB'],
        r2Buckets: ['BUCKET'],
        bindings: {
          APP_ORIGIN: 'https://atlas.test',
          RP_ID: 'atlas.test',
          ADMIN_BOOTSTRAP_TOKEN: 'test-only-bootstrap-token-with-more-than-32-characters',
          CONFIG_ENCRYPTION_KEY: '11'.repeat(32),
          TEST_MIGRATIONS: await readD1Migrations('./migrations'),
        },
      },
    }),
  ],
  test: {
    include: ['tests/**/*.test.ts'],
    setupFiles: ['tests/setup.ts'],
    fileParallelism: false,
    testTimeout: 30000,
  },
});
