import fs from 'node:fs';

const required = [
  'services/assessV2/reviewDomain.ts',
  'services/assessV2ReviewClient.ts',
  'components/assess-v2/AssessV2ReviewWorkspace.tsx',
  'supabase/functions/_shared/assessV2ReviewCommand.ts',
  'supabase/migrations/20260720160000_pr1e_assess_v2_governed_review_handoff.sql',
];
for (const file of required) if (!fs.existsSync(file)) throw new Error(`PR1E_SOURCE_MISSING: ${file}`);
const joined = required.map(file => fs.readFileSync(file, 'utf8')).join('\n');
for (const token of [
  'assess.v2.review','assess.v2.evidence.attest','assess.v2.approve','assess.v2.govern.resolve','assess.v2.studio.handoff',
  'assessment_v2.review.assign','assessment_v2.evidence.attest','assessment_v2.review.resolve','assessment_v2.revision.start','assessment_v2.govern.resolve','assessment_v2.studio.handoff',
]) if (!joined.includes(token)) throw new Error(`PR1E_CONTRACT_MISSING: ${token}`);
const client = fs.readFileSync('services/assessV2ReviewClient.ts','utf8');
if (/approved\s*:|handoffPackage\s*:/.test(client)) throw new Error('PR1E_BROWSER_AUTHORITY_FORBIDDEN');
if (!/reviewerId: reviewer\.actorId/.test(client) || /reviewerId[^\n]*(input|trim|target\.value)/i.test(client)) throw new Error('PR1E_REVIEWER_SELECTION_NOT_PROJECTION_BOUND');
console.log('PR 1E source boundaries passed.');
