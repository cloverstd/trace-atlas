import { spawnSync, spawn } from 'node:child_process';
function run(args) {
  const result = spawnSync('pnpm', ['exec', 'wrangler', ...args], { stdio: 'inherit' });
  if (result.status !== 0) process.exit(result.status ?? 1);
}
run(['d1', 'migrations', 'apply', 'trace-atlas-e2e', '--local', '--env', 'e2e']);
run([
  'd1',
  'execute',
  'trace-atlas-e2e',
  '--local',
  '--env',
  'e2e',
  '--command',
  'DELETE FROM sessions; DELETE FROM challenges; DELETE FROM credentials; DELETE FROM sync_files; DELETE FROM sync_runs; DELETE FROM published_files; DELETE FROM snapshot_files; DELETE FROM snapshots; DELETE FROM settings; DELETE FROM rate_limits; UPDATE admin_state SET initialized=0,generation=generation+1;',
]);
const server = spawn(
  'pnpm',
  ['exec', 'vite', '--host', '127.0.0.1', '--port', '5174', '--strictPort'],
  { stdio: 'inherit', env: { ...process.env, CLOUDFLARE_ENV: 'e2e' } },
);
for (const signal of ['SIGTERM', 'SIGINT']) process.on(signal, () => server.kill(signal));
server.on('exit', (code) => process.exit(code ?? 0));
