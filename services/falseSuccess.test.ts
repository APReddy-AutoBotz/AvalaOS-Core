import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const appSource = readFileSync('App.tsx', 'utf8');
assert.doesNotMatch(appSource, /savedGeneration\s*\|\|\s*newGeneration/);
assert.doesNotMatch(appSource, /setTempArtifacts\(artifacts\)[\s\S]{0,450}applyGuardedView\(View\.WORKSPACE\)/);
assert.match(appSource, /await deliverySaveGeneration\(newGeneration\)/);
assert.match(appSource, /Document generation requires an active project/);

const providerSource = readFileSync('components/docs/DocsProvider.tsx', 'utf8');
assert.match(providerSource, /Promise<DocumentGeneration>/);
assert.match(providerSource, /Document persistence authority is unavailable/);
assert.doesNotMatch(providerSource, /if \(!currentOrganization \|\| !user\) return;/);

const serviceSource = readFileSync('services/docsService.ts', 'utf8');
assert.match(serviceSource, /Document persistence authority is unavailable/);
assert.doesNotMatch(serviceSource, /if \(!currentOrganization \|\| !user\) return;/);

console.log('False-success persistence regression suite passed.');
