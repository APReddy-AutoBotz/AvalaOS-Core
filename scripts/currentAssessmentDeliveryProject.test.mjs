import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const [migration, client, publicationContract, deliveryContract, review, app, connectedFixture, connectedJourney] = await Promise.all([
  readFile('supabase/migrations/20261103170102_current_assessment_delivery_project.sql', 'utf8'),
  readFile('services/assessV2/currentAssessmentProjectClient.ts', 'utf8'),
  readFile('services/productAcceptanceBridge/contracts.ts', 'utf8'),
  readFile('services/legacyDelivery/contracts.ts', 'utf8'),
  readFile('components/assess-v2/AssessV2ReviewWorkspace.tsx', 'utf8'),
  readFile('App.tsx', 'utf8'),
  readFile('scripts/enterpriseLifecyclePostgresFixture.mjs', 'utf8'),
  readFile('tests/browser/enterpriseLifecycleAcceptance/assessmentScenarioJourneys.ts', 'utf8'),
]);

assert.match(migration, /source_current_case_id/);
assert.match(migration, /source_current_decision_id/);
assert.match(migration, /source_current_govern_resolution_id/);
assert.match(migration, /source_assessment_id DROP NOT NULL/);
assert.match(migration, /project_row\.source_assessment_id IS NULL/);
assert.match(migration, /auth\.uid\(\) IS DISTINCT FROM p_actor_id/);
assert.match(migration, /ARRAY\['org\.admin','security\.manage','roles\.manage','project\.manage'\],p_authorization_version/);
assert.doesNotMatch(migration, /'project\.manage','studio\.artifacts\.publish'\],p_authorization_version/);
assert.match(migration, /fn regprocedure:='public\.legacy_delivery_apply_requirement_command/);
assert.match(migration, /fn regprocedure:='public\.legacy_delivery_query/);
assert.doesNotMatch(migration, /fn regprocedure:='public\.studio_delivery_apply_requirement_command/);
assert.match(migration, /sourceAssessmentCaseId',p_row\.source_case_id/);
assert.match(migration, /sourceAssessmentDecisionId',p_row\.source_decision_id/);
assert.match(migration, /project_outcome:='advanced'/);
assert.match(migration, /supersedes_decision_id IS DISTINCT FROM project_row\.source_current_decision_id/);
assert.doesNotMatch(migration, /INSERT INTO public\.assessments/);
assert.match(client, /assess_v2_current_delivery_project_ensure/);
assert.match(client, /current-assessment-delivery-project\.v1/);
assert.match(client, /readEnterpriseErrorCode/);
assert.match(publicationContract, /sourceAssessmentId: string \| null/);
assert.match(publicationContract, /row\.sourceAssessmentId === null && !hasCurrentLineage/);
assert.match(deliveryContract, /sourceAssessmentId: string \| null/);
assert.match(deliveryContract, /row\.sourceAssessmentId === null && !hasCurrentLineage/);
assert.match(review, /Open Studio for this process/);
assert.match(app, /await deliveryRefresh\(\)/);
assert.match(app, /View\.DOCS_FORGE/);
assert.match(connectedFixture, /preseedDeliveryProject \? deliveryProjectId : null/);
assert.match(connectedFixture, /assess_v2_current_delivery_project_ensure/);
assert.match(connectedFixture, /current-assessment-project-source/);
assert.match(connectedJourney, /preseedDeliveryProject: false/);
assert.match(connectedJourney, /Open Studio for this process/);
assert.match(connectedJourney, /compatibilityAssessmentCount\)\.toBe\(0\)/);
assert.match(connectedJourney, /Import 1 Item/);
assert.match(connectedJourney, /Delivery work board/);
assert.match(connectedJourney, /sourceAssessmentId: null/);
console.log('Current assessment project contract: exact V2 lineage, normal Studio navigation, and no compatibility assessment.');
