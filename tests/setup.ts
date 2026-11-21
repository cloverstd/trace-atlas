import { beforeEach, afterEach, vi } from 'vitest';
import { env, reset, applyD1Migrations } from 'cloudflare:test';
beforeEach(async () => {
  await applyD1Migrations(env.DB, env.TEST_MIGRATIONS);
});
afterEach(async () => {
  vi.restoreAllMocks();
  await reset();
});
