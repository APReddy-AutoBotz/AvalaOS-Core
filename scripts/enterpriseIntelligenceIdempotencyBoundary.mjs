import { createHash } from 'node:crypto';
import ts from 'typescript';

const PROTECTED_AST_FINGERPRINTS = Object.freeze({
  createCryptographicUuid: 'bdbc40e5a8b02530c3546e2c68f5948e53d6ed987e5200baba7c6cd97c009eda',
  createEnterpriseActionIdempotencyKey: '255a3ecd055f9d1bd0a0f6a1bd38693aeada246ebc39dc40b94bf30467e62982',
  invokeCommand: '64cc3fe5ff618ca0f6924525b02ca76f0e084ecff9c94a9016a7dde725aeedd5',
  invokeProviderLifecycle: '6074bbf27ffc6f98284dd51876da54d0a18e743e2d4105873002156f962c5cb1',
  loadProjection: '684d980760bb9bf344770c40d98f4bd8f668db93b3c9546b98ee74b01e2ee3b0',
  supabaseClientImport: 'eefc62e932c8859b98d8b89f9ea0d53fd2077e3bdfcaa686eb8a0c7a955b20b9',
});

const fail = detail => {
  throw new Error(`ENTERPRISE_IDEMPOTENCY_BOUNDARY:${detail}`);
};

const unwrap = node => {
  let current = node;
  while (ts.isParenthesizedExpression(current) || ts.isAsExpression(current)
    || ts.isTypeAssertionExpression(current) || ts.isNonNullExpression(current)
    || ts.isSatisfiesExpression(current)) current = current.expression;
  return current;
};

const memberPath = node => {
  const value = unwrap(node);
  if (ts.isIdentifier(value)) return value.text;
  if (ts.isPropertyAccessExpression(value)) {
    const parent = memberPath(value.expression);
    return parent ? `${parent}.${value.name.text}` : '';
  }
  return '';
};

const parse = source => ts.createSourceFile(
  'services/enterpriseIntelligenceClient.ts',
  source,
  ts.ScriptTarget.Latest,
  true,
  ts.ScriptKind.TS,
);

const astFingerprint = (sourceFile, node) => createHash('sha256').update(
  ts.createPrinter({ removeComments: true, newLine: ts.NewLineKind.LineFeed })
    .printNode(ts.EmitHint.Unspecified, node, sourceFile),
).digest('hex');

const variableDeclarations = (node, name) => {
  const results = [];
  const visit = current => {
    if (ts.isVariableDeclaration(current) && ts.isIdentifier(current.name) && current.name.text === name) results.push(current);
    ts.forEachChild(current, visit);
  };
  visit(node);
  return results;
};

const directVariableDeclarations = (block, name) => block.statements.flatMap(statement => (
  ts.isVariableStatement(statement)
    ? statement.declarationList.declarations.filter(declaration => ts.isIdentifier(declaration.name) && declaration.name.text === name)
    : []
));

const uniqueTopLevelVariable = (sourceFile, name) => {
  const declarations = directVariableDeclarations(sourceFile, name);
  if (declarations.length !== 1 || !declarations[0].initializer) fail(`unique-top-level-${name}`);
  const declarationList = declarations[0].parent;
  if (!ts.isVariableDeclarationList(declarationList) || !(declarationList.flags & ts.NodeFlags.Const)) {
    fail(`const-top-level-${name}`);
  }
  const competingDeclarations = sourceFile.statements.filter(statement => (
    (ts.isFunctionDeclaration(statement) || ts.isClassDeclaration(statement))
      && statement.name?.text === name
  ));
  if (competingDeclarations.length) fail(`competing-top-level-${name}`);
  return declarations[0];
};

const functionInitializer = (sourceFile, name) => {
  const initializer = unwrap(uniqueTopLevelVariable(sourceFile, name).initializer);
  if (!ts.isArrowFunction(initializer) && !ts.isFunctionExpression(initializer)) fail(`invalid-${name}`);
  return initializer;
};

const exactCall = (node, path, argumentPath) => {
  const value = unwrap(node);
  if (!ts.isCallExpression(value) || memberPath(value.expression) !== path) return false;
  if (argumentPath === undefined) return value.arguments.length === 0;
  return value.arguments.length === 1 && memberPath(value.arguments[0]) === argumentPath;
};

const bindingNameContains = (name, expected) => {
  if (ts.isIdentifier(name)) return name.text === expected;
  return name.elements.some(element => bindingNameContains(element.name, expected));
};

const assertNoLocalBinding = (functionNode, name) => {
  let found = false;
  const visit = node => {
    if ((ts.isVariableDeclaration(node) || ts.isParameter(node) || ts.isBindingElement(node))
      && bindingNameContains(node.name, name)) found = true;
    if ((ts.isFunctionDeclaration(node) || ts.isFunctionExpression(node) || ts.isClassDeclaration(node))
      && node.name?.text === name) found = true;
    if (ts.isCatchClause(node) && node.variableDeclaration
      && bindingNameContains(node.variableDeclaration.name, name)) found = true;
    ts.forEachChild(node, visit);
  };
  visit(functionNode.body);
  if (found) fail(`local-shadow-${name}`);
};

const exactBoundTopLevelCall = (node, declaration, functionNode, argumentPath) => {
  const value = unwrap(node);
  if (!ts.isCallExpression(value) || !ts.isIdentifier(unwrap(value.expression))
    || unwrap(value.expression).text !== declaration.name.text) return false;
  assertNoLocalBinding(functionNode, declaration.name.text);
  if (argumentPath === undefined) return value.arguments.length === 0;
  return value.arguments.length === 1 && memberPath(value.arguments[0]) === argumentPath;
};

const propertyName = name => {
  if (ts.isIdentifier(name) || ts.isStringLiteral(name) || ts.isNumericLiteral(name)) return name.text;
  if (ts.isComputedPropertyName(name) && ts.isStringLiteral(unwrap(name.expression))) return unwrap(name.expression).text;
  return null;
};

const uniqueFunctionVariable = (functionNode, name) => {
  const declarations = variableDeclarations(functionNode.body, name);
  if (declarations.length !== 1 || !declarations[0].initializer) fail(`unique-live-${name}`);
  const declarationList = declarations[0].parent;
  if (!ts.isVariableDeclarationList(declarationList) || !(declarationList.flags & ts.NodeFlags.Const)) fail(`const-live-${name}`);
  return declarations[0];
};

const resolveLexicalVariable = (identifier, functionNode) => {
  let current = identifier.parent;
  while (current) {
    if (ts.isBlock(current)) {
      const declarations = directVariableDeclarations(current, identifier.text)
        .filter(declaration => declaration.pos < identifier.pos);
      if (declarations.length > 1) fail(`ambiguous-lexical-${identifier.text}`);
      if (declarations.length === 1) return declarations[0];
      if (current === functionNode.body) break;
    }
    current = current.parent;
  }
  fail(`unbound-live-${identifier.text}`);
};

const uniqueNamedImport = (sourceFile, modulePath, importedName) => {
  const imports = sourceFile.statements.flatMap(statement => {
    if (!ts.isImportDeclaration(statement) || !ts.isStringLiteral(statement.moduleSpecifier)
      || statement.moduleSpecifier.text !== modulePath) return [];
    const bindings = statement.importClause?.namedBindings;
    if (!bindings || !ts.isNamedImports(bindings)) return [];
    return bindings.elements.filter(element => (element.propertyName?.text ?? element.name.text) === importedName);
  });
  if (imports.length !== 1 || imports[0].name.text !== importedName) fail(`unique-import-${importedName}`);
  return imports[0].name;
};

const supabaseClientImportDeclaration = sourceFile => {
  const imports = sourceFile.statements.filter(statement => ts.isImportDeclaration(statement)
    && ts.isStringLiteral(statement.moduleSpecifier)
    && statement.moduleSpecifier.text === './supabaseClient');
  if (imports.length !== 1) fail('single-supabase-client-import');
  const namedBindings = imports[0].importClause?.namedBindings;
  if (!namedBindings || !ts.isNamedImports(namedBindings)) fail('named-supabase-client-import-only');
  return imports[0];
};

const isSupabaseClientRoute = value => /(?:^|[/\\])supabaseClient(?:\.[^/\\?]+)?(?:[?#].*)?$/iu.test(value);

const assertNoAlternateSupabaseClientRoutes = (sourceFile, canonicalImport) => {
  for (const statement of sourceFile.statements) {
    if (ts.isImportDeclaration(statement) && ts.isStringLiteral(statement.moduleSpecifier)
      && isSupabaseClientRoute(statement.moduleSpecifier.text) && statement !== canonicalImport) {
      fail('additional-supabase-client-import');
    }
    if (ts.isExportDeclaration(statement) && statement.moduleSpecifier
      && ts.isStringLiteral(statement.moduleSpecifier)
      && isSupabaseClientRoute(statement.moduleSpecifier.text)) fail('supabase-client-re-export');
    if (ts.isImportEqualsDeclaration(statement)) {
      const reference = statement.moduleReference;
      if (ts.isExternalModuleReference(reference)) {
        const expression = reference.expression;
        if (!expression || !ts.isStringLiteral(expression) || isSupabaseClientRoute(expression.text)) {
          fail('supabase-client-import-equals');
        }
      }
    }
  }
  const visit = node => {
    if (ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword) {
      fail('dynamic-import-prohibited-in-enterprise-client');
    }
    if (ts.isCallExpression(node) && ts.isIdentifier(unwrap(node.expression))
      && unwrap(node.expression).text === 'require') {
      const argument = node.arguments.length === 1 ? unwrap(node.arguments[0]) : null;
      if (!argument || !ts.isStringLiteral(argument) || isSupabaseClientRoute(argument.text)) {
        fail('dynamic-supabase-client-require');
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
};

const topLevelBindsName = (sourceFile, name) => sourceFile.statements.some(statement => {
  if (ts.isVariableStatement(statement)) {
    return statement.declarationList.declarations.some(declaration => bindingNameContains(declaration.name, name));
  }
  if ((ts.isFunctionDeclaration(statement) || ts.isClassDeclaration(statement)
      || ts.isEnumDeclaration(statement)) && statement.name?.text === name) return true;
  if (!ts.isImportDeclaration(statement) || !statement.importClause) return false;
  if (statement.importClause.name?.text === name) return true;
  const bindings = statement.importClause.namedBindings;
  if (!bindings) return false;
  if (ts.isNamespaceImport(bindings)) return bindings.name.text === name;
  return bindings.elements.some(element => element.name.text === name);
});

const assertNoTopLevelAmbientAliases = sourceFile => {
  const ambientNames = new Set(['globalThis', 'Uint8Array', 'Array']);
  for (const statement of sourceFile.statements) {
    if (!ts.isVariableStatement(statement)) continue;
    for (const declaration of statement.declarationList.declarations) {
      if (!declaration.initializer) continue;
      const initializer = unwrap(declaration.initializer);
      if (ts.isArrowFunction(initializer) || ts.isFunctionExpression(initializer)) continue;
      let ambientReference = false;
      const visit = node => {
        if (node !== initializer && (ts.isFunctionExpression(node) || ts.isArrowFunction(node)
          || ts.isMethodDeclaration(node) || ts.isGetAccessorDeclaration(node)
          || ts.isSetAccessorDeclaration(node))) return;
        if (ts.isIdentifier(node) && ambientNames.has(node.text)) ambientReference = true;
        ts.forEachChild(node, visit);
      };
      visit(initializer);
      if (ambientReference) fail('top-level-ambient-alias');
    }
  }
};

const highestPropertyAccess = identifier => {
  let current = identifier;
  while (ts.isPropertyAccessExpression(current.parent) && current.parent.expression === current) current = current.parent;
  return current;
};

const assertUnshadowedUuidAmbientBindings = (sourceFile, generator) => {
  assertNoTopLevelAmbientAliases(sourceFile);
  for (const name of ['globalThis', 'Uint8Array', 'Array']) {
    if (topLevelBindsName(sourceFile, name)) fail(`top-level-shadow-${name}`);
    assertNoLocalBinding(generator, name);
  }
  const globalPaths = [];
  const uint8References = [];
  const arrayPaths = [];
  const visit = node => {
    if (ts.isIdentifier(node) && node.text === 'globalThis') {
      globalPaths.push(memberPath(highestPropertyAccess(node)));
    } else if (ts.isIdentifier(node) && node.text === 'Uint8Array') {
      uint8References.push(node);
    } else if (ts.isIdentifier(node) && node.text === 'Array') {
      arrayPaths.push(memberPath(highestPropertyAccess(node)));
    }
    ts.forEachChild(node, visit);
  };
  visit(generator.body);
  const expectedGlobalPaths = [
    'globalThis.crypto.randomUUID',
    'globalThis.crypto.randomUUID',
    'globalThis.crypto.getRandomValues',
    'globalThis.crypto.getRandomValues',
  ].sort();
  if (globalPaths.sort().join('|') !== expectedGlobalPaths.join('|')) fail('uuid-globalThis-reference-inventory');
  if (uint8References.length !== 1 || !ts.isNewExpression(uint8References[0].parent)
    || uint8References[0].parent.expression !== uint8References[0]) fail('uuid-Uint8Array-reference-inventory');
  if (arrayPaths.length !== 1 || arrayPaths[0] !== 'Array.from') fail('uuid-Array-reference-inventory');
};

const directSupabaseInvokeFromRoot = root => {
  const functionsAccess = root.parent;
  if (!ts.isPropertyAccessExpression(functionsAccess) || functionsAccess.expression !== root
    || functionsAccess.name.text !== 'functions' || functionsAccess.questionDotToken) return null;
  const invokeAccess = functionsAccess.parent;
  if (!ts.isPropertyAccessExpression(invokeAccess) || invokeAccess.expression !== functionsAccess
    || invokeAccess.name.text !== 'invoke' || invokeAccess.questionDotToken) return null;
  const call = invokeAccess.parent;
  if (!ts.isCallExpression(call) || call.expression !== invokeAccess || call.questionDotToken) return null;
  return call;
};

const isWithin = (node, ancestor) => {
  let current = node;
  while (current) {
    if (current === ancestor) return true;
    current = current.parent;
  }
  return false;
};

const assertSupabaseCapabilityInventory = (sourceFile, functionInventories) => {
  const importBinding = uniqueNamedImport(sourceFile, './supabaseClient', 'supabase');
  const calls = new Set();
  const visit = node => {
    if (ts.isIdentifier(node) && node.text === 'supabase' && node !== importBinding) {
      const call = directSupabaseInvokeFromRoot(node);
      if (!call || call.arguments.length !== 2 || !ts.isStringLiteral(unwrap(call.arguments[0]))) {
        fail('indirect-computed-or-aliased-supabase-invoke');
      }
      calls.add(call);
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);

  const ownedCalls = new Set();
  for (const [functionNode, endpointCounts] of functionInventories) {
    assertNoLocalBinding(functionNode, 'supabase');
    const functionCalls = [...calls].filter(call => isWithin(call, functionNode.body));
    const expectedTotal = Object.values(endpointCounts).reduce((sum, count) => sum + count, 0);
    if (functionCalls.length !== expectedTotal) fail('protected-function-invoke-count');
    for (const [endpoint, expectedCount] of Object.entries(endpointCounts)) {
      const endpointCalls = functionCalls.filter(call => unwrap(call.arguments[0]).text === endpoint);
      if (endpointCalls.length !== expectedCount) fail(`invoke-count-${endpoint}`);
    }
    for (const call of functionCalls) {
      const endpoint = unwrap(call.arguments[0]).text;
      if (!(endpoint in endpointCounts)) fail(`unowned-invoke-${endpoint}`);
      ownedCalls.add(call);
    }
  }

  if (ownedCalls.size !== calls.size || [...calls].some(call => !ownedCalls.has(call))) {
    fail('source-wide-unowned-supabase-invoke');
  }

  return calls;
};

const sinkBodyIdentifier = call => {
  const options = unwrap(call.arguments[1]);
  if (!ts.isObjectLiteralExpression(options) || options.properties.length !== 1) fail('invoke-options-shape');
  const property = options.properties[0];
  if (ts.isShorthandPropertyAssignment(property) && property.name.text === 'body') return property.name;
  if (ts.isPropertyAssignment(property) && propertyName(property.name) === 'body'
    && ts.isIdentifier(unwrap(property.initializer))) return unwrap(property.initializer);
  fail('invoke-body-binding');
};

const assertObjectHasExactKey = (declaration, expectedInitializer, detail) => {
  const object = unwrap(declaration.initializer);
  if (!ts.isObjectLiteralExpression(object) || object.properties.some(property => ts.isSpreadAssignment(property)
    || ts.isComputedPropertyName(property.name))) fail(`${detail}-object-shape`);
  const matches = object.properties.filter(property => !ts.isSpreadAssignment(property)
    && propertyName(property.name) === 'idempotencyKey');
  if (matches.length !== 1 || !expectedInitializer(matches[0])) fail(`${detail}-key-source`);
  return object;
};

const assertNoProtectedObjectAliasesOrWrites = (functionNode, protectedDeclarations, allowedReferences) => {
  const protectedByName = new Map(protectedDeclarations.map(declaration => [declaration.name.text, declaration]));
  const visit = node => {
    if (ts.isIdentifier(node) && protectedByName.has(node.text)) {
      if (node === protectedByName.get(node.text).name || allowedReferences.has(node)) {
        ts.forEachChild(node, visit);
        return;
      }
      if ((ts.isPropertyAssignment(node.parent) || ts.isPropertyAccessExpression(node.parent)) && node.parent.name === node) {
        ts.forEachChild(node, visit);
        return;
      }
      fail(`mutable-alias-or-write-${node.text}`);
    }
    ts.forEachChild(node, visit);
  };
  visit(functionNode.body);
};

const assertCryptographicUuidGenerator = sourceFile => {
  const generatorDeclaration = uniqueTopLevelVariable(sourceFile, 'createCryptographicUuid');
  const generator = functionInitializer(sourceFile, 'createCryptographicUuid');
  assertUnshadowedUuidAmbientBindings(sourceFile, generator);
  if (!ts.isBlock(generator.body)) fail('uuid-generator-body');
  const returns = [];
  const visit = node => {
    if (ts.isReturnStatement(node) && node.expression) returns.push(unwrap(node.expression));
    ts.forEachChild(node, visit);
  };
  visit(generator.body);
  const bytesDeclarations = variableDeclarations(generator.body, 'bytes');
  const hexDeclarations = variableDeclarations(generator.body, 'hex');
  if (bytesDeclarations.length !== 1 || hexDeclarations.length !== 1) fail('uuid-unique-live-bindings');
  const bytesDeclaration = bytesDeclarations[0];
  const hexDeclaration = hexDeclarations[0];
  if (bytesDeclaration.parent?.parent?.parent !== generator.body || hexDeclaration.parent?.parent?.parent !== generator.body) {
    fail('uuid-direct-live-bindings');
  }
  if (returns.length !== 2 || !exactCall(returns[0], 'globalThis.crypto.randomUUID')) fail('uuid-random-source');
  const bytesInitializer = bytesDeclaration?.initializer && unwrap(bytesDeclaration.initializer);
  const bytesValid = bytesInitializer && ts.isCallExpression(bytesInitializer)
    && memberPath(bytesInitializer.expression) === 'globalThis.crypto.getRandomValues'
    && bytesInitializer.arguments.length === 1
    && ts.isNewExpression(unwrap(bytesInitializer.arguments[0]))
    && memberPath(unwrap(bytesInitializer.arguments[0]).expression) === 'Uint8Array'
    && unwrap(bytesInitializer.arguments[0]).arguments?.length === 1
    && unwrap(bytesInitializer.arguments[0]).arguments[0].getText() === '16';
  if (!bytesValid) fail('uuid-random-bytes');
  const hexInitializer = hexDeclaration?.initializer && unwrap(hexDeclaration.initializer);
  const joinAccess = hexInitializer && ts.isCallExpression(hexInitializer) && unwrap(hexInitializer.expression);
  const arrayFrom = joinAccess && ts.isPropertyAccessExpression(joinAccess) && unwrap(joinAccess.expression);
  const encoder = arrayFrom && ts.isCallExpression(arrayFrom) && unwrap(arrayFrom.arguments[1]);
  const padStart = encoder && ts.isArrowFunction(encoder) && unwrap(encoder.body);
  const padStartAccess = padStart && ts.isCallExpression(padStart) && unwrap(padStart.expression);
  const toString = padStartAccess && ts.isPropertyAccessExpression(padStartAccess) && unwrap(padStartAccess.expression);
  const toStringAccess = toString && ts.isCallExpression(toString) && unwrap(toString.expression);
  const hexValid = hexInitializer && ts.isCallExpression(hexInitializer)
    && ts.isPropertyAccessExpression(joinAccess) && joinAccess.name.text === 'join'
    && hexInitializer.arguments.length === 1 && hexInitializer.arguments[0].getText() === "''"
    && ts.isCallExpression(arrayFrom) && memberPath(arrayFrom.expression) === 'Array.from'
    && arrayFrom.arguments.length === 2 && memberPath(arrayFrom.arguments[0]) === 'bytes'
    && ts.isArrowFunction(encoder) && encoder.parameters.length === 1
    && ts.isIdentifier(encoder.parameters[0].name) && encoder.parameters[0].name.text === 'value'
    && ts.isCallExpression(padStart) && ts.isPropertyAccessExpression(padStartAccess)
    && padStartAccess.name.text === 'padStart'
    && padStart.arguments.length === 2 && padStart.arguments[0].getText() === '2' && padStart.arguments[1].getText() === "'0'"
    && ts.isCallExpression(toString) && ts.isPropertyAccessExpression(toStringAccess)
    && memberPath(toStringAccess.expression) === 'value' && toStringAccess.name.text === 'toString'
    && toString.arguments.length === 1 && toString.arguments[0].getText() === '16';
  if (!hexValid) fail('uuid-hex-encoding');
  const fallback = returns[1];
  const expectedSlices = [['0', '8'], ['8', '12'], ['12', '16'], ['16', '20'], ['20']];
  const expectedLiterals = ['-', '-', '-', '-', ''];
  if (!ts.isTemplateExpression(fallback) || fallback.templateSpans.length !== 5
    || fallback.templateSpans.some((span, index) => {
      const expression = unwrap(span.expression);
      return !ts.isCallExpression(expression) || memberPath(expression.expression) !== 'hex.slice'
        || expression.arguments.map(argument => argument.getText()).join(',') !== expectedSlices[index].join(',')
        || span.literal.text !== expectedLiterals[index];
    })) {
    fail('uuid-fallback-format');
  }
  return generatorDeclaration;
};

const assertIdempotencyGenerator = (sourceFile, cryptographicUuidDeclaration) => {
  const generatorDeclaration = uniqueTopLevelVariable(sourceFile, 'createEnterpriseActionIdempotencyKey');
  const generator = functionInitializer(sourceFile, 'createEnterpriseActionIdempotencyKey');
  const body = unwrap(generator.body);
  if (!ts.isTemplateExpression(body) || body.head.text !== 'ei:' || body.templateSpans.length !== 2
    || memberPath(body.templateSpans[0].expression) !== 'operation'
    || body.templateSpans[0].literal.text !== ':'
    || !exactBoundTopLevelCall(body.templateSpans[1].expression, cryptographicUuidDeclaration, generator)
    || body.templateSpans[1].literal.text !== '') fail('action-key-must-use-fresh-uuid');
  return generatorDeclaration;
};

const directFunctionVariable = (functionNode, name) => {
  const declaration = uniqueFunctionVariable(functionNode, name);
  const statement = declaration.parent?.parent;
  if (!ts.isVariableStatement(statement) || statement.parent !== functionNode.body) fail(`direct-live-${name}`);
  return declaration;
};

const rootIdentifier = node => {
  let current = unwrap(node);
  while (ts.isPropertyAccessExpression(current)) current = unwrap(current.expression);
  return ts.isIdentifier(current) ? current : null;
};

const expressionIsWritten = node => {
  let current = node;
  while (ts.isParenthesizedExpression(current.parent) || ts.isAsExpression(current.parent)
    || ts.isTypeAssertionExpression(current.parent) || ts.isNonNullExpression(current.parent)) current = current.parent;
  const parent = current.parent;
  return (ts.isBinaryExpression(parent) && parent.left === current
      && parent.operatorToken.kind >= ts.SyntaxKind.FirstAssignment
      && parent.operatorToken.kind <= ts.SyntaxKind.LastAssignment)
    || ((ts.isPrefixUnaryExpression(parent) || ts.isPostfixUnaryExpression(parent))
      && (parent.operator === ts.SyntaxKind.PlusPlusToken || parent.operator === ts.SyntaxKind.MinusMinusToken))
    || (ts.isDeleteExpression(parent) && parent.expression === current);
};

const assertControlledAnchorIntegrity = (sourceFile, invokeCommand, body) => {
  const controlledAnchor = directFunctionVariable(invokeCommand, 'controlledAnchor');
  const initializer = unwrap(controlledAnchor.initializer);
  if (!ts.isConditionalExpression(initializer) || memberPath(initializer.condition) !== 'controlledTarget'
    || initializer.whenFalse.kind !== ts.SyntaxKind.NullKeyword) fail('controlled-anchor-source');
  const whenTrue = unwrap(initializer.whenTrue);
  if (!ts.isAwaitExpression(whenTrue)) fail('controlled-anchor-source');
  const beginCall = unwrap(whenTrue.expression);
  const beginImport = uniqueNamedImport(sourceFile, './supabaseClient', 'beginControlledHumanCommand');
  if (!ts.isCallExpression(beginCall) || !ts.isIdentifier(unwrap(beginCall.expression))
    || unwrap(beginCall.expression).text !== beginImport.text) fail('controlled-anchor-source');
  assertNoLocalBinding(invokeCommand, 'beginControlledHumanCommand');

  const bodyObject = unwrap(body.initializer);
  const keyProperty = bodyObject.properties.find(property => !ts.isSpreadAssignment(property)
    && propertyName(property.name) === 'idempotencyKey');
  const requestProperty = bodyObject.properties.find(property => !ts.isSpreadAssignment(property)
    && propertyName(property.name) === 'requestId');
  if (!keyProperty || !requestProperty || !ts.isPropertyAssignment(keyProperty)
    || !ts.isPropertyAssignment(requestProperty)) fail('controlled-anchor-body-binding');
  const keyInitializer = unwrap(keyProperty.initializer);
  const requestInitializer = unwrap(requestProperty.initializer);
  if (!ts.isBinaryExpression(keyInitializer) || !ts.isBinaryExpression(requestInitializer)) {
    fail('controlled-anchor-body-binding');
  }
  const keyLeft = keyInitializer.left;
  const requestLeft = requestInitializer.left;
  const approvedPropertyRoots = new Set([rootIdentifier(keyLeft), rootIdentifier(requestLeft)].filter(Boolean));
  if (approvedPropertyRoots.size !== 2 || [...approvedPropertyRoots].some(identifier => (
    identifier.text !== 'controlledAnchor' || resolveLexicalVariable(identifier, invokeCommand) !== controlledAnchor
  ))) fail('controlled-anchor-body-binding');

  const visit = node => {
    if (ts.isIdentifier(node) && node.text === 'controlledAnchor' && node !== controlledAnchor.name) {
      if (approvedPropertyRoots.has(node)) return;
      if (ts.isPropertyAccessExpression(node.parent) && node.parent.expression === node
        && (node.parent.name.text === 'requestId' || node.parent.name.text === 'businessIdempotencyKey')
        && !expressionIsWritten(node.parent)) return;
      if (ts.isCallExpression(node.parent) && node.parent.arguments.length === 1
        && node.parent.arguments[0] === node && ts.isIdentifier(unwrap(node.parent.expression))
        && (unwrap(node.parent.expression).text === 'executeControlledHumanDeniedCommand'
          || unwrap(node.parent.expression).text === 'completeControlledHumanCommand')) return;
      if (ts.isBinaryExpression(node.parent) && node.parent.left === node
        && node.parent.operatorToken.kind === ts.SyntaxKind.AmpersandAmpersandToken) return;
      if (ts.isIfStatement(node.parent) && node.parent.expression === node) return;
      fail('controlled-anchor-alias-or-write');
    }
    ts.forEachChild(node, visit);
  };
  visit(invokeCommand.body);
};

const assertCommandSurface = (sourceFile, actionKeyDeclaration) => {
  const invokeCommand = functionInitializer(sourceFile, 'invokeCommand');
  const body = uniqueFunctionVariable(invokeCommand, 'body');
  assertObjectHasExactKey(body, property => {
    if (!ts.isPropertyAssignment(property)) return false;
    const initializer = unwrap(property.initializer);
    return ts.isBinaryExpression(initializer) && initializer.operatorToken.kind === ts.SyntaxKind.QuestionQuestionToken
      && memberPath(initializer.left) === 'controlledAnchor.businessIdempotencyKey'
      && exactBoundTopLevelCall(initializer.right, actionKeyDeclaration, invokeCommand, 'input.commandType');
  }, 'command-body');
  assertControlledAnchorIntegrity(sourceFile, invokeCommand, body);
  const retryBody = uniqueFunctionVariable(invokeCommand, 'retryBody');
  const retryInitializer = unwrap(retryBody.initializer);
  if (!ts.isConditionalExpression(retryInitializer)) fail('retry-body-shape');
  const retryFresh = unwrap(retryInitializer.whenTrue);
  const retryOriginal = unwrap(retryInitializer.whenFalse);
  if (!ts.isObjectLiteralExpression(retryFresh) || retryFresh.properties.length !== 2
    || !ts.isSpreadAssignment(retryFresh.properties[0]) || !ts.isIdentifier(unwrap(retryFresh.properties[0].expression))
    || unwrap(retryFresh.properties[0].expression).text !== 'body'
    || !ts.isPropertyAssignment(retryFresh.properties[1]) || propertyName(retryFresh.properties[1].name) !== 'requestId'
    || !exactCall(retryFresh.properties[1].initializer, 'createId')
    || !ts.isIdentifier(retryOriginal) || retryOriginal.text !== 'body') fail('retry-body-source');

  const sinks = [];
  const visitSinks = node => {
    if (ts.isCallExpression(node) && node.arguments.length > 0 && ts.isStringLiteral(unwrap(node.arguments[0]))
      && unwrap(node.arguments[0]).text === 'enterprise-intelligence-command') sinks.push(node);
    ts.forEachChild(node, visitSinks);
  };
  visitSinks(invokeCommand.body);
  if (sinks.length !== 2) fail('command-owned-sink-count');
  const sinkBindings = sinks.map(sink => sinkBodyIdentifier(sink));
  if (sinkBindings[0].text !== 'body' || resolveLexicalVariable(sinkBindings[0], invokeCommand) !== body
    || sinkBindings[1].text !== 'retryBody' || resolveLexicalVariable(sinkBindings[1], invokeCommand) !== retryBody) {
    fail('command-sink-live-binding');
  }
  const allowedReferences = new Set([
    ...sinkBindings,
    unwrap(retryFresh.properties[0].expression),
    retryOriginal,
  ]);
  assertNoProtectedObjectAliasesOrWrites(invokeCommand, [body, retryBody], allowedReferences);
  return invokeCommand;
};

const assertProviderSurfaces = (sourceFile, actionKeyDeclaration) => {
  const invokeProvider = functionInitializer(sourceFile, 'invokeProviderLifecycle');
  const idempotencyDeclaration = uniqueFunctionVariable(invokeProvider, 'idempotencyKey');
  const idempotencyStatement = idempotencyDeclaration.parent?.parent;
  if (!ts.isVariableStatement(idempotencyStatement) || idempotencyStatement.parent !== invokeProvider.body) {
    fail('provider-key-direct-binding');
  }
  if (!idempotencyDeclaration.initializer
    || !exactBoundTopLevelCall(idempotencyDeclaration.initializer, actionKeyDeclaration, invokeProvider, 'input.operation')) {
    fail('provider-key-source');
  }
  const body = uniqueFunctionVariable(invokeProvider, 'body');
  const recoveryBody = uniqueFunctionVariable(invokeProvider, 'recoveryBody');
  const shorthandKey = property => ts.isShorthandPropertyAssignment(property)
    && property.name.text === 'idempotencyKey'
    && resolveLexicalVariable(property.name, invokeProvider) === idempotencyDeclaration;
  assertObjectHasExactKey(body, shorthandKey, 'provider-body');
  assertObjectHasExactKey(recoveryBody, shorthandKey, 'provider-recovery-body');

  const providerSinks = [];
  const recoverySinks = [];
  const visitSinks = node => {
    if (ts.isCallExpression(node) && node.arguments.length > 0 && ts.isStringLiteral(unwrap(node.arguments[0]))) {
      if (unwrap(node.arguments[0]).text === 'enterprise-provider-lifecycle') providerSinks.push(node);
      if (unwrap(node.arguments[0]).text === 'enterprise-provider-lifecycle-recovery') recoverySinks.push(node);
    }
    ts.forEachChild(node, visitSinks);
  };
  visitSinks(invokeProvider.body);
  if (providerSinks.length !== 2 || recoverySinks.length !== 1) fail('provider-owned-sink-count');
  const providerBindings = providerSinks.map(sink => sinkBodyIdentifier(sink));
  const recoveryBinding = sinkBodyIdentifier(recoverySinks[0]);
  if (providerBindings.some(binding => binding.text !== 'body'
      || resolveLexicalVariable(binding, invokeProvider) !== body)
    || recoveryBinding.text !== 'recoveryBody'
    || resolveLexicalVariable(recoveryBinding, invokeProvider) !== recoveryBody) fail('provider-sink-live-binding');
  assertNoProtectedObjectAliasesOrWrites(
    invokeProvider,
    [body, recoveryBody],
    new Set([...providerBindings, recoveryBinding]),
  );
  return invokeProvider;
};

const assertQuerySurface = sourceFile => {
  const loadProjection = functionInitializer(sourceFile, 'loadProjection');
  const queryCalls = [];
  const visit = node => {
    if (ts.isCallExpression(node) && node.arguments.length > 0
      && ts.isStringLiteral(unwrap(node.arguments[0]))
      && unwrap(node.arguments[0]).text === 'enterprise-intelligence-query') queryCalls.push(node);
    ts.forEachChild(node, visit);
  };
  visit(loadProjection.body);
  if (queryCalls.length !== 1) fail('query-owned-sink-count');
  const call = queryCalls[0];
  if (call.arguments.length !== 2) fail('query-invoke-arguments');
  const options = unwrap(call.arguments[1]);
  if (!ts.isObjectLiteralExpression(options) || options.properties.length !== 1) fail('query-options-shape');
  const bodyProperty = options.properties[0];
  if (!ts.isPropertyAssignment(bodyProperty) || propertyName(bodyProperty.name) !== 'body') {
    fail('query-body-property');
  }
  const body = unwrap(bodyProperty.initializer);
  if (!ts.isObjectLiteralExpression(body) || body.properties.length !== 3
    || !ts.isSpreadAssignment(body.properties[0])
    || memberPath(body.properties[0].expression) !== 'input') fail('query-body-shape');
  const organizationProperty = body.properties[1];
  const workspaceProperty = body.properties[2];
  if (!ts.isPropertyAssignment(organizationProperty) || propertyName(organizationProperty.name) !== 'organizationId'
    || !ts.isIdentifier(unwrap(organizationProperty.initializer))
    || !ts.isPropertyAssignment(workspaceProperty) || propertyName(workspaceProperty.name) !== 'workspaceId'
    || !ts.isIdentifier(unwrap(workspaceProperty.initializer))) fail('query-body-scope-binding');
  const organizationDeclaration = uniqueFunctionVariable(loadProjection, 'requestedOrganizationId');
  const workspaceDeclaration = uniqueFunctionVariable(loadProjection, 'requestedWorkspaceId');
  if (resolveLexicalVariable(unwrap(organizationProperty.initializer), loadProjection) !== organizationDeclaration
    || resolveLexicalVariable(unwrap(workspaceProperty.initializer), loadProjection) !== workspaceDeclaration) {
    fail('query-body-scope-binding');
  }
  return loadProjection;
};

const assertProtectedAstFingerprints = (sourceFile, supabaseImport) => {
  for (const name of [
    'createCryptographicUuid',
    'createEnterpriseActionIdempotencyKey',
    'invokeCommand',
    'invokeProviderLifecycle',
    'loadProjection',
  ]) {
    const initializer = unwrap(uniqueTopLevelVariable(sourceFile, name).initializer);
    if (astFingerprint(sourceFile, initializer) !== PROTECTED_AST_FINGERPRINTS[name]) {
      fail(`protected-ast-fingerprint-${name}`);
    }
  }
  if (astFingerprint(sourceFile, supabaseImport) !== PROTECTED_AST_FINGERPRINTS.supabaseClientImport) {
    fail('protected-ast-fingerprint-supabaseClientImport');
  }
};

export const assertEnterpriseClientIdempotencyBoundary = source => {
  const sourceFile = parse(source);
  const supabaseImport = supabaseClientImportDeclaration(sourceFile);
  assertNoAlternateSupabaseClientRoutes(sourceFile, supabaseImport);
  const cryptographicUuidDeclaration = assertCryptographicUuidGenerator(sourceFile);
  const actionKeyDeclaration = assertIdempotencyGenerator(sourceFile, cryptographicUuidDeclaration);
  const invokeCommand = assertCommandSurface(sourceFile, actionKeyDeclaration);
  const invokeProvider = assertProviderSurfaces(sourceFile, actionKeyDeclaration);
  const loadProjection = assertQuerySurface(sourceFile);
  assertSupabaseCapabilityInventory(sourceFile, [
    [invokeCommand, { 'enterprise-intelligence-command': 2 }],
    [invokeProvider, {
      'enterprise-provider-lifecycle': 2,
      'enterprise-provider-lifecycle-authority': 1,
      'enterprise-provider-lifecycle-recovery': 1,
    }],
    [loadProjection, { 'enterprise-intelligence-query': 1 }],
  ]);
  assertProtectedAstFingerprints(sourceFile, supabaseImport);
};
