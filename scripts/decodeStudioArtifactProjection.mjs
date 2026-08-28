import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import ts from 'typescript';

const [file, organizationId, workspaceId] = process.argv.slice(2);
if (!file || !organizationId || !workspaceId) {
  throw new Error('projection file and tenant context are required');
}

const outputDir = await mkdtemp(path.join(tmpdir(), 'studio-decoder-'));
try {
  await writeFile(path.join(outputDir, 'package.json'), JSON.stringify({ type: 'module' }));
  const options = {
    target: ts.ScriptTarget.ES2022,
    module: ts.ModuleKind.ES2022,
    moduleResolution: ts.ModuleResolutionKind.Bundler,
    skipLibCheck: true,
    outDir: outputDir,
    noEmit: false,
    esModuleInterop: true,
    rewriteRelativeImportExtensions: true,
    lib: ['lib.es2022.d.ts', 'lib.dom.d.ts'],
  };
  const host = ts.createCompilerHost(options);
  const originalReadFile = host.readFile.bind(host);
  const supabaseClient = path.resolve('services/supabaseClient.ts');
  host.readFile = sourceFile => path.resolve(sourceFile) === supabaseClient
    ? 'export const supabase:any=undefined;'
    : originalReadFile(sourceFile);

  const program = ts.createProgram({
    rootNames: [
      'vite-env.d.ts',
      'types.ts',
      'services/studioArtifacts/contracts.ts',
      'services/studioArtifacts/workspaceModel.ts',
      'services/studioArtifacts/workspaceRpcAdapter.ts',
      'services/studioArtifacts/client.ts',
    ],
    options,
    host,
  });
  const diagnostics = ts.getPreEmitDiagnostics(program);
  if (diagnostics.length) {
    throw new Error(ts.formatDiagnosticsWithColorAndContext(diagnostics, {
      getCanonicalFileName: value => value,
      getCurrentDirectory: () => process.cwd(),
      getNewLine: () => '\n',
    }));
  }
  if (program.emit().emitSkipped) throw new Error('Studio decoder compilation was skipped');

  const rewriteLocalModuleSpecifiers = async directory => {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const target = path.join(directory, entry.name);
      if (entry.isDirectory()) await rewriteLocalModuleSpecifiers(target);
      if (!entry.isFile() || !target.endsWith('.js')) continue;
      const source = await readFile(target, 'utf8');
      const rewritten = source.replace(/(['"])(\.\.?\/[^'"\r\n]+?)(\1)/gu, (full, quote, specifier) =>
        /\.(?:js|json|mjs|cjs|ts)$/u.test(specifier) ? full : `${quote}${specifier}.js${quote}`);
      if (rewritten !== source) await writeFile(target, rewritten);
    }
  };
  await rewriteLocalModuleSpecifiers(outputDir);

  const moduleFile = path.join(outputDir, 'services', 'studioArtifacts', 'client.js');
  const { decodeStudioArtifactProjection } = await import(pathToFileURL(moduleFile).href);
  const decoded = decodeStudioArtifactProjection(
    JSON.parse(await readFile(file, 'utf8')),
    { organizationId, workspaceId },
  );
  if (decoded.ancestry.organizationId !== organizationId || decoded.ancestry.workspaceId !== workspaceId) {
    throw new Error('production decoder tenant mismatch');
  }
  console.log(`Studio production decoder bridge passed: ${decoded.id}`);
} finally {
  await rm(outputDir, { recursive: true, force: true });
}
