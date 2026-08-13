import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const workflow = await readFile('.github/workflows/exhaustive-acceptance-dispatch-bridge.yml', 'utf8');

assert.match(workflow, /^name: Exhaustive Acceptance Dispatch Bridge$/mu);
assert.match(workflow, /^on:\n  create:$/mu);
assert.match(workflow, /^permissions:\n  contents: read\n  actions: write$/mu);
assert.match(workflow, /github\.ref_type == 'branch'/u);
assert.match(workflow, /startsWith\(github\.event\.ref, 'exhaustive-acceptance-dispatch--'\)/u);
assert.match(workflow, /github\.actor == 'APReddy-AutoBotz'/u);
assert.match(workflow, /prefix='exhaustive-acceptance-dispatch--'/u);
assert.match(workflow, /\^\[0-9a-f\]\{24\}\$/u);
assert.match(workflow, /git fetch --quiet origin main/u);
assert.match(workflow, /\$RELEASE_SHA" != "\$\(git rev-parse origin\/main\)/u);
assert.match(workflow, /--arg ref "\$CREATED_REF"/u);
assert.match(workflow, /--arg release_sha "\$RELEASE_SHA"/u);
assert.match(workflow, /--arg netlify_deploy_id "\$DEPLOYMENT_ID"/u);
assert.match(workflow, /--arg hosted_url 'https:\/\/avalaos-pilot\.netlify\.app'/u);
assert.match(workflow, /actions\/workflows\/exhaustive-acceptance\.yml\/dispatches/u);
assert.doesNotMatch(workflow, /avalaos\.com/u);
assert.doesNotMatch(workflow, /customer_data|real_provider|production_authorized/iu);

const validNames = [
  'exhaustive-acceptance-dispatch--0123456789abcdef01234567',
  'exhaustive-acceptance-dispatch--abcdefabcdefabcdefabcdef',
];
const invalidNames = [
  'exhaustive-acceptance-dispatch--0123456789abcdef0123456',
  'exhaustive-acceptance-dispatch--0123456789abcdef012345678',
  'exhaustive-acceptance-dispatch--0123456789abcdef0123456g',
  'exhaustive-acceptance-dispatch--0123456789abcdef01234567--extra',
  'hosted-pilot-dispatch--0123456789abcdef01234567',
];
const branchPattern = /^exhaustive-acceptance-dispatch--[0-9a-f]{24}$/;
for (const name of validNames) assert.match(name, branchPattern);
for (const name of invalidNames) assert.doesNotMatch(name, branchPattern);

console.log('Exhaustive acceptance dispatch bridge regression checks passed.');
