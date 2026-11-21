import { spawnSync } from 'node:child_process';
const args = process.argv.slice(2);
if (!args.includes('--confirm')) {
  console.error(
    'This revokes all admin passkeys and sessions. Rotate ADMIN_BOOTSTRAP_TOKEN first.\nUsage: pnpm admin:reset --confirm [--remote]',
  );
  process.exit(1);
}
const sql =
  'DELETE FROM sessions; DELETE FROM challenges; DELETE FROM credentials; UPDATE admin_state SET initialized=0,generation=generation+1 WHERE id=1;';
const result = spawnSync(
  'pnpm',
  [
    'exec',
    'wrangler',
    'd1',
    'execute',
    'trace-atlas',
    args.includes('--remote') ? '--remote' : '--local',
    '--command',
    sql,
  ],
  { stdio: 'inherit' },
);
process.exit(result.status ?? 1);
