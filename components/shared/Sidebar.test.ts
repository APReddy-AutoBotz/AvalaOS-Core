import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync('components/shared/Sidebar.tsx', 'utf8');

assert.match(source, /const monitorViews = new Set<View>\(\[View\.PORTFOLIO\]\);/);
assert.match(source, /const deliveryViews = new Set<View>\(deliverySubnav\.map\(item => item\.view\)\);/);
assert.match(source, /deliveryViews\.has\(currentView\) \? deliverySubnav/);
assert.doesNotMatch(source, /lifecycleItems\.some\(item => item\.view === currentView\).*deliverySubnav/);

console.log('Sidebar Monitor navigation regression test passed.');
