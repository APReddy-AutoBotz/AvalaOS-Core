import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const [app, projectView, provider, boardsView] = await Promise.all([
  readFile(new URL('../App.tsx', import.meta.url), 'utf8'),
  readFile(new URL('../components/delivery/ProjectView.tsx', import.meta.url), 'utf8'),
  readFile(new URL('../components/delivery/DeliveryProvider.tsx', import.meta.url), 'utf8'),
  readFile(new URL('../components/delivery/BoardsView.tsx', import.meta.url), 'utf8'),
]);

assert.match(app, /refreshKey:\s*selectedTask\?\.id\s*\?\?\s*'board'/u,
  'opening and closing the normal task modal must advance the existing board outcome read key');
assert.ok(projectView.includes('${deliveryBoardAuthority.scope.authorizationVersion}:${project.id}:${deliveryBoardAuthority.refreshKey}'),
  'the committed outcome projection key must include the modal-cycle refresh selector');
assert.match(projectView, /\[boardAuthorityKey,\s*deliveryBoardAuthority\?\.loadOutcomes,\s*project\.id\]/u,
  'the existing committed outcome read must rerun when its scoped key changes');
assert.doesNotMatch(projectView, /CustomEvent|dispatchEvent\(|addEventListener\(/u,
  'board refresh must reuse scoped React projection reads rather than create a cross-actor event channel');
assert.match(app, /if \(!task\)[\s\S]*?return false;[\s\S]*?const saved = await deliveryUpdateTaskStatus\(taskId, newStatus\);[\s\S]*?saved\.id !== taskId \|\| saved\.status !== newStatus/u,
  'the normal status callback must reject missing work and verify the saved authoritative result');
assert.match(app, /catch \(error\)[\s\S]*?deliveryRefresh\(\)\.catch\(\(\) => undefined\);[\s\S]*?return false/u,
  'a rejected status command must refresh current board state and report failure');
assert.match(provider, /if \(!task\) throw new DeliveryPolicyError\([\s\S]*?return updateTask\(\{ \.\.\.task, status \}\);/u,
  'the Delivery provider must not turn a missing task into a successful no-op');
assert.match(boardsView, /if \(result === false\)[\s\S]*?was not changed[\s\S]*?moved to \$\{newStatus\}/u,
  'the board must distinguish rejected and committed status outcomes');

console.log('Delivery board status: refresh reuse, authoritative save confirmation and honest failure state passed.');
