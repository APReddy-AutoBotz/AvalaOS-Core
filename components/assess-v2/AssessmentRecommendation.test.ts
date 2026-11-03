import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync('components/assess-v2/AssessmentRecommendation.tsx', 'utf8');
assert.match(source, /buildAssessmentRecommendationModel\(decision\.inputSnapshot, decision\.outputSnapshot\)/);
assert.match(source, /Process recommendation/);
assert.match(source, /Review and approval status is recorded in the governed review section below\./);
assert.doesNotMatch(source, /recommendation is reviewer-ready|Evidence review and governance approval remain separate/);
assert.match(source, /Human judgment required/);
assert.match(source, /API use remains unproven/);
assert.match(source, /Alternatives/);
assert.match(source, /Process evidence gaps/);
assert.match(source, /Assumptions to review/);
assert.doesNotMatch(source, /schemaVersion|ruleSetVersion|inputHash|outputHash/);
console.log('Assess recommendation component contract tests passed.');
