import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { createAuthenticatedControlsProductionLoader } from './authenticatedControlsProductionLoader.mjs';

const sha = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const one = result => result.rows[0];

/** DB-backed local adapter for AI-004. All durable writes use production RPCs. */
export const createAuthenticatedControlsPostgresAdapter = async ({
  scope, actorId, serviceQuery, actorQuery, fixtureQuery = serviceQuery, loadProductionModule: suppliedLoader,
}) => {
  if (!scope?.organizationId || !scope?.workspaceId || !actorId || !serviceQuery || !actorQuery) {
    throw new Error('AUTHENTICATED_CONTROLS_POSTGRES_INPUT_REQUIRED');
  }
  const observations = {
    secretWrites: 0,
    secretReads: 0,
    providerRequests: 0,
    egressAttempts: 0,
  };
  const load = suppliedLoader ?? createAuthenticatedControlsProductionLoader({ effects: observations });
  const lifecycle = load(path.resolve('supabase/functions/_shared/providerLifecycle.ts'));
  let providerConfigId = randomUUID();
  const disabledProviderConfigId = randomUUID();
  const unavailableProviderConfigId = randomUUID();
  const secretValues = new Map();
  await fixtureQuery(`INSERT INTO public.ai_provider_configs(
    id,org_id,provider,display_name,default_model,model_allowlist,endpoint_url,
    allowed_modes,allowed_operations,status,created_by,updated_by
  ) VALUES($1,$2,'openai','Authenticated controls synthetic','synthetic-disabled-model',
    ARRAY['synthetic-disabled-model'],'https://api.openai.com',ARRAY['pilot'],
    ARRAY['generate_document'],'pending_review',$5,$5),
    ($3,$2,'openai','Authenticated controls disabled','synthetic-disabled-model',
    ARRAY['synthetic-disabled-model'],'https://api.openai.com',ARRAY['pilot'],
    ARRAY['generate_document'],'retired',$5,$5),
    ($4,$2,'openai','Authenticated controls unavailable','synthetic-disabled-model',
    ARRAY['synthetic-disabled-model'],'https://api.openai.com',ARRAY['pilot'],
    ARRAY['generate_document'],'pending_review',$5,$5)`, [providerConfigId, scope.organizationId,
      disabledProviderConfigId, unavailableProviderConfigId, actorId]);
  // Provider configuration setup advances authorization freshness. Resolve the
  // actor projection after setup so the measured command carries the current
  // version into the production transition RPC.
  const authorityRow = one(await actorQuery(actorId,
    'SELECT public.get_tenant_context($1,$2) value', [scope.organizationId, scope.workspaceId])).value;
  if (!authorityRow) throw new Error('AUTHENTICATED_CONTROLS_AUTHORITY_REQUIRED');
  const writeCounts = async () => one(await fixtureQuery(`SELECT
    (SELECT count(*)::int FROM public.ai_provider_key_refs WHERE org_id=$1) key_refs,
    (SELECT count(*)::int FROM public.enterprise_ai_command_receipts WHERE org_id=$1 AND command_type='provider.secret.bind') receipts,
    (SELECT count(*)::int FROM public.ai_provider_audit_events WHERE org_id=$1 AND operation='provider.secret.bind') audits`, [scope.organizationId]));

  const loadConfig = async ({ providerConfigId: requestedProviderConfigId } = {}) => {
    const configId = requestedProviderConfigId ?? providerConfigId;
    const row = one(await serviceQuery(`SELECT c.id,c.org_id,c.provider,c.status,c.default_model,c.model_allowlist,
      c.endpoint_url,c.last_validated_at,c.key_ref_id,k.resolver_type,k.secret_ref,k.safe_fingerprint,k.status key_status
      FROM public.ai_provider_configs c LEFT JOIN public.ai_provider_key_refs k ON k.id=c.key_ref_id
      WHERE c.id=$1 AND c.org_id=$2 AND c.deleted_at IS NULL`, [configId, scope.organizationId]));
    return row && {
      id: row.id,
      organizationId: row.org_id,
      provider: row.provider,
      status: row.status,
      endpoint: row.endpoint_url,
      defaultModel: row.default_model,
      modelAllowlist: row.model_allowlist,
      lastValidatedAt: row.last_validated_at,
      keyRef: row.key_ref_id ? {
        id: row.key_ref_id,
        provider: row.provider,
        resolverType: row.resolver_type,
        secretRef: row.secret_ref,
        safeFingerprint: row.safe_fingerprint,
        status: row.key_status,
      } : null,
    };
  };
  const authorityFor = async currentActorId => {
    const fresh = one(await actorQuery(currentActorId,
      'SELECT public.get_tenant_context($1,$2) value', [scope.organizationId, scope.workspaceId])).value;
    if (!fresh) throw new lifecycle.ProviderLifecycleError('TENANT_ACCESS_DENIED');
    const roles = (await serviceQuery(`SELECT role.id,role.name,role.scope FROM public.roles role
      JOIN public.organization_members member ON member.role_id=role.id
      WHERE member.org_id=$1 AND member.user_id=$2 AND member.status='active' AND member.deleted_at IS NULL
      UNION ALL
      SELECT role.id,role.name,role.scope FROM public.roles role
      JOIN public.workspace_memberships member ON member.role_id=role.id
      WHERE member.org_id=$1 AND member.workspace_id=$3 AND member.user_id=$2
        AND member.status='active' AND member.deleted_at IS NULL`,
    [scope.organizationId, currentActorId, scope.workspaceId])).rows;
    const organizationRoles = roles.filter(row => row.scope === 'organization');
    const workspaceRoles = roles.filter(row => row.scope === 'workspace');
    return {
      actorId: currentActorId,
      organizationId: scope.organizationId,
      workspaceId: scope.workspaceId,
      authorizationVersion: fresh.authorizationVersion,
      organizationCapabilities: new Set(fresh.capabilities),
      workspaceCapabilities: new Set(fresh.capabilities),
      organizationRoleNames: new Set(organizationRoles.map(row => row.name)),
      workspaceRoleNames: new Set(workspaceRoles.map(row => row.name)),
      organizationRoleIds: new Set(organizationRoles.map(row => row.id)),
      workspaceRoleIds: new Set(workspaceRoles.map(row => row.id)),
      eligibleRouteRoleIds: new Set(),
    };
  };

  const providerDeps = currentActorId => ({
    database: {
      loadConfig,
      transition: async input => {
        try {
          const freshAuthority = await authorityFor(currentActorId);
          return one(await serviceQuery(`SELECT public.enterprise_provider_lifecycle_transition(
            $1,$2,$3,$4,$5,$6::jsonb,$7,$8,$9,$10::jsonb) value`, [input.operation, currentActorId,
            scope.organizationId, scope.workspaceId, freshAuthority.authorizationVersion, JSON.stringify(input.payload),
            input.execution?.receiptId ?? null, input.execution?.executionToken ?? null,
            input.execution?.executionFence ?? null, JSON.stringify(input.execution?.result ?? {})])).value;
        } catch (error) {
          observations.lastPersistenceSignal = String(error?.message ?? error)
            .match(/ENTERPRISE_[A-Z0-9_]+|PR1B_[A-Z0-9_]+/u)?.[0] ?? String(error?.code ?? 'unknown');
          throw error;
        }
      },
    },
    secretBackend: {
      kind: 'vault',
      writable: true,
      resolve: async ({ secretRef }) => {
        observations.secretReads += 1;
        return secretValues.get(secretRef);
      },
      write: async ({ secretRef, value }) => {
        observations.secretWrites += 1;
        secretValues.set(secretRef, value);
      },
      remove: async ({ secretRef }) => {
        secretValues.delete(secretRef);
      },
    },
    routeResolverDeps: {},
    validateConnection: async () => {
      observations.providerRequests += 1;
      throw new Error('NO_EGRESS');
    },
    now: () => new Date('2026-10-10T00:00:00.000Z'),
    randomId: randomUUID,
    assertCampaignRegistration: async () => {},
    assertCampaignLifecycle: async input => {
      const result = one(await serviceQuery(`SELECT public.synthetic_ai_campaign_assert_lifecycle_operation(
        $1,$2,$3,$4) value`, [input.organizationId, input.workspaceId, input.providerConfigId, input.operation]));
      if (result?.value?.allowed !== true) throw new Error('EFFECT_NOT_AUTHORIZED');
    },
    reserveCampaignEffect: async () => {
      observations.providerRequests += 1;
      throw new Error('NO_EGRESS');
    },
  });

  const executeSecretBind = async (syntheticSecret, currentActorId = actorId) => {
    if (typeof syntheticSecret !== 'string' || syntheticSecret.length < 8) throw new Error('SYNTHETIC_SECRET_REQUIRED');
    const before = await writeCounts();
    const secretWritesBefore = observations.secretWrites;
    const providerRequestsBefore = observations.providerRequests;
    const executionToken = randomUUID();
    const requestId = randomUUID();
    const receiptIdempotency = `authenticated-ai004-${randomUUID()}`;
    let receipt = one(await serviceQuery(`SELECT * FROM public.enterprise_ai_claim_command(
      $1,$2,$3,'provider.secret.bind',$4,$5,$6,NULL,$7)`, [actorId, scope.organizationId,
      scope.workspaceId, receiptIdempotency, requestId, sha({ providerConfigId }), executionToken]));
    const execution = {
      receiptId: receipt.id,
      executionToken: receipt.execution_token,
      executionFence: Number(receipt.execution_fence),
      plan: receipt.execution_plan ?? {},
      persistPlan: async plan => {
        receipt = one(await serviceQuery('SELECT * FROM public.enterprise_ai_plan_command($1,$2,$3,$4,$5,$6::jsonb)',
          [receipt.id, scope.organizationId, scope.workspaceId, receipt.execution_token,
            receipt.execution_fence, JSON.stringify(plan)]));
        return receipt.execution_plan;
      },
      renewCleanupLease: async () => {},
    };
    const authority = await authorityFor(currentActorId);
    const result = await lifecycle.executeProviderLifecycleCommand('provider.secret.bind', authority,
      { providerConfigId, providerKey: syntheticSecret }, providerDeps(currentActorId), execution);
    await serviceQuery('SELECT * FROM public.enterprise_ai_complete_command($1,$2,$3,$4,$5,$6::jsonb,$7)',
      [receipt.id, scope.organizationId, scope.workspaceId, receipt.execution_token, receipt.execution_fence,
        JSON.stringify(result), providerConfigId]);
    const after = await writeCounts();
    const persisted = (await fixtureQuery(`SELECT jsonb_build_object(
      'config',to_jsonb(config),
      'key',to_jsonb(key),
      'receipt',to_jsonb(receipt),
      'audit',to_jsonb(audit)
    ) value
    FROM public.ai_provider_configs config
    JOIN public.ai_provider_key_refs key ON key.id=config.key_ref_id
    JOIN public.enterprise_ai_command_receipts receipt ON receipt.org_id=config.org_id
      AND receipt.command_type='provider.secret.bind' AND receipt.resource_id=config.id
    JOIN public.ai_provider_audit_events audit ON audit.org_id=config.org_id
      AND audit.provider_config_id=config.id AND audit.operation='provider.secret.bind'
    WHERE config.id=$1 ORDER BY receipt.created_at DESC,audit.created_at DESC LIMIT 1`, [providerConfigId])).rows[0]?.value;
    if (!persisted) throw new Error('AUTHENTICATED_CONTROLS_PERSISTED_PROOF_MISSING');
    const persistedSerialized = JSON.stringify(persisted ?? {});
    const rawSecretPersisted = persistedSerialized.includes(syntheticSecret);
    const safeResponse = { status: result.status, providerConfigId, secretBound: true };
    const serializedResponse = JSON.stringify(safeResponse);
    const referenceDisclosed = /secret[_-]?ref|key[_-]?ref|safeFingerprint/iu.test(serializedResponse);
    observations.lastReferenceDisclosed = referenceDisclosed;
    observations.lastRawSecretPersisted = rawSecretPersisted;
    return {
      ...safeResponse,
      measurements: {
        logicalMutations: 1,
        domainWrites: after.key_refs - before.key_refs,
        receiptWrites: after.receipts - before.receipts,
        auditWrites: after.audits - before.audits,
        secretWrites: observations.secretWrites - secretWritesBefore,
        providerCalls: observations.providerRequests - providerRequestsBefore,
        referenceDisclosed,
        rawSecretPersisted,
      },
    };
  };

  const executeNoEffect = async (operation, currentActorId, selectedProviderConfigId) => {
    const authority = await authorityFor(currentActorId);
    const execution = {
      receiptId: randomUUID(),
      executionToken: randomUUID(),
      executionFence: 1,
      plan: {},
      persistPlan: async plan => plan,
      renewCleanupLease: async () => {},
    };
    return lifecycle.executeProviderLifecycleCommand(operation, authority,
      { providerConfigId: selectedProviderConfigId }, providerDeps(currentActorId), execution);
  };

  const prepareCase = async testId => {
    if (!['AI-001','AI-002','AI-003','AI-004','AI-005','AI-006'].includes(testId)) return;
    if (testId === 'AI-006') return;
    await fixtureQuery('UPDATE public.enterprise_ai_capability_routes SET enabled=false WHERE org_id=$1 AND workspace_id=$2',
      [scope.organizationId, scope.workspaceId]);
    await fixtureQuery('UPDATE public.ai_provider_configs SET deleted_at=statement_timestamp() WHERE org_id=$1', [scope.organizationId]);
    if (testId === 'AI-004') {
      const current = one(await fixtureQuery(
        'SELECT key_ref_id FROM public.ai_provider_configs WHERE id=$1 AND org_id=$2',
        [providerConfigId, scope.organizationId],
      ));
      if (current?.key_ref_id) {
        providerConfigId = randomUUID();
        await fixtureQuery(`INSERT INTO public.ai_provider_configs(
          id,org_id,provider,display_name,default_model,model_allowlist,endpoint_url,
          allowed_modes,allowed_operations,status,created_by,updated_by
        ) VALUES($1,$2,'openai','Authenticated controls synthetic','synthetic-disabled-model',
          ARRAY['synthetic-disabled-model'],'https://api.openai.com',ARRAY['pilot'],
          ARRAY['generate_document'],'pending_review',$3,$3)`,
        [providerConfigId, scope.organizationId, actorId]);
      }
    }
    const selected = testId === 'AI-002' ? disabledProviderConfigId
      : testId === 'AI-003' || testId === 'AI-004' ? providerConfigId
        : testId === 'AI-005' ? unavailableProviderConfigId : null;
    if (selected) await fixtureQuery('UPDATE public.ai_provider_configs SET deleted_at=NULL WHERE id=$1 AND org_id=$2',
      [selected, scope.organizationId]);
  };

  const handleRequest = async (request, currentActorId) => {
    let body;
    try { body = await request.json(); } catch { return Response.json({ ok: false, error: { code: 'INVALID_REQUEST' } }, { status: 400 }); }
    const operation = body?.operation;
    const selectedProviderConfigId = body?.payload?.providerConfigId;
    if (body?.organizationId !== scope.organizationId || body?.workspaceId !== scope.workspaceId
      || typeof selectedProviderConfigId !== 'string' || !Number.isSafeInteger(body?.expectedAuthorizationVersion)) {
      return Response.json({ ok: false, error: { code: 'INVALID_REQUEST' } }, { status: 400 });
    }
    try {
      const requestAuthority = await authorityFor(currentActorId);
      if (requestAuthority.authorizationVersion !== body.expectedAuthorizationVersion) {
        throw new lifecycle.ProviderLifecycleError('AUTHORIZATION_STALE');
      }
      const result = operation === 'provider.secret.bind'
        ? await executeSecretBind(body?.payload?.providerKey, currentActorId)
        : operation === 'provider.validate'
          ? await executeNoEffect(operation, currentActorId, selectedProviderConfigId)
          : (() => { throw new lifecycle.ProviderLifecycleError('INVALID_REQUEST'); })();
      const safe = operation === 'provider.secret.bind'
        ? { status: result.status, providerConfigId: result.providerConfigId, secretBound: true }
        : { status: result.status, providerConfigId: result.providerConfigId };
      return Response.json({ ok: true, replayed: false, ...safe });
    } catch (error) {
      const code = error instanceof lifecycle.ProviderLifecycleError ? error.code : 'PERSISTENCE_UNAVAILABLE';
      const status = code === 'PERMISSION_DENIED' ? 403 : code === 'RESOURCE_NOT_FOUND' ? 404
        : code === 'AUTHORIZATION_STALE' ? 409 : code === 'INVALID_REQUEST' ? 400 : 503;
      return Response.json({ ok: false, error: { code } }, { status });
    }
  };

  return {
    executeSecretBind,
    executeNoEffect,
    handleRequest,
    prepareCase,
    resetProjectState: () => {
      secretValues.clear();
      return { secretBackendCleared: secretValues.size === 0 };
    },
    observations,
    get providerConfigId() { return providerConfigId; },
    disabledProviderConfigId,
    unavailableProviderConfigId,
    cleanup: async () => {
      secretValues.clear();
      observations.secretBackendCleanupVerified = secretValues.size === 0;
      if (!observations.secretBackendCleanupVerified) throw new Error('AUTHENTICATED_CONTROLS_SECRET_CLEANUP_FAILED');
      return true;
    },
    sourcePaths: [
      'scripts/authenticatedControlsPostgresAdapter.mjs',
      'supabase/functions/_shared/providerLifecycle.ts',
      'supabase/migrations/20260804120000_enterprise_intelligence_authority.sql',
    ],
  };
};
