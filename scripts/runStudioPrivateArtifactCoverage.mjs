import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import ts from 'typescript';

const roots = [
  'types.ts',
  'supabase/functions/deno.d.ts',
  'supabase/functions/_shared/studioPrivateArtifactCommand.test.ts',
  'supabase/functions/_shared/studioPrivateArtifactDb.test.ts',
  'supabase/functions/_shared/studioPrivateArtifactDownloadHandler.test.ts',
  'supabase/functions/_shared/studioPrivateArtifactRenderer.test.ts',
  'supabase/functions/_shared/studioPrivateArtifactSaga.test.ts',
  'supabase/functions/_shared/studioPrivateArtifactStorage.test.ts',
];
const out = path.resolve('.agent/studio-private-artifacts-coverage');
fs.rmSync(out, { recursive: true, force: true });
fs.mkdirSync(out, { recursive: true });
fs.writeFileSync(path.join(out, 'package.json'), JSON.stringify({ type: 'commonjs' }));

const options = {
  target: ts.ScriptTarget.ES2022,
  module: ts.ModuleKind.CommonJS,
  moduleResolution: ts.ModuleResolutionKind.Node10,
  skipLibCheck: true,
  outDir: out,
  noEmit: false,
  esModuleInterop: true,
  rewriteRelativeImportExtensions: true,
  lib: ['lib.es2022.d.ts', 'lib.dom.d.ts'],
};
const program = ts.createProgram({ rootNames: roots, options });
const diagnostics = ts.getPreEmitDiagnostics(program);
if (diagnostics.length) {
  console.error(
    ts.formatDiagnosticsWithColorAndContext(diagnostics, {
      getCanonicalFileName: file => file,
      getCurrentDirectory: () => process.cwd(),
      getNewLine: () => '\n',
    }),
  );
  fs.rmSync(out, { recursive: true, force: true });
  process.exit(1);
}
if (program.emit().emitSkipped) process.exit(1);

const slash = value => path.join(out, value).replace(/\\/g, '/');
const source = [
  'supabase/functions/_shared/studioPrivateArtifactCommand.js',
];
const tests = [
  'supabase/functions/_shared/studioPrivateArtifactCommand.test.js',
  'supabase/functions/_shared/studioPrivateArtifactDb.test.js',
  'supabase/functions/_shared/studioPrivateArtifactDownloadHandler.test.js',
  'supabase/functions/_shared/studioPrivateArtifactRenderer.test.js',
  'supabase/functions/_shared/studioPrivateArtifactStorage.test.js',
  'supabase/functions/_shared/studioPrivateArtifactSaga.test.js',
];
const args = [
  '--experimental-test-coverage',
  '--test-coverage-lines=95',
  '--test-coverage-functions=95',
  '--test-coverage-branches=85',
  ...source.map(file => `--test-coverage-include=${slash(file)}`),
  '--test',
  ...tests.map(slash),
];
const result = spawnSync(process.execPath, args, { stdio: 'inherit' });
fs.rmSync(out, { recursive: true, force: true });
process.exit(result.status ?? 1);
