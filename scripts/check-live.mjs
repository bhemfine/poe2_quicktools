// Runs the live contract check once: `npm run check:live`. Sends ~9 real requests.
import { spawnSync } from 'node:child_process'

const res = spawnSync('npx', ['vitest', 'run', 'tests/live'], {
  stdio: 'inherit',
  shell: true,
  env: { ...process.env, RUN_LIVE: '1' },
})
process.exit(res.status ?? 1)
