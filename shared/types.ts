import { z } from 'zod';
export const settingsSchema = z.object({
  endpoint: z
    .string()
    .url()
    .refine((v) => {
      const u = new URL(v);
      return (
        u.origin === 'https://dav.jianguoyun.com' &&
        !u.username &&
        !u.password &&
        !u.search &&
        !u.hash &&
        u.pathname.replace(/\/$/, '') === '/dav'
      );
    }, '第一版仅支持坚果云官方 HTTPS WebDAV 地址'),
  username: z.string().trim().min(1).max(254),
  password: z.string().max(1024).optional(),
  path: z
    .string()
    .trim()
    .min(1)
    .max(1024)
    .refine(
      (p) => !p.split('/').some((s) => s === '..' || s === '.') && !/[?#\\\x00-\x1f]/.test(p),
      '请输入有效的 Sync 目录路径',
    ),
  enabled: z.boolean(),
  intervalMinutes: z.number().int().min(30).max(10080),
});
export type SourceSettings = z.infer<typeof settingsSchema>;
export type StoredSettings = Omit<SourceSettings, 'password'> & { encryptedPassword: string };
export type Bounds = [number, number, number, number];
export interface FogBlock {
  index: number;
  bitmap: string;
}
export interface FogTile {
  format: 1;
  id: number;
  x: number;
  y: number;
  blocks: FogBlock[];
}
export interface TileOverview {
  id: number;
  x: number;
  y: number;
  bitmap: string;
}
export interface MapManifest {
  format: 1;
  version: string;
  updatedAt: number;
  areaM2: number;
  bounds: Bounds | null;
  tileCount: number;
  overviewPages: number;
}
export interface SyncRun {
  id: string;
  status: string;
  started_at: number;
  finished_at: number | null;
  discovered: number;
  downloaded: number;
  processed: number;
  error: string | null;
  next_attempt_at: number;
}
export const ACTIVE_STATUSES = ['queued', 'listing', 'processing', 'publishing'];
