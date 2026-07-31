import { readFile, writeFile, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import ts from 'typescript';

const [file, artifactId, artifactVersionId] = process.argv.slice(2);
if (!file || !artifactId || !artifactVersionId) {
  throw new Error('projection file, artifact ID, and artifact-version ID are required');
}

// Execute the production strict decoder itself. Transport imports are replaced
// because this bridge validates PostgreSQL JSON, not browser networking.
const source = (await readFile(
  'services/studioArtifacts/privateArtifactClient.ts',
  'utf8',
))
  .replace(/import type \{ TenantContextProjection \} from '[^']+';/u, '')
  .replace("import { supabase } from '../supabaseClient';", 'const supabase = undefined;')
  .replace("from './privateArtifactContracts';", "from './privateArtifactContracts.mjs';");
const compiled = ts.transpileModule(source, {
  compilerOptions: {
    target: ts.ScriptTarget.ES2022,
    module: ts.ModuleKind.ES2022,
  },
}).outputText;
const directory = await mkdtemp(join(tmpdir(), 'studio-private-decoder-'));
try {
  const moduleFile = join(directory, 'private-client.mjs');
  const contractsFile = join(directory, 'privateArtifactContracts.mjs');
  const contractsSource = await readFile(
    'services/studioArtifacts/privateArtifactContracts.ts',
    'utf8',
  );
  await writeFile(
    contractsFile,
    ts.transpileModule(contractsSource, {
      compilerOptions: {
        target: ts.ScriptTarget.ES2022,
        module: ts.ModuleKind.ES2022,
      },
    }).outputText,
  );
  await writeFile(moduleFile, compiled);
  const { decodeStudioPrivateArtifactProjection } = await import(
    `file://${moduleFile}`
  );
  const decoded = decodeStudioPrivateArtifactProjection(
    JSON.parse(await readFile(file, 'utf8')),
    { artifactId, artifactVersionId },
  );
  if (
    decoded.artifactId !== artifactId ||
    decoded.artifactVersionId !== artifactVersionId ||
    decoded.approved !== true
  ) {
    throw new Error('production private-artifact decoder authority mismatch');
  }
  console.log(
    `Studio private-artifact production decoder bridge passed: ${decoded.artifactId}/${decoded.artifactVersionId}`,
  );
} finally {
  await rm(directory, { recursive: true, force: true });
}
