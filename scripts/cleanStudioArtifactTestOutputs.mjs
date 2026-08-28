import fs from 'node:fs';

for (const directory of [
  '.agent/studio-artifacts-coverage',
  '.agent/edge-ts-tests',
  '.agent/pr1f-ts-tests',
  '.agent/studio-private-artifact-esm-tests',
]) {
  fs.rmSync(directory, { recursive: true, force: true });
}
