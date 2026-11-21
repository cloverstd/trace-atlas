export interface Env {
  DB: D1Database;
  BUCKET: R2Bucket;
  ASSETS: Fetcher;
  APP_ORIGIN: string;
  RP_ID: string;
  TENCENT_MAP_KEY?: string;
  ADMIN_BOOTSTRAP_TOKEN: string;
  CONFIG_ENCRYPTION_KEY: string;
}
export interface Session {
  hash: string;
  credential_id: string;
  expires_at: number;
  verified_at: number;
}
export type AppEnv = { Bindings: Env; Variables: { session: Session } };
