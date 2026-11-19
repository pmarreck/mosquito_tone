import { spawnSync } from 'node:child_process';
let failed = false;
for (const suites of [
  ['tests/core.test.mjs', 'tests/audio.test.mjs', 'tests/model.test.mjs', 'tests/package.test.mjs', 'tests/worker.test.mjs'],
  ...(process.env.TONE_CHROMIUM ? [['tests/browser.test.mjs']] : []),
]) {
  const result = spawnSync(process.execPath, ['--test', ...suites], { stdio: 'inherit', env: process.env });
  if (result.status !== 0 || result.error) failed = true;
}
process.exitCode = failed ? 1 : 0;
