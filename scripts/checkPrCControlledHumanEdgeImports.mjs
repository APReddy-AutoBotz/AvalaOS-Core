import { createHash } from 'node:crypto';
import { lstatSync, readFileSync, realpathSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);

export const CONTROLLED_HUMAN_EDGE_FUNCTIONS = Object.freeze([
  'assess-command', 'assess-v2-command', 'enterprise-intelligence-command',
  'enterprise-intelligence-query', 'studio-artifact-command', 'studio-private-artifact-command',
  'tenant-context', 'tenant-session', 'pr-c-controlled-human-synthetic-generation',
]);

const fail = code => { throw new Error(`PR_C_EDGE_IMPORT_${code}`); };
const digest = value => `sha256:${createHash('sha256').update(value).digest('hex')}`;
const allowedSource = relative => /^(?:supabase\/functions\/|services\/)/u.test(relative) || relative === 'types.ts';
const parsedImports = new Map();

// This is local source-resolution evidence, not compilation, runtime, or deployment
// proof. No modules are imported or executed and no network or credentials are used.
export function collectEdgeImportGraph(root, entrypoint) {
  // Only graph consumers need the compiler parser. Merely importing canonical
  // function names must not load it into credential/bootstrap-only consumers.
  const ts = require('typescript');
  const base = realpathSync(root);
  const pending = [entrypoint];
  const visited = new Map();
  while (pending.length) {
    const relative = pending.pop();
    if (visited.has(relative)) continue;
    if (typeof relative !== 'string' || relative.includes('\\') || path.posix.isAbsolute(relative)
      || relative.split('/').some(part => part === '..' || part === '.' || part === '') || !allowedSource(relative)
      || !relative.endsWith('.ts') || /\.(?:test|spec)\.ts$/u.test(relative)) fail('PATH_REJECTED');
    if (visited.size >= 256) fail('GRAPH_LIMIT');
    const absolute = path.resolve(base, relative);
    let stat;
    try {
      stat = lstatSync(absolute);
      if (stat.isSymbolicLink() || !stat.isFile() || realpathSync(absolute) !== absolute) fail('PATH_REJECTED');
    } catch (error) {
      if (error.message === 'PR_C_EDGE_IMPORT_PATH_REJECTED') throw error;
      fail('SOURCE_MISSING');
    }
    if (stat.size > 2 * 1024 * 1024) fail('SOURCE_LIMIT');
    const bytes = readFileSync(absolute);
    const sourceDigest = digest(bytes);
    const cacheKey = `${relative}\0${sourceDigest}`;
    // Cache parsing, never filesystem identity or bytes. Every call re-reads and
    // hashes each current source; same-size edits and changed import graphs
    // cannot reuse a stale result. Keep memory bounded across synthetic tests.
    if (parsedImports.has(cacheKey)) {
      const imports = parsedImports.get(cacheKey);
      visited.set(relative, { path: relative, digest: sourceDigest, imports: [...imports] });
      pending.push(...[...imports].reverse());
      continue;
    }
    const source = ts.createSourceFile(relative, bytes.toString('utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
    if (source.parseDiagnostics.length) fail('SYNTAX_REJECTED');
    const dependencies = new Set();
    const add = literal => {
      if (!literal || !ts.isStringLiteralLike(literal)) fail('DYNAMIC_REJECTED');
      const specifier = literal.text;
      if (!/^(?:\.\/|\.\.\/)/u.test(specifier) || !specifier.endsWith('.ts')
        || /[\\?#%\u0000-\u0020]/u.test(specifier)) fail('SPECIFIER_REJECTED');
      const target = path.posix.normalize(path.posix.join(path.posix.dirname(relative), specifier));
      dependencies.add(target);
    };
    const visit = node => {
      if (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) {
        if (node.moduleSpecifier) add(node.moduleSpecifier);
      } else if (ts.isImportEqualsDeclaration(node)) fail('REQUIRE_REJECTED');
      else if (ts.isImportTypeNode(node)) {
        if (!ts.isLiteralTypeNode(node.argument)) fail('DYNAMIC_REJECTED');
        add(node.argument.literal);
      } else if (ts.isCallExpression(node)) {
        if (node.expression.kind === ts.SyntaxKind.ImportKeyword) {
          if (node.arguments.length !== 1) fail('DYNAMIC_REJECTED');
          add(node.arguments[0]);
        } else if (ts.isIdentifier(node.expression) && node.expression.text === 'require') fail('REQUIRE_REJECTED');
      }
      ts.forEachChild(node, visit);
    };
    visit(source);
    if (source.referencedFiles.length || source.typeReferenceDirectives.length || source.libReferenceDirectives.length) fail('REFERENCE_REJECTED');
    const imports = [...dependencies].sort();
    if (parsedImports.size >= 512) parsedImports.delete(parsedImports.keys().next().value);
    parsedImports.set(cacheKey, Object.freeze(imports));
    visited.set(relative, { path: relative, digest: sourceDigest, imports: [...imports] });
    pending.push(...[...imports].reverse());
  }
  return [...visited.values()].sort((left, right) => left.path.localeCompare(right.path, 'en'));
}

export function checkRequiredEdgeImports(root, names = CONTROLLED_HUMAN_EDGE_FUNCTIONS) {
  if (JSON.stringify(names) !== JSON.stringify(CONTROLLED_HUMAN_EDGE_FUNCTIONS)) fail('FUNCTION_SET');
  return {
    schemaVersion: 'pr-c-edge-local-import-graph-1',
    evidenceClass: 'local_source_resolution_only',
    functions: names.map(name => {
      const graph = collectEdgeImportGraph(root, `supabase/functions/${name}/index.ts`);
      return { name, sourceCount: graph.length, graphDigest: digest(JSON.stringify(graph)) };
    }),
  };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const result = checkRequiredEdgeImports(process.cwd());
    process.stdout.write(`${JSON.stringify(result)}\n`);
  } catch (error) {
    const code = /^PR_C_EDGE_IMPORT_[A-Z_]+$/u.test(error?.message ?? '') ? error.message : 'PR_C_EDGE_IMPORT_FAILED';
    process.stderr.write(`${code}\n`);
    process.exitCode = 1;
  }
}
