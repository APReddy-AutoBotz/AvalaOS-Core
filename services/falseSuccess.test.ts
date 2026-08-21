import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

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
  /useLayoutEffect\(\(\) => \{\s*if \(guardLoading \|\| !currentUser \|\| !currentOrganization\) return;\s*if \(!explicitNavigationIntent \|\| navigationHydrated\.current\) return;\s*if \(processesLoading\) return;/,
  'explicit URL hydration must commit in the layout phase before passive reconciliation can observe a stale render',
);

const providerSource = readFileSync('components/docs/DocsProvider.tsx', 'utf8');
assert.match(providerSource, /Promise<DocumentGeneration>/);
assert.match(providerSource, /Document persistence authority is unavailable/);
assert.doesNotMatch(providerSource, /if \(!currentOrganization \|\| !user\) return;/);

const serviceSource = readFileSync('services/docsService.ts', 'utf8');
assert.match(serviceSource, /Document persistence authority is unavailable/);
assert.doesNotMatch(serviceSource, /if \(!currentOrganization \|\| !user\) return;/);

console.log('False-success persistence regression suite passed.');
