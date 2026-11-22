import type { SourceSettings } from '../../../shared/types';

export type AdminTabId = 'overview' | 'settings' | 'history' | 'security';
export type AuthStatus = { initialized: boolean; authenticated: boolean };
export type AdminConfig = SourceSettings & { passwordConfigured?: boolean };
export type PasskeyCredential = {
  id: string;
  name: string;
  created_at: number;
  last_used_at: number | null;
};

export const SYNC_STATUS_LABELS: Record<string, string> = {
  queued: '等待执行',
  listing: '扫描目录',
  processing: '解析数据',
  publishing: '发布地图',
  success: '已完成',
  failed: '同步失败',
  cancelled: '已取消',
};

export const DEFAULT_CONFIG: AdminConfig = {
  endpoint: 'https://dav.jianguoyun.com/dav',
  username: '',
  password: '',
  path: '',
  intervalMinutes: 60,
  enabled: true,
};
