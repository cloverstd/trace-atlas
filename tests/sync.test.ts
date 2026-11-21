import { describe, it, expect, vi } from 'vitest';
import { env } from 'cloudflare:test';
import { encrypt } from '../worker/lib/crypto';
import { enqueueSync, tick } from '../worker/sync';
import { fixture, deflate, listingXml } from './fixtures';
import { tileFilename } from '../worker/lib/fog';
import type { StoredSettings } from '../shared/types';
async function setup() {
  const config: StoredSettings = {
    endpoint: 'https://dav.jianguoyun.com/dav',
    username: 'test',
    encryptedPassword: await encrypt('secret', env.CONFIG_ENCRYPTION_KEY),
    path: '/Fog of World/Sync',
    enabled: false,
    intervalMinutes: 60,
  };
  await env.DB.prepare('INSERT INTO settings(id,config,generation) VALUES (1,?,?)')
    .bind(JSON.stringify(config), 'generation')
    .run();
}
async function finish(id: string, max = 80) {
  for (let i = 0; i < max; i++) {
    await tick(env);
    const r = await env.DB.prepare('SELECT status,error FROM sync_runs WHERE id=?')
      .bind(id)
      .first<{ status: string; error: string }>();
    if (['failed', 'success', 'cancelled'].includes(r!.status)) return r!;
  }
  throw new Error('run did not finish');
}
describe('resumable sync and snapshot publication', () => {
  it('coalesces concurrent manual starts and respects paused automatic sync', async () => {
    await setup();
    expect(await enqueueSync(env, true)).toBeNull();
    const ids = await Promise.all([enqueueSync(env), enqueueSync(env)]);
    expect(ids[0]).toBe(ids[1]);
    expect(await env.DB.prepare('SELECT COUNT(*) FROM sync_runs').first('COUNT(*)')).toBe(1);
  });
  it('does not let a cancelled invocation overwrite newer scheduling settings', async () => {
    await setup();
    const id = await enqueueSync(env);
    vi.spyOn(globalThis, 'fetch').mockImplementation(async () => {
      await env.DB.batch([
        env.DB.prepare(
          "UPDATE sync_runs SET status='cancelled',lease_token=NULL,lease_until=0 WHERE id=?",
        ).bind(id),
        env.DB.prepare('UPDATE settings SET next_sync_at=12345'),
      ]);
      return new Response('', { status: 401 });
    });
    await tick(env);
    expect(
      await env.DB.prepare('SELECT status FROM sync_runs WHERE id=?').bind(id).first('status'),
    ).toBe('cancelled');
    expect(await env.DB.prepare('SELECT next_sync_at FROM settings').first('next_sync_at')).toBe(
      12345,
    );
  });
  it('stops repeatedly interrupted tasks instead of retrying forever', async () => {
    await setup();
    const id = await enqueueSync(env);
    await env.DB.prepare(
      "UPDATE sync_runs SET attempts=7,lease_token='expired',lease_until=1 WHERE id=?",
    )
      .bind(id)
      .run();
    await tick(env);
    const run = await env.DB.prepare('SELECT status,error FROM sync_runs WHERE id=?')
      .bind(id)
      .first<{ status: string; error: string }>();
    expect(run!.status).toBe('failed');
    expect(run!.error).toContain('CPU');
  });
  it('rolls back all publication changes when the D1 commit fails', async () => {
    await setup();
    const f = fixture(),
      compressed = await deflate(f.data);
    let version = 1;
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (_input, init) =>
      init?.method === 'PROPFIND'
        ? new Response(
            listingXml([
              { name: f.name, size: compressed.length, etag: `&quot;v${version}&quot;` },
            ]),
            { status: 207 },
          )
        : new Response(compressed, { headers: { ETag: `"v${version}"` } }),
    );
    const first = await enqueueSync(env);
    expect((await finish(first)).status).toBe('success');
    const oldKey = await env.DB.prepare('SELECT parsed_key FROM published_files').first(
      'parsed_key',
    );
    await env.DB.prepare(
      "CREATE TRIGGER reject_publish BEFORE UPDATE OF status ON snapshots WHEN NEW.status='ready' BEGIN SELECT RAISE(ABORT,'simulated commit failure'); END",
    ).run();
    version = 2;
    expect((await finish(await enqueueSync(env))).status).toBe('failed');
    expect(
      await env.DB.prepare('SELECT current_snapshot FROM settings').first('current_snapshot'),
    ).toBe(first);
    expect(await env.DB.prepare('SELECT parsed_key FROM published_files').first('parsed_key')).toBe(
      oldKey,
    );
  });
  it('downloads, parses and atomically publishes; unchanged runs reuse objects and deletions need two scans', async () => {
    await setup();
    const f = fixture(),
      compressed = await deflate(f.data);
    let empty = false;
    const fetch = vi.spyOn(globalThis, 'fetch').mockImplementation(async (_input, init) =>
      init?.method === 'PROPFIND'
        ? new Response(listingXml(empty ? [] : [{ name: f.name, size: compressed.length }]), {
            status: 207,
          })
        : new Response(compressed, { headers: { ETag: '"v1"' } }),
    );
    const id = await enqueueSync(env);
    expect(await enqueueSync(env)).toBe(id);
    await tick(env);
    expect(
      await env.DB.prepare('SELECT current_snapshot FROM settings').first('current_snapshot'),
    ).toBeNull();
    expect((await finish(id)).status).toBe('success');
    expect(
      await env.DB.prepare('SELECT current_snapshot FROM settings').first('current_snapshot'),
    ).toBe(id);
    const snapshot = await env.BUCKET.get(`snapshots/${id}/manifest.json`);
    expect((await snapshot!.json<{ tileCount: number }>()).tileCount).toBe(1);
    const key = await env.DB.prepare('SELECT parsed_key FROM published_files').first('parsed_key');
    const again = await enqueueSync(env);
    expect((await finish(again)).status).toBe('success');
    expect(
      await env.DB.prepare('SELECT current_snapshot FROM settings').first('current_snapshot'),
    ).toBe(id);
    expect(await env.DB.prepare('SELECT parsed_key FROM published_files').first('parsed_key')).toBe(
      key,
    );
    expect(fetch.mock.calls.filter((c) => c[1]?.method === 'GET')).toHaveLength(1);
    empty = true;
    expect((await finish(await enqueueSync(env))).status).toBe('success');
    expect(await env.DB.prepare('SELECT COUNT(*) FROM published_files').first('COUNT(*)')).toBe(1);
    expect((await finish(await enqueueSync(env))).status).toBe('success');
    expect(await env.DB.prepare('SELECT COUNT(*) FROM published_files').first('COUNT(*)')).toBe(0);
  });
  it('retains the last good version when a modified file is corrupt', async () => {
    await setup();
    const f = fixture(),
      compressed = await deflate(f.data);
    let corrupt = false;
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (_i, init) => {
      const data = corrupt ? new Uint8Array([1, 2, 3]) : compressed;
      return init?.method === 'PROPFIND'
        ? new Response(
            listingXml([
              {
                name: f.name,
                size: data.length,
                etag: corrupt ? '&quot;v2&quot;' : '&quot;v1&quot;',
              },
            ]),
            { status: 207 },
          )
        : new Response(data, { headers: { ETag: corrupt ? '"v2"' : '"v1"' } });
    });
    const first = await enqueueSync(env);
    expect((await finish(first)).status).toBe('success');
    corrupt = true;
    expect((await finish(await enqueueSync(env))).status).toBe('failed');
    expect(
      await env.DB.prepare('SELECT current_snapshot FROM settings').first('current_snapshot'),
    ).toBe(first);
  });
  it('honors 503 backoff and resumes after the deadline', async () => {
    await setup();
    let limited = true;
    vi.spyOn(globalThis, 'fetch').mockImplementation(async () =>
      limited
        ? new Response('', { status: 503, headers: { 'Retry-After': '120' } })
        : new Response(listingXml([]), { status: 207 }),
    );
    const id = await enqueueSync(env);
    await tick(env);
    const r = await env.DB.prepare('SELECT status,next_attempt_at FROM sync_runs WHERE id=?')
      .bind(id)
      .first<{ status: string; next_attempt_at: number }>();
    expect(r!.status).toBe('queued');
    expect(r!.next_attempt_at).toBeGreaterThan(Date.now() + 110000);
    limited = false;
    await env.DB.prepare('UPDATE sync_runs SET next_attempt_at=0 WHERE id=?').bind(id).run();
    expect((await finish(id)).status).toBe('success');
  });
  it('does not duplicate work while another invocation holds the lease', async () => {
    await setup();
    const id = await enqueueSync(env);
    await env.DB.prepare('UPDATE sync_runs SET lease_token=?,lease_until=? WHERE id=?')
      .bind('held', Date.now() + 60000, id)
      .run();
    const fetch = vi.spyOn(globalThis, 'fetch');
    await tick(env);
    expect(fetch).not.toHaveBeenCalled();
    expect(
      await env.DB.prepare('SELECT lease_token FROM sync_runs WHERE id=?')
        .bind(id)
        .first('lease_token'),
    ).toBe('held');
  });
  it('persists more than 750 entries across paginated listings without downloading every unchanged file', async () => {
    await setup();
    const files = Array.from({ length: 751 }, (_, id) => ({
      name: tileFilename(id + 1000),
      size: 42,
    }));
    let calls = 0;
    vi.spyOn(globalThis, 'fetch').mockImplementation(async () => {
      calls++;
      return new Response(listingXml(calls === 1 ? files.slice(0, 750) : files.slice(750)), {
        status: 207,
        headers:
          calls === 1
            ? {
                Link: '<https://dav.jianguoyun.com/dav/Fog%20of%20World/Sync/?cursor=2>; rel="next"',
              }
            : {},
      });
    });
    const id = await enqueueSync(env);
    for (let i = 0; i < 40; i++) {
      await tick(env);
      if (
        (await env.DB.prepare('SELECT status FROM sync_runs WHERE id=?')
          .bind(id)
          .first('status')) === 'processing'
      )
        break;
    }
    expect(calls).toBe(2);
    expect(
      await env.DB.prepare('SELECT COUNT(*) FROM sync_files WHERE run_id=?')
        .bind(id)
        .first('COUNT(*)'),
    ).toBe(751);
  });
});
