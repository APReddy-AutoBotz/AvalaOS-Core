import { createRequire } from 'node:module';
import { createHash } from 'node:crypto';

const require = createRequire(import.meta.url);
const ts = require('typescript');

export const ENTERPRISE_PROJECTION_SITE_COUNT = 66;
export const RELATIONSHIP_REVIEW_TABLE = 'enterprise_evidence_candidate_relationship_reviews';
// Reviewed target -> call-kind -> table -> ordered-column inventory. This is
// independent of both the source being extracted and the database catalog.
// A legitimate projection change requires explicit review of this binding.
export const ENTERPRISE_PROJECTION_INVENTORY_SHA256 = '104dfc9cb12f411dfa93df3da9b1e0deaf5cd889df47a846037de7b0feabac8e';

const fail = (code, detail = '') => {
  throw new Error(`ENTERPRISE_PROJECTION_SCHEMA_${code}${detail ? `:${detail}` : ''}`);
};

const nameOf = node => node && ts.isIdentifier(node) ? node.text
  : node && ts.isStringLiteralLike(node) ? node.text : '';

const unwrap = node => {
  let current = node;
  while (current && (ts.isParenthesizedExpression(current) || ts.isAsExpression(current)
    || ts.isTypeAssertionExpression(current) || ts.isSatisfiesExpression?.(current))) current = current.expression;
  return current;
};

const literalPrefix = node => {
  const value = unwrap(node);
  if (ts.isStringLiteralLike(value) || ts.isNoSubstitutionTemplateLiteral(value)) {
    return { prefix: value.text, dynamic: false };
  }
  if (ts.isTemplateExpression(value)) return { prefix: value.head.text, dynamic: true };
  fail('DYNAMIC_PATH');
};

const projectionFromPath = (node, target, callKind, ordinal) => {
  const { prefix, dynamic } = literalPrefix(node);
  if (!prefix) fail('PATH_MALFORMED', target);
  // Interpolation is permitted only after the complete select clause. This
  // keeps scope/filter values dynamic without allowing selected columns to be.
  if (dynamic && !/^[a-z][a-z0-9_]*\?select=[^&?#]+&/u.test(prefix)) {
    fail('DYNAMIC_SELECT', target);
  }
  const match = /^([a-z][a-z0-9_]*)\?select=([^&?#]*)(?:&|$)/u.exec(prefix);
  if (!match || !match[2]) fail('PATH_MALFORMED', target);
  const table = match[1];
  const columns = match[2].split(',');
  if (!columns.length || columns.some(column => !/^[a-z][a-z0-9_]*$/u.test(column))) {
    fail('SELECTOR_UNSUPPORTED', target);
  }
  if (new Set(columns).size !== columns.length) fail('SELECTOR_DUPLICATE', target);
  return Object.freeze({ ordinal, target, callKind, table, columns: Object.freeze(columns) });
};

const findProjectionFactory = sourceFile => {
  const matches = [];
  for (const statement of sourceFile.statements) {
    if (!ts.isVariableStatement(statement)) continue;
    for (const declaration of statement.declarationList.declarations) {
      if (nameOf(declaration.name) !== 'createEnterpriseIntelligenceQueryDatabase') continue;
      matches.push(unwrap(declaration.initializer));
    }
  }
  if (matches.length !== 1 || !ts.isArrowFunction(matches[0])) fail('FACTORY_NOT_EXACT');
  return matches[0];
};

const findLoadMethod = factory => {
  const body = unwrap(factory.body);
  if (!ts.isObjectLiteralExpression(body)) fail('FACTORY_BODY_UNSUPPORTED');
  const matches = body.properties.filter(property =>
    (ts.isMethodDeclaration(property) || ts.isPropertyAssignment(property))
    && nameOf(property.name) === 'loadProjectionRows');
  if (matches.length !== 1) fail('LOAD_METHOD_NOT_EXACT');
  const method = matches[0];
  if (ts.isMethodDeclaration(method)) return method.body;
  const initializer = unwrap(method.initializer);
  if (!ts.isArrowFunction(initializer) && !ts.isFunctionExpression(initializer)) fail('LOAD_METHOD_UNSUPPORTED');
  return initializer.body;
};

const lexicalDeclarationsNamed = (root, expectedName) => {
  const declarations = [];
  const visit = node => {
    if ((ts.isVariableDeclaration(node) || ts.isParameter(node) || ts.isFunctionDeclaration(node)
      || ts.isClassDeclaration(node) || ts.isBindingElement(node)) && nameOf(node.name) === expectedName) {
      declarations.push(node);
    }
    ts.forEachChild(node, visit);
  };
  visit(root);
  return declarations;
};

const bindLoadAdapter = loadBody => {
  const declarations = lexicalDeclarationsNamed(loadBody, 'load');
  if (declarations.length !== 1 || !ts.isVariableDeclaration(declarations[0])) fail('LOAD_BINDING_NOT_EXACT');
  const declaration = declarations[0];
  const declarationList = declaration.parent;
  const statement = declarationList?.parent;
  if (!ts.isVariableDeclarationList(declarationList) || declarationList.declarations.length !== 1
    || !ts.isVariableStatement(statement) || statement.parent !== loadBody) fail('LOAD_BINDING_NOT_LOCAL');
  const initializer = unwrap(declaration.initializer);
  if (!ts.isArrowFunction(initializer) || initializer.parameters.length !== 2
    || nameOf(initializer.parameters[0].name) !== 'target' || nameOf(initializer.parameters[1].name) !== 'path') {
    fail('LOAD_ADAPTER_UNSUPPORTED');
  }
  const queryCalls = [];
  const visit = node => {
    if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === 'query') {
      queryCalls.push(node);
    }
    ts.forEachChild(node, visit);
  };
  visit(initializer.body);
  if (queryCalls.length !== 1 || queryCalls[0].arguments.length < 1
    || !ts.isIdentifier(unwrap(queryCalls[0].arguments[0]))
    || unwrap(queryCalls[0].arguments[0]).text !== 'path') fail('LOAD_ADAPTER_NOT_EXACT');
  return queryCalls[0];
};

const directQueryTarget = call => {
  let current = call;
  while (current.parent && !ts.isBlock(current.parent)) {
    const parent = current.parent;
    if (ts.isBinaryExpression(parent) && parent.operatorToken.kind === ts.SyntaxKind.EqualsToken) {
      const left = unwrap(parent.left);
      if (ts.isPropertyAccessExpression(left) && nameOf(left.expression) === 'rows'
        && /^[A-Za-z][A-Za-z0-9]*$/u.test(left.name.text)) return left.name.text;
      fail('QUERY_TARGET_UNSUPPORTED');
    }
    current = parent;
  }
  fail('QUERY_TARGET_MISSING');
};

export function extractEnterpriseProjectionSchemaContract(sourceText, fileName = 'enterpriseIntelligenceQuery.ts') {
  if (typeof sourceText !== 'string' || !sourceText.trim()) fail('SOURCE_EMPTY');
  const sourceFile = ts.createSourceFile(fileName, sourceText, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  if (sourceFile.parseDiagnostics.length) fail('SOURCE_SYNTAX');
  const factory = findProjectionFactory(sourceFile);
  if (factory.parameters.length < 1 || nameOf(factory.parameters[0].name) !== 'query') {
    fail('QUERY_BINDING_NOT_EXACT');
  }
  const loadBody = findLoadMethod(factory);
  if (!loadBody) fail('LOAD_BODY_MISSING');
  if (lexicalDeclarationsNamed(loadBody, 'query').length !== 0) fail('QUERY_SHADOWED');
  const plumbingQuery = bindLoadAdapter(loadBody);
  const sites = [];
  let plumbingQueries = 0;
  const visit = node => {
    if (ts.isCallExpression(node) && ts.isIdentifier(node.expression)) {
      if (node.expression.text === 'load') {
        if (node.arguments.length !== 2 || !ts.isStringLiteralLike(unwrap(node.arguments[0]))) fail('LOAD_CALL_UNSUPPORTED');
        const target = unwrap(node.arguments[0]).text;
        if (!/^[A-Za-z][A-Za-z0-9]*$/u.test(target)) fail('LOAD_TARGET_UNSUPPORTED');
        sites.push(projectionFromPath(node.arguments[1], target, 'load', sites.length + 1));
      } else if (node.expression.text === 'query') {
        const first = unwrap(node.arguments[0]);
        if (node === plumbingQuery && node.arguments.length >= 1 && ts.isIdentifier(first) && first.text === 'path') {
          plumbingQueries += 1;
        } else {
          if (node.arguments.length < 1) fail('QUERY_CALL_UNSUPPORTED');
          const target = directQueryTarget(node);
          sites.push(projectionFromPath(node.arguments[0], target, 'query', sites.length + 1));
        }
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(loadBody);
  if (plumbingQueries !== 1) fail('LOAD_ADAPTER_NOT_EXACT');
  if (sites.length !== ENTERPRISE_PROJECTION_SITE_COUNT) fail('SITE_COUNT', String(sites.length));
  const targets = sites.map(site => site.target);
  if (new Set(targets).size !== targets.length) fail('TARGET_DUPLICATE');
  if (!sites.length) fail('INVENTORY_EMPTY');
  return Object.freeze({
    schemaVersion: 'enterprise-projection-schema-contract-v1',
    factory: 'createEnterpriseIntelligenceQueryDatabase',
    siteCount: sites.length,
    sites: Object.freeze(sites),
  });
}

export function assertEnterpriseProjectionOwnerContract(contract) {
  const matches = contract.sites.filter(site => site.target === 'transcriptCandidateRelationships');
  if (matches.length !== 1) fail('RELATIONSHIP_TARGET_NOT_EXACT');
  const site = matches[0];
  if (site.table !== RELATIONSHIP_REVIEW_TABLE) fail('RELATIONSHIP_TABLE_MISMATCH');
  if (!site.columns.includes('reviewer_id') || site.columns.includes('created_by')) {
    fail('RELATIONSHIP_OWNER_MISMATCH');
  }
  return site;
}

export function assertProjectionColumnsExist(contract, catalogRows) {
  if (!Array.isArray(catalogRows)) fail('CATALOG_UNAVAILABLE');
  const actual = new Set(catalogRows.map(row => `${row.table_name}.${row.column_name}`));
  for (const site of contract.sites) {
    for (const column of site.columns) {
      const key = `${site.table}.${column}`;
      if (!actual.has(key)) fail('MISSING_COLUMN', key);
    }
  }
}

export function assertEnterpriseProjectionInventory(contract) {
  if (contract?.schemaVersion !== 'enterprise-projection-schema-contract-v1'
    || contract.factory !== 'createEnterpriseIntelligenceQueryDatabase'
    || contract.siteCount !== ENTERPRISE_PROJECTION_SITE_COUNT
    || createHash('sha256').update(JSON.stringify(contract.sites)).digest('hex') !== ENTERPRISE_PROJECTION_INVENTORY_SHA256) {
    fail('INVENTORY_MISMATCH');
  }
}

// Also exported for the real-database negative countercontrol. This deliberately
// checks column existence independently of the reviewed inventory/owner checks.
export async function assertEnterpriseProjectionDatabaseColumns(database, contract) {
  if (!database || typeof database.query !== 'function') fail('DATABASE_UNAVAILABLE');
  const tables = [...new Set(contract.sites.map(site => site.table))].sort();
  const result = await database.query(
    `SELECT c.relname AS table_name,a.attname AS column_name
     FROM pg_catalog.pg_class c
     JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
     JOIN pg_catalog.pg_attribute a ON a.attrelid=c.oid
     WHERE n.nspname='public' AND c.relkind IN ('r','p','v','m')
       AND c.relname=ANY($1::text[]) AND a.attnum>0 AND NOT a.attisdropped
     ORDER BY c.relname,a.attnum`,
    [tables],
  );
  assertProjectionColumnsExist(contract, result.rows);
}

export async function assertEnterpriseProjectionSchema(database, sourceText) {
  const contract = extractEnterpriseProjectionSchemaContract(sourceText);
  assertEnterpriseProjectionInventory(contract);
  await assertEnterpriseProjectionDatabaseColumns(database, contract);
  assertEnterpriseProjectionOwnerContract(contract);
  return contract;
}
