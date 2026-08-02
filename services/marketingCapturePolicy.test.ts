import assert from 'node:assert/strict';
import {
  isApplicationPortfolioMarketingCapture,
  isProductMarketingCapture,
  isStudioMarketingCapture,
  preserveMarketingCaptureSearch,
  resolveMarketingCapture,
} from './marketingCapturePolicy';

const production = { development: false, test: false, dedicatedCaptureBuild: false };
const development = { ...production, development: true };
const captureBuild = { ...production, dedicatedCaptureBuild: true };

const ignored = resolveMarketingCapture('?capture=product', production);
assert.equal(ignored.enabled, false);
assert.equal(ignored.reason, 'production_disabled');
assert.equal(isProductMarketingCapture(ignored), false);

const product = resolveMarketingCapture('?capture=product', captureBuild);
assert.equal(product.enabled, true);
assert.equal(product.readOnly, true);
assert.equal(isProductMarketingCapture(product), true);
assert.equal(isStudioMarketingCapture(product), true);
assert.equal(isApplicationPortfolioMarketingCapture(product), true);
assert.equal(preserveMarketingCaptureSearch('?view=dashboard', product), '?view=dashboard&capture=product');

const studio = resolveMarketingCapture('?capture=studio', development);
assert.equal(isStudioMarketingCapture(studio), true);
assert.equal(isApplicationPortfolioMarketingCapture(studio), false);
assert.equal(resolveMarketingCapture('?capture=unknown', development).reason, 'unsupported_scenario');
assert.equal(resolveMarketingCapture('', development).reason, 'not_requested');

console.log('marketing capture policy: 13 production-isolation, read-only, and scenario assertions passed');
