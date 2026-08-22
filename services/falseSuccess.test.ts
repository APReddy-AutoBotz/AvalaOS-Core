import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const storageSource = readFileSync('services/storage.ts', 'utf8');
assert.doesNotMatch(
  storageSource,
  /useLayoutEffect/,
  'persistent reconstruction evidence must not be rewritten by mount/render effects',
);
assert.match(
  storageSource,
  /const setPersistentState = useCallback\([\s\S]*if \(enabled\) StorageService\.save\(key, resolved\);[\s\S]*setState\(resolved\);/,
  'persistent storage writes must remain coupled to explicit application state transitions',
);
assert.doesNotMatch(
  storageSource,
  /StorageService\.save\(key, state\)/,
  'rendered state must never overwrite independently changed browser reconstruction evidence',
);

const appSource = readFileSync('App.tsx', 'utf8');
assert.doesNotMatch(appSource, /savedGeneration\s*\|\|\s*newGeneration/);
assert.doesNotMatch(appSource, /setTempArtifacts\(artifacts\)[\s\S]{0,450}applyGuardedView\(View\.WORKSPACE\)/);
assert.match(appSource, /await persistBeforeCommit/);
assert.match(appSource, /\(\) => deliverySaveGeneration\(newGeneration\)/);
assert.match(appSource, /Document generation requires an active project/);
assert.match(
  appSource,
  /pendingNavigationHydration\.current = \{[\s\S]*selectedProcessId: resolvedNavigation\.selectedProcessId,[\s\S]*activeGenerationId: resolvedNavigation\.activeGenerationId,/,
  'URL hydration must retain the complete expected navigation tuple until React commits it',
);
assert.match(
  appSource,
  /const hydrationCommitted = Boolean\(pending[\s\S]*currentView === pending\.view[\s\S]*areScopesEqual\(currentScope, pending\.scope\)[\s\S]*selectedProcessId === pending\.selectedProcessId[\s\S]*activeGenerationId === pending\.activeGenerationId\);[\s\S]*if \(!hydrationCommitted\) return;[\s\S]*navigationWriteSuppressed\.current = false;/,
  'pre-hydration effects must not release reconciliation suppression before the full navigation tuple commits',
);
assert.match(
  appSource,
  /if \(explicitNavigationIntent && !navigationHydrated\.current\) return;\s*if \(navigationWriteSuppressed\.current\) return;[\s\S]*resolvePersistedViewScopeState/,
  'persisted view/scope normalization must not race explicit URL hydration or its commit',
);
assert.match(
  appSource,
  /useLayoutEffect\(\(\) => \{\s*if \(guardLoading \|\| !currentUser \|\| !currentOrganization\) return;\s*if \(!explicitNavigationIntent \|\| navigationHydrated\.current\) return;\s*if \(!hasDurableProductNavigationAgreement\([\s\S]*?\)\) \{[\s\S]*?navigationHydrated\.current = true;\s*return;\s*\}\s*[^]*?if \(processesLoading\) return;/,
  'invalid durable navigation must be rejected in the layout phase before product hydration can observe a stale render',
);
assert.match(
  appSource,
  /if \(processesLoading\) return;\s*const resolvedNavigation = resolveProductNavigationState\(/,
  'valid durable navigation must wait for product data before canonical route reconstruction',
);

const providerSource = readFileSync('components/docs/DocsProvider.tsx', 'utf8');
assert.match(providerSource, /Promise<DocumentGeneration>/);
assert.match(providerSource, /Document persistence authority is unavailable/);
assert.doesNotMatch(providerSource, /if \(!currentOrganization \|\| !user\) return;/);

const serviceSource = readFileSync('services/docsService.ts', 'utf8');
assert.match(serviceSource, /Document persistence authority is unavailable/);
assert.doesNotMatch(serviceSource, /if \(!currentOrganization \|\| !user\) return;/);

console.log('False-success persistence regression suite passed.');
