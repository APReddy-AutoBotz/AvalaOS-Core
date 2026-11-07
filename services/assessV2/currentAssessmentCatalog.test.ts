import { strict as assert } from 'assert';
import fs from 'node:fs';
import { buildCurrentAssessmentCatalog, presentCurrentAssessmentCatalogCount, presentCurrentAssessmentCatalogStatus, selectCurrentAssessmentCases, type CurrentAssessmentCaseSummary } from './currentAssessmentCatalog';

const current = (processId: string, status: CurrentAssessmentCaseSummary['status']): CurrentAssessmentCaseSummary => ({
  id: `case-${processId}`,
  processId,
  status,
  version: 3,
  updatedAt: '2026-11-07T00:00:00.000Z',
  hasCurrentDecision: status !== 'draft',
});

const catalog = buildCurrentAssessmentCatalog(
  ['draft-process', 'planning-process', 'review-process', 'new-process'],
  [current('draft-process', 'draft'), current('planning-process', 'planning_approved'), current('review-process', 'in_review')],
);

assert.deepEqual(catalog, [
  { processId: 'draft-process', statusLabel: 'Working draft', scored: false, inMotion: true },
  { processId: 'planning-process', statusLabel: 'Approved for planning', scored: true, inMotion: false },
  { processId: 'review-process', statusLabel: 'In review', scored: true, inMotion: true },
  { processId: 'new-process', statusLabel: 'Not started', scored: false, inMotion: false },
]);
assert.deepEqual(buildCurrentAssessmentCatalog(['only-current'], [
  current('historical-other-process', 'approved'),
  current('only-current', 'handed_off'),
]), [{ processId: 'only-current', statusLabel: 'Handed off', scored: true, inMotion: false }]);
assert.equal(presentCurrentAssessmentCatalogStatus('ready', undefined), 'Not started');
assert.equal(presentCurrentAssessmentCatalogStatus('loading', undefined), 'Checking current assessment');
assert.equal(presentCurrentAssessmentCatalogStatus('unavailable', catalog[0]), 'Current assessment unavailable');
assert.equal(presentCurrentAssessmentCatalogCount('unavailable', 4), '—');
assert.equal(buildCurrentAssessmentCatalog(['not-finalized'], [{
  ...current('not-finalized', 'approved'),
  hasCurrentDecision: false,
}])[0].scored, false, 'status alone does not establish a current decision pack');
const duplicateCases = [
  { ...current('duplicate', 'in_review'), id: 'newest', updatedAt: '2026-11-07T02:00:00.000Z' },
  { ...current('duplicate', 'draft'), id: 'older', updatedAt: '2026-11-07T01:00:00.000Z' },
];
assert.deepEqual(selectCurrentAssessmentCases(duplicateCases), [duplicateCases[0]],
  'duplicate current rows select the first row in the normal chooser order');
assert.deepEqual(buildCurrentAssessmentCatalog(['duplicate'], duplicateCases),
  [{ processId: 'duplicate', statusLabel: 'In review', scored: true, inMotion: true }]);

const catalogViewSource = fs.readFileSync('components/assess/ProcessCatalogView.tsx', 'utf8');
assert.match(catalogViewSource, /listCurrentAssessV2Cases\(tenantContext, displayedProcessIds\)/);
assert.match(catalogViewSource, /currentCatalog\.filter\(item => item\.scored\)/);
assert.match(catalogViewSource, /presentCurrentAssessmentCatalogStatus\(currentAssessmentState, currentCatalogByProcess\.get\(process\.id\)\)/);
assert.doesNotMatch(catalogViewSource, /const completedCount = displayedProcesses\.filter/);

console.log('current assessment catalog uses only the current Assess V2 case for badges and counts');
