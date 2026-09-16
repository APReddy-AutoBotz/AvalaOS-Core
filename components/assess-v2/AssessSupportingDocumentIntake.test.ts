import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const source = readFileSync('components/assess-v2/AssessSupportingDocumentIntake.tsx', 'utf8');

test('native document state is fenced by the complete Assess scope', () => {
  assert.match(source, /tenantContext\.userId}:\$\{tenantContext\.organizationId}:\$\{tenantContext\.workspaceId}:\$\{tenantContext\.authorizationVersion}:\$\{processId}:\$\{caseId}:\$\{caseVersion/);
  assert.match(source, /const requestEpoch = useRef\(0\)/);
  assert.match(source, /const fileEpoch = useRef\(0\)/);
  assert.match(source, /expectedScope === activeScope\.current/);
  assert.match(source, /return \(\) => \{ requestEpoch\.current \+= 1; fileEpoch\.current \+= 1; \}/);
  assert.match(source, /const bytes = await file\.arrayBuffer\(\);\s+if \(!isCurrent\(\)\) return;/);
  assert.match(source, /assessDocumentMappingScope: \{/);
  assert.match(source, /caseId,\s+caseVersion,/);
  assert.match(source, /inputBundleId && inputBundleVersionId \? \{ inputBundleId, inputBundleVersionId \}/);
  assert.match(source, /load\(isCurrent, bundleToken\)/);
});

test('native mapping fails closed around manual edits and server authority', () => {
  for (const capability of ['assess.v2.read', 'assess.v2.draft.write', 'evidence.review', 'evidence.write', 'transcript.sources.manage', 'transcript.sources.read', 'transcript.assess.apply']) {
    assert.equal(source.includes(`'${capability}'`), true, `${capability} must be required`);
  }
  assert.match(source, /commonLocked = busy \|\| reloadRequired \|\| readOnly \|\| hasUnsavedChanges/);
  assert.match(source, /const uploadLocked = commonLocked \|\| uploadMissing\.length > 0/);
  assert.match(source, /const reviewLocked = commonLocked \|\| reviewMissing\.length > 0/);
  assert.match(source, /const applyLocked = commonLocked \|\| applyMissing\.length > 0/);
  assert.match(source, /projection\?\.documentMapping\.features\.enabled === true/);
  assert.match(source, /route\.capability === 'assess\.evidence\.extract' && route\.enabled && route\.availability === 'ready'/);
  assert.match(source, /COMMAND_OUTCOME_UNKNOWN/);
  assert.match(source, /Apply outcome is unknown\. Reload authoritative Assess state before retrying\./);
  assert.match(source, /projection\?\.capabilities\.includes\(capability\) === true/);
});

test('native mapping selects newest exact bundle history and restores edit focus', () => {
  assert.match(source, /inputBundleId === selectedBundle\?\.id && item\.inputBundleVersionId === selectedBundle\?\.versionSelector/);
  assert.match(source, /toSorted\(\(left, right\) => Date\.parse\(right\.updatedAt\) - Date\.parse\(left\.updatedAt\)\)\[0\]/);
  assert.match(source, /catalogs\.find\(item => item\.id === latestRun\?\.catalogId\)/);
  assert.match(source, /previews\.find\(item => item\.caseId === caseId/);
  assert.match(source, /latestRun\?\.projectionComplete === true/);
  assert.match(source, /latestPreviewCandidate\?\.projectionComplete === true/);
  assert.match(source, /manifest\.unresolvedConflictCount === previewUnresolvedCount/);
  assert.match(source, /previewManifest: latestPreview\.manifest/);
  assert.match(source, /latest preview projection is incomplete/);
  assert.doesNotMatch(source, /documentMapping\.runs\.filter\([^;]+\)\.at\(-1\)/);
  assert.doesNotMatch(source, /documentMapping\.previews\.filter\([^;]+\)\.at\(-1\)/);
  assert.match(source, /editRegionRef\.current\?\.querySelector<HTMLElement>/);
  assert.match(source, /button\.focus\(\{ preventScroll: true \}\)/);
});

test('mapping UI never asks users for internal targets or generic JSON', () => {
  assert.doesNotMatch(source, /Allowlisted target|target path|JSON editor|JSON\.parse\(event\.target\.value/);
  assert.match(source, /descriptor\.label/);
  assert.match(source, /descriptor\.contextLabel/);
  assert.match(source, /sourceAnchor\.safeExcerpt/);
  assert.match(source, /sourceAnchor\.locator/);
  assert.match(source, /latestRun\.warnings/);
  assert.match(source, /latestRun\.analyzedSources/);
  assert.match(source, /Source-specific parser disclosures/);
  for (const constructorType of ['primitive_constructor', 'asset_constructor', 'interaction_constructor', 'decision_constructor', 'exception_constructor']) {
    assert.equal(source.includes(`descriptor.valueType === '${constructorType}'`), true, `${constructorType} needs a typed editor`);
  }
  assert.match(source, /descriptor\.valueType === 'number'/);
  for (const safetyFact of ['highImpact', 'financialAction', 'untrustedContentWithTools']) {
    assert.equal(source.includes(safetyFact), true, `${safetyFact} requires an explicit typed review control`);
  }
  assert.match(source, /Missing facts are not treated as “No”/);
  assert.match(source, /value="">Review required/);
});

test('document analysis is one native governed effect and cannot mutate deterministic decisions', () => {
  assert.match(source, /enterpriseIntelligenceClient\.analyzeAssessDocuments/);
  assert.doesNotMatch(source, /extractTranscriptAssessBundle/);
  assert.match(source, /AI only proposes server-issued typed fields; it cannot calculate scores, approve, or change deterministic decisions\./);
  assert.match(source, /previewAssessDocumentMapping/);
  assert.match(source, /commitAssessDocumentMapping/);
});

test('resolved conflicts disclose the authoritative final value before apply', () => {
  assert.match(source, /Final resolved value/);
  assert.match(source, /formatValue\(conflict\.resolvedValue\)/);
});
