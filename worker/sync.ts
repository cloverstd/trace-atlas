import type { Env } from './types';
import type { StoredSettings, Bounds, MapManifest, TileOverview } from '../shared/types';
import { listPage, davFetch, rootUrl, RetryableError, type RemoteFile } from './lib/webdav';
import { parseFog, mergeBounds } from './lib/fog';
interface SettingsRow {
  config: string;
  generation: string;
  current_snapshot: string | null;
  next_sync_at: number;
}
interface Run {
  id: string;
  generation: string;
  config: string;
  status: string;
  cursor: string | null;
  listing_key: string | null;
  listing_offset: number;
  seen_cursors: string;
  lease_token: string;
  attempts: number;
  publish_offset: number;
  publish_area: number;
  publish_bounds: string | null;
  publish_pages: number;
}
interface FileRow {
  path: string;
  tile_id: number;
  etag: string | null;
  modified: string;
  size: number;
  status: string;
  raw_key: string | null;
  parsed_key: string | null;
  overview: string | null;
  area: number | null;
  bounds: string | null;
  missing_count: number;
}
const ACTIVE = "('queued','listing','processing','publishing')";
export function enqueueSync(env: Env): Promise<string>;
export function enqueueSync(env: Env, automatic: true): Promise<string | null>;
export async function enqueueSync(env: Env, automatic = false): Promise<string | null> {
  const existing = await env.DB.prepare(
    `SELECT id FROM sync_runs WHERE status IN ${ACTIVE}`,
  ).first<{ id: string }>();
  if (existing) return existing.id;
  const id = crypto.randomUUID(),
    now = Date.now();
  await env.DB.prepare(
    `INSERT OR IGNORE INTO sync_runs(id,generation,config,status,started_at) SELECT ?,generation,config,'queued',? FROM settings WHERE id=1 AND (?=0 OR (json_extract(config,'$.enabled')=1 AND next_sync_at<=?)) AND NOT EXISTS(SELECT 1 FROM sync_runs WHERE status IN ${ACTIVE})`,
  )
    .bind(id, now, +automatic, now)
    .run();
  const active = await env.DB.prepare(`SELECT id FROM sync_runs WHERE status IN ${ACTIVE}`).first<{
    id: string;
  }>();
  if (active) return active.id;
  if (automatic) return null;
  const created = await env.DB.prepare('SELECT id FROM sync_runs WHERE id=?')
    .bind(id)
    .first<{ id: string }>();
  if (created) return created.id;
  throw new Error('请先保存 WebDAV 配置，然后重新同步');
}
function guard(env: Env, run: Run, sql: string, args: unknown[] = []) {
  return env.DB.prepare(sql).bind(...args, run.id, run.lease_token);
}
const VALID =
  "EXISTS(SELECT 1 FROM sync_runs WHERE id=? AND lease_token=? AND status IN ('queued','listing','processing','publishing'))";
async function updateRun(env: Env, run: Run, sets: string, args: unknown[] = []) {
  await env.DB.prepare(
    `UPDATE sync_runs SET ${sets} WHERE id=? AND lease_token=? AND status IN ${ACTIVE}`,
  )
    .bind(...args, run.id, run.lease_token)
    .run();
}
async function gzPut(env: Env, key: string, value: unknown) {
  const bytes = new TextEncoder().encode(JSON.stringify(value));
  const compressed = await new Response(
    new Blob([bytes]).stream().pipeThrough(new CompressionStream('gzip')),
  ).arrayBuffer();
  await env.BUCKET.put(key, compressed, {
    httpMetadata: { contentType: 'application/json', contentEncoding: 'gzip' },
  });
}
async function listing(env: Env, run: Run) {
  const config = JSON.parse(run.config) as StoredSettings;
  if (!run.listing_key) {
    const page = await listPage(env, config, run.cursor),
      seen = JSON.parse(run.seen_cursors) as string[];
    if (page.next && (seen.includes(page.next) || page.next === run.cursor))
      throw new Error('WebDAV 分页游标重复，已停止以避免遗漏文件');
    const key = `listing/${run.id}/${crypto.randomUUID()}.json`;
    await env.BUCKET.put(key, JSON.stringify(page));
    await updateRun(
      env,
      run,
      "status='listing',listing_key=?,listing_offset=0,attempts=0,error=NULL",
      [key],
    );
    return;
  }
  const staged = await env.BUCKET.get(run.listing_key);
  if (!staged) throw new Error('暂存目录缺失，请重新同步');
  const page = await staged.json<{ files: RemoteFile[]; next: string | null }>();
  const slice = page.files.slice(run.listing_offset, run.listing_offset + 24);
  const prior = slice.length
    ? await env.DB.prepare(
        `SELECT * FROM published_files WHERE generation=? AND path IN (${slice.map(() => '?').join(',')})`,
      )
        .bind(run.generation, ...slice.map((f) => f.path))
        .all<FileRow>()
    : { results: [] };
  const byPath = new Map(prior.results.map((f) => [f.path, f]));
  const statements = slice.map((f) => {
    const old = byPath.get(f.path);
    const same =
      old &&
      (f.etag && old.etag
        ? f.etag === old.etag
        : f.modified !== '' && f.modified === old.modified && f.size === old.size);
    return guard(
      env,
      run,
      `INSERT INTO sync_files(run_id,path,tile_id,etag,modified,size,status,raw_key,parsed_key,overview,area,bounds) SELECT ?,?,?,?,?,?,?,?,?,?,?,? WHERE ${VALID} ON CONFLICT(run_id,path) DO NOTHING`,
      [
        run.id,
        f.path,
        f.tileId,
        f.etag,
        f.modified,
        f.size,
        same ? 'done' : 'pending',
        same ? old.raw_key : null,
        same ? old.parsed_key : null,
        same ? old.overview : null,
        same ? old.area : null,
        same ? old.bounds : null,
      ],
    );
  });
  for (let i = 0; i < statements.length; i += 40) await env.DB.batch(statements.slice(i, i + 40));
  if (run.listing_offset + slice.length < page.files.length) {
    await updateRun(
      env,
      run,
      'listing_offset=listing_offset+?,discovered=(SELECT COUNT(*) FROM sync_files WHERE run_id=?)',
      [slice.length, run.id],
    );
    return;
  }
  const seen = JSON.parse(run.seen_cursors) as string[];
  if (page.next) {
    seen.push(page.next);
    await updateRun(
      env,
      run,
      "status='listing',listing_key=NULL,listing_offset=0,cursor=?,seen_cursors=?,discovered=(SELECT COUNT(*) FROM sync_files WHERE run_id=?),attempts=0,error=NULL",
      [page.next, JSON.stringify(seen), run.id],
    );
    return;
  }
  await env.DB.batch([
    guard(
      env,
      run,
      `INSERT INTO sync_files(run_id,path,tile_id,etag,modified,size,status,raw_key,parsed_key,overview,area,bounds,missing_count) SELECT ?,p.path,p.tile_id,p.etag,p.modified,p.size,'done',p.raw_key,p.parsed_key,p.overview,p.area,p.bounds,p.missing_count+1 FROM published_files p WHERE p.generation=? AND p.missing_count<1 AND NOT EXISTS(SELECT 1 FROM sync_files f WHERE f.run_id=? AND f.path=p.path) AND ${VALID}`,
      [run.id, run.generation, run.id],
    ),
    env.DB.prepare(
      `UPDATE sync_runs SET status='processing',cursor=NULL,listing_key=NULL,discovered=(SELECT COUNT(*) FROM sync_files WHERE run_id=?),processed=(SELECT COUNT(*) FROM sync_files WHERE run_id=? AND status='done'),attempts=0,error=NULL WHERE id=? AND lease_token=? AND status IN ${ACTIVE}`,
    ).bind(run.id, run.id, run.id, run.lease_token),
  ]);
}
async function processing(env: Env, run: Run) {
  const file = await env.DB.prepare(
    "SELECT * FROM sync_files WHERE run_id=? AND status!='done' ORDER BY CASE status WHEN 'downloaded' THEN 0 ELSE 1 END,path LIMIT 1",
  )
    .bind(run.id)
    .first<FileRow>();
  if (!file) {
    const changes = await env.DB.prepare(
      `SELECT
      (SELECT current_snapshot FROM settings WHERE id=1) IS NULL OR EXISTS(
        SELECT 1 FROM sync_files f LEFT JOIN published_files p ON p.path=f.path AND p.generation=?
        WHERE f.run_id=? AND f.parsed_key IS NOT p.parsed_key
        UNION ALL
        SELECT 1 FROM published_files p WHERE NOT EXISTS(SELECT 1 FROM sync_files f WHERE f.run_id=? AND f.path=p.path)
      ) AS changed`,
    )
      .bind(run.generation, run.id, run.id)
      .first<{ changed: number }>();
    if (!changes!.changed) {
      const now = Date.now();
      await env.DB.batch([
        guard(
          env,
          run,
          `UPDATE published_files SET missing_count=(SELECT missing_count FROM sync_files WHERE run_id=? AND path=published_files.path) WHERE missing_count!=(SELECT missing_count FROM sync_files WHERE run_id=? AND path=published_files.path) AND ${VALID}`,
          [run.id, run.id],
        ),
        guard(env, run, `UPDATE settings SET next_sync_at=? WHERE generation=? AND ${VALID}`, [
          now + (JSON.parse(run.config) as StoredSettings).intervalMinutes * 60000,
          run.generation,
        ]),
        env.DB.prepare(
          `UPDATE sync_runs SET status='success',finished_at=?,error=NULL,lease_token=NULL,lease_until=0 WHERE id=? AND lease_token=? AND status IN ${ACTIVE}`,
        ).bind(now, run.id, run.lease_token),
      ]);
      return;
    }
    await env.DB.batch([
      guard(
        env,
        run,
        `INSERT OR IGNORE INTO snapshots(id,manifest_key,status,created_at) SELECT ?,?,'building',? WHERE ${VALID}`,
        [run.id, `snapshots/${run.id}/manifest.json`, Date.now()],
      ),
      env.DB.prepare(
        `UPDATE sync_runs SET status='publishing',attempts=0,error=NULL WHERE id=? AND lease_token=? AND status IN ${ACTIVE}`,
      ).bind(run.id, run.lease_token),
    ]);
    return;
  }
  if (file.status === 'pending') {
    const config = JSON.parse(run.config) as StoredSettings;
    const response = await davFetch(
      env,
      config,
      rootUrl(config) + encodeURIComponent(file.path),
      'GET',
      file.etag && !file.etag.startsWith('W/') ? { 'If-Match': file.etag } : {},
    );
    const etag = response.headers.get('ETag');
    if (file.etag && etag && etag !== file.etag) {
      await response.body?.cancel();
      throw new Error('文件在同步期间发生变化，请重新同步');
    }
    const stream = new FixedLengthStream(file.size);
    const key = `raw/${run.id}/${crypto.randomUUID()}`;
    const abort = new AbortController();
    const transfer = response.body!.pipeTo(stream.writable, { signal: abort.signal });
    try {
      await Promise.all([
        transfer,
        env.BUCKET.put(key, stream.readable, {
          httpMetadata: { contentType: 'application/octet-stream' },
        }),
      ]);
    } catch {
      abort.abort();
      throw new RetryableError('文件下载中断或长度变化，将稍后重试');
    }
    await env.DB.batch([
      guard(
        env,
        run,
        `UPDATE sync_files SET status='downloaded',raw_key=? WHERE run_id=? AND path=? AND ${VALID}`,
        [key, run.id, file.path],
      ),
      env.DB.prepare(
        `UPDATE sync_runs SET downloaded=downloaded+1,attempts=0,error=NULL WHERE id=? AND lease_token=? AND status IN ${ACTIVE}`,
      ).bind(run.id, run.lease_token),
    ]);
    return;
  }
  const raw = await env.BUCKET.get(file.raw_key!);
  if (!raw) throw new Error('暂存文件缺失，请重新同步');
  const parsed = await parseFog(file.path, raw.body),
    key = `parsed/${run.id}/${file.tile_id}.json.gz`;
  await gzPut(env, key, parsed.tile);
  await env.DB.batch([
    guard(
      env,
      run,
      `UPDATE sync_files SET status='done',parsed_key=?,overview=?,area=?,bounds=? WHERE run_id=? AND path=? AND ${VALID}`,
      [key, parsed.overview, parsed.areaM2, JSON.stringify(parsed.bounds), run.id, file.path],
    ),
    env.DB.prepare(
      `UPDATE sync_runs SET processed=processed+1,attempts=0,error=NULL WHERE id=? AND lease_token=? AND status IN ${ACTIVE}`,
    ).bind(run.id, run.lease_token),
  ]);
}
async function publishing(env: Env, run: Run) {
  const rows = await env.DB.prepare(
    'SELECT * FROM sync_files WHERE run_id=? ORDER BY tile_id LIMIT 24 OFFSET ?',
  )
    .bind(run.id, run.publish_offset)
    .all<FileRow>();
  if (rows.results.length) {
    const page: TileOverview[] = rows.results.map((f) => ({
      id: f.tile_id,
      x: f.tile_id % 512,
      y: Math.floor(f.tile_id / 512),
      bitmap: f.overview!,
    }));
    await gzPut(env, `snapshots/${run.id}/overview-${run.publish_pages}.json.gz`, page);
    const membership = rows.results.map((f) =>
      guard(
        env,
        run,
        `INSERT OR IGNORE INTO snapshot_files(snapshot_id,tile_id,parsed_key,raw_key) SELECT ?,?,?,? WHERE ${VALID}`,
        [run.id, f.tile_id, f.parsed_key, f.raw_key],
      ),
    );
    for (let i = 0; i < membership.length; i += 40) await env.DB.batch(membership.slice(i, i + 40));
    let bounds = JSON.parse(run.publish_bounds ?? 'null') as Bounds | null;
    for (const f of rows.results) bounds = mergeBounds(bounds, JSON.parse(f.bounds ?? 'null'));
    await updateRun(
      env,
      run,
      'publish_offset=publish_offset+?,publish_pages=publish_pages+1,publish_area=publish_area+?,publish_bounds=?,attempts=0,error=NULL',
      [
        rows.results.length,
        rows.results.reduce((sum, f) => sum + (f.area ?? 0), 0),
        JSON.stringify(bounds),
      ],
    );
    return;
  }
  const now = Date.now();
  const manifest: MapManifest = {
    format: 1,
    version: run.id,
    updatedAt: now,
    areaM2: run.publish_area,
    bounds: JSON.parse(run.publish_bounds ?? 'null'),
    tileCount: run.publish_offset,
    overviewPages: run.publish_pages,
  };
  await env.BUCKET.put(`snapshots/${run.id}/manifest.json`, JSON.stringify(manifest), {
    httpMetadata: { contentType: 'application/json' },
  });
  const interval = (JSON.parse(run.config) as StoredSettings).intervalMinutes * 60000;
  await env.DB.batch([
    guard(
      env,
      run,
      `UPDATE snapshots SET retired_at=? WHERE id=(SELECT current_snapshot FROM settings WHERE id=1) AND ${VALID}`,
      [now],
    ),
    guard(env, run, `DELETE FROM published_files WHERE ${VALID}`),
    guard(
      env,
      run,
      `INSERT INTO published_files(path,generation,tile_id,etag,modified,size,raw_key,parsed_key,overview,area,bounds,missing_count) SELECT path,?,tile_id,etag,modified,size,raw_key,parsed_key,overview,area,bounds,missing_count FROM sync_files WHERE run_id=? AND ${VALID}`,
      [run.generation, run.id],
    ),
    guard(env, run, `UPDATE snapshots SET status='ready',created_at=? WHERE id=? AND ${VALID}`, [
      now,
      run.id,
    ]),
    guard(
      env,
      run,
      `UPDATE settings SET current_snapshot=?,next_sync_at=? WHERE id=1 AND generation=? AND ${VALID}`,
      [run.id, now + interval, run.generation],
    ),
    env.DB.prepare(
      `UPDATE sync_runs SET status='success',finished_at=?,error=NULL,lease_token=NULL,lease_until=0 WHERE id=? AND lease_token=? AND status IN ${ACTIVE}`,
    ).bind(now, run.id, run.lease_token),
  ]);
}
export async function tick(env: Env) {
  const now = Date.now();
  let active = await env.DB.prepare(`SELECT id FROM sync_runs WHERE status IN ${ACTIVE}`).first<{
    id: string;
  }>();
  if (!active) {
    const settings = await env.DB.prepare('SELECT * FROM settings WHERE id=1').first<SettingsRow>();
    if (settings && JSON.parse(settings.config).enabled && settings.next_sync_at <= now) {
      const id = await enqueueSync(env, true);
      if (!id) return;
      active = { id };
    } else {
      if (new Date(now).getUTCMinutes() % 10 === 0) await cleanup(env);
      return;
    }
  }
  const token = crypto.randomUUID();
  const run = await env.DB.prepare(
    `UPDATE sync_runs SET attempts=CASE WHEN lease_token IS NOT NULL THEN attempts+1 ELSE attempts END,lease_token=?,lease_until=? WHERE id=? AND lease_until<? AND next_attempt_at<=? AND status IN ${ACTIVE} RETURNING *`,
  )
    .bind(token, now + 16 * 60000, active.id, now, now)
    .first<Run>();
  if (!run) return;
  try {
    if (run.attempts >= 8)
      throw new Error('文件处理多次中断，请检查 Workers CPU 限制；免费额度不足时切换付费 Workers');
    if (run.status === 'queued' || run.status === 'listing') await listing(env, run);
    else if (run.status === 'processing') await processing(env, run);
    else await publishing(env, run);
  } catch (e) {
    const retry = e instanceof RetryableError && run.attempts < 8;
    // Only controlled messages reach the admin. Never persist request objects, credentials, or provider bodies.
    const message =
      e instanceof RetryableError
        ? e.message
        : e instanceof Error && /^(迷雾|文件|WebDAV|远程|暂存)/.test(e.message)
          ? e.message
          : '处理失败，请检查数据格式并重新同步';
    console.error(
      JSON.stringify({
        event: 'sync_failure',
        runId: run.id,
        phase: run.status,
        retryable: retry,
        reason: message,
      }),
    );
    if (retry)
      await updateRun(env, run, 'attempts=attempts+1,next_attempt_at=?,error=?', [
        Date.now() +
          Math.max((e as RetryableError).delayMs, Math.min(60000 * 2 ** run.attempts, 3600000)),
        message,
      ]);
    else {
      await env.DB.batch([
        guard(env, run, `UPDATE settings SET next_sync_at=? WHERE generation=? AND ${VALID}`, [
          Date.now() + (JSON.parse(run.config) as StoredSettings).intervalMinutes * 60000,
          run.generation,
        ]),
        env.DB.prepare(
          `UPDATE sync_runs SET status='failed',finished_at=?,error=? WHERE id=? AND lease_token=? AND status IN ${ACTIVE}`,
        ).bind(Date.now(), message, run.id, run.lease_token),
      ]);
    }
  } finally {
    await env.DB.prepare(
      'UPDATE sync_runs SET lease_token=NULL,lease_until=0 WHERE id=? AND lease_token=?',
    )
      .bind(run.id, token)
      .run();
  }
}
export async function cleanup(env: Env) {
  const now = Date.now();
  await env.DB.batch([
    env.DB.prepare('DELETE FROM sessions WHERE expires_at<?').bind(now),
    env.DB.prepare('DELETE FROM challenges WHERE expires_at<?').bind(now),
    env.DB.prepare('DELETE FROM rate_limits WHERE expires_at<?').bind(now),
    env.DB.prepare(
      "DELETE FROM snapshots WHERE status='ready' AND retired_at<? AND id NOT IN (SELECT id FROM snapshots WHERE status='ready' ORDER BY created_at DESC LIMIT 2)",
    ).bind(now - 86400000),
    env.DB.prepare(
      "DELETE FROM snapshots WHERE status='building' AND created_at<? AND id NOT IN (SELECT id FROM sync_runs WHERE status IN ('queued','listing','processing','publishing'))",
    ).bind(now - 86400000),
    env.DB.prepare(
      "DELETE FROM sync_runs WHERE status IN ('success','failed','cancelled') AND finished_at<?",
    ).bind(now - 30 * 86400000),
  ]);
  // Incremental mark-and-sweep. Protect both live snapshots and unfinished/recent syncs.
  const state = await env.DB.prepare('SELECT cursor FROM gc_state WHERE id=1').first<{
    cursor: string | null;
  }>();
  const listed = await env.BUCKET.list({ limit: 10, cursor: state?.cursor ?? undefined });
  for (const object of listed.objects) {
    if (object.uploaded.getTime() > now - 86400000) continue;
    const [prefix, owner] = object.key.split('/');
    let keep: unknown;
    if (prefix === 'listing')
      keep = await env.DB.prepare(`SELECT id FROM sync_runs WHERE id=? AND status IN ${ACTIVE}`)
        .bind(owner)
        .first();
    else if (prefix === 'snapshots')
      keep = await env.DB.prepare('SELECT id FROM snapshots WHERE id=?').bind(owner).first();
    else
      keep = await env.DB.prepare(
        `SELECT 1 FROM snapshot_files WHERE raw_key=? OR parsed_key=? UNION ALL SELECT 1 FROM sync_files f JOIN sync_runs r ON r.id=f.run_id WHERE (f.raw_key=? OR f.parsed_key=?) AND (r.status IN ${ACTIVE} OR COALESCE(r.finished_at,0)>?) LIMIT 1`,
      )
        .bind(object.key, object.key, object.key, object.key, now - 86400000)
        .first();
    if (!keep) await env.BUCKET.delete(object.key);
  }
  await env.DB.prepare('UPDATE gc_state SET cursor=? WHERE id=1')
    .bind(listed.truncated ? listed.cursor : null)
    .run();
}
