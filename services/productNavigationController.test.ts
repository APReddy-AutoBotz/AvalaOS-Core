import assert from 'node:assert/strict';
import { canApplyDefaultNavigation, createProductNavigationController } from './productNavigationController';

assert.equal(canApplyDefaultNavigation({
  explicitNavigationIntent: false,
  settlement: 'idle',
}), true, 'an ordinary session may apply its authority default');
assert.equal(canApplyDefaultNavigation({
  explicitNavigationIntent: true,
  settlement: 'awaiting-classification',
}), false, 'an explicit durable URL owns initialization until it is classified');
assert.equal(canApplyDefaultNavigation({
  explicitNavigationIntent: true,
  settlement: 'settling-rejected',
}), false, 'classification must not let an authority default race the pending safe commit');
assert.equal(canApplyDefaultNavigation({
  explicitNavigationIntent: true,
  settlement: 'settled-rejected',
}), false, 'a rejected durable tuple must not be resurrected by an authority default');

const rejected = createProductNavigationController(true);
assert.equal(rejected.needsClassification(), true);
const rejectedSettlement = rejected.beginSettlement(false);
assert.equal(rejected.settlementPending(), true);
assert.equal(rejected.commitSettlement(rejectedSettlement), true);
assert.equal(rejected.settlement(), 'settled-rejected');
assert.equal(rejected.commitSettlement(rejectedSettlement), false, 'replayed settlement completion is harmless');
rejected.begin('user');
assert.equal(rejected.settlement(), 'idle', 'explicit reselection restores ordinary navigation writes');
assert.equal(canApplyDefaultNavigation({
  explicitNavigationIntent: true,
  settlement: rejected.settlement(),
}), true, 'a later authority identity may apply its server-derived default after the durable epoch is superseded');

const ordered = createProductNavigationController(true);
const slowInvalid = ordered.beginSettlement(false);
const fastValid = ordered.beginSettlement(true, 'popstate');
assert.equal(ordered.commitSettlement(slowInvalid), false, 'a stale invalid completion cannot win a newer epoch');
assert.equal(ordered.commitSettlement(fastValid), true);
assert.equal(ordered.settlement(), 'settled-valid');

const identitySwitch = createProductNavigationController(true);
const formerIdentity = identitySwitch.beginSettlement(true);
identitySwitch.rebind();
assert.equal(identitySwitch.commitSettlement(formerIdentity), false, 'an old identity cannot complete durable reconstruction after a rebind');
assert.equal(identitySwitch.settlement(), 'idle', 'the new server-derived identity may establish its own default');

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
