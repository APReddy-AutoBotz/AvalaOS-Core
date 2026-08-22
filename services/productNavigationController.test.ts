import assert from 'node:assert/strict';
import { canApplyDefaultNavigation, createProductNavigationController } from './productNavigationController';

assert.equal(canApplyDefaultNavigation({
  explicitNavigationIntent: false,
  navigationHydrated: false,
  navigationSettlementPending: false,
}), true, 'an ordinary session may apply its authority default');
assert.equal(canApplyDefaultNavigation({
  explicitNavigationIntent: true,
  navigationHydrated: false,
  navigationSettlementPending: false,
}), false, 'an explicit durable URL owns initialization until it is classified');
assert.equal(canApplyDefaultNavigation({
  explicitNavigationIntent: true,
  navigationHydrated: true,
  navigationSettlementPending: true,
}), false, 'classification must not let an authority default race the pending safe commit');
assert.equal(canApplyDefaultNavigation({
  explicitNavigationIntent: true,
  navigationHydrated: true,
  navigationSettlementPending: false,
}), true, 'authority defaults may run again only after durable settlement completes');

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
