import { createHash } from 'node:crypto';
import process from 'node:process';
import { pathToFileURL } from 'node:url';
import pg from 'pg';

import { createControlledHumanPostgresClientConfig,
  validatePrivilegedPostgresConnectionString } from './prCControlledHumanPostgresTls.mjs';

export const CANONICAL_HANDS_ON_SCHEMA = 'canonical-hands-on-access-v1';
export const CANONICAL_HANDS_ON_PERSONAS = Object.freeze(['author', 'reviewer', 'approver', 'deliveryOwner']);
export const CANONICAL_HANDS_ON_CAPABILITIES = Object.freeze({
  author: Object.freeze([
    'assess.create', 'assess.finalize', 'assess.process.update', 'assess.read', 'assess.response.write',
    'assess.v2.clone', 'assess.v2.create', 'assess.v2.draft.write', 'assess.v2.finalize', 'assess.v2.read',
    'delivery.handoff.request', 'monitor.read', 'operations.read', 'project.read',
    'studio.artifacts.approve', 'studio.artifacts.read', 'studio.artifacts.review',
    'studio.handoffs.read', 'studio.handoffs.request', 'studio.templates.read',
  ].toSorted()),
  reviewer: Object.freeze([
    'assess.read', 'assess.v2.approve', 'assess.v2.evidence.attest', 'assess.v2.read', 'assess.v2.review',
    'delivery.handoff.review', 'delivery.outcomes.read', 'delivery.package.review', 'project.read',
    'studio.artifacts.read', 'studio.artifacts.review', 'studio.handoffs.read', 'studio.handoffs.review',
  ].toSorted()),
  approver: Object.freeze([
    'assess.read', 'assess.v2.govern.resolve', 'assess.v2.read', 'assess.v2.studio.handoff',
    'delivery.handoff.approve', 'delivery.package.approve', 'monitor.baseline.create', 'monitor.read', 'project.read',
    'studio.artifacts.edit', 'studio.artifacts.generate', 'studio.artifacts.read',
    'studio.handoffs.approve', 'studio.handoffs.consume', 'studio.handoffs.read', 'studio.templates.read',
  ].toSorted()),
  deliveryOwner: Object.freeze([
    'assess.read', 'delivery.handoff.consume', 'delivery.package.manage', 'project.read',
  ].toSorted()),
});

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const SHA = /^[0-9a-f]{40}$/u;
const DIGEST = /^sha256:[0-9a-f]{64}$/u;
const PROJECT_REF = /^[a-z0-9]{20}$/u;
const LOGIN = /^hands-on\.[a-z0-9]{8,24}\.(author|reviewer|approver|delivery-owner)@example\.invalid$/u;
const SECRET_KEY = /password|token|secret|credential|database|service.?role|email|login/iu;
const fail = code => { throw new Error(`CANONICAL_HANDS_ON_${code}`); };
const exactKeys = (value, keys, code = 'BUNDLE_REJECTED') => {
  if (!value || typeof value !== 'object' || Array.isArray(value)
    || JSON.stringify(Object.keys(value).sort()) !== JSON.stringify([...keys].sort())) fail(code);
};
const iso = value => {
  const parsed = new Date(value);
  return Number.isFinite(parsed.getTime()) ? parsed.toISOString() : null;
};
const digest = value => `sha256:${createHash('sha256').update(JSON.stringify(value)).digest('hex')}`;
const same = (left, right) => JSON.stringify(left) === JSON.stringify(right);

export function validateCanonicalHandsOnBundle(raw, {
  operation, operatorSha, previewReleaseSha, previewUrl, now = new Date(),
} = {}) {
  let value;
  try { value = typeof raw === 'string' ? JSON.parse(raw) : raw; } catch { fail('BUNDLE_REJECTED'); }
  exactKeys(value, [
    'schemaVersion', 'bundleId', 'targetProjectRef', 'targetPublicDigest', 'organizationId', 'workspaceId',
    'migrationVersion', 'operatorSha', 'previewReleaseSha', 'previewUrl', 'createdAt', 'expiresAt', 'personas',
  ]);
  if (value.schemaVersion !== CANONICAL_HANDS_ON_SCHEMA || !UUID.test(value.bundleId)
    || !PROJECT_REF.test(value.targetProjectRef) || !DIGEST.test(value.targetPublicDigest)
    || !UUID.test(value.organizationId) || !UUID.test(value.workspaceId)
    || !/^20[0-9]{12}$/u.test(value.migrationVersion) || !SHA.test(value.operatorSha)
    || !SHA.test(value.previewReleaseSha)
    || !/^https:\/\/ap-acceptance-[0-9a-f]{8}--avalaos-pilot\.netlify\.app$/u.test(value.previewUrl)) {
    fail('BUNDLE_REJECTED');
  }
  if (!['prepare', 'revoke'].includes(operation) || value.operatorSha !== operatorSha
    || value.previewReleaseSha !== previewReleaseSha || value.previewUrl !== previewUrl) fail('REQUEST_BINDING_REJECTED');
  const createdAt = iso(value.createdAt); const expiresAt = iso(value.expiresAt); const nowMs = now.getTime();
  if (!createdAt || !expiresAt || Date.parse(createdAt) > nowMs + 5 * 60_000
    || (operation === 'prepare' && Date.parse(expiresAt) <= nowMs)
    || Date.parse(expiresAt) - Date.parse(createdAt) > 7 * 24 * 60 * 60_000) {
    fail('EXPIRY_REJECTED');
  }
  if (!Array.isArray(value.personas) || value.personas.length !== CANONICAL_HANDS_ON_PERSONAS.length) {
    fail('PERSONA_SET_REJECTED');
  }
  const personas = new Map();
  for (const persona of value.personas) {
    exactKeys(persona, ['key', 'userId', 'loginId', 'password', 'roleId']);
    if (!CANONICAL_HANDS_ON_PERSONAS.includes(persona.key) || personas.has(persona.key)
      || !UUID.test(persona.userId) || !UUID.test(persona.roleId) || !LOGIN.test(persona.loginId)
      || typeof persona.password !== 'string' || persona.password.length < 20 || persona.password.length > 128
      || /\s/u.test(persona.password)) fail('PERSONA_REJECTED');
    const expectedLoginPersona = persona.key === 'deliveryOwner' ? 'delivery-owner' : persona.key;
    if (!persona.loginId.endsWith(`.${expectedLoginPersona}@example.invalid`)) fail('PERSONA_REJECTED');
    personas.set(persona.key, Object.freeze({ ...persona }));
  }
  if (!CANONICAL_HANDS_ON_PERSONAS.every(key => personas.has(key))
    || new Set([...personas.values()].map(item => item.userId)).size !== personas.size
    || new Set([...personas.values()].map(item => item.roleId)).size !== personas.size
    || new Set([...personas.values()].map(item => item.loginId)).size !== personas.size
    || new Set([...personas.values()].map(item => item.password)).size !== personas.size) fail('PERSONA_SET_REJECTED');
  return Object.freeze({ ...value, createdAt, expiresAt,
    personas: Object.freeze(CANONICAL_HANDS_ON_PERSONAS.map(key => personas.get(key))) });
}

export function validateCanonicalHandsOnRoleInventory(rows, bundle) {
  if (!Array.isArray(rows) || rows.length !== CANONICAL_HANDS_ON_PERSONAS.length) fail('ROLE_INVENTORY_REJECTED');
  const byRole = new Map(rows.map(row => [row.id, row]));
  for (const persona of bundle.personas) {
    const role = byRole.get(persona.roleId);
    const actual = Array.isArray(role?.capabilities) ? [...role.capabilities].sort() : null;
    if (role?.status !== 'active' || role?.scope !== 'organization' || role?.org_id !== bundle.organizationId
      || role?.workspace_id !== null || !same(actual, CANONICAL_HANDS_ON_CAPABILITIES[persona.key])) {
      fail('ROLE_INVENTORY_REJECTED');
    }
  }
  return true;
}

export function canonicalHandsOnSafeResult(operation, state, bundle, details = {}) {
  const result = {
    schemaVersion: CANONICAL_HANDS_ON_SCHEMA, operation, state,
    bundleDigest: digest({ bundleId: bundle.bundleId, targetPublicDigest: bundle.targetPublicDigest,
      operatorSha: bundle.operatorSha, previewReleaseSha: bundle.previewReleaseSha }),
    personaCount: bundle.personas.length,
    ...(operation === 'prepare'
      ? { providersEnabled: false, production: false, customerRows: 0 }
      : { cleanupReadinessIndependent: true }),
    ...details,
  };
  if (Object.keys(result).some(key => SECRET_KEY.test(key)) || /@example\.invalid|Bearer\s|eyJ[A-Za-z0-9_-]+\./u.test(JSON.stringify(result))) {
    fail('EVIDENCE_LEAK');
  }
  return Object.freeze(result);
}

export function validateCanonicalHandsOnProtectedScope(raw, bundle) {
  let scope;
  try { scope = typeof raw === 'string' ? JSON.parse(raw) : raw; } catch { fail('TARGET_BINDING_REJECTED'); }
  exactKeys(scope, ['organizationId', 'workspaceId', 'roleIds'], 'TARGET_BINDING_REJECTED');
  const existingPersonas = ['author', 'reviewer', 'approver', 'outsider', 'deliveryOwner'];
  exactKeys(scope.roleIds, existingPersonas, 'TARGET_BINDING_REJECTED');
  const existingRoleIds = existingPersonas.map(key => scope.roleIds[key]);
  if (scope.organizationId !== bundle.organizationId || scope.workspaceId !== bundle.workspaceId
    || existingRoleIds.some(roleId => !UUID.test(roleId))
    || new Set(existingRoleIds).size !== existingRoleIds.length) {
    fail('TARGET_BINDING_REJECTED');
  }
  return true;
}

export function validateCanonicalHandsOnDatabaseTarget(connectionString, projectRef) {
  let target;
  try { target = new URL(connectionString); } catch { fail('DATABASE_TARGET_REJECTED'); }
  let tls = false;
  try { tls = validatePrivilegedPostgresConnectionString(connectionString, { allowLoopback: false }); } catch {}
  const direct = target.hostname === `db.${projectRef}.supabase.co`
    && decodeURIComponent(target.username) === 'postgres' && ['', '5432'].includes(target.port);
  const pooled = /^[a-z0-9]+(?:-[a-z0-9]+)*[.]pooler[.]supabase[.]com$/u.test(target.hostname)
    && decodeURIComponent(target.username) === `postgres.${projectRef}` && ['', '5432', '6543'].includes(target.port);
  if (!PROJECT_REF.test(projectRef) || !tls || !['postgres:', 'postgresql:'].includes(target.protocol)
    || target.password.length === 0 || target.pathname !== '/postgres' || target.hash !== '' || (!direct && !pooled)) {
    fail('DATABASE_TARGET_REJECTED');
  }
  return true;
}

export function createCanonicalHandsOnAuthClient({ origin, serviceRoleKey, fetchImpl = fetch, timeoutMs = 15_000 }) {
  if (!/^https:\/\/[a-z0-9]{20}\.supabase\.co$/u.test(origin) || typeof serviceRoleKey !== 'string'
    || serviceRoleKey.length < 32 || timeoutMs !== 15_000) fail('AUTH_CONFIGURATION_REJECTED');
  const headers = { apikey: serviceRoleKey, authorization: `Bearer ${serviceRoleKey}`, 'content-type': 'application/json' };
  const request = async (method, path, body, { allowAbsent = false, empty = false } = {}) => {
    let response;
    try {
      response = await fetchImpl(`${origin}/auth/v1/admin/users${path}`, {
        method, redirect: 'error', cache: 'no-store', signal: AbortSignal.timeout(timeoutMs), headers,
        ...(body ? { body: JSON.stringify(body) } : {}),
      });
    } catch { fail('AUTH_OUTCOME_RECONCILIATION_REQUIRED'); }
    if (allowAbsent && response.status === 404) return null;
    if (!response.ok) fail('AUTH_OUTCOME_RECONCILIATION_REQUIRED');
    if (empty) return true;
    const length = response.headers.get('content-length');
    if (length !== null && (!/^\d+$/u.test(length) || Number(length) > 32_768)) {
      fail('AUTH_OUTCOME_RECONCILIATION_REQUIRED');
    }
    let text;
    try { text = await response.text(); } catch { fail('AUTH_OUTCOME_RECONCILIATION_REQUIRED'); }
    if (new TextEncoder().encode(text).byteLength > 32_768) fail('AUTH_OUTCOME_RECONCILIATION_REQUIRED');
    let decoded;
    try { decoded = JSON.parse(text); } catch { fail('AUTH_OUTCOME_RECONCILIATION_REQUIRED'); }
    const user = decoded?.user ?? decoded;
    if (!UUID.test(user?.id ?? '')) fail('AUTH_OUTCOME_RECONCILIATION_REQUIRED');
    return user;
  };
  const owned = (user, bundle, persona) => Boolean(user && user.id === persona.userId && user.email === persona.loginId
    && user.app_metadata?.canonical_hands_on_bundle === bundle.bundleId
    && user.app_metadata?.canonical_hands_on_target === bundle.targetPublicDigest
    && user.app_metadata?.canonical_hands_on_persona === persona.key);
  return Object.freeze({
    get: persona => request('GET', `/${persona.userId}`, undefined, { allowAbsent: true }),
    create: (bundle, persona) => request('POST', '', {
      id: persona.userId, email: persona.loginId, password: persona.password, email_confirm: true,
      user_metadata: { synthetic: true, canonicalHandsOn: true, persona: persona.key },
      app_metadata: { provider: 'email', providers: ['email'], canonical_hands_on_bundle: bundle.bundleId,
        canonical_hands_on_target: bundle.targetPublicDigest, canonical_hands_on_persona: persona.key },
    }),
    ban: persona => request('PUT', `/${persona.userId}`, { ban_duration: '876000h' }),
    removeUnactivated: persona => request('DELETE', `/${persona.userId}`, undefined, { empty: true }),
    active: user => Boolean(user && (typeof user.banned_until !== 'string'
      || !Number.isFinite(Date.parse(user.banned_until)) || Date.parse(user.banned_until) <= Date.now())),
    banned: user => Boolean(user && typeof user.banned_until === 'string'
      && Number.isFinite(Date.parse(user.banned_until)) && Date.parse(user.banned_until) > Date.now() + 30_000),
    owned,
  });
}

const previewIdentity = async (bundle, fetchImpl = fetch) => {
  let response;
  try { response = await fetchImpl(bundle.previewUrl, { method: 'HEAD', redirect: 'error', signal: AbortSignal.timeout(15_000) }); }
  catch { fail('PREVIEW_IDENTITY_REJECTED'); }
  if (!response.ok || response.headers.get('x-avalaos-release') !== bundle.previewReleaseSha
    || response.headers.get('x-avalaos-environment') !== 'hosted_nonproduction_pilot') fail('PREVIEW_IDENTITY_REJECTED');
};

const readDatabaseOwnershipState = async (db, bundle) => {
  const userIds = bundle.personas.map(persona => persona.userId);
  const state = (await db.query(`SELECT
    EXISTS(SELECT 1 FROM public.hosted_pilot_environment_identity WHERE singleton
      AND product_key='avalaos-core' AND environment_class='hosted_nonproduction_pilot') target_marker,
    EXISTS(SELECT 1 FROM public.organizations WHERE id=$1
      AND coalesce((settings->>'synthetic')::boolean,false)) synthetic_org,
    EXISTS(SELECT 1 FROM public.workspaces WHERE id=$2 AND org_id=$1
      AND coalesce((metadata->>'synthetic')::boolean,false)) synthetic_workspace,
    (SELECT count(*)::int FROM public.profiles WHERE id=ANY($3::uuid[])) owned_profiles,
    (SELECT count(*)::int FROM public.organization_members WHERE org_id=$1 AND user_id=ANY($3::uuid[])
      AND status='active' AND deleted_at IS NULL) owned_org_memberships,
    (SELECT count(*)::int FROM public.workspace_memberships WHERE org_id=$1 AND workspace_id=$2
      AND user_id=ANY($3::uuid[]) AND status='active' AND deleted_at IS NULL) owned_workspace_memberships`,
  [bundle.organizationId, bundle.workspaceId, userIds])).rows[0];
  if (state.target_marker !== true || state.synthetic_org !== true || state.synthetic_workspace !== true) {
    fail('TARGET_IDENTITY_REJECTED');
  }
  return Object.freeze({ profiles: Number(state.owned_profiles), orgMemberships: Number(state.owned_org_memberships),
    workspaceMemberships: Number(state.owned_workspace_memberships) });
};

const readPrepareDatabaseState = async (db, bundle) => {
  const roleIds = bundle.personas.map(persona => persona.roleId);
  const userIds = bundle.personas.map(persona => persona.userId);
  const state = (await db.query(`SELECT
    (SELECT migration_tip FROM public.hosted_pilot_environment_identity WHERE singleton) migration_tip,
    (SELECT production_authorized OR customer_data_authorized OR real_provider_calls_authorized
      FROM public.hosted_pilot_environment_identity WHERE singleton) forbidden_authority,
    (SELECT provider_enabled FROM public.studio_artifact_runtime_control WHERE singleton) studio_provider,
    (SELECT provider_enabled FROM public.enterprise_intelligence_runtime_control WHERE singleton) intelligence_provider,
    EXISTS(SELECT 1 FROM public.organizations WHERE id=$1 AND status='active' AND deleted_at IS NULL
      AND coalesce((settings->>'synthetic')::boolean,false)) synthetic_org,
    EXISTS(SELECT 1 FROM public.workspaces WHERE id=$2 AND org_id=$1 AND status='active' AND deleted_at IS NULL
      AND coalesce((metadata->>'synthetic')::boolean,false)) synthetic_workspace,
    (SELECT count(*)::int FROM public.profiles p JOIN public.organization_members m ON m.user_id=p.id AND m.org_id=$1
      WHERE coalesce((p.metadata->>'synthetic')::boolean,false)=false) customer_rows,
    (SELECT count(*)::int FROM public.authenticated_synthetic_exercises WHERE lifecycle='active') active_exercises,
    (SELECT count(*)::int FROM public.studio_artifact_generation_attempts WHERE transport_kind='authenticated_synthetic'
      AND state NOT IN('completed','stale_completed','failed','cancelled','timed_out')) active_generation_attempts,
    (SELECT count(*)::int FROM public.enterprise_provider_secret_cleanup_jobs WHERE state<>'completed') unfinished_cleanup,
    (SELECT count(*)::int FROM public.enterprise_ai_capability_routes WHERE org_id=$1 AND workspace_id=$2 AND enabled)
      enabled_provider_routes,
    (SELECT count(*)::int FROM public.profiles WHERE id=ANY($3::uuid[])) owned_profiles,
    (SELECT count(*)::int FROM public.organization_members WHERE org_id=$1 AND user_id=ANY($3::uuid[])
      AND status='active' AND deleted_at IS NULL) owned_org_memberships,
    (SELECT count(*)::int FROM public.workspace_memberships WHERE org_id=$1 AND workspace_id=$2
      AND user_id=ANY($3::uuid[]) AND status='active' AND deleted_at IS NULL) owned_workspace_memberships`,
  [bundle.organizationId, bundle.workspaceId, userIds])).rows[0];
  const roles = (await db.query(`SELECT r.id,r.org_id,r.workspace_id,r.scope,r.status,
    coalesce(array_agg(c.capability_key ORDER BY c.capability_key) FILTER(WHERE c.capability_key IS NOT NULL),'{}') capabilities
    FROM public.roles r LEFT JOIN public.role_capabilities c ON c.role_id=r.id
    WHERE r.id=ANY($1::uuid[]) AND r.deleted_at IS NULL GROUP BY r.id,r.org_id,r.workspace_id,r.scope,r.status ORDER BY r.id`,
  [roleIds])).rows;
  validateCanonicalHandsOnRoleInventory(roles, bundle);
  if (state.migration_tip !== bundle.migrationVersion || state.forbidden_authority !== false
    || state.studio_provider !== false || state.intelligence_provider !== false
    || state.synthetic_org !== true || state.synthetic_workspace !== true || state.customer_rows !== 0
    || state.active_exercises !== 0 || state.active_generation_attempts !== 0 || state.unfinished_cleanup !== 0
    || state.enabled_provider_routes !== 0) {
    fail('TARGET_PREFLIGHT_REJECTED');
  }
  return Object.freeze({ profiles: Number(state.owned_profiles), orgMemberships: Number(state.owned_org_memberships),
    workspaceMemberships: Number(state.owned_workspace_memberships) });
};

const verifyPreparedDatabase = async (db, bundle, expectedActive) => {
  const rows = (await db.query(`SELECT p.id,p.status,p.email,m.role_id,m.status org_status,w.status workspace_status,
      a.version,coalesce((p.metadata->>'canonicalHandsOnBundle'),'') bundle_id
    FROM public.profiles p
    LEFT JOIN public.organization_members m ON m.org_id=$1 AND m.user_id=p.id
    LEFT JOIN public.workspace_memberships w ON w.org_id=$1 AND w.workspace_id=$2 AND w.user_id=p.id
    LEFT JOIN public.authorization_versions a ON a.org_id=$1 AND a.user_id=p.id
    WHERE p.id=ANY($3::uuid[]) ORDER BY p.id`, [bundle.organizationId, bundle.workspaceId,
    bundle.personas.map(persona => persona.userId)])).rows;
  if (rows.length !== bundle.personas.length) fail('DATABASE_OWNERSHIP_REJECTED');
  for (const persona of bundle.personas) {
    const row = rows.find(item => item.id === persona.userId);
    const authorizationVersion = Number(row?.version);
    if (!row || row.email !== persona.loginId || row.bundle_id !== bundle.bundleId
      || row.role_id !== persona.roleId || !Number.isSafeInteger(authorizationVersion) || authorizationVersion < 1
      || (expectedActive && (row.status !== 'active' || row.org_status !== 'active'
        || row.workspace_status !== 'active'))
      || (!expectedActive && (row.status !== 'disabled' || row.org_status !== 'removed'
        || row.workspace_status !== 'removed'))) fail('DATABASE_OWNERSHIP_REJECTED');
  }
  return true;
};

const verifyRevocableDatabase = async (db, bundle, { revoked }) => {
  const rows = (await db.query(`SELECT p.id,p.status,p.email,m.role_id,m.status org_status,w.status workspace_status,
      a.version,coalesce((p.metadata->>'canonicalHandsOnBundle'),'') bundle_id
    FROM public.profiles p
    LEFT JOIN public.organization_members m ON m.org_id=$1 AND m.user_id=p.id
    LEFT JOIN public.workspace_memberships w ON w.org_id=$1 AND w.workspace_id=$2 AND w.user_id=p.id
    LEFT JOIN public.authorization_versions a ON a.org_id=$1 AND a.user_id=p.id
    WHERE p.id=ANY($3::uuid[]) ORDER BY p.id`, [bundle.organizationId, bundle.workspaceId,
    bundle.personas.map(persona => persona.userId)])).rows;
  if (rows.length !== bundle.personas.length) fail('DATABASE_OWNERSHIP_REJECTED');
  for (const persona of bundle.personas) {
    const row = rows.find(item => item.id === persona.userId);
    const authorizationVersion = row?.version === null || row?.version === undefined ? null : Number(row.version);
    if (!row || row.email !== persona.loginId || !['', bundle.bundleId].includes(row.bundle_id)
      || (row.role_id !== null && row.role_id !== persona.roleId)
      || (authorizationVersion !== null
        && (!Number.isSafeInteger(authorizationVersion) || authorizationVersion < 1))
      || (revoked && (row.status !== 'disabled' || row.org_status === 'active' || row.workspace_status === 'active'))
      || (!revoked && !['active','disabled'].includes(row.status))) fail('DATABASE_OWNERSHIP_REJECTED');
  }
  return true;
};

export async function prepareCanonicalHandsOnAccess({ db, auth, bundle }) {
  const state = await readPrepareDatabaseState(db, bundle);
  const users = await Promise.all(bundle.personas.map(persona => auth.get(persona)));
  const exactReplay = state.profiles === 4 && state.orgMemberships === 4 && state.workspaceMemberships === 4
    && users.every((user, index) => auth.owned(user, bundle, bundle.personas[index]) && auth.active(user));
  if (exactReplay) {
    await verifyPreparedDatabase(db, bundle, true);
    return canonicalHandsOnSafeResult('prepare', 'prepared', bundle,
      { exactReplay: true, accessActive: true, operatorManagedExpiry: true });
  }
  if (state.profiles !== 0 || state.orgMemberships !== 0 || state.workspaceMemberships !== 0 || users.some(Boolean)) {
    fail('PARTIAL_STATE_RECONCILIATION_REQUIRED');
  }
  const created = [];
  try {
    for (const persona of bundle.personas) {
      let user;
      try { user = await auth.create(bundle, persona); }
      catch {
        user = await auth.get(persona);
        if (!auth.owned(user, bundle, persona)) fail('AUTH_OUTCOME_RECONCILIATION_REQUIRED');
      }
      if (!auth.owned(user, bundle, persona) || !auth.active(user)) fail('AUTH_OWNERSHIP_REJECTED');
      created.push(persona);
    }
    await db.query('BEGIN');
    for (const persona of bundle.personas) {
      const profile = await db.query(`INSERT INTO public.profiles(id,email,full_name,status,metadata)
        VALUES($1,$2,$3,'active',$4::jsonb)
        ON CONFLICT(id) DO UPDATE SET email=excluded.email,full_name=excluded.full_name,status='active',
          metadata=public.profiles.metadata||excluded.metadata
        WHERE public.profiles.email=excluded.email AND public.profiles.deleted_at IS NULL
          AND public.profiles.status IN('active','invited')
          AND coalesce(public.profiles.metadata->>'canonicalHandsOnBundle',$5)=$5
        RETURNING id`, [persona.userId, persona.loginId,
        `Hands-on ${persona.key}`, JSON.stringify({ synthetic: true, canonicalHandsOn: true,
          canonicalHandsOnBundle: bundle.bundleId, expiresAt: bundle.expiresAt, persona: persona.key }), bundle.bundleId]);
      if (profile.rowCount !== 1 || profile.rows[0]?.id !== persona.userId) fail('PROFILE_OWNERSHIP_REJECTED');
      await db.query(`INSERT INTO public.organization_members(org_id,user_id,role_id,status,joined_at)
        VALUES($1,$2,$3,'active',statement_timestamp())`, [bundle.organizationId, persona.userId, persona.roleId]);
      await db.query(`INSERT INTO public.workspace_memberships(org_id,workspace_id,user_id,status,joined_at)
        VALUES($1,$2,$3,'active',statement_timestamp())`, [bundle.organizationId, bundle.workspaceId, persona.userId]);
      await db.query(`INSERT INTO public.authorization_versions(org_id,user_id,version) VALUES($1,$2,1)
        ON CONFLICT(org_id,user_id) DO NOTHING`,
        [bundle.organizationId, persona.userId]);
    }
    await db.query('COMMIT');
  } catch (error) {
    await db.query('ROLLBACK').catch(() => undefined);
    let reconciled;
    try { reconciled = await readDatabaseOwnershipState(db, bundle); }
    catch { fail('COMMIT_OUTCOME_RECONCILIATION_REQUIRED'); }
    if (reconciled.profiles === 4 && reconciled.orgMemberships === 4 && reconciled.workspaceMemberships === 4) {
      await verifyPreparedDatabase(db, bundle, true);
      return canonicalHandsOnSafeResult('prepare', 'prepared', bundle,
        { exactReplay: false, recoveredCommit: true, accessActive: true, createdIdentities: 4,
          activeMemberships: 8, operatorManagedExpiry: true });
    }
    if (reconciled.profiles !== 0 || reconciled.orgMemberships !== 0 || reconciled.workspaceMemberships !== 0) {
      fail('PARTIAL_STATE_RECONCILIATION_REQUIRED');
    }
    for (const persona of created.toReversed()) {
      try { await auth.removeUnactivated(persona); }
      catch {
        let remaining;
        try { remaining = await auth.get(persona); }
        catch { fail('COMPENSATION_RECONCILIATION_REQUIRED'); }
        if (remaining) fail('COMPENSATION_RECONCILIATION_REQUIRED');
      }
    }
    throw error;
  }
  await verifyPreparedDatabase(db, bundle, true);
  return canonicalHandsOnSafeResult('prepare', 'prepared', bundle,
    { exactReplay: false, accessActive: true, createdIdentities: 4, activeMemberships: 8,
      operatorManagedExpiry: true });
}

export async function revokeCanonicalHandsOnAccess({ db, auth, bundle }) {
  await readDatabaseOwnershipState(db, bundle);
  const users = await Promise.all(bundle.personas.map(persona => auth.get(persona)));
  const present = users.filter(Boolean);
  for (let index = 0; index < users.length; index += 1) {
    if (users[index] && !auth.owned(users[index], bundle, bundle.personas[index])) fail('AUTH_OWNERSHIP_REJECTED');
  }
  if (present.length !== 4) fail('PARTIAL_STATE_RECONCILIATION_REQUIRED');
  let databaseRevoked = false;
  try { await verifyRevocableDatabase(db, bundle, { revoked: true }); databaseRevoked = true; }
  catch {
    try { await verifyRevocableDatabase(db, bundle, { revoked: false }); }
    catch { fail('PARTIAL_STATE_RECONCILIATION_REQUIRED'); }
  }
  if (databaseRevoked && users.every(user => auth.banned(user))) {
    return canonicalHandsOnSafeResult('revoke', 'revoked', bundle,
      { exactReplay: true, accessActive: false, operatorManagedExpiry: true, identitiesRetainedBanned: 4 });
  }
  if (!databaseRevoked) {
    await db.query('BEGIN');
    try {
      const userIds = bundle.personas.map(persona => persona.userId);
      await db.query('DELETE FROM auth.sessions WHERE user_id=ANY($1::uuid[])', [userIds]);
      await db.query(`UPDATE public.organization_members SET status='removed',deleted_at=statement_timestamp()
        WHERE org_id=$1 AND user_id=ANY($2::uuid[]) AND status='active'`, [bundle.organizationId, userIds]);
      await db.query(`UPDATE public.workspace_memberships SET status='removed',disabled_at=statement_timestamp(),deleted_at=statement_timestamp()
        WHERE org_id=$1 AND workspace_id=$2 AND user_id=ANY($3::uuid[]) AND status='active'`,
      [bundle.organizationId, bundle.workspaceId, userIds]);
      await db.query(`UPDATE public.profiles SET status='disabled',metadata=metadata||$1::jsonb
        WHERE id=ANY($2::uuid[])`, [JSON.stringify({ synthetic: true, canonicalHandsOn: true,
        canonicalHandsOnBundle: bundle.bundleId, canonicalHandsOnRevoked: true }), userIds]);
      await db.query('COMMIT');
    } catch (error) {
      await db.query('ROLLBACK').catch(() => undefined);
      try { await verifyRevocableDatabase(db, bundle, { revoked: true }); }
      catch {
        try { await verifyRevocableDatabase(db, bundle, { revoked: false }); }
        catch { fail('COMMIT_OUTCOME_RECONCILIATION_REQUIRED'); }
        throw error;
      }
    }
  }
  for (let index = 0; index < bundle.personas.length; index += 1) {
    const persona = bundle.personas[index];
    if (auth.banned(users[index])) continue;
    try { await auth.ban(persona); }
    catch {
      const remaining = await auth.get(persona);
      if (!auth.owned(remaining, bundle, persona) || !auth.banned(remaining)) {
        fail('AUTH_OUTCOME_RECONCILIATION_REQUIRED');
      }
    }
  }
  const banned = await Promise.all(bundle.personas.map(persona => auth.get(persona)));
  if (!banned.every((user, index) => auth.owned(user, bundle, bundle.personas[index]) && auth.banned(user))) {
    fail('AUTH_OUTCOME_RECONCILIATION_REQUIRED');
  }
  await verifyRevocableDatabase(db, bundle, { revoked: true });
  const residue = (await db.query(`SELECT
    (SELECT count(*)::int FROM auth.sessions WHERE user_id=ANY($1::uuid[])) sessions,
    (SELECT count(*)::int FROM public.organization_members WHERE org_id=$2 AND user_id=ANY($1::uuid[]) AND status='active') org_memberships,
    (SELECT count(*)::int FROM public.workspace_memberships WHERE org_id=$2 AND workspace_id=$3
      AND user_id=ANY($1::uuid[]) AND status='active') workspace_memberships`,
  [bundle.personas.map(persona => persona.userId), bundle.organizationId, bundle.workspaceId])).rows[0];
  if (Object.values(residue).some(value => Number(value) !== 0)) fail('REVOCATION_INCOMPLETE');
  return canonicalHandsOnSafeResult('revoke', 'revoked', bundle,
    { exactReplay: false, accessActive: false, sessions: 0, activeMemberships: 0,
      identitiesRetainedBanned: 4, operatorManagedExpiry: true });
}

export async function executeCanonicalHandsOnAccess({ env = process.env, fetchImpl = fetch, database, authClient } = {}) {
  const operation = env.CANONICAL_HANDS_ON_OPERATION;
  const bundle = validateCanonicalHandsOnBundle(env.CANONICAL_HANDS_ON_ACCESS_BUNDLE, {
    operation, operatorSha: env.CANONICAL_HANDS_ON_OPERATOR_SHA,
    previewReleaseSha: env.CANONICAL_HANDS_ON_PREVIEW_RELEASE_SHA,
    previewUrl: env.CANONICAL_HANDS_ON_PREVIEW_URL,
  });
  const expectedOrigin = `https://${bundle.targetProjectRef}.supabase.co`;
  if (env.AUTHENTICATED_ACCEPTANCE_SUPABASE_URL !== expectedOrigin) fail('TARGET_BINDING_REJECTED');
  validateCanonicalHandsOnProtectedScope(env.AUTHENTICATED_ACCEPTANCE_SCOPE, bundle);
  validateCanonicalHandsOnDatabaseTarget(env.AUTHENTICATED_ACCEPTANCE_DATABASE_URL, bundle.targetProjectRef);
  if (operation === 'prepare') await previewIdentity(bundle, fetchImpl);
  const db = database ?? new pg.Client(createControlledHumanPostgresClientConfig(
    env.AUTHENTICATED_ACCEPTANCE_DATABASE_URL,
    { allowLoopback: false, applicationName: `avalaos_canonical_hands_on_${operation}`, connectionTimeoutMillis: 20_000 },
  ));
  const ownedConnection = !database;
  if (ownedConnection) await db.connect();
  try {
    const auth = authClient ?? createCanonicalHandsOnAuthClient({ origin: expectedOrigin,
      serviceRoleKey: env.AUTHENTICATED_ACCEPTANCE_SUPABASE_SERVICE_ROLE_KEY, fetchImpl });
    return operation === 'prepare'
      ? await prepareCanonicalHandsOnAccess({ db, auth, bundle })
      : await revokeCanonicalHandsOnAccess({ db, auth, bundle });
  } finally { if (ownedConnection) await db.end(); }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  executeCanonicalHandsOnAccess().then(result => process.stdout.write(`${JSON.stringify(result)}\n`)).catch(error => {
    const code = error instanceof Error && /^CANONICAL_HANDS_ON_[A-Z0-9_]+$/u.test(error.message)
      ? error.message : 'CANONICAL_HANDS_ON_FAILED';
    process.stderr.write(`${code}\n`); process.exitCode = 1;
  });
}
