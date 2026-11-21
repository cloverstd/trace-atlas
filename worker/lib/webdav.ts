import { XMLParser, XMLValidator } from 'fast-xml-parser';
import type { StoredSettings } from '../../shared/types';
import type { Env } from '../types';
import { base64, decrypt } from './crypto';
import { filenameToId, readBounded } from './fog';
export class RetryableError extends Error {
  constructor(
    message: string,
    public delayMs = 60000,
  ) {
    super(message);
  }
}
export interface RemoteFile {
  path: string;
  tileId: number;
  etag: string | null;
  modified: string;
  size: number;
}
export function rootUrl(config: StoredSettings) {
  return `${config.endpoint.replace(/\/$/, '')}/${config.path.split('/').filter(Boolean).map(encodeURIComponent).join('/')}/`;
}
export function safeUrl(raw: string, config: StoredSettings): URL {
  const root = new URL(rootUrl(config)),
    url = new URL(raw, root);
  const decodedPath = decodeURIComponent(url.pathname);
  if (
    decodedPath.split('/').some((part) => part === '.' || part === '..') ||
    /[\\\x00-\x1f]/.test(decodedPath)
  )
    throw new Error('WebDAV 返回了无效的路径');
  if (
    url.origin !== root.origin ||
    url.username ||
    url.password ||
    url.hash ||
    !(
      decodeURIComponent(url.pathname).startsWith(decodeURIComponent(root.pathname)) ||
      decodeURIComponent(url.pathname) === decodeURIComponent(root.pathname).replace(/\/$/, '')
    )
  )
    throw new Error('WebDAV 返回了目录范围之外的链接');
  return url;
}
async function reserve(env: Env) {
  const now = Date.now(),
    minute = Math.floor(now / 60000) * 60000;
  const r = await env.DB.prepare(
    'UPDATE webdav_budget SET count=CASE WHEN window_start<? THEN 1 ELSE count+1 END,window_start=? WHERE id=1 AND (window_start<? OR count<10) RETURNING count',
  )
    .bind(minute, minute, minute)
    .first();
  if (!r) throw new RetryableError('等待 WebDAV 请求额度', minute + 60000 - now);
}
export async function davFetch(
  env: Env,
  config: StoredSettings,
  url: string,
  method: 'GET' | 'PROPFIND',
  extra: Record<string, string> = {},
) {
  const safe = safeUrl(url, config);
  await reserve(env);
  const password = await decrypt(config.encryptedPassword, env.CONFIG_ENCRYPTION_KEY);
  let response: Response;
  try {
    response = await fetch(safe, {
      method,
      redirect: 'manual',
      signal: AbortSignal.timeout(30000),
      headers: {
        Authorization: `Basic ${base64(new TextEncoder().encode(`${config.username}:${password}`))}`,
        ...extra,
        ...(method === 'PROPFIND'
          ? { 'Content-Type': 'application/xml; charset=utf-8', Depth: '1' }
          : {}),
      },
      body:
        method === 'PROPFIND'
          ? '<?xml version="1.0"?><d:propfind xmlns:d="DAV:"><d:prop><d:resourcetype/><d:getetag/><d:getlastmodified/><d:getcontentlength/></d:prop></d:propfind>'
          : undefined,
    });
  } catch {
    throw new RetryableError('WebDAV 网络请求失败，请稍后重试');
  }
  if (!response.ok) {
    await response.body?.cancel();
    if ([429, 503, 502, 504, 408].includes(response.status)) {
      const retry = response.headers.get('Retry-After');
      const seconds = Number(retry);
      const delay = retry
        ? Number.isFinite(seconds)
          ? seconds * 1000
          : Date.parse(retry) - Date.now()
        : 60000;
      throw new RetryableError(
        '坚果云暂时不可用或已限流',
        Math.max(60000, Math.min(Number.isFinite(delay) ? delay : 60000, 86400000)),
      );
    }
    if (response.status === 412) throw new RetryableError('远程文件正在变化，将重新尝试');
    throw new Error(`WebDAV 返回 ${response.status}，请检查应用密码和 Sync 目录`);
  }
  return response;
}
export function parseListing(
  xml: string,
  config: StoredSettings,
  currentUrl: string,
  link: string | null,
): { files: RemoteFile[]; next: string | null } {
  if (/<!DOCTYPE|<!ENTITY/i.test(xml) || XMLValidator.validate(xml) !== true)
    throw new Error('WebDAV 目录响应格式无效');
  const parser = new XMLParser({
    removeNSPrefix: true,
    parseTagValue: false,
    processEntities: true,
    htmlEntities: false,
  });
  const data = parser.parse(xml);
  if (!data.multistatus) throw new Error('WebDAV 未返回目录列表');
  const all = data.multistatus.response;
  const entries = all ? (Array.isArray(all) ? all : [all]) : [];
  const root = decodeURIComponent(new URL(rootUrl(config)).pathname),
    files: RemoteFile[] = [];
  for (const item of entries) {
    if (typeof item.href !== 'string') throw new Error('WebDAV 目录缺少文件路径');
    const url = safeUrl(new URL(item.href, currentUrl).toString(), config),
      path = decodeURIComponent(url.pathname);
    if (path.replace(/\/$/, '') === root.replace(/\/$/, '')) continue;
    if (path.slice(root.length).includes('/')) continue;
    const props = Array.isArray(item.propstat) ? item.propstat : [item.propstat];
    const successful = props.filter((p: any) => p && /\s200\s/.test(p.status));
    if (!successful.length) throw new Error('WebDAV 文件属性读取不完整');
    const prop = Object.assign({}, ...successful.map((p: any) => p.prop));
    if (prop.resourcetype && Object.hasOwn(prop.resourcetype, 'collection')) continue;
    const name = path.slice(root.length);
    if (!/^[0-9a-f]{4}[a-z]+$/.test(name)) continue;
    const tileId = filenameToId(name),
      size = Number(prop.getcontentlength);
    if (!Number.isSafeInteger(size) || size < 0 || size > 16 * 1024 * 1024)
      throw new Error('迷雾文件大小无效');
    files.push({
      path: name,
      tileId,
      size,
      etag: typeof prop.getetag === 'string' ? prop.getetag : null,
      modified: prop.getlastmodified ?? '',
    });
  }
  const match = link?.match(/<([^>]+)>\s*;\s*rel\s*=\s*"?next"?/i);
  const next = match ? safeUrl(new URL(match[1], currentUrl).toString(), config).toString() : null;
  return { files, next };
}
export async function listPage(env: Env, config: StoredSettings, cursor: string | null) {
  const url = cursor ?? rootUrl(config);
  const response = await davFetch(env, config, url, 'PROPFIND');
  if (response.status !== 207) {
    await response.body?.cancel();
    throw new Error('WebDAV 未返回 Multi-Status 目录响应');
  }
  const bytes = await readBounded(response.body!, 4 * 1024 * 1024);
  return parseListing(new TextDecoder().decode(bytes), config, url, response.headers.get('Link'));
}
