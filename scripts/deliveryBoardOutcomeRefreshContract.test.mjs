import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const [app, projectView] = await Promise.all([
  readFile(new URL('../App.tsx', import.meta.url), 'utf8'),
  readFile(new URL('../components/delivery/ProjectView.tsx', import.meta.url), 'utf8'),
]);

assert.match(app, /refreshKey:\s*selectedTask\?\.id\s*\?\?\s*'board'/u,
  'opening and closing the normal task modal must advance the existing board outcome read key');
assert.ok(projectView.includes('${deliveryBoardAuthority.scope.authorizationVersion}:${project.id}:${deliveryBoardAuthority.refreshKey}'),
  'the committed outcome projection key must include the modal-cycle refresh selector');
assert.match(projectView, /\[boardAuthorityKey,\s*deliveryBoardAuthority\?\.loadOutcomes,\s*project\.id\]/u,
  'the existing committed outcome read must rerun when its scoped key changes');
assert.doesNotMatch(projectView, /CustomEvent|dispatchEvent\(|addEventListener\(/u,
  'board refresh must reuse scoped React projection reads rather than create a cross-actor event channel');

console.log('Delivery board outcome refresh: modal close, actor/session scope and existing projection-read reuse passed.');
