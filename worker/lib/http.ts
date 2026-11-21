import { HTTPException } from 'hono/http-exception';
import type { Context } from 'hono';
import type { AppEnv, Env } from '../types';
export async function rateLimit(env: Env, key: string, limit = 20, seconds = 300) {
  const now = Date.now();
  const row = await env.DB.prepare(
    'INSERT INTO rate_limits(key,count,expires_at) VALUES (?,1,?) ON CONFLICT(key) DO UPDATE SET count=CASE WHEN expires_at<? THEN 1 ELSE count+1 END, expires_at=CASE WHEN expires_at<? THEN excluded.expires_at ELSE expires_at END RETURNING count',
  )
    .bind(key, now + seconds * 1000, now, now)
    .first<{ count: number }>();
  if (!row || row.count > limit)
    throw new HTTPException(429, { message: '请求过于频繁，请稍后再试' });
}
export function requireOrigin(c: Context<AppEnv>) {
  if (c.req.header('Origin') !== c.env.APP_ORIGIN)
    throw new HTTPException(403, { message: '请求来源不匹配' });
}
export async function jsonBody(c: Context<AppEnv>): Promise<unknown> {
  if (!c.req.header('content-type')?.includes('application/json'))
    throw new HTTPException(415, { message: '需要 JSON 请求' });
  const reader = c.req.raw.body?.getReader();
  if (!reader) throw new HTTPException(400, { message: '请求为空' });
  let data = '',
    length = 0;
  const decoder = new TextDecoder();
  try {
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      length += chunk.value.length;
      if (length > 65536) {
        await reader.cancel();
        throw new HTTPException(413, { message: '请求过大' });
      }
      data += decoder.decode(chunk.value, { stream: true });
    }
    data += decoder.decode();
    return JSON.parse(data);
  } catch (e) {
    if (e instanceof HTTPException) throw e;
    throw new HTTPException(400, { message: 'JSON 格式错误' });
  } finally {
    reader.releaseLock();
  }
}
