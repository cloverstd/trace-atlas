import { describe, it, expect } from 'vitest';
import { env, createExecutionContext, waitOnExecutionContext } from 'cloudflare:test';
import { app } from '../worker';
import { hash, encrypt, decrypt } from '../worker/lib/crypto';
async function request(
  path: string,
  method = 'GET',
  body?: unknown,
  headers: Record<string, string> = {},
) {
  const ctx = createExecutionContext();
  const res = await app.fetch(
    new Request('https://atlas.test' + path, {
      method,
      headers: { ...(body ? { 'Content-Type': 'application/json' } : {}), ...headers },
      body: body ? JSON.stringify(body) : undefined,
    }),
    env,
    ctx,
  );
  await waitOnExecutionContext(ctx);
  return res;
}
describe('admin API boundary', () => {
  it('keeps the map public while rejecting unauthenticated admin requests', async () => {
    expect((await request('/api/public/manifest')).status).toBe(200);
    expect((await request('/api/admin/settings')).status).toBe(401);
    expect((await request('/api/admin/sync', 'POST', {})).status).toBe(401);
    expect((await request('/api/missing')).status).toBe(404);
  });
  it('requires same origin and initialization secret', async () => {
    expect(
      (await request('/api/auth/bootstrap/options', 'POST', { token: env.ADMIN_BOOTSTRAP_TOKEN }))
        .status,
    ).toBe(403);
    expect(
      (
        await request(
          '/api/auth/bootstrap/options',
          'POST',
          { token: 'wrong' },
          { Origin: env.APP_ORIGIN },
        )
      ).status,
    ).toBe(403);
    const r = await request(
      '/api/auth/bootstrap/options',
      'POST',
      { token: env.ADMIN_BOOTSTRAP_TOKEN },
      { Origin: env.APP_ORIGIN },
    );
    expect(r.status).toBe(200);
    expect(r.headers.get('Set-Cookie')).toContain('HttpOnly');
    expect(r.headers.get('Set-Cookie')).toContain('Secure');
  });
  it('permanently closes bootstrap once initialized', async () => {
    await env.DB.prepare('UPDATE admin_state SET initialized=1').run();
    expect(
      (
        await request(
          '/api/auth/bootstrap/options',
          'POST',
          { token: env.ADMIN_BOOTSTRAP_TOKEN },
          { Origin: env.APP_ORIGIN },
        )
      ).status,
    ).toBe(409);
  });
  it('consumes authentication challenges even after an invalid assertion', async () => {
    await env.DB.prepare('UPDATE admin_state SET initialized=1').run();
    const opt = await request('/api/auth/login/options', 'POST', {}, { Origin: env.APP_ORIGIN });
    const cookie = opt.headers.get('Set-Cookie')!.split(';')[0];
    const r = await request(
      '/api/auth/login/verify',
      'POST',
      { response: { id: 'missing' } },
      { Origin: env.APP_ORIGIN, Cookie: cookie },
    );
    expect(r.status).toBe(400);
    expect(await env.DB.prepare('SELECT COUNT(*) AS count FROM challenges').first('count')).toBe(0);
    expect(
      (
        await request(
          '/api/auth/login/verify',
          'POST',
          { response: { id: 'missing' } },
          { Origin: env.APP_ORIGIN, Cookie: cookie },
        )
      ).status,
    ).toBe(400);
  });
  it('prevents deleting the final passkey and expires sessions', async () => {
    const now = Date.now();
    await env.DB.prepare(
      "INSERT INTO credentials VALUES ('credential','key',0,'[]','singleDevice',0,'test',?,NULL)",
    )
      .bind(now)
      .run();
    await env.DB.prepare('INSERT INTO sessions VALUES (?,?,?,?)')
      .bind(await hash('session'), 'credential', now + 60000, now)
      .run();
    const headers = { Origin: env.APP_ORIGIN, Cookie: 'ta_session=session' };
    expect(
      (await request('/api/admin/passkeys/credential', 'DELETE', undefined, headers)).status,
    ).toBe(409);
    await env.DB.prepare('UPDATE sessions SET expires_at=0').run();
    expect((await request('/api/admin/passkeys', 'GET', undefined, headers)).status).toBe(401);
  });
  it('encrypts app passwords with authenticated encryption', async () => {
    const cipher = await encrypt('secret-app-password', env.CONFIG_ENCRYPTION_KEY);
    expect(cipher).not.toContain('secret-app-password');
    expect(await decrypt(cipher, env.CONFIG_ENCRYPTION_KEY)).toBe('secret-app-password');
    await expect(decrypt(cipher, '22'.repeat(32))).rejects.toThrow();
  });
  it('never exposes building snapshots or original files', async () => {
    expect(
      (await request('/api/public/data/00000000-0000-0000-0000-000000000000/tile/1')).status,
    ).toBe(404);
    expect(
      (await request('/api/public/data/00000000-0000-0000-0000-000000000000/raw/1')).status,
    ).toBe(404);
  });
});
