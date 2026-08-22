import assert from 'node:assert/strict';
import { createProductNavigationController } from './productNavigationController';

const controller = createProductNavigationController();
const hydration = controller.begin('hydrate');
assert.equal(controller.writeFor(hydration), 'replace');

const user = controller.begin('user');
assert.equal(controller.writeFor(user), 'push');

const stale = controller.begin('user');
const popstate = controller.begin('popstate');
assert.equal(controller.writeFor(stale), null);
assert.equal(controller.writeFor(popstate), 'replace');

const beforeRebind = controller.begin('user');
const rebind = controller.rebind();
assert.equal(controller.writeFor(beforeRebind), null);
assert.equal(controller.writeFor(rebind), 'replace');
