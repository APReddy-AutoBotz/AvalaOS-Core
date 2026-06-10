import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import pg from 'pg';

const { Client } = pg;
const require = createRequire(import.meta.url);

const workspaceRoot = path.resolve('.');
const compiledDir = path.join(workspaceRoot, '.agent', 'm3.2p-resolver-edge-smoke');
const { runProviderGovernedOperation } = require('../.agent/m3.2p-resolver-edge-smoke/providerResolverIntegration.js');
const { resolveProviderSecretForDecision } = require('../.agent/m3.2p-resolver-edge-smoke/providerSecretAdapter.js');
const { persistProviderResolverAuditEvent } = require('../.agent/m3.2p-resolver-edge-smoke/providerResolverAuditDb.js');

const provider = 'groq';
const mode = 'pilot';
const roleName = 'M3.2p Smoke Resolver Role';
const secretRef = 'AVALA_PROVIDER_SECRET_GROQ_SMOKE';
const fakeProviderSecret = 'm3_2p_mock_provider_value_not_a_real_key';
const evidenceRef = 'docs/quality/m3.2p-non-production-resolver-edge-smoke-mocked-evidence.md';
const actorId = '00000000-0000-4000-8000-0000000032f0';

const operations = ['generate_document', 'refine_section', 'test_provider_connection'];

const ids = {
  orgAllowed: '10000000-0000-4000-8000-0000000032f0',
  orgMissingPolicy: '10000000-0000-4000-8000-0000000032f1',
  orgDisabledConfig: '10000000-0000-4000-8000-0000000032f2',
  orgManualKeyRef: '10000000-0000-4000-8000-0000000032f3',
  orgWrongPrefix: '10000000-0000-4000-8000-0000000032f4',
  keyAllowed: '20000000-0000-4000-8000-0000000032f0',
  keyMissingPolicy: '20000000-0000-4000-8000-0000000032f1',
  keyDisabledConfig: '20000000-0000-4000-8000-0000000032f2',
  keyManual: '20000000-0000-4000-8000-0000000032f3',
  keyWrongPrefix: '20000000-0000-4000-8000-0000000032f4',
  configAllowed: '30000000-0000-4000-8000-0000000032f0',
  configMissingPolicy: '30000000-0000-4000-8000-0000000032f1',
  configDisabled: '30000000-0000-4000-8000-0000000032f2',
  configManual: '30000000-0000-4000-8000-0000000032f3',
  configWrongPrefix: '30000000-0000-4000-8000-0000000032f4',
  roleAllowed: '40000000-0000-4000-8000-0000000032f0',
  roleMissingPolicy: '40000000-0000-4000-8000-0000000032f1',
  roleDisabledConfig: '40000000-0000-4000-8000-0000000032f2',
  roleManualKeyRef: '40000000-0000-4000-8000-0000000032f3',
  roleWrongPrefix: '40000000-0000-4000-8000-0000000032f4',
};

const smokeOrgs = [
  { id: ids.orgAllowed, slug: 'm3-2p-smoke-allowed', roleId: ids.roleAllowed },
  { id: ids.orgMissingPolicy, slug: 'm3-2p-smoke-missing-policy', roleId: ids.roleMissingPolicy },
  { id: ids.orgDisabledConfig, slug: 'm3-2p-smoke-disabled-config', roleId: ids.roleDisabledConfig },
  { id: ids.orgManualKeyRef, slug: 'm3-2p-smoke-manual-key-ref', roleId: ids.roleManualKeyRef },
  { id: ids.orgWrongPrefix, slug: 'm3-2p-smoke-wrong-prefix', roleId: ids.roleWrongPrefix },
];

class SmokeBlocked extends Error {
  constructor(reason) {
    super(reason);
    this.name = 'SmokeBlocked';
    this.reason = reason;
  }
}

const block = (reason) => {
  throw new SmokeBlocked(reason);
};

const log = (message) => {
  console.log(message);
};

const assertSafeOutput = (value) => {
  const walk = (child) => {
    if (typeof child === 'string') {
      assert.equal(child.includes(fakeProviderSecret), false);
      assert.equal(child.includes('DATABASE_URL'), false);
      assert.equal(child.includes('SUPABASE_SERVICE_ROLE_KEY'), false);
      assert.equal(child.includes('Authorization'), false);
      assert.equal(child.includes('Bearer'), false);
      assert.equal(child.includes('providerPayload'), false);
      assert.equal(child.includes('raw prompt'), false);
      assert.equal(child.includes('raw completion'), false);
      return;
    }

    if (!child || typeof child !== 'object') return;

    for (const [key, nested] of Object.entries(child)) {
      const normalized = key.replace(/[^a-zA-Z0-9]/g, '').toLowerCase();
      assert.equal([
        'authorization',
        'authheader',
        'providerkey',
        'providerpayload',
        'rawcompletion',
        'rawkey',
        'rawprompt',
        'secret',
        'secretref',
        'secretvalue',
        'servicerolekey',
      ].includes(normalized), false);
      walk(nested);
    }
  };

  walk(value);
};

const assertSanitizedAuditMetadata = (metadata) => {
  assertSafeOutput(metadata);
  const serialized = JSON.stringify(metadata || {});
  assert.equal(serialized.includes(secretRef), false);
  assert.equal(serialized.includes(fakeProviderSecret), false);
  assert.equal(serialized.includes('prompt'), false);
  assert.equal(serialized.includes('completion'), false);
};

const assertDatabaseUrlSafety = () => {
  const raw = process.env.DATABASE_URL;
  if (!raw) block('DATABASE_URL missing');

  let parsed;
  try {
    parsed = new URL(raw);
  } catch {
    block('DATABASE_URL not parseable');
  }

  const hostAndDb = `${parsed.hostname} ${parsed.pathname}`.toLowerCase();
  if (/(^|[^a-z])prod(uction)?([^a-z]|$)|customer|shared|live/.test(hostAndDb)) {
    block('DATABASE_URL target did not pass non-production marker guard');
  }
};

const queryOne = async (client, sql, params = []) => {
  const result = await client.query(sql, params);
  return result.rows[0] || null;
};

const insertRow = async (client, table, row) => {
  const entries = Object.entries(row);
  const columns = entries.map(([key]) => key);
  const params = entries.map(([, value]) => value);
  const placeholders = params.map((_, index) => `$${index + 1}`);
  const result = await client.query(
    `INSERT INTO ${table} (${columns.join(', ')}) VALUES (${placeholders.join(', ')}) RETURNING *`,
    params,
  );
  return result.rows[0] || null;
};

const upsertById = async (client, table, row) => {
  const entries = Object.entries(row);
  const columns = entries.map(([key]) => key);
  const params = entries.map(([, value]) => value);
  const placeholders = params.map((_, index) => `$${index + 1}`);
  const updates = columns
    .filter(column => column !== 'id')
    .map(column => `${column}=EXCLUDED.${column}`);

  const result = await client.query(
    `INSERT INTO ${table} (${columns.join(', ')}) VALUES (${placeholders.join(', ')})
     ON CONFLICT (id) DO UPDATE SET ${updates.join(', ')}
     RETURNING *`,
    params,
  );
  return result.rows[0] || null;
};

const tableExists = async (client, schema, table) => {
  const row = await queryOne(
    client,
    `SELECT 1 FROM information_schema.tables WHERE table_schema = $1 AND table_name = $2 LIMIT 1`,
    [schema, table],
  );
  return Boolean(row);
};

const authUserColumns = async (client) => {
  const result = await client.query(
    `SELECT column_name FROM information_schema.columns WHERE table_schema = 'auth' AND table_name = 'users'`,
  );
  return new Set(result.rows.map(row => row.column_name));
};

const seedAuthUser = async (client) => {
  if (!(await tableExists(client, 'auth', 'users'))) {
    block('auth.users table missing');
  }

  const columns = await authUserColumns(client);
  const appMeta = { provider: 'email', providers: ['email'], source: 'm3.2p_mocked_smoke' };
  const candidates = {
    instance_id: '00000000-0000-0000-0000-000000000000',
    id: actorId,
    aud: 'authenticated',
    role: 'authenticated',
    email: 'm3.2p-smoke-user@example.invalid',
    encrypted_password: '',
    email_confirmed_at: new Date(),
    created_at: new Date(),
    updated_at: new Date(),
    raw_app_meta_data: appMeta,
    raw_user_meta_data: { source: 'm3.2p_mocked_smoke' },
    is_super_admin: false,
  };
  const row = Object.fromEntries(Object.entries(candidates).filter(([key]) => columns.has(key)));

  if (!row.id || !row.email) block('auth.users required columns unavailable');
  await upsertById(client, 'auth.users', row);
};

const seedSmokeRows = async (client) => {
  let seedStep = 'auth-user';
  try {
    await seedAuthUser(client);

    seedStep = 'profile';
    await upsertById(client, 'profiles', {
      id: actorId,
      email: 'm3.2p-smoke-user@example.invalid',
      full_name: 'M3.2p Smoke User',
    });

    for (const org of smokeOrgs) {
      seedStep = `organization:${org.slug}`;
      await upsertById(client, 'organizations', {
        id: org.id,
        name: `M3.2p Smoke ${org.slug}`,
        slug: org.slug,
        settings: { source: 'm3.2p_mocked_smoke' },
        is_trial: true,
      });
      seedStep = `role:${org.slug}`;
      await upsertById(client, 'roles', {
        id: org.roleId,
        org_id: org.id,
        name: roleName,
        permissions: JSON.stringify(['m3.2p:mocked-smoke']),
      });
      seedStep = `membership:${org.slug}`;
      await client.query(
        `INSERT INTO organization_members (org_id, user_id, role_id, status)
         VALUES ($1, $2, $3, 'active')
         ON CONFLICT (org_id, user_id) DO UPDATE SET role_id = EXCLUDED.role_id, status = 'active'`,
        [org.id, actorId, org.roleId],
      );
    }

    seedStep = 'provider-set:allowed';
    await seedProviderSet(client, {
      orgId: ids.orgAllowed,
      keyRefId: ids.keyAllowed,
      configId: ids.configAllowed,
      resolverType: 'server_reference',
      configStatus: 'active',
      configuredSecretRef: secretRef,
      operations,
    });

    seedStep = 'provider-set:missing-policy';
    await seedProviderSet(client, {
      orgId: ids.orgMissingPolicy,
      keyRefId: ids.keyMissingPolicy,
      configId: ids.configMissingPolicy,
      resolverType: 'server_reference',
      configStatus: 'active',
      configuredSecretRef: secretRef,
      operations: [],
    });

    seedStep = 'provider-set:disabled-config';
    await seedProviderSet(client, {
      orgId: ids.orgDisabledConfig,
      keyRefId: ids.keyDisabledConfig,
      configId: ids.configDisabled,
      resolverType: 'server_reference',
      configStatus: 'disabled',
      configuredSecretRef: secretRef,
      operations: ['generate_document'],
    });

    seedStep = 'provider-set:manual-key-ref';
    await seedProviderSet(client, {
      orgId: ids.orgManualKeyRef,
      keyRefId: ids.keyManual,
      configId: ids.configManual,
      resolverType: 'manual_placeholder',
      configStatus: 'active',
      configuredSecretRef: secretRef,
      operations: ['generate_document'],
    });

    seedStep = 'provider-set:wrong-prefix';
    await seedProviderSet(client, {
      orgId: ids.orgWrongPrefix,
      keyRefId: ids.keyWrongPrefix,
      configId: ids.configWrongPrefix,
      resolverType: 'server_reference',
      configStatus: 'active',
      configuredSecretRef: 'AVALA_PROVIDER_SECRET_GEMINI_SMOKE',
      operations: ['generate_document'],
    });
  } catch {
    block(`seed failed at ${seedStep}`);
  }
};

const seedProviderSet = async (
  client,
  { orgId, keyRefId, configId, resolverType, configStatus, configuredSecretRef, operations: policyOperations },
) => {
  await upsertById(client, 'ai_provider_key_refs', {
    id: keyRefId,
    org_id: orgId,
    provider,
    resolver_type: resolverType,
    secret_ref: configuredSecretRef,
    safe_label: 'M3.2p mocked smoke reference',
    safe_fingerprint: `m3.2p-${keyRefId}`,
    status: 'active',
    rotation_status: 'not_started',
    created_by: actorId,
    updated_by: actorId,
    deleted_at: null,
  });

  await upsertById(client, 'ai_provider_configs', {
    id: configId,
    org_id: orgId,
    provider,
    display_name: `M3.2p mocked smoke ${configId.slice(-4)}`,
    key_ref_id: keyRefId,
    default_model: 'mocked-provider',
    model_policy: { source: 'm3.2p_mocked_smoke' },
    allowed_modes: ['pilot'],
    allowed_operations: operations,
    evidence_ref: evidenceRef,
    status: configStatus,
    created_by: actorId,
    updated_by: actorId,
    deleted_at: null,
  });

  for (const operation of policyOperations) {
    await client.query(
      `INSERT INTO ai_workspace_provider_policies
        (org_id, provider_config_id, operation, mode, allowed_roles, is_default, status, created_by, updated_by, deleted_at)
       VALUES ($1, $2, $3, $4, $5, true, 'active', $6, $6, NULL)
       ON CONFLICT (org_id, provider_config_id, operation, mode)
       WHERE status = 'active' AND deleted_at IS NULL
       DO UPDATE SET allowed_roles = EXCLUDED.allowed_roles, is_default = true, status = 'active', updated_by = EXCLUDED.updated_by, deleted_at = NULL`,
      [orgId, configId, operation, mode, [roleName], actorId],
    );
  }
};

const assertRequiredTables = async (client) => {
  const required = [
    ['public', 'organizations'],
    ['public', 'profiles'],
    ['public', 'roles'],
    ['public', 'organization_members'],
    ['public', 'ai_provider_key_refs'],
    ['public', 'ai_provider_configs'],
    ['public', 'ai_workspace_provider_policies'],
    ['public', 'ai_provider_audit_events'],
  ];

  for (const [schema, table] of required) {
    if (!(await tableExists(client, schema, table))) {
      block(`required table missing: ${schema}.${table}`);
    }
  }
};

const buildResolverDeps = (client, order) => ({
  now: () => new Date('2026-06-10T00:00:00.000Z'),
  createCorrelationId: () => `m3-2p-corr-${Date.now().toString(36)}`,
  queryMembershipAndRoles: async ({ orgId, actorId: inputActorId }) => {
    order.push('resolver:membership');
    const row = await queryOne(
      client,
      `SELECT om.status, om.role_id, r.id AS joined_role_id, r.name AS joined_role_name
       FROM organization_members om
       LEFT JOIN roles r ON r.id = om.role_id
       WHERE om.org_id = $1 AND om.user_id = $2
       LIMIT 1`,
      [orgId, inputActorId],
    );
    if (!row) return null;
    return {
      status: row.status,
      roleIds: [row.role_id, row.joined_role_id].filter(Boolean),
      roleNames: [row.joined_role_name].filter(Boolean),
    };
  },
  queryProviderPolicy: async ({ orgId, operation, mode: inputMode, requestedProviderConfigId }) => {
    order.push('resolver:policy');
    const params = [orgId, operation, inputMode];
    const configFilter = requestedProviderConfigId ? 'AND provider_config_id = $4' : '';
    if (requestedProviderConfigId) params.push(requestedProviderConfigId);
    const result = await client.query(
      `SELECT id, org_id, provider_config_id, operation, mode, allowed_roles, is_default, status, deleted_at
       FROM ai_workspace_provider_policies
       WHERE org_id = $1 AND operation = $2 AND mode = $3 AND status = 'active' AND deleted_at IS NULL
       ${configFilter}`,
      params,
    );
    return result.rows;
  },
  queryProviderConfig: async ({ orgId, providerConfigId }) => {
    order.push('resolver:config');
    return queryOne(
      client,
      `SELECT id, org_id, provider, key_ref_id, allowed_modes, allowed_operations, status, deleted_at
       FROM ai_provider_configs
       WHERE id = $1 AND org_id = $2
       LIMIT 1`,
      [providerConfigId, orgId],
    );
  },
  queryProviderKeyRef: async ({ orgId, provider: inputProvider, keyRefId }) => {
    order.push('resolver:keyRef');
    const row = await queryOne(
      client,
      `SELECT id, org_id, provider, resolver_type, status, expires_at, deleted_at
       FROM ai_provider_key_refs
       WHERE id = $1 AND org_id = $2 AND provider = $3
       LIMIT 1`,
      [keyRefId, orgId, inputProvider],
    );
    return row ? { ...row, referenceSafety: 'reference_only' } : null;
  },
});

const lookupKeyRef = async (client, decision) => queryOne(
  client,
  `SELECT id, org_id, provider, resolver_type, secret_ref, status, expires_at, deleted_at
   FROM ai_provider_key_refs
   WHERE id = $1 AND org_id = $2 AND provider = $3
   LIMIT 1`,
  [decision.keyRefId, decision.orgId, decision.provider],
);

const persistAudit = async (client, event, order, auditRows) => {
  order.push(`audit:${event.status}`);
  assertSafeOutput(event);
  assertSanitizedAuditMetadata(event.metadata);

  return persistProviderResolverAuditEvent(event, {
    insert: async (table, row) => {
      assert.equal(table, 'ai_provider_audit_events');
      assertSanitizedAuditMetadata(row.metadata);
      const inserted = await insertRow(client, table, row);
      auditRows.push(inserted);
      return inserted;
    },
  });
};

const runSmokeCase = async (client, {
  name,
  orgId,
  operation,
  getMode = () => mode,
  expectStatus,
  expectedFailureClass,
  failAudit = false,
}) => {
  const order = [];
  const auditRows = [];
  const secretReads = [];
  let mockedProviderCalls = 0;

  const result = await runProviderGovernedOperation({
    operation,
    orgId,
    actorId,
    requestedProvider: provider,
    evidenceRef,
    correlationId: `m3-2p-${name}`,
    scannerReference: 'scripts/m3.2p-resolver-edge-smoke-mocked.mjs',
    runAllowed: async ({ apiKey }) => {
      order.push('mockedProvider');
      assert.equal(apiKey, fakeProviderSecret);
      mockedProviderCalls += 1;
      return { mocked: true, operation };
    },
  }, {
    getMode,
    resolverDeps: buildResolverDeps(client, order),
    persistAudit: async (event) => {
      if (failAudit) {
        order.push('audit:forced-failure');
        throw new Error('mocked audit failure');
      }
      return persistAudit(client, event, order, auditRows);
    },
    resolveSecret: async (decision) => {
      order.push('secret');
      const resolved = await resolveProviderSecretForDecision(decision, {
        lookupKeyRef: (allowedDecision) => lookupKeyRef(client, allowedDecision),
        readEnv: (name) => {
          secretReads.push(name);
          return process.env[name];
        },
        now: () => new Date('2026-06-10T00:00:00.000Z'),
      });
      return resolved;
    },
  });

  assertSafeOutput(result);
  assert.equal(result.status, expectStatus);
  if (expectStatus === 'blocked') {
    assert.equal(mockedProviderCalls, 0);
    if (expectedFailureClass) assert.equal(result.body.failureClass, expectedFailureClass);
  } else {
    assert.equal(mockedProviderCalls, 1);
  }

  return { name, result, order, auditRows, secretReads, mockedProviderCalls };
};

const verifyAuditRows = async (client) => {
  const result = await client.query(
    `SELECT status, policy_result, failure_class, metadata
     FROM ai_provider_audit_events
     WHERE evidence_ref = $1
     ORDER BY created_at ASC`,
    [evidenceRef],
  );

  assert.equal(result.rows.length >= 8, true);
  for (const row of result.rows) {
    assertSanitizedAuditMetadata(row.metadata);
  }

  return result.rows.length;
};

const main = async () => {
  log('M3.2p mocked resolver Edge smoke starting.');
  let stage = 'startup';
  assertDatabaseUrlSafety();
  log('DATABASE_URL visibility: visible without value.');
  log('Non-production guard: passed.');

  const previousSecretValue = process.env[secretRef];
  process.env[secretRef] = fakeProviderSecret;

  const client = new Client({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.PGSSLMODE === 'disable' ? false : { rejectUnauthorized: false },
  });

  let transactionStarted = false;
  try {
    stage = 'connect';
    await client.connect();
    stage = 'begin';
    await client.query('BEGIN');
    transactionStarted = true;

    stage = 'required-table-check';
    await assertRequiredTables(client);
    log('Provider governance tables: present.');

    stage = 'seed-smoke-rows';
    await seedSmokeRows(client);
    log('Seed/verify: smoke rows available inside transaction.');

    stage = 'blocked-scenarios';
    const blockedCases = [
      await runSmokeCase(client, {
        name: 'missing-mode-block',
        orgId: ids.orgAllowed,
        operation: 'generate_document',
        getMode: () => undefined,
        expectStatus: 'blocked',
        expectedFailureClass: 'mode_not_allowed',
      }),
      await runSmokeCase(client, {
        name: 'invalid-mode-block',
        orgId: ids.orgAllowed,
        operation: 'generate_document',
        getMode: () => 'local-demo',
        expectStatus: 'blocked',
        expectedFailureClass: 'mode_not_allowed',
      }),
      await runSmokeCase(client, {
        name: 'missing-policy-block',
        orgId: ids.orgMissingPolicy,
        operation: 'generate_document',
        expectStatus: 'blocked',
        expectedFailureClass: 'provider_policy_missing',
      }),
      await runSmokeCase(client, {
        name: 'disabled-config-block',
        orgId: ids.orgDisabledConfig,
        operation: 'generate_document',
        expectStatus: 'blocked',
        expectedFailureClass: 'provider_config_ineligible',
      }),
      await runSmokeCase(client, {
        name: 'manual-placeholder-block',
        orgId: ids.orgManualKeyRef,
        operation: 'generate_document',
        expectStatus: 'blocked',
        expectedFailureClass: 'key_reference_ineligible',
      }),
      await runSmokeCase(client, {
        name: 'wrong-prefix-block',
        orgId: ids.orgWrongPrefix,
        operation: 'generate_document',
        expectStatus: 'blocked',
        expectedFailureClass: 'secret_reference_unsafe',
      }),
      await runSmokeCase(client, {
        name: 'audit-failure-block',
        orgId: ids.orgAllowed,
        operation: 'generate_document',
        expectStatus: 'blocked',
        expectedFailureClass: 'audit_context_unsafe',
        failAudit: true,
      }),
    ];

    for (const blockedCase of blockedCases) {
      assert.equal(blockedCase.mockedProviderCalls, 0);
    }
    assert.equal(blockedCases.find(item => item.name === 'wrong-prefix-block').secretReads.length, 0);
    log('Blocked scenarios: passed.');

    stage = 'allowed-scenarios';
    const allowedCases = [];
    for (const operation of operations) {
      allowedCases.push(await runSmokeCase(client, {
        name: `allowed-${operation.replaceAll('_', '-')}`,
        orgId: ids.orgAllowed,
        operation,
        expectStatus: 'allowed',
      }));
    }

    for (const allowedCase of allowedCases) {
      assert.deepEqual(allowedCase.order, [
        'resolver:membership',
        'resolver:policy',
        'resolver:config',
        'resolver:keyRef',
        'audit:allowed',
        'secret',
        'mockedProvider',
      ]);
      assert.deepEqual(allowedCase.secretReads, [secretRef]);
      assert.equal(allowedCase.mockedProviderCalls, 1);
    }
    log('Allowed mocked scenarios: passed.');

    stage = 'audit-sanitization';
    const auditCount = await verifyAuditRows(client);
    log(`Audit sanitization: passed for ${auditCount} smoke audit events.`);

    stage = 'rollback-cleanup';
    await client.query('ROLLBACK');
    transactionStarted = false;
    log('Cleanup: transaction rolled back; no smoke rows retained.');
    log('No live provider call occurred; only mocked provider handoff was invoked.');
    log('Outcome A - mocked smoke passed.');
  } catch (error) {
    if (transactionStarted) {
      try {
        await client.query('ROLLBACK');
        log('Cleanup: transaction rolled back after blocked smoke.');
      } catch {
        log('Cleanup: rollback could not be confirmed.');
      }
    }

    const reason = error instanceof SmokeBlocked ? error.reason : 'mocked smoke assertion or database safety check failed';
    const errorName = error?.name && /^[a-zA-Z0-9_.:-]+$/.test(error.name) ? error.name : 'Error';
    console.error(`Outcome B - blocked at ${stage}: ${reason} (${errorName})`);
    process.exitCode = 1;
  } finally {
    await client.end().catch(() => undefined);

    if (previousSecretValue === undefined) {
      delete process.env[secretRef];
    } else {
      process.env[secretRef] = previousSecretValue;
    }

    fs.rmSync(compiledDir, { recursive: true, force: true });
  }
};

main();
