import path from 'node:path';
import ts from 'typescript';

export const PR1D_FIXTURE_SCENARIOS = Object.freeze([
  'displayed primitive and lifecycle controls allow a scaffolded V2 case to finalize',
  'Retrieve and Execute primitives expose and persist interface dependency knowledge',
]);
const fail = label => { throw new Error(`PR1D_BROWSER_FIXTURE_INVALID: ${label}`); };
const requireThat = (value, label) => { if (!value) fail(label); };
const sourcePath = (...parts) => path.resolve(...parts).replace(/\\/g, '/');

// This is a source-ownership contract, not proof that a browser assertion ran.
// Resolve the real symbols within the three reviewed files without loading or
// executing fixtures. Comments, disconnected helpers and shadowed names do not
// satisfy the capability -> default fixture -> retained scenario relationship.
export function assertPr1dBrowserFixture({ spec, fixture, capabilities }) {
  for (const [label, source] of Object.entries({ spec, fixture, capabilities })) {
    requireThat(typeof source === 'string' && source.length > 0, `${label} missing`);
    requireThat(!source.includes('assess.v2.write'), `${label} obsolete capability`);
  }
  const files = new Map([
    [sourcePath('tests/browser/pr1d.spec.ts'), spec],
    [sourcePath('tests/browser/pr1dNetworkFixture.ts'), fixture],
    [sourcePath('services/assessV2/capabilities.ts'), capabilities],
  ]);
  const options = { noLib: true, noEmit: true, target: ts.ScriptTarget.ESNext, module: ts.ModuleKind.ESNext };
  const host = ts.createCompilerHost(options);
  host.fileExists = file => files.has(file);
  host.readFile = file => files.get(file);
  host.getSourceFile = file => files.has(file) ? ts.createSourceFile(file, files.get(file), options.target, true) : undefined;
  host.resolveModuleNames = (names, containingFile) => names.map(name => {
    const file = sourcePath(path.dirname(containingFile), `${name}.ts`);
    return files.has(file) ? { resolvedFileName: file, extension: ts.Extension.Ts } : undefined;
  });
  const program = ts.createProgram([...files.keys()], options, host);
  requireThat(program.getSyntacticDiagnostics().length === 0, 'invalid syntax');
  const checker = program.getTypeChecker();
  const [specTree, fixtureTree, capabilityTree] = [...files.keys()].map(file => program.getSourceFile(file));
  requireThat(specTree && fixtureTree && capabilityTree, 'source graph missing');
  const symbol = node => {
    const result = checker.getSymbolAtLocation(node);
    return result && (result.flags & ts.SymbolFlags.Alias ? checker.getAliasedSymbol(result) : result);
  };
  const exportedVariable = (tree, name) => {
    const statements = tree.statements.filter(statement => ts.isVariableStatement(statement)
      && statement.modifiers?.some(item => item.kind === ts.SyntaxKind.ExportKeyword)
      && (statement.declarationList.flags & ts.NodeFlags.Const));
    const matches = statements.flatMap(statement => [...statement.declarationList.declarations])
      .filter(declaration => ts.isIdentifier(declaration.name) && declaration.name.text === name);
    requireThat(matches.length === 1, `exported ${name}`);
    return matches[0];
  };
  const canonical = exportedVariable(capabilityTree, 'ASSESS_V2_CAPABILITIES');
  const all = exportedVariable(fixtureTree, 'ALL_CAPABILITIES');
  requireThat(all.initializer && ts.isArrayLiteralExpression(all.initializer), 'capability array');
  requireThat(all.initializer.elements.some(item => ts.isPropertyAccessExpression(item)
    && item.name.text === 'draftWrite' && symbol(item.expression) === symbol(canonical.name)), 'canonical draft-write ownership');
  const installer = exportedVariable(fixtureTree, 'installEnterpriseFixture');
  requireThat(installer.initializer && ts.isArrowFunction(installer.initializer)
    && ts.isBlock(installer.initializer.body), 'fixture installer');
  const localCapabilities = installer.initializer.body.statements.filter(ts.isVariableStatement)
    .flatMap(statement => [...statement.declarationList.declarations])
    .find(declaration => ts.isIdentifier(declaration.name) && declaration.name.text === 'capabilities');
  const fallback = localCapabilities?.initializer;
  requireThat(fallback && ts.isBinaryExpression(fallback) && fallback.operatorToken.kind === ts.SyntaxKind.QuestionQuestionToken
    && ts.isPropertyAccessExpression(fallback.left) && fallback.left.getText(fixtureTree) === 'options.capabilities'
    && symbol(fallback.right) === symbol(all.name), 'fixture defaults to canonical capability array');
  const imports = specTree.statements.filter(ts.isImportDeclaration);
  const fixtureImport = imports.find(item => ts.isStringLiteral(item.moduleSpecifier) && item.moduleSpecifier.text === './pr1dNetworkFixture');
  const bindings = fixtureImport?.importClause?.namedBindings;
  requireThat(bindings && ts.isNamedImports(bindings) && !fixtureImport.importClause.isTypeOnly
    && bindings.elements.some(item => !item.isTypeOnly && symbol(item.name) === symbol(installer.name)), 'real fixture import');
  const testImport = imports.find(item => ts.isStringLiteral(item.moduleSpecifier) && item.moduleSpecifier.text === '@playwright/test');
  const testBinding = testImport?.importClause?.namedBindings?.elements?.find(item => (item.propertyName ?? item.name).text === 'test');
  requireThat(testBinding && !testBinding.isTypeOnly && !testImport.importClause.isTypeOnly, 'Playwright test import');
  for (const title of PR1D_FIXTURE_SCENARIOS) {
    const calls = specTree.statements.filter(ts.isExpressionStatement).map(item => item.expression)
      .filter(item => ts.isCallExpression(item) && ts.isIdentifier(item.expression)
        && checker.getSymbolAtLocation(item.expression) === checker.getSymbolAtLocation(testBinding.name)
        && ts.isStringLiteral(item.arguments[0]) && item.arguments[0].text === title);
    requireThat(calls.length === 1, `active scenario ${title}`);
    const callback = calls[0].arguments[1];
    requireThat(callback && ts.isArrowFunction(callback) && ts.isBlock(callback.body), 'scenario callback');
    const directExpressions = callback.body.statements.flatMap(statement => ts.isVariableStatement(statement)
      ? statement.declarationList.declarations.map(declaration => declaration.initializer)
      : ts.isExpressionStatement(statement) ? [statement.expression] : []);
    requireThat(directExpressions.some(item => item && ts.isAwaitExpression(item)
      && ts.isCallExpression(item.expression) && symbol(item.expression.expression) === symbol(installer.name)), 'awaited real fixture in scenario');
  }
  return true;
}
