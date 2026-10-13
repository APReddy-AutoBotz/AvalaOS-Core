import { createHash } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';

import { authenticatedEvidenceDigest } from './authenticatedBrowserCorrelation.mjs';
import { AUTHENTICATED_OBSERVED_SOURCE_EFFECTS } from './authenticatedHostedObserver.mjs';

const DIGEST = /^sha256:[0-9a-f]{64}$/u;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const timestamp = value => typeof value === 'string' && Number.isFinite(Date.parse(value));
const fail = code => { throw new Error(`AUTHENTICATED_HOSTED_OBSERVATION_${code}`); };
const scalarDigest = value => `sha256:${createHash('sha256').update(String(value)).digest('hex')}`;
const first = (row, fields) => fields.map(field => row?.[field]).find(value => value !== null && value !== undefined) ?? null;
const asDigest = value => {
  if (typeof value !== 'string' || !value) return null;
  if (DIGEST.test(value)) return value;
  if (/^[0-9a-f]{64}$/u.test(value)) return `sha256:${value}`;
  return authenticatedEvidenceDigest(value);
};
const iso = value => {
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date.toISOString() : null;
};

export const AUTHENTICATED_HOSTED_OBSERVATION_SOURCES = Object.freeze([
  ['assess_processes','domain',['updated_by','created_by','owner_id']],
  ['assessments','domain',['updated_by','created_by','owner_id']],
  ['assess_v2_cases','domain',['updated_by','created_by','author_id']],
  ['assess_v2_case_versions','domain',['author_id','created_by'],['case_id','version']],
  ['assess_v2_decision_versions','domain',['created_by','author_id']],
  ['assess_v2_review_assignments','domain',['assigned_by','reviewer_id']],
  ['assess_v2_evidence_attestations','domain',['reviewer_id','reviewed_by']],
  ['assess_v2_review_resolutions','domain',['reviewer_id','resolved_by']],
  ['assess_v2_govern_resolutions','domain',['resolved_by','actor_id']],
  ['assess_v2_studio_handoffs','domain',['created_by','actor_id']],
  ['studio_artifact_source_packages','domain',['created_by','actor_id']],
  ['studio_artifact_aggregates','domain',['updated_by','created_by','actor_id']],
  ['studio_artifact_versions','domain',['created_by','actor_id'],['artifact_id','version']],
  ['studio_artifact_generation_attempts','generation_attempt',['requested_by','actor_id','created_by']],
  ['document_generations','domain',['generated_by','created_by','actor_id']],
  ['delivery_work_items','domain',['updated_by','created_by','owner_id']],
  ['legacy_delivery_imports','domain',['imported_by','created_by','actor_id']],
  ['legacy_delivery_outcome_versions','domain',['recorded_by','created_by','actor_id']],
  ['legacy_delivery_pack_snapshots','domain',['created_by','actor_id']],
  ['studio_delivery_publications','domain',['published_by','created_by','actor_id']],
  ['legacy_delivery_outcome_aggregates','domain',[],['task_id']],
  ['ai_provider_configs','domain',['updated_by','created_by']],
  ['ai_provider_key_refs','secret',['updated_by','created_by','actor_id']],
  ['ai_provider_audit_events','audit',['actor_id']],
  ['enterprise_ai_budget_reservations','budget_reservation',['actor_id']],
  ['studio_renditions','storage',[]],
  ['studio_rendition_attempts','generation_attempt',['requested_by','actor_id','created_by']],
  ['assess_command_receipts','receipt',['actor_id']],
  ['studio_artifact_command_receipts','receipt',['actor_id']],
  ['legacy_delivery_command_receipts','receipt',['actor_id']],
  ['studio_delivery_command_receipts','receipt',['actor_id']],
  ['enterprise_ai_command_receipts','receipt',['actor_id']],
  ['privileged_audit_events','audit',['actor_id']],
].map(([table,effectKind,actorFields,identityFields = ['id']]) => Object.freeze({
  table, effectKind, actorFields: Object.freeze(actorFields), identityFields: Object.freeze(identityFields),
})));

for (const source of AUTHENTICATED_HOSTED_OBSERVATION_SOURCES) {
  if (AUTHENTICATED_OBSERVED_SOURCE_EFFECTS[source.table] !== source.effectKind) fail('SOURCE_EFFECT_REJECTED');
}

export function authenticatedHostedRequestBinding({ requestId, actorHash, commandType, payload, requireUuid = false }) {
  if ((requireUuid ? !UUID.test(requestId ?? '') : typeof requestId !== 'string' || !requestId.length)
    || !DIGEST.test(actorHash ?? '')
    || typeof commandType !== 'string' || !/^[a-z][a-z0-9._:/-]{1,159}$/u.test(commandType)) fail('COMMAND_BINDING_REJECTED');
  const requestIdHash = scalarDigest(requestId);
  return Object.freeze({
    requestIdHash,
    commandBindingHash: authenticatedEvidenceDigest({ requestIdHash, actorHash, commandType }),
    ...(payload === undefined ? {} : { browserPayloadHash: authenticatedEvidenceDigest(payload) }),
  });
}

export const authenticatedHostedCommandBinding = authenticatedHostedRequestBinding;

const projectActors = project => {
  const values = Object.values(project?.identities ?? {}).map(actor => actor?.id);
  if (values.length < 4 || values.some(value => !UUID.test(value)) || new Set(values).size !== values.length) {
    fail('PROJECT_ACTORS_REJECTED');
  }
  return values;
};

const sourceQuery = source => {
  const actor = source.actorFields.length
    ? `(${source.actorFields.map(field => `to_jsonb(x)->>'${field}'=ANY($3::text[])`).join(' OR ')})`
    : 'false';
  const ancestry = `(to_jsonb(x)->>'project_id'=$4 OR to_jsonb(x)->>'process_id'=$5
    OR to_jsonb(x)->>'source_process_id'=$5)`;
  const indirect = source.table === 'studio_renditions'
    ? ` OR EXISTS(SELECT 1 FROM public.studio_rendition_attempts linked
        WHERE linked.id=x.attempt_id AND linked.requested_by=ANY($3::uuid[]))`
    : source.table === 'legacy_delivery_outcome_aggregates'
      ? ` OR EXISTS(SELECT 1 FROM public.delivery_work_items linked
          WHERE linked.id=x.task_id AND linked.project_id=$4::uuid)` : '';
  return `SELECT '${source.table}'::text source,to_jsonb(x) value FROM public.${source.table} x
    WHERE to_jsonb(x)->>'org_id'=$1
      AND (NOT(to_jsonb(x)?'workspace_id') OR to_jsonb(x)->>'workspace_id'=$2)
      AND (${actor} OR ${ancestry}${indirect})`;
};

const nonExerciseQuery = source => {
  const ordering = source.identityFields.map(field => `coalesce(to_jsonb(kept)->>'${field}','')`).join(',');
  const actorOwned = source.actorFields.length
    ? `(${source.actorFields.map(field => `nullif(to_jsonb(x)->>'${field}','')::uuid=ANY(o.actor_ids)`).join(' OR ')})`
    : 'false';
  const resourceOwned = `(nullif(to_jsonb(x)->>'id','')::uuid=ANY(o.project_ids)
    OR nullif(to_jsonb(x)->>'id','')::uuid=ANY(o.process_ids)
    OR nullif(to_jsonb(x)->>'project_id','')::uuid=ANY(o.project_ids)
    OR nullif(to_jsonb(x)->>'process_id','')::uuid=ANY(o.process_ids)
    OR nullif(to_jsonb(x)->>'source_process_id','')::uuid=ANY(o.process_ids))`;
  const indirectOwned = source.table === 'studio_renditions'
    ? ` OR EXISTS(SELECT 1 FROM public.studio_rendition_attempts linked
        WHERE linked.id=x.attempt_id AND linked.requested_by=ANY(o.actor_ids))`
    : '';
  const createdAt = `coalesce(${[
    'created_at','assigned_at','reviewed_at','resolved_at','handed_off_at','published_at','recorded_at','reserved_at',
  ].map(field => `nullif(to_jsonb(x)->>'${field}','')::timestamptz`).join(',')})`;
  return `WITH ownership AS(SELECT $1::uuid[] actor_ids,$2::uuid[] project_ids,$3::uuid[] process_ids,
      $4::timestamptz cutoff,$5::text org_id,$6::text workspace_id)
    SELECT 'sha256:'||encode(public.digest(convert_to(
    coalesce(jsonb_agg(to_jsonb(kept) ORDER BY ${ordering}),'[]'::jsonb)::text,
    'UTF8'),'sha256'),'hex') value FROM (
      SELECT x.* FROM public.${source.table} x CROSS JOIN ownership o
      WHERE NOT(coalesce((${actorOwned} OR ${resourceOwned}${indirectOwned}) AND ${createdAt}>=o.cutoff
        AND to_jsonb(x)->>'org_id'=o.org_id
        AND (NOT(to_jsonb(x)?'workspace_id') OR to_jsonb(x)->>'workspace_id'=o.workspace_id),false))
    ) kept`;
};

const rowTime = row => {
  const values = [
    'occurred_at','completed_at','recorded_at','published_at','resolved_at','reviewed_at','assigned_at',
    'handed_off_at','reserved_at','created_at','updated_at',
  ].map(field => iso(row?.[field])).filter(Boolean);
  return values.sort((left, right) => Date.parse(right) - Date.parse(left))[0] ?? null;
};

const receiptAnchor = (entry, actorHash, sessionHash) => {
  const row = entry.row;
  const requestId = row.request_id;
  const receiptId = row.id;
  const commandType = row.command_type ?? row.action;
  if (!UUID.test(requestId ?? '') || !UUID.test(receiptId ?? '') || !commandType || !actorHash || !sessionHash) return null;
  const binding = authenticatedHostedRequestBinding({ requestId, actorHash, commandType, requireUuid: true });
  return {
    ...binding,
    actorHash,
    sessionHash,
    commandType,
    requestId,
    receiptId,
    receiptIdHash: scalarDigest(receiptId),
    persistedRequestHash: asDigest(row.request_hash),
    commandId: row.resource_id ?? row.response?.commandId ?? row.response?.resourceId ?? null,
    occurredAt: entry.occurredAt,
  };
};

const linkedReceiptId = row => first(row, ['receipt_id']) ?? row?.metadata?.receiptId ?? row?.metadata?.receipt_id ?? null;
const businessRow = (source, row) => {
  if (source !== 'studio_artifact_aggregates') return row;
  const { aggregate_version, updated_at, ...business } = row;
  void aggregate_version; void updated_at;
  return business;
};
const recordIdentity = (source, row) => {
  const values = Object.fromEntries(source.identityFields.map(field => [field, row?.[field]]));
  if (Object.values(values).some(value => value === null || value === undefined || value === '')) {
    fail(`SOURCE_IDENTITY_REJECTED:${source.table}`);
  }
  return values;
};

const selectAnchor = ({ entry, anchors, from, to, actorHash }) => {
  if (entry.source.effectKind === 'receipt') return anchors.find(anchor => anchor.receiptId === entry.row.id) ?? null;
  const receiptId = linkedReceiptId(entry.row);
  if (receiptId) {
    const direct = anchors.filter(anchor => anchor.receiptId === receiptId);
    return direct.length === 1 ? direct[0] : null;
  }
  const requestId = entry.row.request_id;
  if (requestId) {
    const direct = anchors.filter(anchor => anchor.requestId === requestId && (!actorHash || anchor.actorHash === actorHash));
    if (direct.length === 1) return direct[0];
  }
  const resourceIds = ['id','case_id','artifact_id','task_id','outcome_id','project_id','process_id','source_process_id']
    .map(field => entry.row[field]).filter(value => UUID.test(value ?? ''));
  if (resourceIds.length) {
    const direct = anchors.filter(anchor => resourceIds.includes(anchor.commandId)
      && (!actorHash || anchor.actorHash === actorHash));
    if (direct.length === 1) return direct[0];
  }
  if (Date.parse(entry.occurredAt) < Date.parse(from) || Date.parse(entry.occurredAt) > Date.parse(to) || !actorHash) return null;
  const temporal = anchors.filter(anchor => anchor.actorHash === actorHash
    && Date.parse(anchor.occurredAt) >= Date.parse(from) && Date.parse(anchor.occurredAt) <= Date.parse(to));
  return temporal.length === 1 ? temporal[0] : null;
};

const controlRecord = ({ source, item, scope, capturedAt }) => {
  const actorHash = item?.actorHash ?? null;
  const sessionHash = item?.sessionHash ?? null;
  const requestIdHash = item?.requestHash ?? null;
  const commandType = item?.commandType ?? null;
  const commandBindingHash = requestIdHash && actorHash && commandType
    ? authenticatedEvidenceDigest({ requestIdHash, actorHash, commandType }) : null;
  return {
    source,
    recordHash: item?.eventIdHash ?? item?.permitIdHash ?? item?.exerciseIdHash
      ?? authenticatedEvidenceDigest({ source, item }),
    rowHash: authenticatedEvidenceDigest(item),
    businessRowHash: authenticatedEvidenceDigest(item),
    occurredAt: iso(item?.occurredAt ?? item?.consumedAt ?? item?.revokedAt ?? item?.armedAt
      ?? item?.boundAt ?? item?.activatedAt ?? capturedAt) ?? capturedAt,
    classification: item?.classification
      ?? (item?.state === 'active' || item?.state === 'armed' || item?.lifecycle === 'active'
        ? 'transient_control' : 'immutable_history'),
    active: item?.state === 'active' || item?.state === 'armed' || item?.lifecycle === 'active',
    actorHash: actorHash && sessionHash ? actorHash : null,
    sessionHash: actorHash && sessionHash ? sessionHash : null,
    requestIdHash,
    persistedRequestHash: null,
    persistedPayloadHash: item?.payloadHash ?? null,
    commandBindingHash,
    commandIdHash: null,
    receiptIdHash: null,
    auditIdHash: null,
    effectKind: 'control',
    organizationHash: scalarDigest(scope.organizationId),
    workspaceHash: scalarDigest(scope.workspaceId),
  };
};

export function createAuthenticatedHostedObservationReader({ db, config }) {
  if (!db?.query || !UUID.test(config?.scope?.organizationId ?? '')
    || !UUID.test(config?.scope?.workspaceId ?? '')) fail('CONFIG_REJECTED');
  const scope = config.scope;
  return Object.freeze({
    async capture(input) {
      if (!input || Object.hasOwn(input, 'to')) fail('CAPTURE_REJECTED');
      const { exerciseId, from, project } = input;
      if (!UUID.test(exerciseId ?? '') || !timestamp(from)
        || !UUID.test(project?.projectId ?? '') || !UUID.test(project?.processId ?? '')) fail('CAPTURE_REJECTED');
      const actors = projectActors(project);
      const authorityFrame = (await db.query(
        'SELECT public.authenticated_synthetic_observe($1,$2,statement_timestamp()) value',
        [exerciseId, from],
      )).rows?.[0]?.value;
      const capturedAt = iso(authorityFrame?.capturedAt);
      if (!capturedAt || Date.parse(capturedAt) < Date.parse(from)
        || !Array.isArray(authorityFrame?.actorSessions)) fail('AUTHORITY_FRAME_REJECTED');
      const sessionByActor = new Map(authorityFrame.actorSessions.map(item => [item.actorHash, item.sessionHash]));
      const entries = [];
      const result = await db.query(AUTHENTICATED_HOSTED_OBSERVATION_SOURCES.map(sourceQuery).join('\nUNION ALL\n'),
        [scope.organizationId, scope.workspaceId, actors, project.projectId, project.processId]);
      const sourceByTable = new Map(AUTHENTICATED_HOSTED_OBSERVATION_SOURCES.map(source => [source.table, source]));
      for (const resultRow of result.rows ?? []) {
        const source = sourceByTable.get(resultRow.source);
        if (!source) fail('SOURCE_SUBSTITUTION_REJECTED');
        const row = resultRow.value;
        const occurredAt = rowTime(row);
        if (!occurredAt) fail(`SOURCE_TIME_REJECTED:${source.table}`);
        entries.push({ source, row, occurredAt });
      }
      const actorFor = entry => first(entry.row, entry.source.actorFields);
      const hashesFor = entry => {
        const actorId = actorFor(entry);
        const actorHash = actorId ? scalarDigest(actorId) : null;
        const sessionHash = actorHash ? sessionByActor.get(actorHash) ?? null : null;
        return { actorHash: actorHash && sessionHash ? actorHash : null,
          sessionHash: actorHash && sessionHash ? sessionHash : null };
      };
      const anchors = entries.filter(entry => entry.source.effectKind === 'receipt'
        && Date.parse(entry.occurredAt) >= Date.parse(from)
        && Date.parse(entry.occurredAt) <= Date.parse(capturedAt)).map(entry => {
        const binding = hashesFor(entry);
        return receiptAnchor(entry, binding.actorHash, binding.sessionHash);
      }).filter(Boolean);
      const records = entries.map(entry => {
        const binding = hashesFor(entry);
        const anchor = selectAnchor({ entry, anchors, from, to: capturedAt, actorHash: binding.actorHash });
        const command = anchor?.commandId ?? null;
        return {
          source: entry.source.table,
          recordHash: authenticatedEvidenceDigest({ source: entry.source.table,
            identity: recordIdentity(entry.source, entry.row) }),
          rowHash: authenticatedEvidenceDigest(entry.row),
          businessRowHash: authenticatedEvidenceDigest(businessRow(entry.source.table, entry.row)),
          occurredAt: entry.occurredAt,
          classification: 'immutable_history',
          active: false,
          actorHash: anchor?.actorHash ?? binding.actorHash,
          sessionHash: anchor?.sessionHash ?? binding.sessionHash,
          requestIdHash: anchor?.requestIdHash ?? null,
          persistedRequestHash: anchor?.persistedRequestHash ?? null,
          persistedPayloadHash: null,
          commandBindingHash: anchor?.commandBindingHash ?? null,
          commandIdHash: command ? scalarDigest(command) : null,
          receiptIdHash: anchor?.receiptIdHash ?? null,
          auditIdHash: entry.source.effectKind === 'audit' && entry.row.id
            ? scalarDigest(entry.row.id) : null,
          effectKind: entry.source.effectKind,
          organizationHash: scalarDigest(scope.organizationId),
          workspaceHash: scalarDigest(scope.workspaceId),
        };
      });
      for (const [source, items] of [
        ['authenticated_synthetic_exercises', [authorityFrame.exercise]],
        ['authenticated_synthetic_actor_sessions', authorityFrame.actorSessions],
        ['authenticated_synthetic_permits', authorityFrame.permits],
        ['authenticated_synthetic_permit_events', authorityFrame.permitEvents],
      ]) for (const item of items ?? []) records.push(controlRecord({ source, item, scope, capturedAt }));
      const identities = new Set();
      for (const row of records) {
        if (identities.has(row.recordHash)) fail('DUPLICATE_RECORD');
        identities.add(row.recordHash);
      }
      return { capturedAt, records };
    },

    async nonExerciseDigest({ cutoff, ownership }) {
      const actorIds = ownership?.actorIds ?? [];
      const projectIds = ownership?.projectIds ?? [];
      const processIds = ownership?.processIds ?? [];
      if (!timestamp(cutoff) || ![actorIds, projectIds, processIds].every(values => Array.isArray(values)
        && values.every(value => UUID.test(value)) && new Set(values).size === values.length)) {
        fail('NON_EXERCISE_OWNERSHIP_REJECTED');
      }
      const sourceDigests = {};
      for (const source of AUTHENTICATED_HOSTED_OBSERVATION_SOURCES) {
        const result = await db.query(nonExerciseQuery(source), [actorIds, projectIds, processIds, iso(cutoff),
          scope.organizationId, scope.workspaceId]);
        const digest = result.rows?.[0]?.value;
        if (!DIGEST.test(digest ?? '')) fail('NON_EXERCISE_DIGEST_REJECTED');
        sourceDigests[source.table] = digest;
      }
      return authenticatedEvidenceDigest(sourceDigests);
    },
  });
}

export function assertAuthenticatedObservationRecordShape(actual, expected) {
  if (!isDeepStrictEqual(actual, expected)) fail('TEST_RECORD_MISMATCH');
}
