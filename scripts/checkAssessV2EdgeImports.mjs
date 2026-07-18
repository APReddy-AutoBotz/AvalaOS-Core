import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';

const root = process.cwd();
const entry = path.resolve(root, 'supabase/functions/assess-v2-command/index.ts');
const visited = new Set();
const edges = [];

const relativeSpecifier = value => value.startsWith('./') || value.startsWith('../');
const moduleSpecifiers = sourceFile => {
  const specifiers = [];
  const add = node => {
    if (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) {
      if (node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier)) specifiers.push(node.moduleSpecifier.text);
    } else if (ts.isImportEqualsDeclaration(node) && ts.isExternalModuleReference(node.moduleReference)) {
      const expression = node.moduleReference.expression;
      if (expression && ts.isStringLiteral(expression)) specifiers.push(expression.text);
    } else if (ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword) {
      const [argument] = node.arguments;
      if (argument && ts.isStringLiteral(argument)) specifiers.push(argument.text);
    } else if (ts.isImportTypeNode(node) && ts.isLiteralTypeNode(node.argument) && ts.isStringLiteral(node.argument.literal)) {
      specifiers.push(node.argument.literal.text);
    }
    ts.forEachChild(node, add);
  };
  add(sourceFile);
  return specifiers;
};

const visit = file => {
  const normalized = path.normalize(file);
  if (visited.has(normalized)) return;
  if (!normalized.startsWith(`${root}${path.sep}`)) throw new Error(`PR1D_EDGE_IMPORT_OUTSIDE_REPOSITORY: ${normalized}`);
  if (!fs.existsSync(normalized) || !fs.statSync(normalized).isFile()) throw new Error(`PR1D_EDGE_IMPORT_MISSING: ${normalized}`);

  visited.add(normalized);
  const source = fs.readFileSync(normalized, 'utf8');
  const sourceFile = ts.createSourceFile(normalized, source, ts.ScriptTarget.ES2022, true, ts.ScriptKind.TS);
  for (const specifier of moduleSpecifiers(sourceFile)) {
    if (!relativeSpecifier(specifier)) continue;
    const relativeSource = path.relative(root, normalized).replaceAll('\\', '/');
    if (path.posix.extname(specifier) !== '.ts') {
      throw new Error(`PR1D_EDGE_IMPORT_EXTENSION_REQUIRED: ${relativeSource} -> ${specifier}`);
    }
    const target = path.resolve(path.dirname(normalized), specifier);
    if (!fs.existsSync(target) || !fs.statSync(target).isFile()) {
      throw new Error(`PR1D_EDGE_IMPORT_UNRESOLVED: ${relativeSource} -> ${specifier}`);
    }
    edges.push([normalized, target]);
    visit(target);
  }
};

visit(entry);

for (const required of [
  'services/assessV1Compatibility.ts',
  'services/assessV2/index.ts',
  'supabase/functions/_shared/assessV2Command.ts',
  'supabase/functions/_shared/assessV2Db.ts',
  'supabase/functions/_shared/assessV2Handlers.ts',
  'supabase/functions/_shared/assessV2Router.ts',
]) {
  if (!visited.has(path.resolve(root, required))) throw new Error(`PR1D_EDGE_IMPORT_GRAPH_INCOMPLETE: ${required}`);
}

console.log(`PR 1D Edge import graph verified: ${visited.size} TypeScript modules and ${edges.length} relative edges use explicit .ts specifiers.`);
