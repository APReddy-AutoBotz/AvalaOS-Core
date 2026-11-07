import path from 'node:path';
import { tmpdir } from 'node:os';
import { mkdtemp, rm } from 'node:fs/promises';
import { build, preview } from 'vite';

const outDir = await mkdtemp(path.join(tmpdir(), 'avalaos-assessment-recommendation-'));
const configFile = path.resolve('vite.assessment-recommendation-contrast.config.ts');
await build({ configFile, build: { outDir, emptyOutDir: true } });
const server = await preview({
  configFile,
  build: { outDir },
  preview: { host: '127.0.0.1', port: 4198, strictPort: true },
});
async function stop() {
  await server.close();
  await rm(outDir, { recursive: true, force: true });
}
process.once('SIGTERM', stop);
process.once('SIGINT', stop);

// Bound this single-case loopback preview even if its test process exits early.
setTimeout(() => stop().finally(() => process.exit()), 60_000).unref();
