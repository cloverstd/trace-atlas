import { expect, it } from 'vitest';
import { env, createExecutionContext, waitOnExecutionContext } from 'cloudflare:test';
import { app } from '../worker';

it('serves stored gzip JSON through both R2 and cache with one compression layer', async () => {
  const version = crypto.randomUUID();
  const overview = [{ id: 1, x: 1, y: 0, bitmap: 'AA==' }];
  const tile = { format: 1, id: 1, x: 1, y: 0, blocks: [] };
  await env.DB.prepare(
    "INSERT INTO snapshots(id,manifest_key,status,created_at) VALUES (?,?,'ready',?)",
  )
    .bind(version, `snapshots/${version}/manifest.json`, Date.now())
    .run();
  await env.DB.prepare('INSERT INTO snapshot_files VALUES (?,?,?,?)')
    .bind(version, 1, `parsed/${version}/1.json.gz`, 'raw/test')
    .run();
  for (const [kind, id, key, value] of [
    ['overview', 0, `snapshots/${version}/overview-0.json.gz`, overview],
    ['tile', 1, `parsed/${version}/1.json.gz`, tile],
  ] as const) {
    const compressed = await new Response(
      new Blob([JSON.stringify(value)]).stream().pipeThrough(new CompressionStream('gzip')),
    ).arrayBuffer();
    await env.BUCKET.put(key, compressed, {
      httpMetadata: { contentType: 'application/json', contentEncoding: 'gzip' },
    });
    for (let attempt = 0; attempt < 2; attempt++) {
      const ctx = createExecutionContext();
      const response = await app.fetch(
        new Request(`https://atlas.test/api/public/data/${version}/${kind}/${id}?encoding=2`),
        env,
        ctx,
      );
      await waitOnExecutionContext(ctx);
      expect(response.status).toBe(200);
      expect(response.headers.get('Content-Encoding')).toBe('gzip');
      expect(
        await new Response(response.body!.pipeThrough(new DecompressionStream('gzip'))).json(),
      ).toEqual(value);
      // The second request must be satisfied by the cache, without the original R2 object.
      await env.BUCKET.delete(key);
    }
  }
});
