// Independent deterministic ownership anchors. Changes require source-contract review.
export const PROOF_SOURCE_ANCHORS = Object.freeze([
  {
    "anchorId": "hosted-sandbox-route",
    "sourceReference": "services/hostedSandboxRoute.ts",
    "selector": "export const HOSTED_SANDBOX_ROUTE = '/sandbox';"
  },
  {
    "anchorId": "application-shell",
    "sourceReference": "App.tsx",
    "selector": "function App() {"
  },
  {
    "anchorId": "sandbox-main-focus-target",
    "sourceReference": "App.tsx",
    "selector": "<main id=\"app-main\" tabIndex={0} className=\"view-transition-enter view-transition-enter-active"
  },
  {
    "anchorId": "sandbox-readable-screen-motion",
    "sourceReference": "index.css",
    "selector": "@keyframes kp-screen-in {\n  from {\n    transform: translateY(8px);\n  }\n  to {\n    transform: translateY(0);\n  }\n}"
  },
  {
    "anchorId": "sandbox-home-contrast-target",
    "sourceReference": "components/shared/CustomDashboardView.tsx",
    "selector": "<div className=\"av-stat-strip\"><p className=\"av-eyebrow\">Open work</p>"
  },
  {
    "anchorId": "sandbox-opaque-contrast-surface",
    "sourceReference": "index.css",
    "selector": ".av-surface,\n.av-public-panel,\n.av-stat-strip {\n  border: 1px solid var(--av-color-border);\n  border-radius: var(--av-radius-panel);\n  background: var(--av-color-surface);\n  box-shadow: var(--av-shadow-xs);\n}"
  },
  {
    "anchorId": "sandbox-contrast-foreground-token",
    "sourceReference": "index.css",
    "selector": ".av-eyebrow {\n  color: var(--av-color-text-subtle);\n  font-size: 0.68rem;\n  font-weight: 700;\n  letter-spacing: 0.16em;\n  line-height: 1.25;\n  text-transform: uppercase;\n}"
  },
  {
    "anchorId": "assess-v1-scoring",
    "sourceReference": "services/scoringEngine.ts",
    "selector": "export const CURRENT_SCORE_VERSION = 'assess-core-2026-05';"
  },
  {
    "anchorId": "application-portfolio",
    "sourceReference": "services/assessV2/applicationPortfolio.ts",
    "selector": "export const APPLICATION_PORTFOLIO_MODEL_VERSION = 'assess-v2-application-portfolio-2026-07';"
  },
  {
    "anchorId": "application-portfolio-acceptance-harness",
    "sourceReference": "scripts/testPr1gMigrations.mjs",
    "selector": "await acceptanceScenario('APPS-001', 'authorized application create with receipt and audit'"
  },
  {
    "anchorId": "application-portfolio-acceptance-evidence",
    "sourceReference": "scripts/applicationPortfolioAcceptanceEvidence.mjs",
    "selector": "export const APPLICATION_PORTFOLIO_TEST_IDS"
  },
  {
    "anchorId": "application-portfolio-pr1b-base",
    "sourceReference": "supabase/migrations/20260712120000_pr1b_identity_rbac_rls_assess.sql",
    "selector": "CREATE TABLE IF NOT EXISTS public.assess_command_receipts"
  },
  {
    "anchorId": "application-portfolio-pr1g-migration",
    "sourceReference": "supabase/migrations/20260722120000_pr1g_application_portfolio.sql",
    "selector": "CREATE OR REPLACE FUNCTION public.pr1g_execute_application_command("
  },
  {
    "anchorId": "application-portfolio-pr1g-authority-correction",
    "sourceReference": "supabase/migrations/20260726120000_pr1g_authority_concurrency_correction.sql",
    "selector": "CREATE OR REPLACE FUNCTION public.pr1g_execute_application_command("
  },
  {
    "anchorId": "application-portfolio-pr1b-fixture-authority-fix",
    "sourceReference": "supabase/migrations/20260727090000_pr1b_membership_role_scope_trigger_forward_fix.sql",
    "selector": "CREATE OR REPLACE FUNCTION public.pr1b_enforce_organization_membership_role_scope()"
  },
  {
    "anchorId": "assess-review-domain",
    "sourceReference": "services/assessV2/reviewDomain.ts",
    "selector": "export const ASSESS_V2_REVIEW_VERSION = 'assess-v2-review-2026-07' as const;"
  },
  {
    "anchorId": "studio-artifact-contracts",
    "sourceReference": "services/studioArtifacts/contracts.ts",
    "selector": "export const STUDIO_ARTIFACT_TYPES = ['brd', 'frd', 'pdd'] as const;"
  },
  {
    "anchorId": "delivery-workflow-policy",
    "sourceReference": "services/deliveryWorkflowPolicy.ts",
    "selector": "export type DeliveryWorkflowDecisionStatus = 'allowed' | 'blocked' | 'decision_pending';"
  },
  {
    "anchorId": "docs-delivery-lineage",
    "sourceReference": "services/docsToDeliveryLineage.ts",
    "selector": "export const buildDocsToDeliveryLineage = ({"
  },
  {
    "anchorId": "admin-workbench",
    "sourceReference": "services/adminWorkbenchModel.ts",
    "selector": "export const ADMIN_WORKBENCH_SECTIONS: readonly AdminSectionDefinition[] = ["
  },
  {
    "anchorId": "trust-assurance",
    "sourceReference": "services/trustAssurance/domain.ts",
    "selector": "export const deriveEffectiveProofStatus = ("
  },
  {
    "anchorId": "trust-acceptance-harness",
    "sourceReference": "scripts/testTrustAssurancePostgres.mjs",
    "selector": "TRUST-001 exact reviewed evidence link"
  },
  {
    "anchorId": "trust-acceptance-evidence",
    "sourceReference": "scripts/trustAcceptanceEvidence.mjs",
    "selector": "export const TRUST_TEST_IDS"
  },
  {
    "anchorId": "trust-assurance-migration",
    "sourceReference": "supabase/migrations/20260808190000_trust_assurance_evidence_hub.sql",
    "selector": "CREATE FUNCTION public.trust_assurance_command"
  },
  {
    "anchorId": "ai-runtime-mode",
    "sourceReference": "services/aiMode.ts",
    "selector": "export const getAiExecutionPolicy = ({"
  },
  {
    "anchorId": "enterprise-intelligence",
    "sourceReference": "services/enterpriseIntelligence.ts",
    "selector": "export const ENTERPRISE_INTELLIGENCE_SCHEMA_VERSION = 'enterprise-intelligence-1';"
  },
  {
    "anchorId": "handoff-ledger",
    "sourceReference": "services/handoffLedgerService.ts",
    "selector": "export function useHandoffLedger() {"
  },
  {
    "anchorId": "persistence-transition",
    "sourceReference": "services/persistenceTransition.ts",
    "selector": "export const persistBeforeCommit = async <T>("
  },
  {
    "anchorId": "pilot-operations-postgres",
    "sourceReference": "scripts/testPilotOperationsPostgres.mjs",
    "selector": "['pilot-operations-postgres--responseLossExactReplayVerified',responseLossExactReplayVerified],"
  },
  {
    "anchorId": "hosted-exact-run-scenarios",
    "sourceReference": "supabase/migrations/20260823090000_hosted_evidence_family_provenance_contract.sql",
    "selector": "CREATE FUNCTION public.hosted_pilot_execute_assertion_scenario("
  },
  {
    "anchorId": "assess-v2-conflict-harness",
    "sourceReference": "scripts/testPr1dMigrations.mjs",
    "selector": "const dbName = 'avalaos_pr1d_authority_test';"
  },
  {
    "anchorId": "assess-v2-conflict-evidence",
    "sourceReference": "scripts/assessV2AcceptanceEvidence.mjs",
    "selector": "export const ASSESS_V2_TEST_IDS"
  },
  {
    "anchorId": "assess-v2-pr1c",
    "sourceReference": "supabase/migrations/20260713120000_pr1c_enterprise_assess_ui_govern_studio_handoff.sql",
    "selector": "CREATE TABLE IF NOT EXISTS public.assessment_studio_handoffs ("
  },
  {
    "anchorId": "assess-v2-pr1d",
    "sourceReference": "supabase/migrations/20260714120000_pr1d_assess_v2_decision_intelligence.sql",
    "selector": "CREATE TABLE public.assess_v2_cases("
  },
  {
    "anchorId": "assess-v2-integrity",
    "sourceReference": "supabase/migrations/20260715120000_pr1d_decision_integrity_correction.sql",
    "selector": "CREATE OR REPLACE FUNCTION public.pr1d_upsert_assess_v2_draft("
  },
  {
    "anchorId": "assess-v2-attestation",
    "sourceReference": "supabase/migrations/20260717120000_pr1d_evidence_attestation_boundary.sql",
    "selector": "CREATE OR REPLACE FUNCTION public.pr1d_reject_author_attestation()"
  },
  {
    "anchorId": "assess-v2-fact-validation",
    "sourceReference": "supabase/migrations/20260719130000_pr1d_author_fact_validation.sql",
    "selector": "CREATE OR REPLACE FUNCTION public.pr1d_upsert_assess_v2_draft("
  },
  {
    "anchorId": "assess-v2-source-hardening",
    "sourceReference": "supabase/migrations/20260720100000_pr1d_fact_source_and_create_hash_hardening.sql",
    "selector": "CREATE OR REPLACE FUNCTION public.pr1d_author_fact_valid("
  },
  {
    "anchorId": "assess-v2-visibility",
    "sourceReference": "supabase/migrations/20260720120000_pr1d_soft_delete_visibility_hardening.sql",
    "selector": "CREATE POLICY pr1d_cases_read"
  },
  {
    "anchorId": "studio-acceptance-teststudioacceptancepostgres-mjs",
    "sourceReference": "scripts/testStudioAcceptancePostgres.mjs",
    "selector": "import assert from 'node:assert/strict';"
  },
  {
    "anchorId": "studio-acceptance-studioacceptanceevidence-mjs",
    "sourceReference": "scripts/studioAcceptanceEvidence.mjs",
    "selector": "export const STUDIO_ACCEPTANCE_TEST_IDS = ["
  },
  {
    "anchorId": "studio-acceptance-studioartifactpostgresfixture-mjs",
    "sourceReference": "scripts/studioArtifactPostgresFixture.mjs",
    "selector": "import assert from 'node:assert/strict';"
  },
  {
    "anchorId": "studio-acceptance-studioprivateartifactpostgresfixture-mjs",
    "sourceReference": "scripts/studioPrivateArtifactPostgresFixture.mjs",
    "selector": "import assert from 'node:assert/strict';"
  },
  {
    "anchorId": "studio-acceptance-syntheticaiterminaljournalmigrationtestguard-mjs",
    "sourceReference": "scripts/syntheticAiTerminalJournalMigrationTestGuard.mjs",
    "selector": "export const SYNTHETIC_AI_TERMINAL_JOURNAL_MIGRATION ="
  },
  {
    "anchorId": "studio-acceptance-20260727120000-studio-governed-artifact-authority-sql",
    "sourceReference": "supabase/migrations/20260727120000_studio_governed_artifact_authority.sql",
    "selector": "CREATE OR REPLACE FUNCTION public.studio_reject_immutable()"
  },
  {
    "anchorId": "studio-acceptance-20260729163251-studio-private-artifact-authority-sql",
    "sourceReference": "supabase/migrations/20260729163251_studio_private_artifact_authority.sql",
    "selector": "CREATE OR REPLACE FUNCTION public.studio_private_reject_immutable()"
  },
  {
    "anchorId": "studio-acceptance-20260730190000-pr217-studio-private-artifact-runtime-forward-fix-sql",
    "sourceReference": "supabase/migrations/20260730190000_pr217_studio_private_artifact_runtime_forward_fix.sql",
    "selector": "CREATE OR REPLACE FUNCTION public.studio_private_state_timestamp()"
  },
  {
    "anchorId": "studio-acceptance-20260828120000-governed-multisource-studio-pr-b-sql",
    "sourceReference": "supabase/migrations/20260828120000_governed_multisource_studio_pr_b.sql",
    "selector": "CREATE OR REPLACE FUNCTION public.studio_pr_b_json_structure_safe(value jsonb)"
  },
  {
    "anchorId": "govern-acceptance-testgovernacceptancepostgres-mjs",
    "sourceReference": "scripts/testGovernAcceptancePostgres.mjs",
    "selector": "import assert from 'node:assert/strict';"
  },
  {
    "anchorId": "govern-acceptance-governacceptanceevidence-mjs",
    "sourceReference": "scripts/governAcceptanceEvidence.mjs",
    "selector": "export const GOVERN_ACCEPTANCE_TEST_IDS = ["
  },
  {
    "anchorId": "govern-acceptance-20260720160000-pr1e-assess-v2-governed-review-handoff-sql",
    "sourceReference": "supabase/migrations/20260720160000_pr1e_assess_v2_governed_review_handoff.sql",
    "selector": "CREATE OR REPLACE FUNCTION public.pr1e_can_read_lineage(p_org uuid,p_workspace uuid,p_case uuid,p_decision uuid)"
  },
  {
    "anchorId": "govern-acceptance-20260923142120-pr1e-govern-control-alias-binding-sql",
    "sourceReference": "supabase/migrations/20260923142120_pr1e_govern_control_alias_binding.sql",
    "selector": "  new_expression text := 'SELECT COALESCE(jsonb_agg(required.control ORDER BY required.control->>''controlId''),''[]'') INTO v_required_controls FROM (';"
  },
  {
    "anchorId": "ei-acceptance-testenterpriseintelligenceacceptancepostgres-mjs",
    "sourceReference": "scripts/testEnterpriseIntelligenceAcceptancePostgres.mjs",
    "selector": "import assert from 'node:assert/strict';"
  },
  {
    "anchorId": "ei-acceptance-enterpriseintelligenceacceptanceevidence-mjs",
    "sourceReference": "scripts/enterpriseIntelligenceAcceptanceEvidence.mjs",
    "selector": "export const EI_ACCEPTANCE_TEST_IDS = ['EI-001', 'EI-002', 'EI-003', 'EI-004', 'EI-005'];"
  },
  {
    "anchorId": "ei-acceptance-enterpriseintelligenceacceptanceparser-test-ts",
    "sourceReference": "scripts/enterpriseIntelligenceAcceptanceParser.test.ts",
    "selector": "import assert from 'node:assert/strict';"
  },
  {
    "anchorId": "ei-acceptance-enterpriseintelligencepostgresfixture-mjs",
    "sourceReference": "scripts/enterpriseIntelligencePostgresFixture.mjs",
    "selector": "import assert from 'node:assert/strict';"
  },
  {
    "anchorId": "ei-acceptance-supabase-functions-shared-enterpriseintelligencecommand-ts",
    "sourceReference": "supabase/functions/_shared/enterpriseIntelligenceCommand.ts",
    "selector": "export const isRecoverableEnterpriseCommandError = (error: unknown): error is RecoverableEnterpriseCommandError => ("
  },
  {
    "anchorId": "ei-acceptance-supabase-functions-shared-enterpriseintelligenceingestion-ts",
    "sourceReference": "supabase/functions/_shared/enterpriseIntelligenceIngestion.ts",
    "selector": "export const MAX_EVIDENCE_BYTES = 12_000_000;"
  },
  {
    "anchorId": "ei-acceptance-20260804120000-enterprise-intelligence-authority-sql",
    "sourceReference": "supabase/migrations/20260804120000_enterprise_intelligence_authority.sql",
    "selector": "CREATE OR REPLACE FUNCTION public.enterprise_command_runtime_area("
  },
  {
    "anchorId": "ei-acceptance-20260805140000-enterprise-intelligence-ready-review-corrections-sql",
    "sourceReference": "supabase/migrations/20260805140000_enterprise_intelligence_ready_review_corrections.sql",
    "selector": "CREATE OR REPLACE FUNCTION public.enterprise_provider_route_role_guard()"
  },
  {
    "anchorId": "ei-acceptance-20260805130000-provider-secret-write-intent-recovery-sql",
    "sourceReference": "supabase/migrations/20260805130000_provider_secret_write_intent_recovery.sql",
    "selector": "CREATE OR REPLACE FUNCTION public.enterprise_ai_plan_command("
  },
  {
    "anchorId": "ei-acceptance-20260916181916-assess-document-xlsx-ingestion-authority-sql",
    "sourceReference": "supabase/migrations/20260916181916_assess_document_xlsx_ingestion_authority.sql",
    "selector": "CREATE OR REPLACE FUNCTION public.enterprise_source_version_derive()"
  },
  {
    "anchorId": "ei-acceptance-20261008022445-enterprise-evidence-canonical-size-limit-sql",
    "sourceReference": "supabase/migrations/20261008022445_enterprise_evidence_canonical_size_limit.sql",
    "selector": "DO $source_size_limit$"
  },
  {
    "anchorId": "ei-acceptance-govern-immutable-action-authority",
    "sourceReference": "supabase/migrations/20261009162752_govern_immutable_action_authority.sql",
    "selector": "DO $govern_action_authority$"
  },
  {
    "anchorId": "legacy-delivery-legacyDeliveryAuthorityPostgres-mjs",
    "sourceReference": "scripts/legacyDeliveryAuthorityPostgres.mjs",
    "selector": "export async function runLegacyDeliveryAuthorityPostgres"
  },
  {
    "anchorId": "legacy-delivery-legacyDeliveryPostgresFixture-mjs",
    "sourceReference": "scripts/legacyDeliveryPostgresFixture.mjs",
    "selector": "export const LEGACY_DELIVERY_FIXTURE_VERSION"
  },
  {
    "anchorId": "legacy-delivery-legacyDeliveryAcceptanceEvidence-mjs",
    "sourceReference": "scripts/legacyDeliveryAcceptanceEvidence.mjs",
    "selector": "export const LEGACY_DELIVERY_ACCEPTANCE_TEST_IDS"
  },
  {
    "anchorId": "legacy-delivery-deliveryPolicy-ts",
    "sourceReference": "services/deliveryPolicy.ts",
    "selector": "export const canCreateDeliveryTask"
  },
  {
    "anchorId": "legacy-delivery-20260607152500-m5-2g-a-delivery-work-items-authority-sql",
    "sourceReference": "supabase/migrations/20260607152500_m5_2g_a_delivery_work_items_authority.sql",
    "selector": "CREATE TABLE IF NOT EXISTS delivery_work_items ("
  },
  {
    "anchorId": "legacy-delivery-20261010025331-legacy-delivery-authority-sql",
    "sourceReference": "supabase/migrations/20261010025331_legacy_delivery_authority.sql",
    "selector": "CREATE OR REPLACE FUNCTION public.legacy_delivery_apply_command("
  },
  {
    "anchorId": "authenticated-controls-loader",
    "sourceReference": "scripts/authenticatedControlsProductionLoader.mjs",
    "selector": "export const createAuthenticatedControlsProductionLoader"
  },
  {
    "anchorId": "ei-production-query",
    "sourceReference": "supabase/functions/_shared/enterpriseIntelligenceQuery.ts",
    "selector": "export const handleEnterpriseIntelligenceQuery"
  },
  {
    "anchorId": "tenant-authority",
    "sourceReference": "supabase/functions/_shared/tenantAuthority.ts",
    "selector": "export const resolveTenantAuthority"
  },
  {
    "anchorId": "authenticated-scripts-authenticatedacceptancecases-mjs",
    "sourceReference": "scripts/authenticatedAcceptanceCases.mjs",
    "selector": "export const AUTHENTICATED_ACCEPTANCE_PROJECTS = Object.freeze(['desktop-chromium', 'pixel-7-chromium']);"
  },
  {
    "anchorId": "authenticated-scripts-authenticatedacceptanceprofile-mjs",
    "sourceReference": "scripts/authenticatedAcceptanceProfile.mjs",
    "selector": "export const AUTHENTICATED_HOSTED_PROFILE_SCHEMA = 'hosted-authenticated-synthetic-profile-v1';"
  },
  {
    "anchorId": "authenticated-scripts-authenticatedacceptanceevidence-mjs",
    "sourceReference": "scripts/authenticatedAcceptanceEvidence.mjs",
    "selector": "export function validateAuthenticatedAcceptanceManifest(manifest, expected, catalog) {"
  },
  {
    "anchorId": "authenticated-scripts-enterpriselifecyclepostgresfixture-mjs",
    "sourceReference": "scripts/enterpriseLifecyclePostgresFixture.mjs",
    "selector": "export const validateEnterpriseLifecycleDatabaseUrl = value => {"
  },
  {
    "anchorId": "authenticated-tests-browser-enterpriselifecycleacceptance-enterpriselifecycleacceptance-spec-ts",
    "sourceReference": "tests/browser/enterpriseLifecycleAcceptance/enterpriseLifecycleAcceptance.spec.ts",
    "selector": "test.describe.configure({ mode: 'serial' });"
  },
  {
    "anchorId": "authenticated-supabase-migrations-20261010051100-authenticated-studio-delivery-outcome-monitor-sql",
    "sourceReference": "supabase/migrations/20261010051100_authenticated_studio_delivery_outcome_monitor.sql",
    "selector": "CREATE TABLE public.studio_delivery_workspace_controls("
  },
  {
    "anchorId": "authenticated-supabase-migrations-20261010051413-authenticated-process-update-authority-sql",
    "sourceReference": "supabase/migrations/20261010051413_authenticated_process_update_authority.sql",
    "selector": "CREATE TABLE IF NOT EXISTS public.process_update_workspace_controls("
  },
  {
    "anchorId": "authenticated-services-processupdatecontract-ts",
    "sourceReference": "services/processUpdateContract.ts",
    "selector": "export const PROCESS_UPDATE_CAPABILITY = 'assess.process.update' as const;"
  },
  {
    "anchorId": "authenticated-services-processupdateclient-ts",
    "sourceReference": "services/processUpdateClient.ts",
    "selector": "export const defaultProcessUpdateTransport: ProcessUpdateTransport = {"
  },
  {
    "anchorId": "authenticated-supabase-functions-shared-processupdatecommand-ts",
    "sourceReference": "supabase/functions/_shared/processUpdateCommand.ts",
    "selector": "export const executeProcessUpdateRequest = async (request: Request, body: unknown, dependencies: ProcessUpdateDependencies) => {"
  },
  {
    "anchorId": "authenticated-services-productacceptancebridge-contracts-ts",
    "sourceReference": "services/productAcceptanceBridge/contracts.ts",
    "selector": "export const STUDIO_DELIVERY_COMMAND_SCHEMA_VERSION = 'studio-delivery-command.v1' as const;"
  },
  {
    "anchorId": "authenticated-services-productacceptancebridge-client-ts",
    "sourceReference": "services/productAcceptanceBridge/client.ts",
    "selector": "export const studioDeliveryDefaultTransport: StudioDeliveryTransport = {"
  },
  {
    "anchorId": "authenticated-supabase-functions-shared-studiodeliverycommand-ts",
    "sourceReference": "supabase/functions/_shared/studioDeliveryCommand.ts",
    "selector": "export const handleStudioDeliveryCommand = async (request: Request, dependencies: StudioDeliveryCommandDependencies): Promise<Response> => {"
  },
  {
    "anchorId": "authenticated-supabase-functions-shared-studiodeliveryoutcomequery-ts",
    "sourceReference": "supabase/functions/_shared/studioDeliveryOutcomeQuery.ts",
    "selector": "export const handleStudioDeliveryOutcomeQuery = async (request: Request, dependencies: StudioDeliveryOutcomeQueryDependencies): Promise<Response> => {"
  },
  {
    "anchorId": "authenticated-scripts-authenticatedcontrolsfixture-mjs",
    "sourceReference": "scripts/authenticatedControlsFixture.mjs",
    "selector": "export const createAuthenticatedControlsFixture = ({"
  },
  {
    "anchorId": "authenticated-scripts-authenticatedcontrolsacceptance-mjs",
    "sourceReference": "scripts/authenticatedControlsAcceptance.mjs",
    "selector": "export const AUTHENTICATED_CONTROL_CASE_IDS = Object.freeze(["
  },
  {
    "anchorId": "authenticated-scripts-authenticatedcontrolspostgresadapter-mjs",
    "sourceReference": "scripts/authenticatedControlsPostgresAdapter.mjs",
    "selector": "export const createAuthenticatedControlsPostgresAdapter = async ({"
  },
  {
    "anchorId": "authenticated-tests-browser-authenticatedcontrolsacceptance-ts",
    "sourceReference": "tests/browser/authenticatedControlsAcceptance.ts",
    "selector": "export async function observeAuthenticatedAdminControls("
  }
]);

export const PROOF_EXECUTION_CONTEXTS = Object.freeze({
  "oracle": {
    "command": [
      "node",
      "scripts/runAssessV1AcceptanceOracle.mjs"
    ],
    "environments": [
      "pull-request",
      "stable-release"
    ],
    "workflowPath": ".github/workflows/exhaustive-acceptance.yml",
    "assertionIdFormat": "assess-v1-oracle::{testId}::{scenario}"
  },
  "server": {
    "environment": "disposable-ci",
    "workflowPath": ".github/workflows/exhaustive-acceptance.yml"
  }
});

export const PROOF_COMMAND_CONTRACTS = Object.freeze({
  "retainedCommands": {
    "assess-v2-authority": [
      "node",
      "scripts/testPr1dMigrations.mjs"
    ],
    "application-portfolio": [
      "node",
      "scripts/testPr1gMigrations.mjs"
    ],
    "govern-authority": [
      "npm",
      "run",
      "test:pr1e"
    ],
    "studio-governed": [
      "npm",
      "run",
      "test:studio-artifacts"
    ],
    "studio-private": [
      "npm",
      "run",
      "test:studio-private-artifacts"
    ],
    "delivery-policy": [
      "npm",
      "run",
      "test:delivery-workflow-policy"
    ],
    "trust-authority": [
      "node",
      "scripts/testTrustAssurancePostgres.mjs"
    ],
    "ai-boundary": [
      "npm",
      "run",
      "test:pr1a"
    ],
    "enterprise-intelligence": [
      "npm",
      "run",
      "test:enterprise-intelligence"
    ],
    "cross-cutting-false-success": [
      "npm",
      "run",
      "test:false-success"
    ],
    "canonical-pilot-journey": [
      "npm",
      "run",
      "test:pilot-acceptance"
    ],
    "requested-changes-domain-regression": [
      "node",
      "scripts/runTypeScriptTest.mjs",
      "types.ts",
      "services/assessV2/types.ts",
      "services/assessV2/canonical.ts",
      "services/assessV2/reviewDomain.ts",
      "tests/acceptance/journeys/requestedChangesJourney.test.ts"
    ],
    "pilot-operations": [
      "npm",
      "run",
      "test:pilot-operations"
    ],
    "studio-postgres-acceptance": [
      "node",
      "scripts/testStudioAcceptancePostgres.mjs"
    ],
    "govern-postgres-acceptance": [
      "node",
      "scripts/testGovernAcceptancePostgres.mjs"
    ],
    "enterprise-intelligence-postgres-acceptance": [
      "node",
      "scripts/testEnterpriseIntelligenceAcceptancePostgres.mjs"
    ],
    "legacy-delivery-postgres-acceptance": [
      "node",
      "scripts/legacyDeliveryAuthorityPostgres.mjs"
    ]
  },
  "serverCommands": {
    "server-disposable-postgresql": [
      "npm",
      "run",
      "test:migrations:pilot-operations:postgres"
    ]
  }
});

export const PROOF_OWNER_SOURCE_CONTRACTS = Object.freeze([
  {
    "branchId": "ADMIN-ADMIN_NAVIGATION",
    "testId": "ADMIN-001",
    "sourceAnchorIds": [
      "admin-workbench",
      "authenticated-scripts-authenticatedacceptancecases-mjs",
      "authenticated-scripts-authenticatedacceptanceprofile-mjs",
      "authenticated-scripts-authenticatedacceptanceevidence-mjs",
      "authenticated-scripts-enterpriselifecyclepostgresfixture-mjs",
      "authenticated-tests-browser-enterpriselifecycleacceptance-enterpriselifecycleacceptance-spec-ts",
      "authenticated-supabase-migrations-20261010051100-authenticated-studio-delivery-outcome-monitor-sql",
      "authenticated-supabase-migrations-20261010051413-authenticated-process-update-authority-sql",
      "authenticated-scripts-authenticatedcontrolsfixture-mjs",
      "authenticated-scripts-authenticatedcontrolsacceptance-mjs",
      "authenticated-scripts-authenticatedcontrolspostgresadapter-mjs",
      "authenticated-tests-browser-authenticatedcontrolsacceptance-ts"
    ],
    "ownership": [
      {
        "kind": "authenticated-scenario",
        "ownerId": "authenticated-admin-001"
      }
    ]
  },
  {
    "branchId": "ADMIN-NON_ADMIN_DENIAL",
    "testId": "ADMIN-002",
    "sourceAnchorIds": [
      "admin-workbench",
      "authenticated-scripts-authenticatedacceptancecases-mjs",
      "authenticated-scripts-authenticatedacceptanceprofile-mjs",
      "authenticated-scripts-authenticatedacceptanceevidence-mjs",
      "authenticated-scripts-enterpriselifecyclepostgresfixture-mjs",
      "authenticated-tests-browser-enterpriselifecycleacceptance-enterpriselifecycleacceptance-spec-ts",
      "authenticated-supabase-migrations-20261010051100-authenticated-studio-delivery-outcome-monitor-sql",
      "authenticated-supabase-migrations-20261010051413-authenticated-process-update-authority-sql",
      "authenticated-scripts-authenticatedcontrolsfixture-mjs",
      "authenticated-scripts-authenticatedcontrolsacceptance-mjs",
      "authenticated-scripts-authenticatedcontrolspostgresadapter-mjs",
      "authenticated-tests-browser-authenticatedcontrolsacceptance-ts"
    ],
    "ownership": [
      {
        "kind": "authenticated-scenario",
        "ownerId": "authenticated-admin-002"
      }
    ]
  },
  {
    "branchId": "ADMIN-PILOT_OPERATIONS_READ_ONLY",
    "testId": "ADMIN-004",
    "sourceAnchorIds": [
      "admin-workbench",
      "hosted-exact-run-scenarios",
      "authenticated-scripts-authenticatedacceptancecases-mjs",
      "authenticated-scripts-authenticatedacceptanceprofile-mjs",
      "authenticated-scripts-authenticatedacceptanceevidence-mjs",
      "authenticated-scripts-enterpriselifecyclepostgresfixture-mjs",
      "authenticated-tests-browser-enterpriselifecycleacceptance-enterpriselifecycleacceptance-spec-ts",
      "authenticated-supabase-migrations-20261010051100-authenticated-studio-delivery-outcome-monitor-sql",
      "authenticated-supabase-migrations-20261010051413-authenticated-process-update-authority-sql",
      "authenticated-scripts-authenticatedcontrolsfixture-mjs",
      "authenticated-scripts-authenticatedcontrolsacceptance-mjs",
      "authenticated-scripts-authenticatedcontrolspostgresadapter-mjs",
      "authenticated-tests-browser-authenticatedcontrolsacceptance-ts"
    ],
    "ownership": [
      {
        "kind": "authenticated-scenario",
        "ownerId": "authenticated-admin-004"
      }
    ]
  },
  {
    "branchId": "ADMIN-ROLE_CAPABILITY_VIEW",
    "testId": "ADMIN-003",
    "sourceAnchorIds": [
      "admin-workbench",
      "authenticated-scripts-authenticatedacceptancecases-mjs",
      "authenticated-scripts-authenticatedacceptanceprofile-mjs",
      "authenticated-scripts-authenticatedacceptanceevidence-mjs",
      "authenticated-scripts-enterpriselifecyclepostgresfixture-mjs",
      "authenticated-tests-browser-enterpriselifecycleacceptance-enterpriselifecycleacceptance-spec-ts",
      "authenticated-supabase-migrations-20261010051100-authenticated-studio-delivery-outcome-monitor-sql",
      "authenticated-supabase-migrations-20261010051413-authenticated-process-update-authority-sql",
      "authenticated-scripts-authenticatedcontrolsfixture-mjs",
      "authenticated-scripts-authenticatedcontrolsacceptance-mjs",
      "authenticated-scripts-authenticatedcontrolspostgresadapter-mjs",
      "authenticated-tests-browser-authenticatedcontrolsacceptance-ts"
    ],
    "ownership": [
      {
        "kind": "authenticated-scenario",
        "ownerId": "authenticated-admin-003"
      }
    ]
  },
  {
    "branchId": "AI-NO_BROWSER_SECRET",
    "testId": "AI-006",
    "sourceAnchorIds": [
      "ai-runtime-mode",
      "hosted-exact-run-scenarios",
      "authenticated-scripts-authenticatedacceptancecases-mjs",
      "authenticated-scripts-authenticatedacceptanceprofile-mjs",
      "authenticated-scripts-authenticatedacceptanceevidence-mjs",
      "authenticated-scripts-enterpriselifecyclepostgresfixture-mjs",
      "authenticated-tests-browser-enterpriselifecycleacceptance-enterpriselifecycleacceptance-spec-ts",
      "authenticated-supabase-migrations-20261010051100-authenticated-studio-delivery-outcome-monitor-sql",
      "authenticated-supabase-migrations-20261010051413-authenticated-process-update-authority-sql",
      "authenticated-scripts-authenticatedcontrolsfixture-mjs",
      "authenticated-scripts-authenticatedcontrolsacceptance-mjs",
      "authenticated-scripts-authenticatedcontrolspostgresadapter-mjs",
      "authenticated-tests-browser-authenticatedcontrolsacceptance-ts"
    ],
    "ownership": [
      {
        "kind": "authenticated-scenario",
        "ownerId": "authenticated-ai-006"
      }
    ]
  },
  {
    "branchId": "AI-NO_BYOK",
    "testId": "AI-001",
    "sourceAnchorIds": [
      "ai-runtime-mode",
      "authenticated-scripts-authenticatedacceptancecases-mjs",
      "authenticated-scripts-authenticatedacceptanceprofile-mjs",
      "authenticated-scripts-authenticatedacceptanceevidence-mjs",
      "authenticated-scripts-enterpriselifecyclepostgresfixture-mjs",
      "authenticated-tests-browser-enterpriselifecycleacceptance-enterpriselifecycleacceptance-spec-ts",
      "authenticated-supabase-migrations-20261010051100-authenticated-studio-delivery-outcome-monitor-sql",
      "authenticated-supabase-migrations-20261010051413-authenticated-process-update-authority-sql",
      "authenticated-scripts-authenticatedcontrolsfixture-mjs",
      "authenticated-scripts-authenticatedcontrolsacceptance-mjs",
      "authenticated-scripts-authenticatedcontrolspostgresadapter-mjs",
      "authenticated-tests-browser-authenticatedcontrolsacceptance-ts"
    ],
    "ownership": [
      {
        "kind": "authenticated-scenario",
        "ownerId": "authenticated-ai-001"
      }
    ]
  },
  {
    "branchId": "AI-PROVIDER_CAPABILITY_DENIAL",
    "testId": "AI-003",
    "sourceAnchorIds": [
      "ai-runtime-mode",
      "authenticated-scripts-authenticatedacceptancecases-mjs",
      "authenticated-scripts-authenticatedacceptanceprofile-mjs",
      "authenticated-scripts-authenticatedacceptanceevidence-mjs",
      "authenticated-scripts-enterpriselifecyclepostgresfixture-mjs",
      "authenticated-tests-browser-enterpriselifecycleacceptance-enterpriselifecycleacceptance-spec-ts",
      "authenticated-supabase-migrations-20261010051100-authenticated-studio-delivery-outcome-monitor-sql",
      "authenticated-supabase-migrations-20261010051413-authenticated-process-update-authority-sql",
      "authenticated-scripts-authenticatedcontrolsfixture-mjs",
      "authenticated-scripts-authenticatedcontrolsacceptance-mjs",
      "authenticated-scripts-authenticatedcontrolspostgresadapter-mjs",
      "authenticated-tests-browser-authenticatedcontrolsacceptance-ts"
    ],
    "ownership": [
      {
        "kind": "authenticated-scenario",
        "ownerId": "authenticated-ai-003"
      }
    ]
  },
  {
    "branchId": "AI-PROVIDER_DISABLED",
    "testId": "AI-002",
    "sourceAnchorIds": [
      "ai-runtime-mode",
      "authenticated-scripts-authenticatedacceptancecases-mjs",
      "authenticated-scripts-authenticatedacceptanceprofile-mjs",
      "authenticated-scripts-authenticatedacceptanceevidence-mjs",
      "authenticated-scripts-enterpriselifecyclepostgresfixture-mjs",
      "authenticated-tests-browser-enterpriselifecycleacceptance-enterpriselifecycleacceptance-spec-ts",
      "authenticated-supabase-migrations-20261010051100-authenticated-studio-delivery-outcome-monitor-sql",
      "authenticated-supabase-migrations-20261010051413-authenticated-process-update-authority-sql",
      "authenticated-scripts-authenticatedcontrolsfixture-mjs",
      "authenticated-scripts-authenticatedcontrolsacceptance-mjs",
      "authenticated-scripts-authenticatedcontrolspostgresadapter-mjs",
      "authenticated-tests-browser-authenticatedcontrolsacceptance-ts"
    ],
    "ownership": [
      {
        "kind": "authenticated-scenario",
        "ownerId": "authenticated-ai-002"
      }
    ]
  },
  {
    "branchId": "AI-PROVIDER_SECRET_BOUNDARY",
    "testId": "AI-004",
    "sourceAnchorIds": [
      "ai-runtime-mode",
      "authenticated-scripts-authenticatedacceptancecases-mjs",
      "authenticated-scripts-authenticatedacceptanceprofile-mjs",
      "authenticated-scripts-authenticatedacceptanceevidence-mjs",
      "authenticated-scripts-enterpriselifecyclepostgresfixture-mjs",
      "authenticated-tests-browser-enterpriselifecycleacceptance-enterpriselifecycleacceptance-spec-ts",
      "authenticated-supabase-migrations-20261010051100-authenticated-studio-delivery-outcome-monitor-sql",
      "authenticated-supabase-migrations-20261010051413-authenticated-process-update-authority-sql",
      "authenticated-scripts-authenticatedcontrolsfixture-mjs",
      "authenticated-scripts-authenticatedcontrolsacceptance-mjs",
      "authenticated-scripts-authenticatedcontrolspostgresadapter-mjs",
      "authenticated-tests-browser-authenticatedcontrolsacceptance-ts"
    ],
    "ownership": [
      {
        "kind": "authenticated-scenario",
        "ownerId": "authenticated-ai-004"
      }
    ]
  },
  {
    "branchId": "AI-PROVIDER_UNAVAILABLE",
    "testId": "AI-005",
    "sourceAnchorIds": [
      "ai-runtime-mode",
      "authenticated-scripts-authenticatedacceptancecases-mjs",
      "authenticated-scripts-authenticatedacceptanceprofile-mjs",
      "authenticated-scripts-authenticatedacceptanceevidence-mjs",
      "authenticated-scripts-enterpriselifecyclepostgresfixture-mjs",
      "authenticated-tests-browser-enterpriselifecycleacceptance-enterpriselifecycleacceptance-spec-ts",
      "authenticated-supabase-migrations-20261010051100-authenticated-studio-delivery-outcome-monitor-sql",
      "authenticated-supabase-migrations-20261010051413-authenticated-process-update-authority-sql",
      "authenticated-scripts-authenticatedcontrolsfixture-mjs",
      "authenticated-scripts-authenticatedcontrolsacceptance-mjs",
      "authenticated-scripts-authenticatedcontrolspostgresadapter-mjs",
      "authenticated-tests-browser-authenticatedcontrolsacceptance-ts"
    ],
    "ownership": [
      {
        "kind": "authenticated-scenario",
        "ownerId": "authenticated-ai-005"
      }
    ]
  },
  {
    "branchId": "APPS-APPLICATION_CREATE",
    "testId": "APPS-001",
    "sourceAnchorIds": [
      "application-portfolio-acceptance-harness",
      "application-portfolio-acceptance-evidence",
      "application-portfolio",
      "application-portfolio-pr1b-base",
      "application-portfolio-pr1g-migration",
      "application-portfolio-pr1g-authority-correction",
      "application-portfolio-pr1b-fixture-authority-fix"
    ],
    "ownership": [
      {
        "kind": "retained-assertion",
        "ownerId": "application-portfolio",
        "assertionId": "application-portfolio::APPS-001",
        "scenarioId": "APPS-001::retained-contract"
      }
    ]
  },
  {
    "branchId": "APPS-ASSESSMENT_SNAPSHOT",
    "testId": "APPS-002",
    "sourceAnchorIds": [
      "application-portfolio-acceptance-harness",
      "application-portfolio-acceptance-evidence",
      "application-portfolio",
      "application-portfolio-pr1b-base",
      "application-portfolio-pr1g-migration",
      "application-portfolio-pr1g-authority-correction",
      "application-portfolio-pr1b-fixture-authority-fix"
    ],
    "ownership": [
      {
        "kind": "retained-assertion",
        "ownerId": "application-portfolio",
        "assertionId": "application-portfolio::APPS-002",
        "scenarioId": "APPS-002::retained-contract"
      }
    ]
  },
  {
    "branchId": "APPS-CROSS_WORKSPACE_DENIAL",
    "testId": "APPS-004",
    "sourceAnchorIds": [
      "application-portfolio-acceptance-harness",
      "application-portfolio-acceptance-evidence",
      "application-portfolio",
      "application-portfolio-pr1b-base",
      "application-portfolio-pr1g-migration",
      "application-portfolio-pr1g-authority-correction",
      "application-portfolio-pr1b-fixture-authority-fix"
    ],
    "ownership": [
      {
        "kind": "retained-assertion",
        "ownerId": "application-portfolio",
        "assertionId": "application-portfolio::APPS-004",
        "scenarioId": "APPS-004::retained-contract"
      }
    ]
  },
  {
    "branchId": "APPS-MODERNIZATION_DISPOSITION",
    "testId": "APPS-003",
    "sourceAnchorIds": [
      "application-portfolio-acceptance-harness",
      "application-portfolio-acceptance-evidence",
      "application-portfolio",
      "application-portfolio-pr1b-base",
      "application-portfolio-pr1g-migration",
      "application-portfolio-pr1g-authority-correction",
      "application-portfolio-pr1b-fixture-authority-fix"
    ],
    "ownership": [
      {
        "kind": "retained-assertion",
        "ownerId": "application-portfolio",
        "assertionId": "application-portfolio::APPS-003",
        "scenarioId": "APPS-003::retained-contract"
      }
    ]
  },
  {
    "branchId": "APPS-REPLAY",
    "testId": "APPS-005",
    "sourceAnchorIds": [
      "application-portfolio-acceptance-harness",
      "application-portfolio-acceptance-evidence",
      "application-portfolio",
      "application-portfolio-pr1b-base",
      "application-portfolio-pr1g-migration",
      "application-portfolio-pr1g-authority-correction",
      "application-portfolio-pr1b-fixture-authority-fix"
    ],
    "ownership": [
      {
        "kind": "retained-assertion",
        "ownerId": "application-portfolio",
        "assertionId": "application-portfolio::APPS-005",
        "scenarioId": "APPS-005::retained-contract"
      }
    ]
  },
  {
    "branchId": "ASSESS-DISCOVERY_COMPLETE",
    "testId": "ASSESS-003",
    "sourceAnchorIds": [
      "assess-v1-scoring",
      "authenticated-scripts-authenticatedacceptancecases-mjs",
      "authenticated-scripts-authenticatedacceptanceprofile-mjs",
      "authenticated-scripts-authenticatedacceptanceevidence-mjs",
      "authenticated-scripts-enterpriselifecyclepostgresfixture-mjs",
      "authenticated-tests-browser-enterpriselifecycleacceptance-enterpriselifecycleacceptance-spec-ts",
      "authenticated-supabase-migrations-20261010051100-authenticated-studio-delivery-outcome-monitor-sql",
      "authenticated-supabase-migrations-20261010051413-authenticated-process-update-authority-sql",
      "authenticated-services-processupdatecontract-ts",
      "authenticated-services-processupdateclient-ts",
      "authenticated-supabase-functions-shared-processupdatecommand-ts"
    ],
    "ownership": [
      {
        "kind": "authenticated-scenario",
        "ownerId": "authenticated-assess-003"
      }
    ]
  },
  {
    "branchId": "ASSESS-DISCOVERY_INCOMPLETE",
    "testId": "ASSESS-004",
    "sourceAnchorIds": [
      "assess-v1-scoring"
    ],
    "ownership": [
      {
        "kind": "hosted-scenario",
        "ownerId": "incomplete-assessment"
      }
    ]
  },
  {
    "branchId": "ASSESS-PROCESS_CREATE",
    "testId": "ASSESS-001",
    "sourceAnchorIds": [
      "assess-v1-scoring"
    ],
    "ownership": [
      {
        "kind": "hosted-scenario",
        "ownerId": "process-create"
      }
    ]
  },
  {
    "branchId": "ASSESS-PROCESS_EDIT_DENIAL",
    "testId": "ASSESS-002",
    "sourceAnchorIds": [
      "assess-v1-scoring",
      "authenticated-scripts-authenticatedacceptancecases-mjs",
      "authenticated-scripts-authenticatedacceptanceprofile-mjs",
      "authenticated-scripts-authenticatedacceptanceevidence-mjs",
      "authenticated-scripts-enterpriselifecyclepostgresfixture-mjs",
      "authenticated-tests-browser-enterpriselifecycleacceptance-enterpriselifecycleacceptance-spec-ts",
      "authenticated-supabase-migrations-20261010051100-authenticated-studio-delivery-outcome-monitor-sql",
      "authenticated-supabase-migrations-20261010051413-authenticated-process-update-authority-sql",
      "authenticated-services-processupdatecontract-ts",
      "authenticated-services-processupdateclient-ts",
      "authenticated-supabase-functions-shared-processupdatecommand-ts"
    ],
    "ownership": [
      {
        "kind": "authenticated-scenario",
        "ownerId": "authenticated-assess-002"
      }
    ]
  },
  {
    "branchId": "ASSESS-V1_GATE_DISCOVERY",
    "testId": "ASSESS-009",
    "sourceAnchorIds": [
      "assess-v1-scoring"
    ],
    "ownership": [
      {
        "kind": "oracle-scenario",
        "ownerId": "needs-discovery",
        "assertionIds": [
          "assess-v1-oracle::ASSESS-009::needs-discovery"
        ],
        "scenarioIds": [
          "needs-discovery"
        ]
      }
    ]
  },
  {
    "branchId": "ASSESS-V1_GATE_GOVERNANCE",
    "testId": "ASSESS-013",
    "sourceAnchorIds": [
      "assess-v1-scoring"
    ],
    "ownership": [
      {
        "kind": "oracle-scenario",
        "ownerId": "governance-review",
        "assertionIds": [
          "assess-v1-oracle::ASSESS-013::governance-review"
        ],
        "scenarioIds": [
          "governance-review"
        ]
      }
    ]
  },
  {
    "branchId": "ASSESS-V1_GATE_HUMAN_LED",
    "testId": "ASSESS-012",
    "sourceAnchorIds": [
      "assess-v1-scoring"
    ],
    "ownership": [
      {
        "kind": "oracle-scenario",
        "ownerId": "human-led",
        "assertionIds": [
          "assess-v1-oracle::ASSESS-012::human-led"
        ],
        "scenarioIds": [
          "human-led"
        ]
      }
    ]
  },
  {
    "branchId": "ASSESS-V1_GATE_LOW_VALUE",
    "testId": "ASSESS-011",
    "sourceAnchorIds": [
      "assess-v1-scoring"
    ],
    "ownership": [
      {
        "kind": "oracle-scenario",
        "ownerId": "low-value",
        "assertionIds": [
          "assess-v1-oracle::ASSESS-011::low-value"
        ],
        "scenarioIds": [
          "low-value"
        ]
      }
    ]
  },
  {
    "branchId": "ASSESS-V1_GATE_NO_GO",
    "testId": "ASSESS-014",
    "sourceAnchorIds": [
      "assess-v1-scoring"
    ],
    "ownership": [
      {
        "kind": "oracle-scenario",
        "ownerId": "no-go",
        "assertionIds": [
          "assess-v1-oracle::ASSESS-014::no-go"
        ],
        "scenarioIds": [
          "no-go"
        ]
      }
    ]
  },
  {
    "branchId": "ASSESS-V1_GATE_REDESIGN",
    "testId": "ASSESS-010",
    "sourceAnchorIds": [
      "assess-v1-scoring"
    ],
    "ownership": [
      {
        "kind": "oracle-scenario",
        "ownerId": "process-redesign",
        "assertionIds": [
          "assess-v1-oracle::ASSESS-010::process-redesign"
        ],
        "scenarioIds": [
          "process-redesign"
        ]
      }
    ]
  },
  {
    "branchId": "ASSESS-V1_SCORE_MAX",
    "testId": "ASSESS-008",
    "sourceAnchorIds": [
      "assess-v1-scoring"
    ],
    "ownership": [
      {
        "kind": "oracle-scenario",
        "ownerId": "governance-max",
        "assertionIds": [
          "assess-v1-oracle::ASSESS-008::governance-max"
        ],
        "scenarioIds": [
          "governance-max"
        ]
      }
    ]
  },
  {
    "branchId": "ASSESS-V1_SCORE_MIN",
    "testId": "ASSESS-007",
    "sourceAnchorIds": [
      "assess-v1-scoring"
    ],
    "ownership": [
      {
        "kind": "oracle-scenario",
        "ownerId": "governance-min",
        "assertionIds": [
          "assess-v1-oracle::ASSESS-007::governance-min"
        ],
        "scenarioIds": [
          "governance-min"
        ]
      }
    ]
  },
  {
    "branchId": "ASSESS-V1_THRESHOLD_ABOVE",
    "testId": "ASSESS-017",
    "sourceAnchorIds": [
      "assess-v1-scoring"
    ],
    "ownership": [
      {
        "kind": "oracle-scenario",
        "ownerId": "completion-above",
        "assertionIds": [
          "assess-v1-oracle::ASSESS-017::completion-above"
        ],
        "scenarioIds": [
          "completion-above"
        ]
      }
    ]
  },
  {
    "branchId": "ASSESS-V1_THRESHOLD_BELOW",
    "testId": "ASSESS-015",
    "sourceAnchorIds": [
      "assess-v1-scoring"
    ],
    "ownership": [
      {
        "kind": "oracle-scenario",
        "ownerId": "completion-below",
        "assertionIds": [
          "assess-v1-oracle::ASSESS-015::completion-below"
        ],
        "scenarioIds": [
          "completion-below"
        ]
      }
    ]
  },
  {
    "branchId": "ASSESS-V1_THRESHOLD_EXACT",
    "testId": "ASSESS-016",
    "sourceAnchorIds": [
      "assess-v1-scoring"
    ],
    "ownership": [
      {
        "kind": "oracle-scenario",
        "ownerId": "completion-exact",
        "assertionIds": [
          "assess-v1-oracle::ASSESS-016::completion-exact"
        ],
        "scenarioIds": [
          "completion-exact"
        ]
      }
    ]
  },
  {
    "branchId": "ASSESS-V1_VALIDATION_INVALID",
    "testId": "ASSESS-006",
    "sourceAnchorIds": [
      "assess-v1-scoring"
    ],
    "ownership": [
      {
        "kind": "oracle-scenario",
        "ownerId": "invalid-input",
        "assertionIds": [
          "assess-v1-oracle::ASSESS-006::invalid-input"
        ],
        "scenarioIds": [
          "invalid-input"
        ]
      }
    ]
  },
  {
    "branchId": "ASSESS-V1_VALIDATION_MISSING",
    "testId": "ASSESS-005",
    "sourceAnchorIds": [
      "assess-v1-scoring"
    ],
    "ownership": [
      {
        "kind": "oracle-scenario",
        "ownerId": "missing-input",
        "assertionIds": [
          "assess-v1-oracle::ASSESS-005::missing-input"
        ],
        "scenarioIds": [
          "missing-input"
        ]
      }
    ]
  },
  {
    "branchId": "ASSESS-V2_CREATE",
    "testId": "ASSESS-018",
    "sourceAnchorIds": [
      "assess-v1-scoring",
      "authenticated-scripts-authenticatedacceptancecases-mjs",
      "authenticated-scripts-authenticatedacceptanceprofile-mjs",
      "authenticated-scripts-authenticatedacceptanceevidence-mjs",
      "authenticated-scripts-enterpriselifecyclepostgresfixture-mjs",
      "authenticated-tests-browser-enterpriselifecycleacceptance-enterpriselifecycleacceptance-spec-ts",
      "authenticated-supabase-migrations-20261010051100-authenticated-studio-delivery-outcome-monitor-sql",
      "authenticated-supabase-migrations-20261010051413-authenticated-process-update-authority-sql",
      "authenticated-services-processupdatecontract-ts",
      "authenticated-services-processupdateclient-ts",
      "authenticated-supabase-functions-shared-processupdatecommand-ts"
    ],
    "ownership": [
      {
        "kind": "authenticated-scenario",
        "ownerId": "authenticated-assess-018"
      }
    ]
  },
  {
    "branchId": "ASSESS-V2_FEATURE_DISABLED",
    "testId": "ASSESS-020",
    "sourceAnchorIds": [
      "assess-v1-scoring",
      "authenticated-scripts-authenticatedacceptancecases-mjs",
      "authenticated-scripts-authenticatedacceptanceprofile-mjs",
      "authenticated-scripts-authenticatedacceptanceevidence-mjs",
      "authenticated-scripts-enterpriselifecyclepostgresfixture-mjs",
      "authenticated-tests-browser-enterpriselifecycleacceptance-enterpriselifecycleacceptance-spec-ts",
      "authenticated-supabase-migrations-20261010051100-authenticated-studio-delivery-outcome-monitor-sql",
      "authenticated-supabase-migrations-20261010051413-authenticated-process-update-authority-sql",
      "authenticated-services-processupdatecontract-ts",
      "authenticated-services-processupdateclient-ts",
      "authenticated-supabase-functions-shared-processupdatecommand-ts"
    ],
    "ownership": [
      {
        "kind": "authenticated-scenario",
        "ownerId": "authenticated-assess-020"
      }
    ]
  },
  {
    "branchId": "ASSESS-V2_FINALIZE",
    "testId": "ASSESS-019",
    "sourceAnchorIds": [
      "assess-v1-scoring",
      "authenticated-scripts-authenticatedacceptancecases-mjs",
      "authenticated-scripts-authenticatedacceptanceprofile-mjs",
      "authenticated-scripts-authenticatedacceptanceevidence-mjs",
      "authenticated-scripts-enterpriselifecyclepostgresfixture-mjs",
      "authenticated-tests-browser-enterpriselifecycleacceptance-enterpriselifecycleacceptance-spec-ts",
      "authenticated-supabase-migrations-20261010051100-authenticated-studio-delivery-outcome-monitor-sql",
      "authenticated-supabase-migrations-20261010051413-authenticated-process-update-authority-sql",
      "authenticated-services-processupdatecontract-ts",
      "authenticated-services-processupdateclient-ts",
      "authenticated-supabase-functions-shared-processupdatecommand-ts"
    ],
    "ownership": [
      {
        "kind": "authenticated-scenario",
        "ownerId": "authenticated-assess-019"
      }
    ]
  },
  {
    "branchId": "ASSESS-V2_IDEMPOTENCY_CONFLICT",
    "testId": "ASSESS-022",
    "sourceAnchorIds": [
      "assess-v2-conflict-harness",
      "assess-v2-conflict-evidence",
      "application-portfolio-pr1b-base",
      "assess-v2-pr1c",
      "assess-v2-pr1d",
      "assess-v2-integrity",
      "assess-v2-attestation",
      "assess-v2-fact-validation",
      "assess-v2-source-hardening",
      "assess-v2-visibility"
    ],
    "ownership": [
      {
        "kind": "retained-assertion",
        "ownerId": "assess-v2-authority",
        "assertionId": "assess-v2-authority::ASSESS-022",
        "scenarioId": "ASSESS-022::retained-contract"
      }
    ]
  },
  {
    "branchId": "ASSESS-V2_VERSION_CONFLICT",
    "testId": "ASSESS-021",
    "sourceAnchorIds": [
      "assess-v2-conflict-harness",
      "assess-v2-conflict-evidence",
      "application-portfolio-pr1b-base",
      "assess-v2-pr1c",
      "assess-v2-pr1d",
      "assess-v2-integrity",
      "assess-v2-attestation",
      "assess-v2-fact-validation",
      "assess-v2-source-hardening",
      "assess-v2-visibility"
    ],
    "ownership": [
      {
        "kind": "retained-assertion",
        "ownerId": "assess-v2-authority",
        "assertionId": "assess-v2-authority::ASSESS-021",
        "scenarioId": "ASSESS-021::retained-contract"
      }
    ]
  },
  {
    "branchId": "DELIVERY-DELIVERY_PACK",
    "testId": "DELIVERY-009",
    "sourceAnchorIds": [
      "delivery-workflow-policy",
      "authenticated-scripts-authenticatedacceptancecases-mjs",
      "authenticated-scripts-authenticatedacceptanceprofile-mjs",
      "authenticated-scripts-authenticatedacceptanceevidence-mjs",
      "authenticated-scripts-enterpriselifecyclepostgresfixture-mjs",
      "authenticated-tests-browser-enterpriselifecycleacceptance-enterpriselifecycleacceptance-spec-ts",
      "authenticated-supabase-migrations-20261010051100-authenticated-studio-delivery-outcome-monitor-sql",
      "authenticated-supabase-migrations-20261010051413-authenticated-process-update-authority-sql",
      "authenticated-services-productacceptancebridge-contracts-ts",
      "authenticated-services-productacceptancebridge-client-ts",
      "authenticated-supabase-functions-shared-studiodeliverycommand-ts",
      "authenticated-supabase-functions-shared-studiodeliveryoutcomequery-ts"
    ],
    "ownership": [
      {
        "kind": "authenticated-scenario",
        "ownerId": "authenticated-delivery-009"
      }
    ]
  },
  {
    "branchId": "DELIVERY-DUPLICATE_IMPORT",
    "testId": "DELIVERY-007",
    "sourceAnchorIds": [
      "legacy-delivery-legacyDeliveryAuthorityPostgres-mjs",
      "legacy-delivery-legacyDeliveryPostgresFixture-mjs",
      "legacy-delivery-legacyDeliveryAcceptanceEvidence-mjs",
      "studio-acceptance-syntheticaiterminaljournalmigrationtestguard-mjs",
      "legacy-delivery-deliveryPolicy-ts",
      "delivery-workflow-policy",
      "application-portfolio-pr1b-base",
      "legacy-delivery-20260607152500-m5-2g-a-delivery-work-items-authority-sql",
      "legacy-delivery-20261010025331-legacy-delivery-authority-sql",
      "authenticated-supabase-migrations-20261010051100-authenticated-studio-delivery-outcome-monitor-sql",
      "authenticated-supabase-migrations-20261010051413-authenticated-process-update-authority-sql"
    ],
    "ownership": [
      {
        "kind": "retained-assertion",
        "ownerId": "legacy-delivery-postgres-acceptance",
        "assertionId": "legacy-delivery-postgres-acceptance::DELIVERY-007",
        "scenarioId": "DELIVERY-007::retained-contract"
      }
    ]
  },
  {
    "branchId": "DELIVERY-HANDOFF_IMPORT",
    "testId": "DELIVERY-001",
    "sourceAnchorIds": [
      "delivery-workflow-policy",
      "authenticated-scripts-authenticatedacceptancecases-mjs",
      "authenticated-scripts-authenticatedacceptanceprofile-mjs",
      "authenticated-scripts-authenticatedacceptanceevidence-mjs",
      "authenticated-scripts-enterpriselifecyclepostgresfixture-mjs",
      "authenticated-tests-browser-enterpriselifecycleacceptance-enterpriselifecycleacceptance-spec-ts",
      "authenticated-supabase-migrations-20261010051100-authenticated-studio-delivery-outcome-monitor-sql",
      "authenticated-supabase-migrations-20261010051413-authenticated-process-update-authority-sql",
      "authenticated-services-productacceptancebridge-contracts-ts",
      "authenticated-services-productacceptancebridge-client-ts",
      "authenticated-supabase-functions-shared-studiodeliverycommand-ts",
      "authenticated-supabase-functions-shared-studiodeliveryoutcomequery-ts"
    ],
    "ownership": [
      {
        "kind": "authenticated-scenario",
        "ownerId": "authenticated-delivery-001"
      }
    ]
  },
  {
    "branchId": "DELIVERY-INVALID_TRANSITION",
    "testId": "DELIVERY-006",
    "sourceAnchorIds": [
      "delivery-workflow-policy",
      "authenticated-scripts-authenticatedacceptancecases-mjs",
      "authenticated-scripts-authenticatedacceptanceprofile-mjs",
      "authenticated-scripts-authenticatedacceptanceevidence-mjs",
      "authenticated-scripts-enterpriselifecyclepostgresfixture-mjs",
      "authenticated-tests-browser-enterpriselifecycleacceptance-enterpriselifecycleacceptance-spec-ts",
      "authenticated-supabase-migrations-20261010051100-authenticated-studio-delivery-outcome-monitor-sql",
      "authenticated-supabase-migrations-20261010051413-authenticated-process-update-authority-sql",
      "authenticated-services-productacceptancebridge-contracts-ts",
      "authenticated-services-productacceptancebridge-client-ts",
      "authenticated-supabase-functions-shared-studiodeliverycommand-ts",
      "authenticated-supabase-functions-shared-studiodeliveryoutcomequery-ts"
    ],
    "ownership": [
      {
        "kind": "authenticated-scenario",
        "ownerId": "authenticated-delivery-006"
      }
    ]
  },
  {
    "branchId": "DELIVERY-RETAINED_LINEAGE",
    "testId": "DELIVERY-008",
    "sourceAnchorIds": [
      "legacy-delivery-legacyDeliveryAuthorityPostgres-mjs",
      "legacy-delivery-legacyDeliveryPostgresFixture-mjs",
      "legacy-delivery-legacyDeliveryAcceptanceEvidence-mjs",
      "studio-acceptance-syntheticaiterminaljournalmigrationtestguard-mjs",
      "legacy-delivery-deliveryPolicy-ts",
      "delivery-workflow-policy",
      "application-portfolio-pr1b-base",
      "legacy-delivery-20260607152500-m5-2g-a-delivery-work-items-authority-sql",
      "legacy-delivery-20261010025331-legacy-delivery-authority-sql",
      "authenticated-supabase-migrations-20261010051100-authenticated-studio-delivery-outcome-monitor-sql",
      "authenticated-supabase-migrations-20261010051413-authenticated-process-update-authority-sql"
    ],
    "ownership": [
      {
        "kind": "retained-assertion",
        "ownerId": "legacy-delivery-postgres-acceptance",
        "assertionId": "legacy-delivery-postgres-acceptance::DELIVERY-008",
        "scenarioId": "DELIVERY-008::retained-contract"
      }
    ]
  },
  {
    "branchId": "DELIVERY-STATUS_TRANSITION",
    "testId": "DELIVERY-005",
    "sourceAnchorIds": [
      "delivery-workflow-policy",
      "authenticated-scripts-authenticatedacceptancecases-mjs",
      "authenticated-scripts-authenticatedacceptanceprofile-mjs",
      "authenticated-scripts-authenticatedacceptanceevidence-mjs",
      "authenticated-scripts-enterpriselifecyclepostgresfixture-mjs",
      "authenticated-tests-browser-enterpriselifecycleacceptance-enterpriselifecycleacceptance-spec-ts",
      "authenticated-supabase-migrations-20261010051100-authenticated-studio-delivery-outcome-monitor-sql",
      "authenticated-supabase-migrations-20261010051413-authenticated-process-update-authority-sql",
      "authenticated-services-productacceptancebridge-contracts-ts",
      "authenticated-services-productacceptancebridge-client-ts",
      "authenticated-supabase-functions-shared-studiodeliverycommand-ts",
      "authenticated-supabase-functions-shared-studiodeliveryoutcomequery-ts"
    ],
    "ownership": [
      {
        "kind": "authenticated-scenario",
        "ownerId": "authenticated-delivery-005"
      }
    ]
  },
  {
    "branchId": "DELIVERY-TASK_CREATE",
    "testId": "DELIVERY-002",
    "sourceAnchorIds": [
      "delivery-workflow-policy",
      "authenticated-scripts-authenticatedacceptancecases-mjs",
      "authenticated-scripts-authenticatedacceptanceprofile-mjs",
      "authenticated-scripts-authenticatedacceptanceevidence-mjs",
      "authenticated-scripts-enterpriselifecyclepostgresfixture-mjs",
      "authenticated-tests-browser-enterpriselifecycleacceptance-enterpriselifecycleacceptance-spec-ts",
      "authenticated-supabase-migrations-20261010051100-authenticated-studio-delivery-outcome-monitor-sql",
      "authenticated-supabase-migrations-20261010051413-authenticated-process-update-authority-sql",
      "authenticated-services-productacceptancebridge-contracts-ts",
      "authenticated-services-productacceptancebridge-client-ts",
      "authenticated-supabase-functions-shared-studiodeliverycommand-ts",
      "authenticated-supabase-functions-shared-studiodeliveryoutcomequery-ts"
    ],
    "ownership": [
      {
        "kind": "authenticated-scenario",
        "ownerId": "authenticated-delivery-002"
      }
    ]
  },
  {
    "branchId": "DELIVERY-TASK_DELETE_DENIAL",
    "testId": "DELIVERY-004",
    "sourceAnchorIds": [
      "delivery-workflow-policy",
      "authenticated-scripts-authenticatedacceptancecases-mjs",
      "authenticated-scripts-authenticatedacceptanceprofile-mjs",
      "authenticated-scripts-authenticatedacceptanceevidence-mjs",
      "authenticated-scripts-enterpriselifecyclepostgresfixture-mjs",
      "authenticated-tests-browser-enterpriselifecycleacceptance-enterpriselifecycleacceptance-spec-ts",
      "authenticated-supabase-migrations-20261010051100-authenticated-studio-delivery-outcome-monitor-sql",
      "authenticated-supabase-migrations-20261010051413-authenticated-process-update-authority-sql",
      "authenticated-services-productacceptancebridge-contracts-ts",
      "authenticated-services-productacceptancebridge-client-ts",
      "authenticated-supabase-functions-shared-studiodeliverycommand-ts",
      "authenticated-supabase-functions-shared-studiodeliveryoutcomequery-ts"
    ],
    "ownership": [
      {
        "kind": "authenticated-scenario",
        "ownerId": "authenticated-delivery-004"
      }
    ]
  },
  {
    "branchId": "DELIVERY-TASK_UPDATE_OWN",
    "testId": "DELIVERY-003",
    "sourceAnchorIds": [
      "delivery-workflow-policy",
      "authenticated-scripts-authenticatedacceptancecases-mjs",
      "authenticated-scripts-authenticatedacceptanceprofile-mjs",
      "authenticated-scripts-authenticatedacceptanceevidence-mjs",
      "authenticated-scripts-enterpriselifecyclepostgresfixture-mjs",
      "authenticated-tests-browser-enterpriselifecycleacceptance-enterpriselifecycleacceptance-spec-ts",
      "authenticated-supabase-migrations-20261010051100-authenticated-studio-delivery-outcome-monitor-sql",
      "authenticated-supabase-migrations-20261010051413-authenticated-process-update-authority-sql",
      "authenticated-services-productacceptancebridge-contracts-ts",
      "authenticated-services-productacceptancebridge-client-ts",
      "authenticated-supabase-functions-shared-studiodeliverycommand-ts",
      "authenticated-supabase-functions-shared-studiodeliveryoutcomequery-ts"
    ],
    "ownership": [
      {
        "kind": "authenticated-scenario",
        "ownerId": "authenticated-delivery-003"
      }
    ]
  },
  {
    "branchId": "E2E-AUTHORITY_DENIAL",
    "testId": "E2E-003",
    "sourceAnchorIds": [
      "handoff-ledger",
      "authenticated-scripts-authenticatedacceptancecases-mjs",
      "authenticated-scripts-authenticatedacceptanceprofile-mjs",
      "authenticated-scripts-authenticatedacceptanceevidence-mjs",
      "authenticated-scripts-enterpriselifecyclepostgresfixture-mjs",
      "authenticated-tests-browser-enterpriselifecycleacceptance-enterpriselifecycleacceptance-spec-ts",
      "authenticated-supabase-migrations-20261010051100-authenticated-studio-delivery-outcome-monitor-sql",
      "authenticated-supabase-migrations-20261010051413-authenticated-process-update-authority-sql",
      "authenticated-services-productacceptancebridge-contracts-ts",
      "authenticated-services-productacceptancebridge-client-ts",
      "authenticated-supabase-functions-shared-studiodeliverycommand-ts",
      "authenticated-supabase-functions-shared-studiodeliveryoutcomequery-ts"
    ],
    "ownership": [
      {
        "kind": "authenticated-scenario",
        "ownerId": "authenticated-e2e-003"
      }
    ]
  },
  {
    "branchId": "E2E-CANONICAL_HAPPY",
    "testId": "E2E-001",
    "sourceAnchorIds": [
      "handoff-ledger",
      "hosted-exact-run-scenarios",
      "authenticated-scripts-authenticatedacceptancecases-mjs",
      "authenticated-scripts-authenticatedacceptanceprofile-mjs",
      "authenticated-scripts-authenticatedacceptanceevidence-mjs",
      "authenticated-scripts-enterpriselifecyclepostgresfixture-mjs",
      "authenticated-tests-browser-enterpriselifecycleacceptance-enterpriselifecycleacceptance-spec-ts",
      "authenticated-supabase-migrations-20261010051100-authenticated-studio-delivery-outcome-monitor-sql",
      "authenticated-supabase-migrations-20261010051413-authenticated-process-update-authority-sql",
      "authenticated-services-productacceptancebridge-contracts-ts",
      "authenticated-services-productacceptancebridge-client-ts",
      "authenticated-supabase-functions-shared-studiodeliverycommand-ts",
      "authenticated-supabase-functions-shared-studiodeliveryoutcomequery-ts"
    ],
    "ownership": [
      {
        "kind": "authenticated-scenario",
        "ownerId": "authenticated-e2e-001"
      }
    ]
  },
  {
    "branchId": "E2E-HITL_COMPLIANCE",
    "testId": "E2E-007",
    "sourceAnchorIds": [
      "handoff-ledger",
      "authenticated-scripts-authenticatedacceptancecases-mjs",
      "authenticated-scripts-authenticatedacceptanceprofile-mjs",
      "authenticated-scripts-authenticatedacceptanceevidence-mjs",
      "authenticated-scripts-enterpriselifecyclepostgresfixture-mjs",
      "authenticated-tests-browser-enterpriselifecycleacceptance-enterpriselifecycleacceptance-spec-ts",
      "authenticated-supabase-migrations-20261010051100-authenticated-studio-delivery-outcome-monitor-sql",
      "authenticated-supabase-migrations-20261010051413-authenticated-process-update-authority-sql",
      "authenticated-services-productacceptancebridge-contracts-ts",
      "authenticated-services-productacceptancebridge-client-ts",
      "authenticated-supabase-functions-shared-studiodeliverycommand-ts",
      "authenticated-supabase-functions-shared-studiodeliveryoutcomequery-ts"
    ],
    "ownership": [
      {
        "kind": "authenticated-scenario",
        "ownerId": "authenticated-e2e-007"
      }
    ]
  },
  {
    "branchId": "E2E-LOW_SUITABILITY",
    "testId": "E2E-005",
    "sourceAnchorIds": [
      "handoff-ledger",
      "authenticated-scripts-authenticatedacceptancecases-mjs",
      "authenticated-scripts-authenticatedacceptanceprofile-mjs",
      "authenticated-scripts-authenticatedacceptanceevidence-mjs",
      "authenticated-scripts-enterpriselifecyclepostgresfixture-mjs",
      "authenticated-tests-browser-enterpriselifecycleacceptance-enterpriselifecycleacceptance-spec-ts",
      "authenticated-supabase-migrations-20261010051100-authenticated-studio-delivery-outcome-monitor-sql",
      "authenticated-supabase-migrations-20261010051413-authenticated-process-update-authority-sql",
      "authenticated-services-productacceptancebridge-contracts-ts",
      "authenticated-services-productacceptancebridge-client-ts",
      "authenticated-supabase-functions-shared-studiodeliverycommand-ts",
      "authenticated-supabase-functions-shared-studiodeliveryoutcomequery-ts"
    ],
    "ownership": [
      {
        "kind": "authenticated-scenario",
        "ownerId": "authenticated-e2e-005"
      }
    ]
  },
  {
    "branchId": "E2E-REQUESTED_CHANGES_LOOP",
    "testId": "E2E-002",
    "sourceAnchorIds": [
      "handoff-ledger",
      "authenticated-scripts-authenticatedacceptancecases-mjs",
      "authenticated-scripts-authenticatedacceptanceprofile-mjs",
      "authenticated-scripts-authenticatedacceptanceevidence-mjs",
      "authenticated-scripts-enterpriselifecyclepostgresfixture-mjs",
      "authenticated-tests-browser-enterpriselifecycleacceptance-enterpriselifecycleacceptance-spec-ts",
      "authenticated-supabase-migrations-20261010051100-authenticated-studio-delivery-outcome-monitor-sql",
      "authenticated-supabase-migrations-20261010051413-authenticated-process-update-authority-sql",
      "authenticated-services-productacceptancebridge-contracts-ts",
      "authenticated-services-productacceptancebridge-client-ts",
      "authenticated-supabase-functions-shared-studiodeliverycommand-ts",
      "authenticated-supabase-functions-shared-studiodeliveryoutcomequery-ts"
    ],
    "ownership": [
      {
        "kind": "authenticated-scenario",
        "ownerId": "authenticated-e2e-002"
      }
    ]
  },
  {
    "branchId": "E2E-STALE_REPLAY_RECOVERY",
    "testId": "E2E-004",
    "sourceAnchorIds": [
      "handoff-ledger",
      "authenticated-scripts-authenticatedacceptancecases-mjs",
      "authenticated-scripts-authenticatedacceptanceprofile-mjs",
      "authenticated-scripts-authenticatedacceptanceevidence-mjs",
      "authenticated-scripts-enterpriselifecyclepostgresfixture-mjs",
      "authenticated-tests-browser-enterpriselifecycleacceptance-enterpriselifecycleacceptance-spec-ts",
      "authenticated-supabase-migrations-20261010051100-authenticated-studio-delivery-outcome-monitor-sql",
      "authenticated-supabase-migrations-20261010051413-authenticated-process-update-authority-sql",
      "authenticated-services-productacceptancebridge-contracts-ts",
      "authenticated-services-productacceptancebridge-client-ts",
      "authenticated-supabase-functions-shared-studiodeliverycommand-ts",
      "authenticated-supabase-functions-shared-studiodeliveryoutcomequery-ts"
    ],
    "ownership": [
      {
        "kind": "authenticated-scenario",
        "ownerId": "authenticated-e2e-004"
      }
    ]
  },
  {
    "branchId": "E2E-STRONG_AUTOMATION",
    "testId": "E2E-006",
    "sourceAnchorIds": [
      "handoff-ledger",
      "authenticated-scripts-authenticatedacceptancecases-mjs",
      "authenticated-scripts-authenticatedacceptanceprofile-mjs",
      "authenticated-scripts-authenticatedacceptanceevidence-mjs",
      "authenticated-scripts-enterpriselifecyclepostgresfixture-mjs",
      "authenticated-tests-browser-enterpriselifecycleacceptance-enterpriselifecycleacceptance-spec-ts",
      "authenticated-supabase-migrations-20261010051100-authenticated-studio-delivery-outcome-monitor-sql",
      "authenticated-supabase-migrations-20261010051413-authenticated-process-update-authority-sql",
      "authenticated-services-productacceptancebridge-contracts-ts",
      "authenticated-services-productacceptancebridge-client-ts",
      "authenticated-supabase-functions-shared-studiodeliverycommand-ts",
      "authenticated-supabase-functions-shared-studiodeliveryoutcomequery-ts"
    ],
    "ownership": [
      {
        "kind": "authenticated-scenario",
        "ownerId": "authenticated-e2e-006"
      }
    ]
  },
  {
    "branchId": "EI-ASSEMBLE_PHASE1_NONEXECUTION",
    "testId": "EI-005",
    "sourceAnchorIds": [
      "ei-acceptance-testenterpriseintelligenceacceptancepostgres-mjs",
      "ei-acceptance-enterpriseintelligenceacceptanceevidence-mjs",
      "ei-acceptance-enterpriseintelligenceacceptanceparser-test-ts",
      "ei-acceptance-enterpriseintelligencepostgresfixture-mjs",
      "authenticated-controls-loader",
      "studio-acceptance-syntheticaiterminaljournalmigrationtestguard-mjs",
      "enterprise-intelligence",
      "ei-acceptance-supabase-functions-shared-enterpriseintelligencecommand-ts",
      "ei-acceptance-supabase-functions-shared-enterpriseintelligenceingestion-ts",
      "ei-production-query",
      "tenant-authority",
      "application-portfolio-pr1b-base",
      "ei-acceptance-20260804120000-enterprise-intelligence-authority-sql",
      "ei-acceptance-20260805130000-provider-secret-write-intent-recovery-sql",
      "ei-acceptance-20260805140000-enterprise-intelligence-ready-review-corrections-sql",
      "ei-acceptance-20260916181916-assess-document-xlsx-ingestion-authority-sql",
      "ei-acceptance-20261008022445-enterprise-evidence-canonical-size-limit-sql",
      "ei-acceptance-govern-immutable-action-authority",
      "legacy-delivery-20261010025331-legacy-delivery-authority-sql",
      "authenticated-supabase-migrations-20261010051100-authenticated-studio-delivery-outcome-monitor-sql",
      "authenticated-supabase-migrations-20261010051413-authenticated-process-update-authority-sql"
    ],
    "ownership": [
      {
        "kind": "retained-assertion",
        "ownerId": "enterprise-intelligence-postgres-acceptance",
        "assertionId": "enterprise-intelligence-postgres-acceptance::EI-005",
        "scenarioId": "EI-005::retained-contract"
      }
    ]
  },
  {
    "branchId": "EI-COMMAND_REPLAY",
    "testId": "EI-004",
    "sourceAnchorIds": [
      "ei-acceptance-testenterpriseintelligenceacceptancepostgres-mjs",
      "ei-acceptance-enterpriseintelligenceacceptanceevidence-mjs",
      "ei-acceptance-enterpriseintelligenceacceptanceparser-test-ts",
      "ei-acceptance-enterpriseintelligencepostgresfixture-mjs",
      "authenticated-controls-loader",
      "studio-acceptance-syntheticaiterminaljournalmigrationtestguard-mjs",
      "enterprise-intelligence",
      "ei-acceptance-supabase-functions-shared-enterpriseintelligencecommand-ts",
      "ei-acceptance-supabase-functions-shared-enterpriseintelligenceingestion-ts",
      "ei-production-query",
      "tenant-authority",
      "application-portfolio-pr1b-base",
      "ei-acceptance-20260804120000-enterprise-intelligence-authority-sql",
      "ei-acceptance-20260805130000-provider-secret-write-intent-recovery-sql",
      "ei-acceptance-20260805140000-enterprise-intelligence-ready-review-corrections-sql",
      "ei-acceptance-20260916181916-assess-document-xlsx-ingestion-authority-sql",
      "ei-acceptance-20261008022445-enterprise-evidence-canonical-size-limit-sql",
      "ei-acceptance-govern-immutable-action-authority",
      "legacy-delivery-20261010025331-legacy-delivery-authority-sql",
      "authenticated-supabase-migrations-20261010051100-authenticated-studio-delivery-outcome-monitor-sql",
      "authenticated-supabase-migrations-20261010051413-authenticated-process-update-authority-sql"
    ],
    "ownership": [
      {
        "kind": "retained-assertion",
        "ownerId": "enterprise-intelligence-postgres-acceptance",
        "assertionId": "enterprise-intelligence-postgres-acceptance::EI-004",
        "scenarioId": "EI-004::retained-contract"
      }
    ]
  },
  {
    "branchId": "EI-INGESTION_LINEAGE",
    "testId": "EI-002",
    "sourceAnchorIds": [
      "ei-acceptance-testenterpriseintelligenceacceptancepostgres-mjs",
      "ei-acceptance-enterpriseintelligenceacceptanceevidence-mjs",
      "ei-acceptance-enterpriseintelligenceacceptanceparser-test-ts",
      "ei-acceptance-enterpriseintelligencepostgresfixture-mjs",
      "authenticated-controls-loader",
      "studio-acceptance-syntheticaiterminaljournalmigrationtestguard-mjs",
      "enterprise-intelligence",
      "ei-acceptance-supabase-functions-shared-enterpriseintelligencecommand-ts",
      "ei-acceptance-supabase-functions-shared-enterpriseintelligenceingestion-ts",
      "ei-production-query",
      "tenant-authority",
      "application-portfolio-pr1b-base",
      "ei-acceptance-20260804120000-enterprise-intelligence-authority-sql",
      "ei-acceptance-20260805130000-provider-secret-write-intent-recovery-sql",
      "ei-acceptance-20260805140000-enterprise-intelligence-ready-review-corrections-sql",
      "ei-acceptance-20260916181916-assess-document-xlsx-ingestion-authority-sql",
      "ei-acceptance-20261008022445-enterprise-evidence-canonical-size-limit-sql",
      "ei-acceptance-govern-immutable-action-authority",
      "legacy-delivery-20261010025331-legacy-delivery-authority-sql",
      "authenticated-supabase-migrations-20261010051100-authenticated-studio-delivery-outcome-monitor-sql",
      "authenticated-supabase-migrations-20261010051413-authenticated-process-update-authority-sql"
    ],
    "ownership": [
      {
        "kind": "retained-assertion",
        "ownerId": "enterprise-intelligence-postgres-acceptance",
        "assertionId": "enterprise-intelligence-postgres-acceptance::EI-002",
        "scenarioId": "EI-002::retained-contract"
      }
    ]
  },
  {
    "branchId": "EI-INGESTION_VALIDATION",
    "testId": "EI-001",
    "sourceAnchorIds": [
      "ei-acceptance-testenterpriseintelligenceacceptancepostgres-mjs",
      "ei-acceptance-enterpriseintelligenceacceptanceevidence-mjs",
      "ei-acceptance-enterpriseintelligenceacceptanceparser-test-ts",
      "ei-acceptance-enterpriseintelligencepostgresfixture-mjs",
      "authenticated-controls-loader",
      "studio-acceptance-syntheticaiterminaljournalmigrationtestguard-mjs",
      "enterprise-intelligence",
      "ei-acceptance-supabase-functions-shared-enterpriseintelligencecommand-ts",
      "ei-acceptance-supabase-functions-shared-enterpriseintelligenceingestion-ts",
      "ei-production-query",
      "tenant-authority",
      "application-portfolio-pr1b-base",
      "ei-acceptance-20260804120000-enterprise-intelligence-authority-sql",
      "ei-acceptance-20260805130000-provider-secret-write-intent-recovery-sql",
      "ei-acceptance-20260805140000-enterprise-intelligence-ready-review-corrections-sql",
      "ei-acceptance-20260916181916-assess-document-xlsx-ingestion-authority-sql",
      "ei-acceptance-20261008022445-enterprise-evidence-canonical-size-limit-sql",
      "ei-acceptance-govern-immutable-action-authority",
      "legacy-delivery-20261010025331-legacy-delivery-authority-sql",
      "authenticated-supabase-migrations-20261010051100-authenticated-studio-delivery-outcome-monitor-sql",
      "authenticated-supabase-migrations-20261010051413-authenticated-process-update-authority-sql"
    ],
    "ownership": [
      {
        "kind": "retained-assertion",
        "ownerId": "enterprise-intelligence-postgres-acceptance",
        "assertionId": "enterprise-intelligence-postgres-acceptance::EI-001",
        "scenarioId": "EI-001::retained-contract"
      }
    ]
  },
  {
    "branchId": "EI-QUERY_TENANT_ISOLATION",
    "testId": "EI-003",
    "sourceAnchorIds": [
      "ei-acceptance-testenterpriseintelligenceacceptancepostgres-mjs",
      "ei-acceptance-enterpriseintelligenceacceptanceevidence-mjs",
      "ei-acceptance-enterpriseintelligenceacceptanceparser-test-ts",
      "ei-acceptance-enterpriseintelligencepostgresfixture-mjs",
      "authenticated-controls-loader",
      "studio-acceptance-syntheticaiterminaljournalmigrationtestguard-mjs",
      "enterprise-intelligence",
      "ei-acceptance-supabase-functions-shared-enterpriseintelligencecommand-ts",
      "ei-acceptance-supabase-functions-shared-enterpriseintelligenceingestion-ts",
      "ei-production-query",
      "tenant-authority",
      "application-portfolio-pr1b-base",
      "ei-acceptance-20260804120000-enterprise-intelligence-authority-sql",
      "ei-acceptance-20260805130000-provider-secret-write-intent-recovery-sql",
      "ei-acceptance-20260805140000-enterprise-intelligence-ready-review-corrections-sql",
      "ei-acceptance-20260916181916-assess-document-xlsx-ingestion-authority-sql",
      "ei-acceptance-20261008022445-enterprise-evidence-canonical-size-limit-sql",
      "ei-acceptance-govern-immutable-action-authority",
      "legacy-delivery-20261010025331-legacy-delivery-authority-sql",
      "authenticated-supabase-migrations-20261010051100-authenticated-studio-delivery-outcome-monitor-sql",
      "authenticated-supabase-migrations-20261010051413-authenticated-process-update-authority-sql"
    ],
    "ownership": [
      {
        "kind": "retained-assertion",
        "ownerId": "enterprise-intelligence-postgres-acceptance",
        "assertionId": "enterprise-intelligence-postgres-acceptance::EI-003",
        "scenarioId": "EI-003::retained-contract"
      }
    ]
  },
  {
    "branchId": "GOVERN-APPROVAL",
    "testId": "GOVERN-005",
    "sourceAnchorIds": [
      "assess-review-domain",
      "authenticated-scripts-authenticatedacceptancecases-mjs",
      "authenticated-scripts-authenticatedacceptanceprofile-mjs",
      "authenticated-scripts-authenticatedacceptanceevidence-mjs",
      "authenticated-scripts-enterpriselifecyclepostgresfixture-mjs",
      "authenticated-tests-browser-enterpriselifecycleacceptance-enterpriselifecycleacceptance-spec-ts",
      "authenticated-supabase-migrations-20261010051100-authenticated-studio-delivery-outcome-monitor-sql",
      "authenticated-supabase-migrations-20261010051413-authenticated-process-update-authority-sql"
    ],
    "ownership": [
      {
        "kind": "authenticated-scenario",
        "ownerId": "authenticated-govern-005"
      }
    ]
  },
  {
    "branchId": "GOVERN-CHANGES_REQUESTED",
    "testId": "GOVERN-003",
    "sourceAnchorIds": [
      "assess-review-domain",
      "authenticated-scripts-authenticatedacceptancecases-mjs",
      "authenticated-scripts-authenticatedacceptanceprofile-mjs",
      "authenticated-scripts-authenticatedacceptanceevidence-mjs",
      "authenticated-scripts-enterpriselifecyclepostgresfixture-mjs",
      "authenticated-tests-browser-enterpriselifecycleacceptance-enterpriselifecycleacceptance-spec-ts",
      "authenticated-supabase-migrations-20261010051100-authenticated-studio-delivery-outcome-monitor-sql",
      "authenticated-supabase-migrations-20261010051413-authenticated-process-update-authority-sql"
    ],
    "ownership": [
      {
        "kind": "authenticated-scenario",
        "ownerId": "authenticated-govern-003"
      }
    ]
  },
  {
    "branchId": "GOVERN-DUPLICATE_DECISION",
    "testId": "GOVERN-010",
    "sourceAnchorIds": [
      "govern-acceptance-testgovernacceptancepostgres-mjs",
      "govern-acceptance-governacceptanceevidence-mjs",
      "studio-acceptance-syntheticaiterminaljournalmigrationtestguard-mjs",
      "assess-review-domain",
      "application-portfolio-pr1b-base",
      "assess-v2-pr1d",
      "govern-acceptance-20260720160000-pr1e-assess-v2-governed-review-handoff-sql",
      "govern-acceptance-20260923142120-pr1e-govern-control-alias-binding-sql"
    ],
    "ownership": [
      {
        "kind": "retained-assertion",
        "ownerId": "govern-postgres-acceptance",
        "assertionId": "govern-postgres-acceptance::GOVERN-010",
        "scenarioId": "GOVERN-010::retained-contract"
      }
    ]
  },
  {
    "branchId": "GOVERN-INDEPENDENT_ATTESTATION",
    "testId": "GOVERN-002",
    "sourceAnchorIds": [
      "assess-review-domain",
      "authenticated-scripts-authenticatedacceptancecases-mjs",
      "authenticated-scripts-authenticatedacceptanceprofile-mjs",
      "authenticated-scripts-authenticatedacceptanceevidence-mjs",
      "authenticated-scripts-enterpriselifecyclepostgresfixture-mjs",
      "authenticated-tests-browser-enterpriselifecycleacceptance-enterpriselifecycleacceptance-spec-ts",
      "authenticated-supabase-migrations-20261010051100-authenticated-studio-delivery-outcome-monitor-sql",
      "authenticated-supabase-migrations-20261010051413-authenticated-process-update-authority-sql"
    ],
    "ownership": [
      {
        "kind": "authenticated-scenario",
        "ownerId": "authenticated-govern-002"
      }
    ]
  },
  {
    "branchId": "GOVERN-REJECTION",
    "testId": "GOVERN-006",
    "sourceAnchorIds": [
      "assess-review-domain",
      "authenticated-scripts-authenticatedacceptancecases-mjs",
      "authenticated-scripts-authenticatedacceptanceprofile-mjs",
      "authenticated-scripts-authenticatedacceptanceevidence-mjs",
      "authenticated-scripts-enterpriselifecyclepostgresfixture-mjs",
      "authenticated-tests-browser-enterpriselifecycleacceptance-enterpriselifecycleacceptance-spec-ts",
      "authenticated-supabase-migrations-20261010051100-authenticated-studio-delivery-outcome-monitor-sql",
      "authenticated-supabase-migrations-20261010051413-authenticated-process-update-authority-sql"
    ],
    "ownership": [
      {
        "kind": "authenticated-scenario",
        "ownerId": "authenticated-govern-006"
      }
    ]
  },
  {
    "branchId": "GOVERN-REVIEW_ASSIGNMENT",
    "testId": "GOVERN-001",
    "sourceAnchorIds": [
      "assess-review-domain",
      "authenticated-scripts-authenticatedacceptancecases-mjs",
      "authenticated-scripts-authenticatedacceptanceprofile-mjs",
      "authenticated-scripts-authenticatedacceptanceevidence-mjs",
      "authenticated-scripts-enterpriselifecyclepostgresfixture-mjs",
      "authenticated-tests-browser-enterpriselifecycleacceptance-enterpriselifecycleacceptance-spec-ts",
      "authenticated-supabase-migrations-20261010051100-authenticated-studio-delivery-outcome-monitor-sql",
      "authenticated-supabase-migrations-20261010051413-authenticated-process-update-authority-sql"
    ],
    "ownership": [
      {
        "kind": "authenticated-scenario",
        "ownerId": "authenticated-govern-001"
      }
    ]
  },
  {
    "branchId": "GOVERN-REVOKED_AUTHORITY",
    "testId": "GOVERN-009",
    "sourceAnchorIds": [
      "govern-acceptance-testgovernacceptancepostgres-mjs",
      "govern-acceptance-governacceptanceevidence-mjs",
      "studio-acceptance-syntheticaiterminaljournalmigrationtestguard-mjs",
      "assess-review-domain",
      "application-portfolio-pr1b-base",
      "assess-v2-pr1d",
      "govern-acceptance-20260720160000-pr1e-assess-v2-governed-review-handoff-sql",
      "govern-acceptance-20260923142120-pr1e-govern-control-alias-binding-sql"
    ],
    "ownership": [
      {
        "kind": "retained-assertion",
        "ownerId": "govern-postgres-acceptance",
        "assertionId": "govern-postgres-acceptance::GOVERN-009",
        "scenarioId": "GOVERN-009::retained-contract"
      }
    ]
  },
  {
    "branchId": "GOVERN-REWORK_RESUBMIT",
    "testId": "GOVERN-004",
    "sourceAnchorIds": [
      "assess-review-domain",
      "authenticated-scripts-authenticatedacceptancecases-mjs",
      "authenticated-scripts-authenticatedacceptanceprofile-mjs",
      "authenticated-scripts-authenticatedacceptanceevidence-mjs",
      "authenticated-scripts-enterpriselifecyclepostgresfixture-mjs",
      "authenticated-tests-browser-enterpriselifecycleacceptance-enterpriselifecycleacceptance-spec-ts",
      "authenticated-supabase-migrations-20261010051100-authenticated-studio-delivery-outcome-monitor-sql",
      "authenticated-supabase-migrations-20261010051413-authenticated-process-update-authority-sql"
    ],
    "ownership": [
      {
        "kind": "authenticated-scenario",
        "ownerId": "authenticated-govern-004"
      }
    ]
  },
  {
    "branchId": "GOVERN-SEPARATION_OF_DUTY",
    "testId": "GOVERN-007",
    "sourceAnchorIds": [
      "assess-review-domain",
      "authenticated-scripts-authenticatedacceptancecases-mjs",
      "authenticated-scripts-authenticatedacceptanceprofile-mjs",
      "authenticated-scripts-authenticatedacceptanceevidence-mjs",
      "authenticated-scripts-enterpriselifecyclepostgresfixture-mjs",
      "authenticated-tests-browser-enterpriselifecycleacceptance-enterpriselifecycleacceptance-spec-ts",
      "authenticated-supabase-migrations-20261010051100-authenticated-studio-delivery-outcome-monitor-sql",
      "authenticated-supabase-migrations-20261010051413-authenticated-process-update-authority-sql"
    ],
    "ownership": [
      {
        "kind": "authenticated-scenario",
        "ownerId": "authenticated-govern-007"
      }
    ]
  },
  {
    "branchId": "GOVERN-STALE_AUTHORITY",
    "testId": "GOVERN-008",
    "sourceAnchorIds": [
      "govern-acceptance-testgovernacceptancepostgres-mjs",
      "govern-acceptance-governacceptanceevidence-mjs",
      "studio-acceptance-syntheticaiterminaljournalmigrationtestguard-mjs",
      "assess-review-domain",
      "application-portfolio-pr1b-base",
      "assess-v2-pr1d",
      "govern-acceptance-20260720160000-pr1e-assess-v2-governed-review-handoff-sql",
      "govern-acceptance-20260923142120-pr1e-govern-control-alias-binding-sql"
    ],
    "ownership": [
      {
        "kind": "retained-assertion",
        "ownerId": "govern-postgres-acceptance",
        "assertionId": "govern-postgres-acceptance::GOVERN-008",
        "scenarioId": "GOVERN-008::retained-contract"
      }
    ]
  },
  {
    "branchId": "MONITOR-BLOCKER_VISIBILITY",
    "testId": "MONITOR-003",
    "sourceAnchorIds": [
      "docs-delivery-lineage",
      "authenticated-scripts-authenticatedacceptancecases-mjs",
      "authenticated-scripts-authenticatedacceptanceprofile-mjs",
      "authenticated-scripts-authenticatedacceptanceevidence-mjs",
      "authenticated-scripts-enterpriselifecyclepostgresfixture-mjs",
      "authenticated-tests-browser-enterpriselifecycleacceptance-enterpriselifecycleacceptance-spec-ts",
      "authenticated-supabase-migrations-20261010051100-authenticated-studio-delivery-outcome-monitor-sql",
      "authenticated-supabase-migrations-20261010051413-authenticated-process-update-authority-sql",
      "authenticated-services-productacceptancebridge-contracts-ts",
      "authenticated-services-productacceptancebridge-client-ts",
      "authenticated-supabase-functions-shared-studiodeliverycommand-ts",
      "authenticated-supabase-functions-shared-studiodeliveryoutcomequery-ts"
    ],
    "ownership": [
      {
        "kind": "authenticated-scenario",
        "ownerId": "authenticated-monitor-003"
      }
    ]
  },
  {
    "branchId": "MONITOR-LINEAGE_VISIBILITY",
    "testId": "MONITOR-001",
    "sourceAnchorIds": [
      "docs-delivery-lineage",
      "authenticated-scripts-authenticatedacceptancecases-mjs",
      "authenticated-scripts-authenticatedacceptanceprofile-mjs",
      "authenticated-scripts-authenticatedacceptanceevidence-mjs",
      "authenticated-scripts-enterpriselifecyclepostgresfixture-mjs",
      "authenticated-tests-browser-enterpriselifecycleacceptance-enterpriselifecycleacceptance-spec-ts",
      "authenticated-supabase-migrations-20261010051100-authenticated-studio-delivery-outcome-monitor-sql",
      "authenticated-supabase-migrations-20261010051413-authenticated-process-update-authority-sql",
      "authenticated-services-productacceptancebridge-contracts-ts",
      "authenticated-services-productacceptancebridge-client-ts",
      "authenticated-supabase-functions-shared-studiodeliverycommand-ts",
      "authenticated-supabase-functions-shared-studiodeliveryoutcomequery-ts"
    ],
    "ownership": [
      {
        "kind": "authenticated-scenario",
        "ownerId": "authenticated-monitor-001"
      }
    ]
  },
  {
    "branchId": "MONITOR-UNAVAILABLE_PROJECTION",
    "testId": "MONITOR-004",
    "sourceAnchorIds": [
      "docs-delivery-lineage",
      "authenticated-scripts-authenticatedacceptancecases-mjs",
      "authenticated-scripts-authenticatedacceptanceprofile-mjs",
      "authenticated-scripts-authenticatedacceptanceevidence-mjs",
      "authenticated-scripts-enterpriselifecyclepostgresfixture-mjs",
      "authenticated-tests-browser-enterpriselifecycleacceptance-enterpriselifecycleacceptance-spec-ts",
      "authenticated-supabase-migrations-20261010051100-authenticated-studio-delivery-outcome-monitor-sql",
      "authenticated-supabase-migrations-20261010051413-authenticated-process-update-authority-sql",
      "authenticated-services-productacceptancebridge-contracts-ts",
      "authenticated-services-productacceptancebridge-client-ts",
      "authenticated-supabase-functions-shared-studiodeliverycommand-ts",
      "authenticated-supabase-functions-shared-studiodeliveryoutcomequery-ts"
    ],
    "ownership": [
      {
        "kind": "authenticated-scenario",
        "ownerId": "authenticated-monitor-004"
      }
    ]
  },
  {
    "branchId": "MONITOR-VALUE_SIGNAL",
    "testId": "MONITOR-002",
    "sourceAnchorIds": [
      "docs-delivery-lineage",
      "authenticated-scripts-authenticatedacceptancecases-mjs",
      "authenticated-scripts-authenticatedacceptanceprofile-mjs",
      "authenticated-scripts-authenticatedacceptanceevidence-mjs",
      "authenticated-scripts-enterpriselifecyclepostgresfixture-mjs",
      "authenticated-tests-browser-enterpriselifecycleacceptance-enterpriselifecycleacceptance-spec-ts",
      "authenticated-supabase-migrations-20261010051100-authenticated-studio-delivery-outcome-monitor-sql",
      "authenticated-supabase-migrations-20261010051413-authenticated-process-update-authority-sql",
      "authenticated-services-productacceptancebridge-contracts-ts",
      "authenticated-services-productacceptancebridge-client-ts",
      "authenticated-supabase-functions-shared-studiodeliverycommand-ts",
      "authenticated-supabase-functions-shared-studiodeliveryoutcomequery-ts"
    ],
    "ownership": [
      {
        "kind": "authenticated-scenario",
        "ownerId": "authenticated-monitor-002"
      }
    ]
  },
  {
    "branchId": "PUBLIC-LANDING",
    "testId": "PUBLIC-001",
    "sourceAnchorIds": [
      "application-shell"
    ],
    "ownership": [
      {
        "kind": "hosted-scenario",
        "ownerId": "public-landing"
      }
    ]
  },
  {
    "branchId": "PUBLIC-RELEASE_IDENTITY",
    "testId": "PUBLIC-004",
    "sourceAnchorIds": [
      "application-shell"
    ],
    "ownership": [
      {
        "kind": "hosted-scenario",
        "ownerId": "release-identity"
      }
    ]
  },
  {
    "branchId": "PUBLIC-SANDBOX_ROUTE_ISOLATION",
    "testId": "PUBLIC-003",
    "sourceAnchorIds": [
      "application-shell"
    ],
    "ownership": [
      {
        "kind": "hosted-scenario",
        "ownerId": "sandbox-accepted-descendant"
      }
    ]
  },
  {
    "branchId": "PUBLIC-SIGN_IN_SEPARATION",
    "testId": "PUBLIC-002",
    "sourceAnchorIds": [
      "application-shell"
    ],
    "ownership": [
      {
        "kind": "hosted-scenario",
        "ownerId": "sign-in-separation"
      }
    ]
  },
  {
    "branchId": "SAFETY-HORIZONTAL_OVERFLOW",
    "testId": "SAFETY-006",
    "sourceAnchorIds": [
      "persistence-transition"
    ],
    "ownership": [
      {
        "kind": "hosted-scenario",
        "ownerId": "horizontal-overflow"
      }
    ]
  },
  {
    "branchId": "SAFETY-OFFLINE_NO_FALSE_SUCCESS",
    "testId": "SAFETY-001",
    "sourceAnchorIds": [
      "persistence-transition",
      "authenticated-scripts-authenticatedacceptancecases-mjs",
      "authenticated-scripts-authenticatedacceptanceprofile-mjs",
      "authenticated-scripts-authenticatedacceptanceevidence-mjs",
      "authenticated-scripts-enterpriselifecyclepostgresfixture-mjs",
      "authenticated-tests-browser-enterpriselifecycleacceptance-enterpriselifecycleacceptance-spec-ts",
      "authenticated-supabase-migrations-20261010051100-authenticated-studio-delivery-outcome-monitor-sql",
      "authenticated-supabase-migrations-20261010051413-authenticated-process-update-authority-sql",
      "authenticated-services-processupdatecontract-ts",
      "authenticated-services-processupdateclient-ts",
      "authenticated-supabase-functions-shared-processupdatecommand-ts"
    ],
    "ownership": [
      {
        "kind": "authenticated-scenario",
        "ownerId": "authenticated-safety-001"
      }
    ]
  },
  {
    "branchId": "SAFETY-RELOAD_RECONSTRUCTION",
    "testId": "SAFETY-004",
    "sourceAnchorIds": [
      "persistence-transition"
    ],
    "ownership": [
      {
        "kind": "hosted-scenario",
        "ownerId": "reload-reconstruction"
      }
    ]
  },
  {
    "branchId": "SAFETY-RESPONSE_LOST_AFTER_COMMIT",
    "testId": "SAFETY-005",
    "sourceAnchorIds": [
      "pilot-operations-postgres",
      "hosted-exact-run-scenarios"
    ],
    "ownership": [
      {
        "kind": "server-assertion",
        "ownerId": "server-disposable-postgresql",
        "scenarioIds": [
          "production-command-response-lost-after-durable-commit"
        ],
        "assertionIds": [
          "pilot-operations-postgres--responseLossExactReplayVerified",
          "pilot-operations-postgres--responseLossExactlyOneEffectVerified",
          "pilot-operations-postgres--responseLossConflictRejected",
          "pilot-operations-postgres--responseLossForeignTenantNonDisclosure"
        ]
      }
    ]
  },
  {
    "branchId": "SAFETY-SERIOUS_CRITICAL_A11Y",
    "testId": "SAFETY-007",
    "sourceAnchorIds": [
      "persistence-transition"
    ],
    "ownership": [
      {
        "kind": "hosted-scenario",
        "ownerId": "serious-critical-a11y"
      }
    ]
  },
  {
    "branchId": "SAFETY-SERVER_ERROR_NO_FALSE_SUCCESS",
    "testId": "SAFETY-002",
    "sourceAnchorIds": [
      "persistence-transition",
      "authenticated-scripts-authenticatedacceptancecases-mjs",
      "authenticated-scripts-authenticatedacceptanceprofile-mjs",
      "authenticated-scripts-authenticatedacceptanceevidence-mjs",
      "authenticated-scripts-enterpriselifecyclepostgresfixture-mjs",
      "authenticated-tests-browser-enterpriselifecycleacceptance-enterpriselifecycleacceptance-spec-ts",
      "authenticated-supabase-migrations-20261010051100-authenticated-studio-delivery-outcome-monitor-sql",
      "authenticated-supabase-migrations-20261010051413-authenticated-process-update-authority-sql",
      "authenticated-services-processupdatecontract-ts",
      "authenticated-services-processupdateclient-ts",
      "authenticated-supabase-functions-shared-processupdatecommand-ts"
    ],
    "ownership": [
      {
        "kind": "authenticated-scenario",
        "ownerId": "authenticated-safety-002"
      }
    ]
  },
  {
    "branchId": "SAFETY-TIMEOUT_NO_FALSE_SUCCESS",
    "testId": "SAFETY-003",
    "sourceAnchorIds": [
      "persistence-transition",
      "authenticated-scripts-authenticatedacceptancecases-mjs",
      "authenticated-scripts-authenticatedacceptanceprofile-mjs",
      "authenticated-scripts-authenticatedacceptanceevidence-mjs",
      "authenticated-scripts-enterpriselifecyclepostgresfixture-mjs",
      "authenticated-tests-browser-enterpriselifecycleacceptance-enterpriselifecycleacceptance-spec-ts",
      "authenticated-supabase-migrations-20261010051100-authenticated-studio-delivery-outcome-monitor-sql",
      "authenticated-supabase-migrations-20261010051413-authenticated-process-update-authority-sql",
      "authenticated-services-processupdatecontract-ts",
      "authenticated-services-processupdateclient-ts",
      "authenticated-supabase-functions-shared-processupdatecommand-ts"
    ],
    "ownership": [
      {
        "kind": "authenticated-scenario",
        "ownerId": "authenticated-safety-003"
      }
    ]
  },
  {
    "branchId": "SANDBOX-ACCEPTED_DESCENDANT_ROUTE",
    "testId": "SANDBOX-006",
    "sourceAnchorIds": [
      "hosted-sandbox-route"
    ],
    "ownership": [
      {
        "kind": "hosted-scenario",
        "ownerId": "sandbox-accepted-descendant"
      }
    ]
  },
  {
    "branchId": "SANDBOX-ACCESS",
    "testId": "SANDBOX-001",
    "sourceAnchorIds": [
      "hosted-sandbox-route"
    ],
    "ownership": [
      {
        "kind": "hosted-scenario",
        "ownerId": "sandbox-access"
      }
    ]
  },
  {
    "branchId": "SANDBOX-DESKTOP_LAYOUT",
    "testId": "SANDBOX-007",
    "sourceAnchorIds": [
      "hosted-sandbox-route"
    ],
    "ownership": [
      {
        "kind": "hosted-scenario",
        "ownerId": "desktop-layout"
      }
    ]
  },
  {
    "branchId": "SANDBOX-KEYBOARD_ACCESSIBILITY",
    "testId": "SANDBOX-009",
    "sourceAnchorIds": [
      "hosted-sandbox-route",
      "sandbox-main-focus-target",
      "sandbox-readable-screen-motion",
      "sandbox-home-contrast-target",
      "sandbox-opaque-contrast-surface",
      "sandbox-contrast-foreground-token"
    ],
    "ownership": [
      {
        "kind": "hosted-scenario",
        "ownerId": "keyboard-a11y"
      }
    ]
  },
  {
    "branchId": "SANDBOX-LOCAL_SYNTHETIC_AUTHORITY",
    "testId": "SANDBOX-003",
    "sourceAnchorIds": [
      "hosted-sandbox-route"
    ],
    "ownership": [
      {
        "kind": "hosted-scenario",
        "ownerId": "local-authority"
      }
    ]
  },
  {
    "branchId": "SANDBOX-MOBILE_LAYOUT",
    "testId": "SANDBOX-008",
    "sourceAnchorIds": [
      "hosted-sandbox-route"
    ],
    "ownership": [
      {
        "kind": "hosted-scenario",
        "ownerId": "mobile-layout"
      }
    ]
  },
  {
    "branchId": "SANDBOX-NO_PROVIDER_CALL",
    "testId": "SANDBOX-004",
    "sourceAnchorIds": [
      "hosted-sandbox-route"
    ],
    "ownership": [
      {
        "kind": "hosted-scenario",
        "ownerId": "network-safety"
      }
    ]
  },
  {
    "branchId": "SANDBOX-PERSONA_SELECTION",
    "testId": "SANDBOX-002",
    "sourceAnchorIds": [
      "hosted-sandbox-route"
    ],
    "ownership": [
      {
        "kind": "hosted-scenario",
        "ownerId": "persona-matrix"
      }
    ]
  },
  {
    "branchId": "SANDBOX-REFRESH_PERSISTENCE",
    "testId": "SANDBOX-005",
    "sourceAnchorIds": [
      "hosted-sandbox-route"
    ],
    "ownership": [
      {
        "kind": "hosted-scenario",
        "ownerId": "reload-reconstruction"
      }
    ]
  },
  {
    "branchId": "STUDIO-DELETION",
    "testId": "STUDIO-010",
    "sourceAnchorIds": [
      "studio-acceptance-teststudioacceptancepostgres-mjs",
      "studio-acceptance-studioacceptanceevidence-mjs",
      "studio-acceptance-studioartifactpostgresfixture-mjs",
      "studio-acceptance-studioprivateartifactpostgresfixture-mjs",
      "studio-acceptance-syntheticaiterminaljournalmigrationtestguard-mjs",
      "studio-artifact-contracts",
      "studio-acceptance-20260727120000-studio-governed-artifact-authority-sql",
      "studio-acceptance-20260729163251-studio-private-artifact-authority-sql",
      "studio-acceptance-20260730190000-pr217-studio-private-artifact-runtime-forward-fix-sql",
      "studio-acceptance-20260828120000-governed-multisource-studio-pr-b-sql"
    ],
    "ownership": [
      {
        "kind": "retained-assertion",
        "ownerId": "studio-postgres-acceptance",
        "assertionId": "studio-postgres-acceptance::STUDIO-010",
        "scenarioId": "STUDIO-010::retained-contract"
      }
    ]
  },
  {
    "branchId": "STUDIO-DELETION_RECONCILIATION",
    "testId": "STUDIO-011",
    "sourceAnchorIds": [
      "studio-acceptance-teststudioacceptancepostgres-mjs",
      "studio-acceptance-studioacceptanceevidence-mjs",
      "studio-acceptance-studioartifactpostgresfixture-mjs",
      "studio-acceptance-studioprivateartifactpostgresfixture-mjs",
      "studio-acceptance-syntheticaiterminaljournalmigrationtestguard-mjs",
      "studio-artifact-contracts",
      "studio-acceptance-20260727120000-studio-governed-artifact-authority-sql",
      "studio-acceptance-20260729163251-studio-private-artifact-authority-sql",
      "studio-acceptance-20260730190000-pr217-studio-private-artifact-runtime-forward-fix-sql",
      "studio-acceptance-20260828120000-governed-multisource-studio-pr-b-sql"
    ],
    "ownership": [
      {
        "kind": "retained-assertion",
        "ownerId": "studio-postgres-acceptance",
        "assertionId": "studio-postgres-acceptance::STUDIO-011",
        "scenarioId": "STUDIO-011::retained-contract"
      }
    ]
  },
  {
    "branchId": "STUDIO-DOWNLOAD_DENIAL",
    "testId": "STUDIO-007",
    "sourceAnchorIds": [
      "studio-artifact-contracts",
      "authenticated-scripts-authenticatedacceptancecases-mjs",
      "authenticated-scripts-authenticatedacceptanceprofile-mjs",
      "authenticated-scripts-authenticatedacceptanceevidence-mjs",
      "authenticated-scripts-enterpriselifecyclepostgresfixture-mjs",
      "authenticated-tests-browser-enterpriselifecycleacceptance-enterpriselifecycleacceptance-spec-ts",
      "authenticated-supabase-migrations-20261010051100-authenticated-studio-delivery-outcome-monitor-sql",
      "authenticated-supabase-migrations-20261010051413-authenticated-process-update-authority-sql",
      "authenticated-scripts-authenticatedcontrolsfixture-mjs",
      "authenticated-scripts-authenticatedcontrolsacceptance-mjs",
      "authenticated-scripts-authenticatedcontrolspostgresadapter-mjs",
      "authenticated-tests-browser-authenticatedcontrolsacceptance-ts"
    ],
    "ownership": [
      {
        "kind": "authenticated-scenario",
        "ownerId": "authenticated-studio-007"
      }
    ]
  },
  {
    "branchId": "STUDIO-GENERATION_FAILURE",
    "testId": "STUDIO-003",
    "sourceAnchorIds": [
      "studio-artifact-contracts",
      "authenticated-scripts-authenticatedacceptancecases-mjs",
      "authenticated-scripts-authenticatedacceptanceprofile-mjs",
      "authenticated-scripts-authenticatedacceptanceevidence-mjs",
      "authenticated-scripts-enterpriselifecyclepostgresfixture-mjs",
      "authenticated-tests-browser-enterpriselifecycleacceptance-enterpriselifecycleacceptance-spec-ts",
      "authenticated-supabase-migrations-20261010051100-authenticated-studio-delivery-outcome-monitor-sql",
      "authenticated-supabase-migrations-20261010051413-authenticated-process-update-authority-sql"
    ],
    "ownership": [
      {
        "kind": "authenticated-scenario",
        "ownerId": "authenticated-studio-003"
      }
    ]
  },
  {
    "branchId": "STUDIO-GOVERNED_GENERATION",
    "testId": "STUDIO-002",
    "sourceAnchorIds": [
      "studio-artifact-contracts",
      "authenticated-scripts-authenticatedacceptancecases-mjs",
      "authenticated-scripts-authenticatedacceptanceprofile-mjs",
      "authenticated-scripts-authenticatedacceptanceevidence-mjs",
      "authenticated-scripts-enterpriselifecyclepostgresfixture-mjs",
      "authenticated-tests-browser-enterpriselifecycleacceptance-enterpriselifecycleacceptance-spec-ts",
      "authenticated-supabase-migrations-20261010051100-authenticated-studio-delivery-outcome-monitor-sql",
      "authenticated-supabase-migrations-20261010051413-authenticated-process-update-authority-sql"
    ],
    "ownership": [
      {
        "kind": "authenticated-scenario",
        "ownerId": "authenticated-studio-002"
      }
    ]
  },
  {
    "branchId": "STUDIO-HANDOFF_LINEAGE",
    "testId": "STUDIO-001",
    "sourceAnchorIds": [
      "studio-artifact-contracts",
      "authenticated-scripts-authenticatedacceptancecases-mjs",
      "authenticated-scripts-authenticatedacceptanceprofile-mjs",
      "authenticated-scripts-authenticatedacceptanceevidence-mjs",
      "authenticated-scripts-enterpriselifecyclepostgresfixture-mjs",
      "authenticated-tests-browser-enterpriselifecycleacceptance-enterpriselifecycleacceptance-spec-ts",
      "authenticated-supabase-migrations-20261010051100-authenticated-studio-delivery-outcome-monitor-sql",
      "authenticated-supabase-migrations-20261010051413-authenticated-process-update-authority-sql",
      "authenticated-services-productacceptancebridge-contracts-ts",
      "authenticated-services-productacceptancebridge-client-ts",
      "authenticated-supabase-functions-shared-studiodeliverycommand-ts",
      "authenticated-supabase-functions-shared-studiodeliveryoutcomequery-ts"
    ],
    "ownership": [
      {
        "kind": "authenticated-scenario",
        "ownerId": "authenticated-studio-001"
      }
    ]
  },
  {
    "branchId": "STUDIO-LEGAL_HOLD",
    "testId": "STUDIO-009",
    "sourceAnchorIds": [
      "studio-acceptance-teststudioacceptancepostgres-mjs",
      "studio-acceptance-studioacceptanceevidence-mjs",
      "studio-acceptance-studioartifactpostgresfixture-mjs",
      "studio-acceptance-studioprivateartifactpostgresfixture-mjs",
      "studio-acceptance-syntheticaiterminaljournalmigrationtestguard-mjs",
      "studio-artifact-contracts",
      "studio-acceptance-20260727120000-studio-governed-artifact-authority-sql",
      "studio-acceptance-20260729163251-studio-private-artifact-authority-sql",
      "studio-acceptance-20260730190000-pr217-studio-private-artifact-runtime-forward-fix-sql",
      "studio-acceptance-20260828120000-governed-multisource-studio-pr-b-sql"
    ],
    "ownership": [
      {
        "kind": "retained-assertion",
        "ownerId": "studio-postgres-acceptance",
        "assertionId": "studio-postgres-acceptance::STUDIO-009",
        "scenarioId": "STUDIO-009::retained-contract"
      }
    ]
  },
  {
    "branchId": "STUDIO-PRIVATE_RENDITION",
    "testId": "STUDIO-006",
    "sourceAnchorIds": [
      "studio-acceptance-teststudioacceptancepostgres-mjs",
      "studio-acceptance-studioacceptanceevidence-mjs",
      "studio-acceptance-studioartifactpostgresfixture-mjs",
      "studio-acceptance-studioprivateartifactpostgresfixture-mjs",
      "studio-acceptance-syntheticaiterminaljournalmigrationtestguard-mjs",
      "studio-artifact-contracts",
      "studio-acceptance-20260727120000-studio-governed-artifact-authority-sql",
      "studio-acceptance-20260729163251-studio-private-artifact-authority-sql",
      "studio-acceptance-20260730190000-pr217-studio-private-artifact-runtime-forward-fix-sql",
      "studio-acceptance-20260828120000-governed-multisource-studio-pr-b-sql"
    ],
    "ownership": [
      {
        "kind": "retained-assertion",
        "ownerId": "studio-postgres-acceptance",
        "assertionId": "studio-postgres-acceptance::STUDIO-006",
        "scenarioId": "STUDIO-006::retained-contract"
      }
    ]
  },
  {
    "branchId": "STUDIO-RETENTION",
    "testId": "STUDIO-008",
    "sourceAnchorIds": [
      "studio-acceptance-teststudioacceptancepostgres-mjs",
      "studio-acceptance-studioacceptanceevidence-mjs",
      "studio-acceptance-studioartifactpostgresfixture-mjs",
      "studio-acceptance-studioprivateartifactpostgresfixture-mjs",
      "studio-acceptance-syntheticaiterminaljournalmigrationtestguard-mjs",
      "studio-artifact-contracts",
      "studio-acceptance-20260727120000-studio-governed-artifact-authority-sql",
      "studio-acceptance-20260729163251-studio-private-artifact-authority-sql",
      "studio-acceptance-20260730190000-pr217-studio-private-artifact-runtime-forward-fix-sql",
      "studio-acceptance-20260828120000-governed-multisource-studio-pr-b-sql"
    ],
    "ownership": [
      {
        "kind": "retained-assertion",
        "ownerId": "studio-postgres-acceptance",
        "assertionId": "studio-postgres-acceptance::STUDIO-008",
        "scenarioId": "STUDIO-008::retained-contract"
      }
    ]
  },
  {
    "branchId": "STUDIO-REVISION_IMMUTABILITY",
    "testId": "STUDIO-004",
    "sourceAnchorIds": [
      "studio-acceptance-teststudioacceptancepostgres-mjs",
      "studio-acceptance-studioacceptanceevidence-mjs",
      "studio-acceptance-studioartifactpostgresfixture-mjs",
      "studio-acceptance-studioprivateartifactpostgresfixture-mjs",
      "studio-acceptance-syntheticaiterminaljournalmigrationtestguard-mjs",
      "studio-artifact-contracts",
      "studio-acceptance-20260727120000-studio-governed-artifact-authority-sql",
      "studio-acceptance-20260729163251-studio-private-artifact-authority-sql",
      "studio-acceptance-20260730190000-pr217-studio-private-artifact-runtime-forward-fix-sql",
      "studio-acceptance-20260828120000-governed-multisource-studio-pr-b-sql"
    ],
    "ownership": [
      {
        "kind": "retained-assertion",
        "ownerId": "studio-postgres-acceptance",
        "assertionId": "studio-postgres-acceptance::STUDIO-004",
        "scenarioId": "STUDIO-004::retained-contract"
      }
    ]
  },
  {
    "branchId": "STUDIO-THREE_PERSON_APPROVAL",
    "testId": "STUDIO-005",
    "sourceAnchorIds": [
      "studio-acceptance-teststudioacceptancepostgres-mjs",
      "studio-acceptance-studioacceptanceevidence-mjs",
      "studio-acceptance-studioartifactpostgresfixture-mjs",
      "studio-acceptance-studioprivateartifactpostgresfixture-mjs",
      "studio-acceptance-syntheticaiterminaljournalmigrationtestguard-mjs",
      "studio-artifact-contracts",
      "studio-acceptance-20260727120000-studio-governed-artifact-authority-sql",
      "studio-acceptance-20260729163251-studio-private-artifact-authority-sql",
      "studio-acceptance-20260730190000-pr217-studio-private-artifact-runtime-forward-fix-sql",
      "studio-acceptance-20260828120000-governed-multisource-studio-pr-b-sql"
    ],
    "ownership": [
      {
        "kind": "retained-assertion",
        "ownerId": "studio-postgres-acceptance",
        "assertionId": "studio-postgres-acceptance::STUDIO-005",
        "scenarioId": "STUDIO-005::retained-contract"
      }
    ]
  },
  {
    "branchId": "TRUST-AUDIT_TRUTH",
    "testId": "TRUST-005",
    "sourceAnchorIds": [
      "trust-acceptance-harness",
      "trust-acceptance-evidence",
      "trust-assurance",
      "trust-assurance-migration"
    ],
    "ownership": [
      {
        "kind": "retained-assertion",
        "ownerId": "trust-authority",
        "assertionId": "trust-authority::TRUST-005",
        "scenarioId": "TRUST-005::retained-contract"
      }
    ]
  },
  {
    "branchId": "TRUST-CLAIM_EVIDENCE_SELECTION",
    "testId": "TRUST-001",
    "sourceAnchorIds": [
      "trust-acceptance-harness",
      "trust-acceptance-evidence",
      "trust-assurance",
      "trust-assurance-migration"
    ],
    "ownership": [
      {
        "kind": "retained-assertion",
        "ownerId": "trust-authority",
        "assertionId": "trust-authority::TRUST-001",
        "scenarioId": "TRUST-001::retained-contract"
      }
    ]
  },
  {
    "branchId": "TRUST-CROSS_TENANT_DENIAL",
    "testId": "TRUST-004",
    "sourceAnchorIds": [
      "trust-acceptance-harness",
      "trust-acceptance-evidence",
      "trust-assurance",
      "trust-assurance-migration"
    ],
    "ownership": [
      {
        "kind": "retained-assertion",
        "ownerId": "trust-authority",
        "assertionId": "trust-authority::TRUST-004",
        "scenarioId": "TRUST-004::retained-contract"
      }
    ]
  },
  {
    "branchId": "TRUST-IMMUTABLE_EVIDENCE",
    "testId": "TRUST-003",
    "sourceAnchorIds": [
      "trust-acceptance-harness",
      "trust-acceptance-evidence",
      "trust-assurance",
      "trust-assurance-migration"
    ],
    "ownership": [
      {
        "kind": "retained-assertion",
        "ownerId": "trust-authority",
        "assertionId": "trust-authority::TRUST-003",
        "scenarioId": "TRUST-003::retained-contract"
      }
    ]
  },
  {
    "branchId": "TRUST-PUBLICATION_SOD",
    "testId": "TRUST-002",
    "sourceAnchorIds": [
      "trust-acceptance-harness",
      "trust-acceptance-evidence",
      "trust-assurance",
      "trust-assurance-migration"
    ],
    "ownership": [
      {
        "kind": "retained-assertion",
        "ownerId": "trust-authority",
        "assertionId": "trust-authority::TRUST-002",
        "scenarioId": "TRUST-002::retained-contract"
      }
    ]
  }
]);
