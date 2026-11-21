import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { ZodError } from 'zod';
import type { AppEnv, Env } from './types';
import { auth, requireSession, passkeys } from './auth';
import { settingsSchema, type StoredSettings } from '../shared/types';
import { encrypt } from './lib/crypto';
import { jsonBody } from './lib/http';
import { listPage } from './lib/webdav';
import { enqueueSync, tick } from './sync';
export const app = new Hono<AppEnv>();
app.use('/api/*', async (c, next) => {
  c.header('X-Content-Type-Options', 'nosniff');
  c.header('Referrer-Policy', 'strict-origin-when-cross-origin');
  c.header('Cache-Control', 'no-store');
  await next();
});
app.route('/api/auth', auth);
app.get('/api/public/map-config', (c) =>
  c.json({ tencentKey: c.env.TENCENT_MAP_KEY?.trim() || '' }),
);
app.get('/api/public/manifest', async (c) => {
  const s = await c.env.DB.prepare('SELECT current_snapshot FROM settings WHERE id=1').first<{
    current_snapshot: string | null;
  }>();
  if (!s?.current_snapshot)
    return c.json({ empty: true }, 200, { 'Cache-Control': 'public, max-age=30' });
  const object = await c.env.BUCKET.get(`snapshots/${s.current_snapshot}/manifest.json`);
  if (!object) throw new HTTPException(503, { message: '展示数据暂时不可用' });
  return new Response(object.body, {
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'public, max-age=60',
      ETag: object.httpEtag,
      'X-Content-Type-Options': 'nosniff',
    },
  });
});
app.get('/api/public/data/:version/:kind/:id', async (c) => {
  const { version, kind, id } = c.req.param();
  if (
    !/^[a-f0-9-]{36}$/.test(version) ||
    !/^\d{1,6}$/.test(id) ||
    !['overview', 'tile'].includes(kind)
  )
    throw new HTTPException(404);
  const cache = (caches as CacheStorage & { default: Cache }).default;
  const cacheUrl = new URL(c.req.url);
  // Separate correctly encoded responses from previously double-compressed cache entries.
  cacheUrl.searchParams.set('encoding', '2');
  const cacheKey = new Request(cacheUrl);
  const cached = await cache.match(cacheKey);
  if (cached) return new Response(cached.body, { headers: cached.headers, encodeBody: 'manual' });
  const snap = await c.env.DB.prepare("SELECT id FROM snapshots WHERE id=? AND status='ready'")
    .bind(version)
    .first();
  if (!snap) throw new HTTPException(404, { message: '此版本已过期，请刷新地图' });
  let key: string;
  if (kind === 'overview') key = `snapshots/${version}/overview-${Number(id)}.json.gz`;
  else {
    const f = await c.env.DB.prepare(
      'SELECT parsed_key FROM snapshot_files WHERE snapshot_id=? AND tile_id=?',
    )
      .bind(version, Number(id))
      .first<{ parsed_key: string }>();
    if (!f) throw new HTTPException(404);
    key = f.parsed_key;
  }
  const object = await c.env.BUCKET.get(key);
  if (!object) throw new HTTPException(404);
  const headers = new Headers();
  object.writeHttpMetadata(headers);
  headers.set('Cache-Control', 'public, max-age=86400, immutable');
  headers.set('ETag', object.httpEtag);
  headers.set('X-Content-Type-Options', 'nosniff');
  // R2 stores gzip bytes already. Prevent Workers from compressing them a second time.
  const response = new Response(object.body, { headers, encodeBody: 'manual' });
  c.executionCtx.waitUntil(
    cache.put(cacheKey, new Response(response.clone().body, { headers, encodeBody: 'manual' })),
  );
  return response;
});
const admin = new Hono<AppEnv>();
admin.use('*', requireSession);
admin.route('/passkeys', passkeys);
admin.get('/settings', async (c) => {
  const row = await c.env.DB.prepare('SELECT config FROM settings WHERE id=1').first<{
    config: string;
  }>();
  if (!row) return c.json(null);
  const { encryptedPassword, ...config } = JSON.parse(row.config) as StoredSettings;
  return c.json({ ...config, passwordConfigured: !!encryptedPassword });
});
async function prepareSettings(c: Parameters<typeof jsonBody>[0]) {
  const b = settingsSchema.parse(await jsonBody(c));
  const old = await c.env.DB.prepare('SELECT config,generation FROM settings WHERE id=1').first<{
    config: string;
    generation: string;
  }>();
  const previous = old ? (JSON.parse(old.config) as StoredSettings) : null;
  if (!b.password && !previous?.encryptedPassword)
    throw new HTTPException(400, { message: '请输入坚果云应用密码' });
  if (!b.password && previous && b.username !== previous.username)
    throw new HTTPException(400, { message: '更换账号时请重新填写应用密码' });
  const { password, ...rest } = b;
  const config: StoredSettings = {
    ...rest,
    path: `/${b.path.split('/').filter(Boolean).join('/')}`,
    encryptedPassword: password
      ? await encrypt(password, c.env.CONFIG_ENCRYPTION_KEY)
      : previous!.encryptedPassword,
  };
  const identityChanged =
    !previous ||
    ['username', 'endpoint', 'path'].some(
      (k) => config[k as keyof StoredSettings] !== previous[k as keyof StoredSettings],
    );
  return { config, generation: identityChanged ? crypto.randomUUID() : old!.generation };
}
admin.put('/settings', async (c) => {
  const { config, generation } = await prepareSettings(c);
  await c.env.DB.batch([
    c.env.DB.prepare(
      "UPDATE sync_runs SET status='cancelled',finished_at=?,lease_token=NULL,lease_until=0 WHERE status IN ('queued','listing','processing','publishing')",
    ).bind(Date.now()),
    c.env.DB.prepare(
      'INSERT INTO settings(id,config,generation,next_sync_at) VALUES (1,?,?,?) ON CONFLICT(id) DO UPDATE SET config=excluded.config,generation=excluded.generation,next_sync_at=excluded.next_sync_at',
    ).bind(JSON.stringify(config), generation, Date.now()),
  ]);
  return c.json({ ok: true });
});
admin.post('/settings/test', async (c) => {
  const { config } = await prepareSettings(c);
  const result = await listPage(c.env, config, null);
  return c.json({ ok: true, filesOnPage: result.files.length, hasMore: !!result.next });
});
admin.get('/runs', async (c) =>
  c.json(
    (
      await c.env.DB.prepare(
        'SELECT id,status,started_at,finished_at,discovered,downloaded,processed,error,next_attempt_at FROM sync_runs ORDER BY started_at DESC LIMIT 50',
      ).all()
    ).results,
  ),
);
admin.post('/sync', async (c) => {
  const id = await enqueueSync(c.env);
  return c.json({ id }, 202);
});
admin.post('/sync/cancel', async (c) => {
  await c.env.DB.batch([
    c.env.DB.prepare(
      "UPDATE sync_runs SET status='cancelled',finished_at=?,lease_token=NULL,lease_until=0 WHERE status IN ('queued','listing','processing','publishing')",
    ).bind(Date.now()),
    c.env.DB.prepare('UPDATE settings SET next_sync_at=? WHERE id=1').bind(Date.now() + 3600000),
  ]);
  return c.json({ ok: true });
});
app.route('/api/admin', admin);
app.all('/api/*', (c) => c.json({ error: '接口不存在' }, 404));
app.onError((error, c) => {
  if (error instanceof ZodError)
    return c.json({ error: error.issues.map((i) => i.message).join('；') }, 400);
  if (error instanceof HTTPException)
    return c.json({ error: error.message || '请求失败' }, error.status);
  const safe =
    error instanceof Error && /^(WebDAV|迷雾|文件|请先|坚果云|等待)/.test(error.message)
      ? error.message
      : '服务暂时不可用，请检查部署配置或稍后重试';
  return c.json({ error: safe }, 500);
});
export default {
  fetch: app.fetch,
  scheduled: (_event: ScheduledController, env: Env, ctx: ExecutionContext) => {
    ctx.waitUntil(tick(env));
  },
} satisfies ExportedHandler<Env>;
