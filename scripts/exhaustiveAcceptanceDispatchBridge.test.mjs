import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const bridge = await readFile('.github/workflows/exhaustive-acceptance-dispatch-bridge.yml', 'utf8');
const acceptance = await readFile('.github/workflows/exhaustive-acceptance.yml', 'utf8');

assert.match(bridge, /^name: Exhaustive Acceptance Dispatch Bridge$/mu);
assert.match(bridge, /^on:\n  create:$/mu);
assert.match(bridge, /^permissions:\n  contents: read$/mu);
assert.match(bridge, /github\.ref_type == 'branch'/u);
assert.match(bridge, /startsWith\(github\.event\.ref, 'exhaustive-acceptance-dispatch--'\)/u);
assert.match(bridge, /github\.actor == 'APReddy-AutoBotz'/u);
assert.match(bridge, /prefix='exhaustive-acceptance-dispatch--'/u);
assert.match(bridge, /\^\[0-9a-f\]\{24\}\$/u);
assert.match(bridge, /git fetch --quiet origin main/u);
assert.match(bridge, /\$RELEASE_SHA" != "\$\(git rev-parse origin\/main\)/u);
assert.match(bridge, /release_sha=\$RELEASE_SHA/u);
assert.match(bridge, /netlify_deploy_id=\$DEPLOYMENT_ID/u);
assert.match(bridge, /uses: \.\/\.github\/workflows\/exhaustive-acceptance\.yml/u);
assert.match(bridge, /hosted_url: https:\/\/avalaos-pilot\.netlify\.app/u);
assert.doesNotMatch(bridge, /actions\/workflows\/exhaustive-acceptance\.yml\/dispatches/u);
assert.doesNotMatch(bridge, /Authorization: Bearer|GH_TOKEN/u);
assert.doesNotMatch(bridge, /avalaos\.com/u);

assert.match(acceptance, /^  workflow_call:$/mu);
assert.match(acceptance, /^  pull_request:$/mu);
assert.doesNotMatch(acceptance, /^  workflow_dispatch:$/mu);

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

console.log('Exhaustive acceptance controller bridge regression checks passed.');
