import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { createAuthenticatedControlsProductionLoader } from './authenticatedControlsProductionLoader.mjs';

const root = process.cwd();
const hash = value => createHash('sha256').update(String(value)).digest('hex');
const json = (body, status = 200) => new Response(JSON.stringify(body), {
  status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
});

const emptyProjectionRows = () => ({
  providerConfigs: [], providerRoutes: [], providerRoleOptions: [], providerRoleCapabilities: [],
  evidenceSources: [], evidenceVersions: [], evidenceCandidates: [], assessDrafts: [], applications: [],
  applicationAssessments: [], studioAggregates: [], studioVersions: [], studioHandoffs: [],
  deliveryPackages: [], deliveryVersions: [], deliveryItems: [], monitorBaselines: [],
  deliveryWorkspace: null, monitorApprovedBaselines: null, modernizationAssessments: [],
  modernizationDecisions: [], blueprints: [], reviewEvents: [], approvals: [], commandReceipts: [],
  transcriptFlags: [], transcriptSources: [], transcriptSourceVersions: [], transcriptCandidates: [],
  transcriptSourceSets: [], transcriptSourceSetVersions: [], transcriptSourceSetItems: [],
  transcriptInputBundles: [], transcriptInputBundleVersions: [], transcriptInputBundleItems: [],
  transcriptJourneys: [], transcriptApplyPreviews: [], transcriptApplyPreviewBatches: [],
  transcriptCandidateApplications: [], transcriptCandidateRelationships: [], transcriptConflicts: [],
  transcriptConflictResolutions: [], transcriptExtractionBindings: [], transcriptJobs: [],
  transcriptStalenessEvents: [], studioSourceFlags: [], studioSourceOwnerships: [],
  studioExtractionJobClassifications: [], studioSources: [], studioSourceVersions: [],
  studioSourceCandidates: [], studioSourceSets: [], studioSourceSetVersions: [], studioSourceSetItems: [],
  studioInputBundles: [], studioInputBundleVersions: [], studioInputBundleItems: [], studioExtractionRuns: [],
  studioExtractionBindings: [], studioCandidateEdits: [], studioProviderRoutes: [], mappingCatalogs: [],
  mappingTargets: [], mappingRuns: [], mappingRunSources: [], mappingProposals: [], mappingReviews: [],
  mappingPreviewBatches: [], mappingPreviewManifests: [], mappingPreviewItems: [], mappingConflicts: [],
  mappingConflictResolutions: [], mappingApplications: [],
});

const actorEntries = actors => Object.values(actors).map(actor => [actor.token, actor.user.id]);

/**
 * Mountable local-only acceptance adapter. It executes production handlers and
 * command code while the parent fixture owns HTTP, auth tokens and PostgreSQL.
 * It never enables a provider route and its synthetic secret store cannot egress.
 */
export const createAuthenticatedControlsFixture = ({
  scope,
  actors,
  serviceQuery,
  actorQuery,
  fixtureQuery = serviceQuery,
  loadProductionModule: suppliedLoader,
}) => {
  if (!scope?.organizationId || !scope?.workspaceId || !actors || !serviceQuery || !actorQuery) {
    throw new Error('AUTHENTICATED_CONTROLS_FIXTURE_INPUT_REQUIRED');
  }
  const observations = {
    apiCalls: 0, authorityRpcCalls: 0, projectionLoads: 0, providerRequests: 0,
    providerSecretWrites: 0, providerSecretReads: 0, providerSecretRemovals: 0,
    providerLogicalWrites: 0, providerReceiptCommits: 0, privilegedAuditWrites: 0,
    adminRpcCalls: 0, pilotOperationsReads: 0, storageClaims: 0, storageReads: 0,
    storageCompletions: 0, egressAttempts: 0,
  };
  const load = suppliedLoader ?? createAuthenticatedControlsProductionLoader({ effects: observations });
  const queryModule = load(path.join(root, 'supabase', 'functions', '_shared', 'enterpriseIntelligenceQuery.ts'));
  const tenantModule = load(path.join(root, 'supabase', 'functions', '_shared', 'tenantAuthority.ts'));
  const adminModule = load(path.join(root, 'supabase', 'functions', '_shared', 'syntheticAdminEndpoint.ts'));
  const adminContract = load(path.join(root, 'services', 'syntheticAdminContract.ts'));
  const downloadModule = load(path.join(root, 'supabase', 'functions', '_shared', 'studioPrivateArtifactDownloadHandler.ts'));
  const tokens = new Map(actorEntries(actors));
  const actorFrom = request => {
    const token = request.headers.get('authorization')?.replace(/^Bearer\s+/iu, '');
    const actorId = token ? tokens.get(token) : null;
    if (!actorId) throw new Error('AUTHENTICATION_REQUIRED');
    return actorId;
  };
  const authorityFor = async (actorId, organizationId, workspaceId) => {
    observations.authorityRpcCalls += 1;
    const result = await actorQuery(actorId, 'SELECT public.get_tenant_context($1,$2) value', [organizationId, workspaceId]);
    return tenantModule.resolveTenantAuthority(actorId, { organizationId, workspaceId }, {
      loadFreshProjection: async () => result.rows[0]?.value ?? null,
    });
  };
  let postgresAdapter = null;
  const rawProjection = async authority => {
    const rows = emptyProjectionRows();
    const values = [authority.organizationId, authority.workspaceId];
    rows.providerConfigs = (await serviceQuery(`SELECT id,provider,display_name,default_model,status,key_ref_id,budget_policy,last_validated_at,created_at
      FROM public.ai_provider_configs WHERE org_id=$1 AND deleted_at IS NULL ORDER BY created_at DESC,id DESC LIMIT 100`, [values[0]])).rows;
    rows.providerRoutes = (await serviceQuery(`SELECT id,provider_config_id,capability,model,enabled,allowed_roles,updated_at
      FROM public.enterprise_ai_capability_routes WHERE org_id=$1 AND workspace_id=$2 AND deleted_at IS NULL ORDER BY updated_at DESC LIMIT 200`, values)).rows;
    rows.providerRoleOptions = (await serviceQuery(`SELECT id,name,slug,scope,org_id,workspace_id FROM public.roles
      WHERE org_id=$1 AND status='active' AND deleted_at IS NULL AND (workspace_id=$2 OR workspace_id IS NULL)
      ORDER BY name LIMIT 200`, values)).rows;
    rows.providerRoleCapabilities = (await serviceQuery("SELECT role_id,capability_key FROM public.role_capabilities WHERE capability_key='org.admin' LIMIT 200")).rows;
    return rows;
  };

  const handle = async request => {
    const url = new URL(request.url);
    const owned = new Set([
      '/functions/v1/enterprise-intelligence-query', '/functions/v1/enterprise-provider-lifecycle',
      '/functions/v1/synthetic-admin', '/functions/v1/pilot-operations-query',
      '/functions/v1/studio-artifact-download',
    ]);
    if (!owned.has(url.pathname)) return null;
    observations.apiCalls += 1;
    if (url.pathname === '/functions/v1/enterprise-intelligence-query') {
      return queryModule.handleEnterpriseIntelligenceQuery(request, {
        authenticate: async candidate => ({ id: actorFrom(candidate) }),
        authorityDatabase: { loadFreshProjection: async target => {
          const actorId = actorFrom(request);
          observations.authorityRpcCalls += 1;
          const result = await actorQuery(actorId, 'SELECT public.get_tenant_context($1,$2) value', [target.organizationId, target.workspaceId]);
          return result.rows[0]?.value ?? null;
        } },
        queryDatabase: { loadProjectionRows: async authority => {
          observations.projectionLoads += 1;
          return rawProjection(authority);
        } },
      });
    }
    const actorId = actorFrom(request);
    if (url.pathname === '/functions/v1/enterprise-provider-lifecycle') {
      if (!postgresAdapter) return json({ ok: false, error: { code: 'PERSISTENCE_UNAVAILABLE' } }, 503);
      return postgresAdapter.handleRequest(request, actorId);
    }
    if (url.pathname === '/functions/v1/synthetic-admin') {
      return adminModule.handleSyntheticAdminRequest(request, {
        getUser: async () => ({ id: actorId }),
        rpc: async (name, args) => {
          observations.adminRpcCalls += 1;
          if (name !== 'synthetic_admin_list') throw new adminContract.SyntheticAdminError('INVALID_REQUEST');
          try {
            return (await serviceQuery(`SELECT public.synthetic_admin_list($1,$2,$3,$4,$5,$6,$7) value`, [
              args.p_actor,args.p_org,args.p_workspace,args.p_version,args.p_fingerprint,
              args.p_cursor,args.p_limit,
            ])).rows[0]?.value;
          } catch (error) {
            const signal = String(error?.message ?? error);
            if (/PERMISSION_DENIED|PR1B_(?:ACCESS|AUTHORITY|CAPABILITY|NOT_FOUND)/u.test(signal)) {
              throw new adminContract.SyntheticAdminError('PERMISSION_DENIED');
            }
            if (/AUTHORIZATION_STALE/u.test(signal)) throw new adminContract.SyntheticAdminError('AUTHORIZATION_STALE');
            if (/FEATURE_DISABLED/u.test(signal)) throw new adminContract.SyntheticAdminError('FEATURE_DISABLED');
            throw new adminContract.SyntheticAdminError('TEMPORARY_FAILURE');
          }
        },
        targetConfig: () => ({ enabled: true, fingerprint: `sha256:${'a'.repeat(64)}` }),
      });
    }
    if (url.pathname === '/functions/v1/pilot-operations-query') {
      observations.pilotOperationsReads += 1;
      const body = await request.json().catch(() => null);
      if (!body || body.organizationId !== scope.organizationId || body.workspaceId !== scope.workspaceId
        || !Number.isSafeInteger(body.expectedAuthorizationVersion)) return json({ code: 'VALIDATION_FAILED' }, 400);
      try {
        const authority = await authorityFor(actorId, body.organizationId, body.workspaceId);
        if (authority.authorizationVersion !== body.expectedAuthorizationVersion) return json({ code: 'AUTHORIZATION_STALE' }, 409);
        if (!authority.capabilities.includes('operations.read')) return json({ code: 'ACCESS_DENIED' }, 404);
        const value = (await serviceQuery('SELECT public.pilot_operations_projection($1,$2,$3,$4) value', [
          actorId,body.organizationId,body.workspaceId,body.expectedAuthorizationVersion,
        ])).rows[0]?.value;
        return json(value);
      } catch { return json({ code: 'ACCESS_DENIED' }, 404); }
    }
    const body = await request.clone().json().catch(() => ({}));
    const denied = new Request(request.url, {
      method: request.method, headers: request.headers, body: JSON.stringify(body),
    });
    return downloadModule.handleStudioPrivateArtifactDownload(denied, {
      authenticate: async () => ({ id: actorId }),
      loadFreshAuthority: async input => {
        const authority = await authorityFor(actorId, input.organizationId, input.workspaceId);
        return { actorId: authority.userId, organizationId: authority.organizationId,
          workspaceId: authority.workspaceId, authorizationVersion: authority.authorizationVersion,
          capabilities: authority.capabilities };
      },
      claimDownload: async () => { observations.storageClaims += 1; throw new Error('UNEXPECTED_STORAGE_CLAIM'); },
      retrieveAndVerify: async () => { observations.storageReads += 1; return { bytes: new Uint8Array([1]), mimeType: 'application/pdf', filename: 'synthetic.pdf' }; },
      completeDownload: async () => { observations.storageCompletions += 1; }, failDownload: async () => {},
    });
  };

  const adminActor = actors.author ?? actors.admin ?? Object.values(actors)[0];
  const nonAdminActor = actors.reviewer ?? actors.outsider;
  const restrictedRoleId = randomUUID();
  let restrictedRoleReady = false;
  let originalNonAdminRoleId = null;
  const beforeByCase = new Map();

  const ensureRestrictedRole = async () => {
    if (restrictedRoleReady || !nonAdminActor) return;
    const current = (await fixtureQuery(`SELECT role_id FROM public.organization_members
      WHERE org_id=$1 AND user_id=$2 AND status='active' AND deleted_at IS NULL`,
    [scope.organizationId, nonAdminActor.user.id])).rows[0];
    originalNonAdminRoleId = current?.role_id ?? null;
    await fixtureQuery(`INSERT INTO public.roles(id,org_id,name,slug,scope,permissions)
      VALUES($1,$2,'Authenticated controls restricted','authenticated-controls-restricted','organization','[]')`,
    [restrictedRoleId, scope.organizationId]);
    await fixtureQuery(`INSERT INTO public.role_capabilities(role_id,capability_key)
      SELECT $1,capability_key FROM public.capabilities
      WHERE capability_key IN('assess.read','studio.artifacts.read')`, [restrictedRoleId]);
    restrictedRoleReady = true;
  };

  const setNonAdminRestricted = async restricted => {
    if (!nonAdminActor) return;
    await ensureRestrictedRole();
    await fixtureQuery('UPDATE public.organization_members SET role_id=$3 WHERE org_id=$1 AND user_id=$2', [
      scope.organizationId, nonAdminActor.user.id, restricted ? restrictedRoleId : originalNonAdminRoleId,
    ]);
  };

  const ensurePilotProjection = async () => {
    const role = (await fixtureQuery(`SELECT role_id FROM public.organization_members
      WHERE org_id=$1 AND user_id=$2 AND status='active' AND deleted_at IS NULL`,
    [scope.organizationId, adminActor.user.id])).rows[0];
    await fixtureQuery("INSERT INTO public.role_capabilities(role_id,capability_key) VALUES($1,'operations.read') ON CONFLICT DO NOTHING", [role.role_id]);
    await fixtureQuery(`INSERT INTO public.pilot_operations_environments(
      org_id,workspace_id,environment_type,lifecycle,expected_schema_version,read_only,created_by)
      VALUES($1,$2,'pilot_candidate','active_non_live','local-acceptance',true,$3)
      ON CONFLICT(org_id,workspace_id,environment_type) DO NOTHING`,
    [scope.organizationId, scope.workspaceId, adminActor.user.id]);
  };

  const measureState = async () => {
    const db = (await fixtureQuery(`SELECT
      (SELECT count(*)::int FROM public.ai_provider_configs WHERE org_id=$1 AND key_ref_id IS NOT NULL) logical_mutations,
      (SELECT count(*)::int FROM public.ai_provider_key_refs WHERE org_id=$1) domain_writes,
      (SELECT count(*)::int FROM public.enterprise_ai_command_receipts WHERE org_id=$1 AND command_type='provider.secret.bind') receipt_writes,
      (SELECT count(*)::int FROM public.ai_provider_audit_events WHERE org_id=$1 AND operation='provider.secret.bind') audit_writes,
      (SELECT count(*)::int FROM public.studio_artifact_download_receipts WHERE org_id=$1 AND workspace_id=$2) storage_writes,
      (SELECT COALESCE(sum(request_count),0)::int FROM public.enterprise_ai_usage_ledger WHERE org_id=$1 AND workspace_id=$2) paid_calls,
      (SELECT COALESCE(sum(input_tokens+output_tokens),0)::int FROM public.enterprise_ai_usage_ledger WHERE org_id=$1 AND workspace_id=$2) provider_tokens,
      (SELECT count(*)::int FROM public.enterprise_ai_budget_reservations WHERE org_id=$1 AND workspace_id=$2) budget_debits`,
    [scope.organizationId, scope.workspaceId])).rows[0];
    const adapter = postgresAdapter?.observations ?? {};
    const counters = {
      logicalMutations: db.logical_mutations, domainWrites: db.domain_writes,
      receiptWrites: db.receipt_writes, auditWrites: db.audit_writes,
      secretWrites: adapter.secretWrites ?? 0, storageWrites: db.storage_writes,
      providerCalls: adapter.providerRequests ?? 0, paidCalls: db.paid_calls,
      providerTokens: db.provider_tokens, budgetDebits: db.budget_debits, foreignWrites: 0,
    };
    const enabledRoutes = Number((await fixtureQuery(`SELECT count(*)::int count FROM public.enterprise_ai_capability_routes
      WHERE org_id=$1 AND workspace_id=$2 AND enabled AND deleted_at IS NULL`,
    [scope.organizationId, scope.workspaceId])).rows[0]?.count ?? 0);
    observations.providerRouteEnabled = enabledRoutes > 0;
    return { counters, state: { ...counters, enabledRoutes,
      scopeHash: hash(`${scope.organizationId}\0${scope.workspaceId}`) } };
  };

  const prepareCase = async testId => {
    await setNonAdminRestricted(['ADMIN-002','ADMIN-003','AI-003','STUDIO-007'].includes(testId));
    if (testId === 'ADMIN-004') await ensurePilotProjection();
    await postgresAdapter?.prepareCase?.(testId);
    beforeByCase.set(testId, await measureState());
    const adminAuthority = await authorityFor(adminActor.user.id, scope.organizationId, scope.workspaceId);
    const nonAdminAuthority = nonAdminActor
      ? await authorityFor(nonAdminActor.user.id, scope.organizationId, scope.workspaceId).catch(() => null) : null;
    return { testId, prepared: true, organizationId: scope.organizationId, workspaceId: scope.workspaceId,
      providerConfigId: postgresAdapter?.providerConfigId ?? null,
      adminAuthorizationVersion: adminAuthority.authorizationVersion,
      nonAdminAuthorizationVersion: nonAdminAuthority?.authorizationVersion ?? null,
      renditionId: randomUUID() };
  };

  const readFrame = async testId => {
    const before = beforeByCase.get(testId);
    if (!before) throw new Error('AUTHENTICATED_CONTROLS_CASE_NOT_PREPARED');
    const after = await measureState();
    return { testId, measured: { before: before.counters, after: after.counters,
      beforeState: before.state, afterState: after.state }, observations: snapshot() };
  };

  const snapshot = () => Object.freeze({
    fixtureId: 'local-authenticated-controls-v1', authKind: 'fixture_transport',
    scopeHash: hash(`${scope.organizationId}\0${scope.workspaceId}`),
    ...structuredClone(observations), providerRouteEnabled: observations.providerRouteEnabled ?? null,
    providerSecretCount: postgresAdapter?.observations?.secretWrites ?? 0,
    providerReferenceDisclosed: postgresAdapter?.observations?.lastReferenceDisclosed ?? null,
    rawSecretPersisted: postgresAdapter?.observations?.lastRawSecretPersisted ?? null,
  });
  return {
    handle, observations, snapshot, prepareCase, readFrame,
    mountPostgresAdapter: adapter => { postgresAdapter = adapter; return true; },
    cleanup: async () => true,
    sourcePaths: [
      'scripts/authenticatedControlsFixture.mjs',
      'supabase/functions/_shared/enterpriseIntelligenceQuery.ts',
      'supabase/functions/_shared/providerLifecycle.ts',
      'supabase/functions/_shared/syntheticAdminEndpoint.ts',
      'supabase/functions/_shared/studioPrivateArtifactDownloadHandler.ts',
      'supabase/functions/pilot-operations-query/index.ts',
    ],
  };
};
