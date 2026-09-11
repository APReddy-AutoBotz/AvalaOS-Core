import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { assertEnterpriseClientIdempotencyBoundary } from './enterpriseIntelligenceIdempotencyBoundary.mjs';

const source = readFileSync('services/enterpriseIntelligenceClient.ts', 'utf8').replace(/\r\n?/gu, '\n');
const rejects = candidate => assert.throws(
  () => assertEnterpriseClientIdempotencyBoundary(candidate),
  /ENTERPRISE_IDEMPOTENCY_BOUNDARY/u,
);
const replaceOnce = (value, search, replacement) => {
  assert.ok(value.includes(search), `mutation target missing: ${search}`);
  return value.replace(search, replacement);
};

test('accepts fresh UUID action keys while allowing controlled-human evidence digests', () => {
  assert.match(source, /controlledHumanDigest[\s\S]+?subtle\.digest\('SHA-256'/u);
  assert.doesNotThrow(() => assertEnterpriseClientIdempotencyBoundary(source));
});

test('rejects deterministic action-key generators and weakened cryptographic UUID sources', () => {
  rejects(replaceOnce(
    source,
    '`ei:${operation}:${createCryptographicUuid()}`',
    '`ei:${operation}:${stableFingerprint(operation)}`',
  ));
  const uuidStart = source.indexOf('const createCryptographicUuid = () => {');
  const uuidEnd = source.indexOf('\n};', uuidStart) + 3;
  assert.ok(uuidStart >= 0 && uuidEnd > uuidStart);
  rejects(`${source.slice(0, uuidStart)}const createCryptographicUuid = () => stableFingerprint(material);${source.slice(uuidEnd)}`);
  rejects(`${source.slice(0, uuidStart)}const createCryptographicUuid = async () => globalThis.crypto.subtle.digest('SHA-256', new TextEncoder().encode(material));${source.slice(uuidEnd)}`);
});

test('rejects digest-derived keys routed into command or provider command surfaces', () => {
  rejects(replaceOnce(
    source,
    'controlledAnchor?.businessIdempotencyKey ?? createEnterpriseActionIdempotencyKey(input.commandType)',
    'controlledAnchor?.businessIdempotencyKey ?? await controlledHumanDigest(input.payload)',
  ));
  rejects(replaceOnce(
    source,
    'const idempotencyKey = createEnterpriseActionIdempotencyKey(input.operation);',
    'const idempotencyKey = await controlledHumanDigest(input.payload);',
  ));
  const providerStart = source.indexOf('const invokeProviderLifecycle');
  assert.ok(providerStart >= 0);
  const providerSource = source.slice(providerStart);
  const mutatedProvider = replaceOnce(providerSource, '        idempotencyKey,', '        idempotencyKey: await controlledHumanDigest(activePayload),');
  rejects(`${source.slice(0, providerStart)}${mutatedProvider}`);
});

test('rejects nested-good declarations that decoy a bad live command or provider binding', () => {
  const generalLiveBad = replaceOnce(
    source,
    'idempotencyKey: controlledAnchor?.businessIdempotencyKey ?? createEnterpriseActionIdempotencyKey(input.commandType),',
    'idempotencyKey: await controlledHumanDigest(input.payload),',
  );
  rejects(replaceOnce(
    generalLiveBad,
    '  const body = {\n    commandType: input.commandType,',
    "  if (false) { const body = { idempotencyKey: controlledAnchor?.businessIdempotencyKey ?? createEnterpriseActionIdempotencyKey(input.commandType) }; void body; }\n  const body = {\n    commandType: input.commandType,",
  ));

  const providerLiveBad = replaceOnce(
    source,
    '  const idempotencyKey = createEnterpriseActionIdempotencyKey(input.operation);',
    '  const idempotencyKey = await controlledHumanDigest(input.payload);',
  );
  rejects(replaceOnce(
    providerLiveBad,
    '  const requestId = createId();\n  const idempotencyKey = await controlledHumanDigest(input.payload);',
    "  const requestId = createId();\n  if (false) { const idempotencyKey = createEnterpriseActionIdempotencyKey(input.operation); void idempotencyKey; }\n  const idempotencyKey = await controlledHumanDigest(input.payload);",
  ));

  const providerBodyLiveBad = replaceOnce(
    source,
    '        idempotencyKey,\n      };',
    '        idempotencyKey: await controlledHumanDigest(activePayload),\n      };',
  );
  rejects(replaceOnce(
    providerBodyLiveBad,
    '      const body = {\n        operation: input.operation,',
    "      if (false) { const body = { idempotencyKey }; void body; }\n      const body = {\n        operation: input.operation,",
  ));

  const recoveryBodyLiveBad = replaceOnce(
    source,
    '              idempotencyKey,\n            };',
    '              idempotencyKey: await controlledHumanDigest(activePayload),\n            };',
  );
  rejects(replaceOnce(
    recoveryBodyLiveBad,
    '            const recoveryBody = {\n              operation: input.operation,',
    "            if (false) { const recoveryBody = { idempotencyKey }; void recoveryBody; }\n            const recoveryBody = {\n              operation: input.operation,",
  ));
});

test('rejects direct, computed, and aliased post-construction digest overwrites at every sink body', () => {
  const insertionPoints = [
    ['general', '    payload: input.payload,\n  };', 'body'],
    ['provider', '        idempotencyKey,\n      };', 'body'],
    ['recovery', '              idempotencyKey,\n            };', 'recoveryBody'],
  ];
  for (const [label, close, binding] of insertionPoints) {
    const direct = `${close}\n${label === 'general' ? '  ' : label === 'provider' ? '      ' : '            '}${binding}.idempotencyKey = await controlledHumanDigest(input.payload);`;
    rejects(replaceOnce(source, close, direct));
    const computed = `${close}\n${label === 'general' ? '  ' : label === 'provider' ? '      ' : '            '}${binding}['idempotencyKey'] = await controlledHumanDigest(input.payload);`;
    rejects(replaceOnce(source, close, computed));
    const indent = label === 'general' ? '  ' : label === 'provider' ? '      ' : '            ';
    const aliasName = `${label}BodyAlias`;
    const aliased = `${close}\n${indent}const ${aliasName} = ${binding};\n${indent}${aliasName}.idempotencyKey = await controlledHumanDigest(input.payload);`;
    rejects(replaceOnce(source, close, aliased));
  }
});

test('rejects computed or endpoint-aliased invoke sinks hidden beside valid decoys', () => {
  rejects(replaceOnce(
    source,
    "  let invocation = await supabase.functions.invoke('enterprise-intelligence-command', { body });",
    "  await supabase.functions['invoke']('enterprise-intelligence-command', { body: { ...body, idempotencyKey: await controlledHumanDigest(input.payload) } });\n  let invocation = await supabase.functions.invoke('enterprise-intelligence-command', { body });",
  ));
  rejects(replaceOnce(
    source,
    "              const recoveryInvocation = await supabase.functions.invoke(\n                'enterprise-provider-lifecycle-recovery',",
    "              const recoveryEndpoint = 'enterprise-provider-lifecycle-recovery';\n              await supabase.functions.invoke(recoveryEndpoint, { body: recoveryBody });\n              const recoveryInvocation = await supabase.functions.invoke(\n                'enterprise-provider-lifecycle-recovery',",
  ));
});

test('rejects local function and variable shadows of the top-level action-key generator', () => {
  const generalEntry = "}): Promise<T> => {\n  if (!commandEnabled()) throw new Error('Enterprise Intelligence requires server runtime authority.');";
  const generalShadows = [
    "}): Promise<T> => {\n  function createEnterpriseActionIdempotencyKey(operation) { return `ei:${operation}:shadow`; }\n  if (!commandEnabled()) throw new Error('Enterprise Intelligence requires server runtime authority.');",
    "}): Promise<T> => {\n  const createEnterpriseActionIdempotencyKey = operation => `ei:${operation}:shadow`;\n  if (!commandEnabled()) throw new Error('Enterprise Intelligence requires server runtime authority.');",
  ];
  for (const shadow of generalShadows) rejects(replaceOnce(source, generalEntry, shadow));

  const providerStart = source.indexOf('const invokeProviderLifecycle');
  assert.ok(providerStart >= 0);
  const prefix = source.slice(0, providerStart);
  const providerSource = source.slice(providerStart);
  const providerEntry = "}): Promise<T> => {\n  if (!commandEnabled()) throw new EnterpriseIntelligenceClientError('COMMAND_UNAVAILABLE');";
  const providerShadows = [
    "}): Promise<T> => {\n  function createEnterpriseActionIdempotencyKey(operation) { return `ei:${operation}:shadow`; }\n  if (!commandEnabled()) throw new EnterpriseIntelligenceClientError('COMMAND_UNAVAILABLE');",
    "}): Promise<T> => {\n  const createEnterpriseActionIdempotencyKey = operation => `ei:${operation}:shadow`;\n  if (!commandEnabled()) throw new EnterpriseIntelligenceClientError('COMMAND_UNAVAILABLE');",
  ];
  for (const shadow of providerShadows) rejects(`${prefix}${replaceOnce(providerSource, providerEntry, shadow)}`);
});

test('rejects controlled-human anchor source substitution, overwrites, and aliases before body construction', () => {
  const insertion = '  const body = {\n    commandType: input.commandType,';
  const unsafe = [
    "  if (controlledAnchor) controlledAnchor.businessIdempotencyKey = await controlledHumanDigest(input.payload);\n",
    "  if (controlledAnchor) controlledAnchor['businessIdempotencyKey'] = await controlledHumanDigest(input.payload);\n",
    "  const anchorAlias = controlledAnchor;\n  if (anchorAlias) anchorAlias.businessIdempotencyKey = await controlledHumanDigest(input.payload);\n",
    "  if (controlledAnchor) Object.assign(controlledAnchor, { businessIdempotencyKey: await controlledHumanDigest(input.payload) });\n",
  ];
  for (const mutation of unsafe) rejects(replaceOnce(source, insertion, `${mutation}${insertion}`));
  rejects(replaceOnce(
    source,
    "const controlledAnchor = controlledTarget ? await beginControlledHumanCommand({ action: input.commandType, ...controlledTarget, selectorBindings: await controlledHumanSelectors(input.commandType, input.controlledSelectorPayload ?? input.payload) }) : null;",
    "const controlledAnchor = controlledTarget ? { requestId: createId(), businessIdempotencyKey: await controlledHumanDigest(input.payload) } : null;",
  ));
});

test('rejects every dynamic, computed, aliased, or extra Supabase invoke capability at protected sinks', () => {
  const mutations = [
    [
      "  let invocation = await supabase.functions.invoke('enterprise-intelligence-command', { body });",
      "  let invocation = await supabase.functions.invoke(`enterprise-intelligence-command`, { body });",
    ],
    [
      "      let invocation = await supabase.functions.invoke('enterprise-provider-lifecycle', { body });",
      "      let invocation = await supabase.functions.invoke('enterprise-provider-' + 'lifecycle', { body });",
    ],
    [
      "                'enterprise-provider-lifecycle-recovery',",
      "                `enterprise-provider-lifecycle-recovery`,",
    ],
    [
      "  let invocation = await supabase.functions.invoke('enterprise-intelligence-command', { body });",
      "  let invocation = await supabase.functions['invoke']('enterprise-intelligence-command', { body });",
    ],
    [
      "      let invocation = await supabase.functions.invoke('enterprise-provider-lifecycle', { body });",
      "      let invocation = await supabase['functions'].invoke('enterprise-provider-lifecycle', { body });",
    ],
    [
      "  let invocation = await supabase.functions.invoke('enterprise-intelligence-command', { body });",
      "  const invokeGeneral = supabase.functions.invoke;\n  let invocation = await invokeGeneral('enterprise-intelligence-command', { body });",
    ],
    [
      "      let invocation = await supabase.functions.invoke('enterprise-provider-lifecycle', { body });",
      "      const invokeProvider = supabase.functions.invoke;\n      let invocation = await invokeProvider('enterprise-provider-lifecycle', { body });",
    ],
    [
      "              const recoveryInvocation = await supabase.functions.invoke(\n                'enterprise-provider-lifecycle-recovery',",
      "              const invokeRecovery = supabase.functions.invoke;\n              const recoveryInvocation = await invokeRecovery(\n                'enterprise-provider-lifecycle-recovery',",
    ],
    [
      "  let invocation = await supabase.functions.invoke('enterprise-intelligence-command', { body });",
      "  const generalEndpoint = 'enterprise-intelligence-command';\n  let invocation = await supabase.functions.invoke(generalEndpoint, { body });",
    ],
    [
      "      let invocation = await supabase.functions.invoke('enterprise-provider-lifecycle', { body });",
      "      const providerEndpoint = 'enterprise-provider-lifecycle';\n      let invocation = await supabase.functions.invoke(providerEndpoint, { body });",
    ],
    [
      "              const recoveryInvocation = await supabase.functions.invoke(\n                'enterprise-provider-lifecycle-recovery',",
      "              const recoveryEndpoint = 'enterprise-provider-lifecycle-recovery';\n              const recoveryInvocation = await supabase.functions.invoke(\n                recoveryEndpoint,",
    ],
    [
      "  let invocation = await supabase.functions.invoke('enterprise-intelligence-command', { body });",
      "  await supabase.functions.invoke('enterprise-intelligence-command', { body });\n  let invocation = await supabase.functions.invoke('enterprise-intelligence-command', { body });",
    ],
    [
      "      let invocation = await supabase.functions.invoke('enterprise-provider-lifecycle', { body });",
      "      await supabase.functions.invoke('enterprise-provider-lifecycle', { body });\n      let invocation = await supabase.functions.invoke('enterprise-provider-lifecycle', { body });",
    ],
    [
      "              const recoveryInvocation = await supabase.functions.invoke(\n                'enterprise-provider-lifecycle-recovery',",
      "              await supabase.functions.invoke('enterprise-provider-lifecycle-recovery', { body: recoveryBody });\n              const recoveryInvocation = await supabase.functions.invoke(\n                'enterprise-provider-lifecycle-recovery',",
    ],
  ];
  assert.equal(mutations.length, 14);
  for (const [target, replacement] of mutations) rejects(replaceOnce(source, target, replacement));
});

test('rejects local and top-level shadows or aliases of every UUID ambient trust anchor', () => {
  const generatorEntry = 'const createCryptographicUuid = () => {\n';
  const localMutations = [
    "const globalThis = { crypto: { randomUUID: () => 'shadow' } };\n",
    'const Uint8Array = class ShadowBytes {};\n',
    'const Array = { from: () => [] };\n',
    'const cryptoAlias = globalThis.crypto;\n',
    'const ByteArrayAlias = Uint8Array;\n',
    'const ArrayAlias = Array;\n',
  ];
  for (const mutation of localMutations) {
    rejects(replaceOnce(source, generatorEntry, `${generatorEntry}  ${mutation}`));
  }
  const topLevelMutations = [
    "const globalThis = { crypto: { randomUUID: () => 'shadow' } };\n",
    'const Uint8Array = class ShadowBytes {};\n',
    'const Array = { from: () => [] };\n',
  ];
  for (const mutation of topLevelMutations) {
    rejects(replaceOnce(source, generatorEntry, `${mutation}${generatorEntry}`));
  }
  const topLevelAliases = [
    'const cryptoAlias = globalThis.crypto;\n',
    'const ByteArrayAlias = Uint8Array;\n',
    'const ArrayAlias = Array;\n',
  ];
  for (const mutation of topLevelAliases) {
    rejects(replaceOnce(source, generatorEntry, `${mutation}${generatorEntry}`));
  }
  rejects(replaceOnce(source, generatorEntry, 'const createCryptographicUuid = (globalThis) => {\n'));
});

test('rejects namespace, computed, dynamic, require, and re-export Supabase capability routes', () => {
  const importEnd = "} from './supabaseClient';";
  const commandSink = "  let invocation = await supabase.functions.invoke('enterprise-intelligence-command', { body });";
  const exactNamespaceMutation = replaceOnce(
    replaceOnce(
      source,
      importEnd,
      `${importEnd}\nimport * as alternateClient from './supabaseClient';`,
    ),
    commandSink,
    "  await alternateClient['supabase'].functions.invoke(`enterprise-intelligence-command`, { body: { ...body, idempotencyKey: await controlledHumanDigest(input.payload) } });\n  let invocation = await supabase.functions.invoke('enterprise-intelligence-command', { body });",
  );
  const mutations = [
    exactNamespaceMutation,
    replaceOnce(
      source,
      commandSink,
      "  const alternateClient = await import('./supabaseClient');\n  await alternateClient['supabase'].functions.invoke(`enterprise-intelligence-command`, { body });\n  let invocation = await supabase.functions.invoke('enterprise-intelligence-command', { body });",
    ),
    replaceOnce(source, importEnd, `${importEnd}\nexport { supabase as alternateSupabase } from './supabaseClient';`),
    replaceOnce(
      source,
      commandSink,
      "  const alternateClient = require('./supabaseClient');\n  await alternateClient['supabase'].functions.invoke(`enterprise-intelligence-command`, { body });\n  let invocation = await supabase.functions.invoke('enterprise-intelligence-command', { body });",
    ),
    replaceOnce(source, importEnd, `${importEnd}\nimport * as alternateClient from './supabaseClient.ts';`),
    replaceOnce(
      source,
      commandSink,
      "  const modulePath = './supabaseClient';\n  const alternateClient = await import(modulePath);\n  await alternateClient['supabase'].functions.invoke(`enterprise-intelligence-command`, { body });\n  let invocation = await supabase.functions.invoke('enterprise-intelligence-command', { body });",
    ),
  ];
  assert.equal(mutations.length, 6);
  for (const mutation of mutations) rejects(mutation);
});

test('rejects semantically inert drift anywhere in each complete protected AST slice or import surface', () => {
  const mutations = [
    replaceOnce(source, 'const createCryptographicUuid = () => {\n', 'const createCryptographicUuid = () => {\n  void 0;\n'),
    replaceOnce(
      source,
      "  if (!commandEnabled()) throw new Error('Enterprise Intelligence requires server runtime authority.');",
      "  void 0;\n  if (!commandEnabled()) throw new Error('Enterprise Intelligence requires server runtime authority.');",
    ),
    replaceOnce(
      source,
      "  if (!commandEnabled()) throw new EnterpriseIntelligenceClientError('COMMAND_UNAVAILABLE');",
      "  void 0;\n  if (!commandEnabled()) throw new EnterpriseIntelligenceClientError('COMMAND_UNAVAILABLE');",
    ),
    replaceOnce(
      source,
      "  if (!commandEnabled()) throw new EnterpriseIntelligenceClientError('ENTERPRISE_PROJECTION_UNAVAILABLE');",
      "  void 0;\n  if (!commandEnabled()) throw new EnterpriseIntelligenceClientError('ENTERPRISE_PROJECTION_UNAVAILABLE');",
    ),
    replaceOnce(source, '  supabase,\n', '  supabase,\n  type SupabaseClientOptions,\n'),
  ];
  assert.equal(mutations.length, 5);
  for (const mutation of mutations) rejects(mutation);
});

test('rejects every direct Supabase invoke not consumed by an explicitly owned function inventory', () => {
  const insertion = '  return projection;\n};\n\nexport const enterpriseIntelligenceClient = {';
  const helpers = [
    "export const unownedDigestCommand = async input => supabase.functions.invoke('enterprise-intelligence-command', { body: { ...input, idempotencyKey: await controlledHumanDigest(input) } });\n\n",
    "export const unownedUnknownEndpoint = async () => supabase.functions.invoke('enterprise-unknown-endpoint', { body: {} });\n\n",
    "const hiddenProviderHelper = async body => supabase.functions.invoke('enterprise-provider-lifecycle', { body });\n\n",
    "const hiddenQueryHelper = async body => supabase.functions.invoke('enterprise-intelligence-query', { body });\n\n",
  ];
  assert.equal(helpers.length, 4);
  for (const helper of helpers) {
    rejects(replaceOnce(source, insertion, `  return projection;\n};\n\n${helper}export const enterpriseIntelligenceClient = {`));
  }
});
