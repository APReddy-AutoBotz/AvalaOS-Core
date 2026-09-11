import assert from 'node:assert/strict';
import test from 'node:test';
import type { TenantContextProjection } from '../../types.ts';
import type { ControlledHumanBackendAttestation, ControlledHumanBrowserBinding } from '../runtimeMode.ts';
import type { StudioSourcePackageIdentity } from './client.ts';
import {
  buildPrCControlledHumanSyntheticGenerationCommand,
  executePrCControlledHumanSyntheticGeneration,
  PrCControlledHumanSyntheticGenerationBoundaryError,
} from './prCControlledHumanSyntheticGeneration.ts';

const U = Array.from({ length: 12 }, (_, index) => `00000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`);
const releaseSha = 'a'.repeat(40);
const binding: ControlledHumanBrowserBinding = {
  releaseSha,
  reviewHeadSha: releaseSha,
  deployId: 'b'.repeat(24),
  deployOrigin: 'https://deploy-preview-264--avalaos-pilot.netlify.app',
  exerciseDigest: `sha256:${'c'.repeat(64)}`,
  targetFingerprint: `sha256:${'d'.repeat(64)}`,
  publicTargetDigest: `sha256:${'1'.repeat(64)}`,
};
const attestation: ControlledHumanBackendAttestation = {
  attested: true,
  contractVersion: 'pr-c-controlled-human-attestation-1',
  environmentClass: 'hosted_nonproduction_pilot',
  prNumber: 264,
  ...binding,
  personaManifestDigest: `sha256:${'e'.repeat(64)}`,
  fixtureManifestDigest: `sha256:${'f'.repeat(64)}`,
  migrationTip: '20260904120000',
  productionAuthorized: false,
  customerDataAuthorized: false,
  realProviderCallsAuthorized: false,
};
const context: TenantContextProjection = {
  userId: U[0],
  organizationId: U[1],
  organizationName: 'Synthetic organization',
  workspaceId: U[2],
  workspaceName: 'Synthetic workspace',
  authorizationVersion: 9,
  capabilities: ['studio.artifacts.generate', 'studio.artifacts.read'],
};
const sourcePackage: StudioSourcePackageIdentity = {
  artifactId: U[3],
  aggregateVersion: 4,
  currentVersionId: U[4],
  currentApprovedVersionId: null,
  sourcePackageId: U[5],
  sourcePackageVersion: 2,
  sourcePackageHash: '1'.repeat(64),
  sourceMode: 'assess_plus_transcript_bundle',
  version: 2,
  lineageClassification: 'mixed',
  planningOnly: false,
  hasAssessAncestry: true,
  hasStudioTranscriptBundle: true,
  hasManualBrief: false,
  routePolicyVersion: 3,
  createdAt: '2026-09-04T00:00:00.000Z',
};
const template = { kind: 'tenant' as const, templateId: U[6], versionId: U[7], version: 1, hash: '2'.repeat(64) };
const result = {
  ok: true,
  outcome: 'generation_completed',
  commandOutcome: 'committed',
  receiptId: U[8],
  resourceId: U[3],
  resource: {
    artifactId: U[3],
    versionId: U[9],
    version: 5,
    sourcePackageId: U[5],
    sourcePackageVersion: 2,
    sourcePackageHash: '1'.repeat(64),
    templateVersionId: U[7],
    templateVersion: 1,
    templateHash: '2'.repeat(64),
    generationKind: 'synthetic_controlled_human',
    synthetic: true,
  },
};

test('builds the exact attested server command without content, provider, route, model, or secret claims', () => {
  const command = buildPrCControlledHumanSyntheticGenerationCommand(
    context, { sourcePackage, template }, 'pr264:synthetic:request:one', U[10], binding, attestation,
  );
  assert.equal(command.environmentClass, 'hosted_nonproduction_pilot');
  assert.equal(command.prNumber, 264);
  assert.equal(command.releaseSha, command.reviewHeadSha);
  assert.deepEqual(command.template, template);
  for (const forbidden of ['content', 'provider', 'providerConfigId', 'providerRouteId', 'model', 'secret', 'prompt']) {
    assert.equal(forbidden in command, false, forbidden);
  }
});

test('executes only when controlled runtime, binding, attestation, scope, capability and lineage are exact', async () => {
  let invoked: Record<string, unknown> | null = null;
  const response = await executePrCControlledHumanSyntheticGeneration(
    context,
    { sourcePackage, template },
    'pr264:synthetic:request:two',
    {
      enabled: () => true,
      resolveBinding: () => ({ status: 'ready', binding }),
      attest: async () => attestation,
      requestId: () => U[10],
      invoke: async body => { invoked = body; return { data: result, error: null }; },
    },
  );
  assert.equal(invoked?.sourcePackageHash, sourcePackage.sourcePackageHash);
  assert.equal(response.resource.generationKind, 'synthetic_controlled_human');
  assert.equal(response.resource.synthetic, true);
});

test('noncontrolled runtime, missing attestation, stale binding and missing capability deny before invocation', async () => {
  const cases = [
    { enabled: () => false, resolveBinding: () => ({ status: 'ready' as const, binding }), attest: async () => attestation, context },
    { enabled: () => true, resolveBinding: () => ({ status: 'disabled' as const }), attest: async () => attestation, context },
    { enabled: () => true, resolveBinding: () => ({ status: 'ready' as const, binding }), attest: async () => null, context },
    { enabled: () => true, resolveBinding: () => ({ status: 'ready' as const, binding }), attest: async () => ({ ...attestation, releaseSha: '9'.repeat(40) }), context },
    { enabled: () => true, resolveBinding: () => ({ status: 'ready' as const, binding }), attest: async () => attestation, context: { ...context, capabilities: ['studio.artifacts.read'] } },
    { enabled: () => true, resolveBinding: () => ({ status: 'ready' as const, binding }), attest: async () => attestation, context: { ...context, workspaceId: 'foreign' } },
  ];
  for (const candidate of cases) {
    let calls = 0;
    await assert.rejects(
      executePrCControlledHumanSyntheticGeneration(candidate.context, { sourcePackage, template }, 'pr264:synthetic:request:three', {
        enabled: candidate.enabled,
        resolveBinding: candidate.resolveBinding,
        attest: candidate.attest,
        requestId: () => U[10],
        invoke: async () => { calls += 1; return { data: result, error: null }; },
      }),
      PrCControlledHumanSyntheticGenerationBoundaryError,
    );
    assert.equal(calls, 0);
  }
});

test('wrong source/template/replay result substitution cannot become success', async () => {
  const mutations = [
    { ...result, resourceId: U[11] },
    { ...result, resource: { ...result.resource, sourcePackageHash: '3'.repeat(64) } },
    { ...result, resource: { ...result.resource, templateVersionId: U[11] } },
    { ...result, resource: { ...result.resource, generationKind: 'provider' } },
    { ...result, resource: { ...result.resource, synthetic: false } },
    { ...result, providerOperationId: 'forbidden' },
  ];
  for (const data of mutations) {
    await assert.rejects(
      executePrCControlledHumanSyntheticGeneration(context, { sourcePackage, template }, 'pr264:synthetic:request:four', {
        enabled: () => true,
        resolveBinding: () => ({ status: 'ready', binding }),
        attest: async () => attestation,
        requestId: () => U[10],
        invoke: async () => ({ data, error: null }),
      }),
      PrCControlledHumanSyntheticGenerationBoundaryError,
    );
  }
});

test('provider/network failure cannot silently fall back to synthetic success', async () => {
  const retainedRequestId = U[11];
  let observedRequestId: unknown;
  await assert.rejects(
    executePrCControlledHumanSyntheticGeneration(context, { sourcePackage, template, requestId: retainedRequestId }, 'pr264:synthetic:request:five', {
      enabled: () => true,
      resolveBinding: () => ({ status: 'ready', binding }),
      attest: async () => attestation,
      requestId: () => { throw new Error('a retained retry must not mint a substitute request'); },
      invoke: async body => { observedRequestId = body.requestId; return { data: null, error: { name: 'FunctionsFetchError' } }; },
    }),
    PrCControlledHumanSyntheticGenerationBoundaryError,
  );
  assert.equal(observedRequestId, retainedRequestId);
});
