import ts from 'typescript';

// Node ESM needs extensions for extensionless local imports. Restrict this
// compatibility rewrite to syntax-owned module specifiers: test inputs, SQL,
// URLs, arbitrary strings and template literals must remain byte-for-byte exact.
export function rewriteTestModuleSpecifiers(source) {
  const parsed = ts.createSourceFile('compiled-test.js', source, ts.ScriptTarget.ESNext, true, ts.ScriptKind.JS);
  const replacements = [];
  const add = node => {
    if (!node || !ts.isStringLiteral(node) || !/^\.\.?\//.test(node.text)
      || /[?#]/.test(node.text) || /\.[^/]+$/.test(node.text)) return;
    replacements.push({ start: node.getStart(parsed), end: node.getEnd(), value: JSON.stringify(`${node.text}.js`) });
  };
  const visit = node => {
    if (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) add(node.moduleSpecifier);
    if (ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword && node.arguments.length === 1) add(node.arguments[0]);
    ts.forEachChild(node, visit);
  };
  visit(parsed);
  return replacements.sort((left, right) => right.start - left.start)
    .reduce((result, replacement) => result.slice(0, replacement.start) + replacement.value + result.slice(replacement.end), source);
}
