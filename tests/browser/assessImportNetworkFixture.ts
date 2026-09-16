import type { Page } from '@playwright/test';
import { createHash } from 'node:crypto';
import type { EnterpriseIntelligenceProjection } from '../../services/enterpriseIntelligence';
import type { SupportedEvidenceMimeType } from '../../services/enterpriseIntelligence';
import {
  emptyAssessDocumentMappingProjection,
  type AssessMappingCatalogProjection,
  type AssessMappingJsonValue,
  type AssessMappingPreviewProjection,
  type AssessMappingRunProjection,
} from '../../services/assessImport/contracts';
import { emptyTranscriptFlowProjection } from '../../services/transcriptFlow/contracts';
import { extractStructuredSpreadsheet, XLSX_MIME } from '../../supabase/functions/_shared/assessDocumentSpreadsheet';
import { API, ORG, WS } from './pr1dNetworkFixture';

const ids = {
  provider: 'a1000000-0000-4000-8000-000000000001', route: 'a1000000-0000-4000-8000-000000000002',
  sourceSet: 'a2000000-0000-4000-8000-000000000001', sourceSetVersion: 'a2000000-0000-4000-8000-000000000002',
  bundle: 'a3000000-0000-4000-8000-000000000001', bundleVersion: 'a3000000-0000-4000-8000-000000000002',
  catalog: 'a4000000-0000-4000-8000-000000000001', nameTarget: 'a4000000-0000-4000-8000-000000000002',
  descriptionTarget: 'a4000000-0000-4000-8000-000000000003', evidenceTarget: 'a4000000-0000-4000-8000-000000000004',
  run: 'a5000000-0000-4000-8000-000000000001', nameProposal: 'a5000000-0000-4000-8000-000000000002',
  descriptionProposal: 'a5000000-0000-4000-8000-000000000003', evidenceProposal: 'a5000000-0000-4000-8000-000000000004',
  job: 'a6000000-0000-4000-8000-000000000001', binding: 'a6000000-0000-4000-8000-000000000002',
  preview: 'a7000000-0000-4000-8000-000000000001', conflict: 'a7000000-0000-4000-8000-000000000002',
  oldCatalog: 'a4000000-0000-4000-8000-000000000010', oldNameTarget: 'a4000000-0000-4000-8000-000000000011',
  oldDescriptionTarget: 'a4000000-0000-4000-8000-000000000012', oldEvidenceTarget: 'a4000000-0000-4000-8000-000000000013',
  oldProposal: 'a5000000-0000-4000-8000-000000000012', oldPreview: 'a7000000-0000-4000-8000-000000000010',
} as const;
const digest = (character: string) => character.repeat(64);
const headers = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'content-type': 'application/json' };

type FixtureOptions = {
  onCommit(values: { name?: string; description?: string }): number;
  loseCommitResponse?: boolean;
  featureEnabled?: boolean;
  providerReady?: boolean;
  analyzeDelayMs?: number;
  applyFailure?: 'stale' | 'unknown';
  includeHistoricalMappingState?: boolean;
  incompletePreviewProjection?: boolean;
};

type StoredSource = {
  sourceId: string;
  sourceVersionId: string;
  displayName: string;
  mimeType: string;
  bytes: Uint8Array;
  text: string;
  cells: Array<{ sheet:string; address:string; text:string }>;
  parserVersion: string;
  extractedByteCount: number;
  sheetCount: number;
  cellCount: number;
  warnings: string[];
};
const sha256 = (value: string) => createHash('sha256').update(value).digest('hex');

export const installAssessImportFixture = async (page: Page, options: FixtureOptions) => {
  const operations: string[] = [];
  const commitAttemptBindings: Array<{ requestId:string; idempotencyKey:string }> = [];
  const storedSources = new Map<string, StoredSource>();
  let analyzeStartedResolve: (() => void) | undefined;
  let analyzeCompletedResolve: (() => void) | undefined;
  const analyzeStarted = new Promise<void>(resolve => { analyzeStartedResolve = resolve; });
  const analyzeCompleted = new Promise<void>(resolve => { analyzeCompletedResolve = resolve; });
  const projection: EnterpriseIntelligenceProjection = {
    schemaVersion: 'enterprise-intelligence-projection-2', organizationId: ORG, workspaceId: WS,
    authorizationVersion: 9, generatedAt: '2026-09-16T08:00:00.000Z', availability: 'ready',
    capabilities: ['assess.v2.read','assess.v2.draft.write','evidence.review','evidence.write','transcript.sources.manage','transcript.sources.read','transcript.assess.apply'],
    providers: [{ id:ids.provider, provider:'openai', displayName:'Synthetic mapping provider', defaultModel:'mock-model', status:'active', credentialState:'server_reference_present', endpointState:'first_party', validationState:'validated', lastValidatedAt:'2026-09-16T07:00:00.000Z', budgetState:'configured', eligibleRouteRoles:[], routes:[{ id:ids.route, capability:'assess.evidence.extract', modelLabel:'Mock model', enabled:options.providerReady !== false, availability:options.providerReady === false ? 'provider_unavailable' : 'ready', allowedRoleCount:1, allowedRoleIds:[] }] }],
    evidenceSources: [], evidenceCandidates: [], assessDrafts: [], applications: [], studioDocuments: [], deliveryPackages: [], monitorBaselines: [],
    modernizationDecisions: [], blueprints: [], approvalResources: [], commandActivity: [],
    transcriptFlow: { ...emptyTranscriptFlowProjection(), features:{ sourceSetsEnabled:true, assessMultisourceApplyEnabled:true } },
    documentMapping: { ...emptyAssessDocumentMappingProjection(), features:options.featureEnabled === false ? { enabled:false, disabledReason:'Supporting-document mapping is disabled for this synthetic workspace.' } : { enabled:true } },
    assessPromotion: { state:'contract_pending', acceptedCandidateCount:0, provenanceComplete:false, idempotencyState:'not_started', conflicts:[] },
  };
  let sourceSequence = 0;
  let committedCaseVersion = 1;
  let committedName = 'Invoice exception handling';
  let committedDescription = 'V2 case';

  await page.route(`${API}/functions/v1/enterprise-intelligence-query`, async route => {
    const body = route.request().postDataJSON() as { organizationId?: string; workspaceId?: string; assessDocumentMappingScope?: { caseId?:string; caseVersion?:number; inputBundleId?:string; inputBundleVersionId?:string } };
    if (body.organizationId !== ORG || body.workspaceId !== WS) return route.fulfill({ status:403, headers, body:JSON.stringify({ code:'TENANT_ACCESS_DENIED' }) });
    projection.generatedAt = new Date(Date.parse(projection.generatedAt) + 1_000).toISOString();
    const responseProjection = structuredClone(projection);
    const scope = body.assessDocumentMappingScope;
    if (scope) {
      responseProjection.documentMapping.catalogs = responseProjection.documentMapping.catalogs.filter(item => item.caseId === scope.caseId && item.caseVersion === scope.caseVersion);
      if (scope.inputBundleId && scope.inputBundleVersionId) {
        responseProjection.documentMapping.runs = responseProjection.documentMapping.runs.filter(item => item.caseId === scope.caseId && item.caseVersion === scope.caseVersion && item.inputBundleId === scope.inputBundleId && item.inputBundleVersionId === scope.inputBundleVersionId);
        const catalogIds = new Set(responseProjection.documentMapping.runs.map(item => item.catalogId));
        responseProjection.documentMapping.previews = responseProjection.documentMapping.previews.filter(item => item.caseId === scope.caseId && item.expectedCaseVersion === scope.caseVersion && item.inputBundleId === scope.inputBundleId && item.inputBundleVersionId === scope.inputBundleVersionId);
        responseProjection.documentMapping.previews.forEach(item => catalogIds.add(item.catalogId));
        responseProjection.documentMapping.catalogs = responseProjection.documentMapping.catalogs.filter(item => catalogIds.has(item.id));
        responseProjection.documentMapping.proposals = responseProjection.documentMapping.proposals.filter(item => item.caseId === scope.caseId && item.caseVersion === scope.caseVersion && item.inputBundleId === scope.inputBundleId && item.inputBundleVersionId === scope.inputBundleVersionId && catalogIds.has(item.catalogId));
        const conflictIds = new Set(responseProjection.documentMapping.previews.flatMap(item => item.conflicts.map(conflict => conflict.id)));
        responseProjection.documentMapping.conflicts = responseProjection.documentMapping.conflicts.filter(item => conflictIds.has(item.id));
      } else {
        responseProjection.documentMapping.proposals = [];
        responseProjection.documentMapping.previews = [];
        responseProjection.documentMapping.conflicts = [];
        responseProjection.documentMapping.runs = [];
      }
    }
    return route.fulfill({ status:200, headers, body:JSON.stringify({ projection:responseProjection }) });
  });

  await page.route(`${API}/functions/v1/enterprise-intelligence-command`, async route => {
    const request = route.request();
    if (request.method() === 'OPTIONS') return route.fulfill({ status:204, headers, body:'' });
    const body = request.postDataJSON() as { commandType?: string; requestId?:string; idempotencyKey?:string; payload?: Record<string, any> };
    const operation = String(body.commandType || '');
    const payload = body.payload || {};
    operations.push(operation);
    const ok = (resource: Record<string, unknown> = {}) => route.fulfill({ status:200, headers, body:JSON.stringify({ ok:true, outcome:'committed', resource }) });

    if (operation === 'evidence.source.create') {
      sourceSequence += 1;
      const suffix = String(sourceSequence).padStart(12, '0');
      const sourceId = `b1000000-0000-4000-8000-${suffix}`;
      const sourceVersionId = `b2000000-0000-4000-8000-${suffix}`;
      const displayName = String(payload.displayName || `source-${sourceSequence}`);
      const mimeType = String(payload.mimeType || 'text/plain');
      const bytes = new Uint8Array(Buffer.from(String(payload.contentBase64 || ''), 'base64'));
      const structured = mimeType === 'text/csv' || mimeType === XLSX_MIME
        ? await extractStructuredSpreadsheet(bytes, mimeType as 'text/csv' | typeof XLSX_MIME)
        : null;
      const text = structured?.text ?? new TextDecoder().decode(bytes);
      const extractedCharacterCount = text.length;
      storedSources.set(sourceVersionId, {
        sourceId, sourceVersionId, displayName, mimeType, bytes, text,
        cells: structured?.cells.map(cell => ({ sheet:cell.sheet, address:cell.address, text:cell.text })) ?? [],
        parserVersion: structured?.parserVersion ?? 'bounded-text-v1',
        extractedByteCount: new TextEncoder().encode(text).byteLength,
        sheetCount: structured?.sheets.length ?? 0,
        cellCount: structured?.cells.length ?? 0,
        warnings: structured?.warnings ?? [],
      });
      projection.evidenceSources.push({ id:sourceId, displayName, mimeType:mimeType as SupportedEvidenceMimeType, status:'review', versionLabel:'Committed source version 1', extractedCharacterCount, extractionState:'ready', sourceBytesAnchored:true, extractedTextAnchored:true, createdAt:'2026-09-16T08:00:00.000Z' });
      projection.transcriptFlow.sourceVersions.push({ sourceId, versionSelector:sourceVersionId, displayName, versionLabel:'Source version 1', mimeType, extractedCharacterCount, state:'ready', selectable:true, reuseState:'unused' });
      return ok({ id:sourceId, versionId:sourceVersionId, version:1, status:'review' });
    }
    if (operation === 'transcript.source-set.create-version') {
      const members = Array.isArray(payload.items) ? payload.items : [];
      projection.transcriptFlow.sourceSets = [{ id:ids.sourceSet, versionSelector:ids.sourceSetVersion, version:1, ownerModule:'assess', label:String(payload.displayLabel || 'Supporting documents'), description:String(payload.description || ''), versionLabel:'Source-set version 1', status:'locked', sourceCount:members.length, extractedCharacterCount:members.length * 200, members:members.map((member:any) => { const source = projection.transcriptFlow.sourceVersions.find(item => item.versionSelector === member.sourceVersionId)!; return { sourceId:source.sourceId, versionSelector:source.versionSelector, displayName:source.displayName, versionLabel:source.versionLabel, ordinal:member.ordinal, role:member.role, extractedCharacterCount:source.extractedCharacterCount, state:'ready' as const }; }), lockState:'locked', blockers:[], updatedAt:'2026-09-16T08:01:00.000Z' }];
      return ok({ id:ids.sourceSet, versionId:ids.sourceSetVersion, version:1, status:'locked' });
    }
    if (operation === 'transcript.input-bundle.lock') {
      const sourceSet = projection.transcriptFlow.sourceSets[0];
      projection.transcriptFlow.inputBundles = [{ id:ids.bundle, versionSelector:ids.bundleVersion, version:1, ownerModule:'assess', label:'Assessment document bundle', versionLabel:'Bundle version 1', status:'locked', sourceSetIds:[ids.sourceSet], sourceSetVersions:[{ sourceSetId:ids.sourceSet, sourceSetVersionSelector:ids.sourceSetVersion, sourceSetVersion:1, ordinal:1 }], sourceVersionSelectors:sourceSet.members.map(item => item.versionSelector), sourceCount:sourceSet.members.length, extractedCharacterCount:sourceSet.extractedCharacterCount, lockedAt:'2026-09-16T08:02:00.000Z' }, ...(options.includeHistoricalMappingState ? [{ id:'a3000000-0000-4000-8000-000000000003', versionSelector:'a3000000-0000-4000-8000-000000000004', version:1, ownerModule:'assess' as const, label:'Other exact bundle', versionLabel:'Bundle version 1', status:'locked' as const, sourceSetIds:[ids.sourceSet], sourceSetVersions:[{ sourceSetId:ids.sourceSet, sourceSetVersionSelector:ids.sourceSetVersion, sourceSetVersion:1, ordinal:1 }], sourceVersionSelectors:sourceSet.members.map(item => item.versionSelector), sourceCount:sourceSet.members.length, extractedCharacterCount:sourceSet.extractedCharacterCount, lockedAt:'2026-09-16T07:55:00.000Z' }] : [])];
      return ok({ id:ids.bundle, versionId:ids.bundleVersion, version:1, status:'locked' });
    }
    if (operation === 'assess.document-map.analyze') {
      analyzeStartedResolve?.();
      if (options.analyzeDelayMs) await new Promise(resolve => setTimeout(resolve, options.analyzeDelayMs));
      const caseId = String(payload.caseId);
      committedCaseVersion = Number(payload.expectedCaseVersion);
      const requested = Array.isArray(payload.selections) ? payload.selections : [];
      const analyzed = requested.map((selection:any, index:number) => {
        const source = storedSources.get(String(selection.sourceVersionId));
        if (!source) throw new Error('ASSESS_IMPORT_FIXTURE_SOURCE_NOT_STORED');
        return { source, jobId:`a6000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}` };
      });
      const xlsx = analyzed.find(item => item.source.mimeType === XLSX_MIME) || analyzed[0];
      const source = projection.transcriptFlow.sourceVersions.find(item => item.versionSelector === xlsx.source.sourceVersionId)!;
      const currentCatalog: AssessMappingCatalogProjection = { id:ids.catalog, caseId, caseVersion:committedCaseVersion, assessSchemaVersion:'assess-v2-1', catalogVersion:1, catalogHash:digest('a'), status:'current', createdAt:'2026-09-16T08:03:00.000Z', targets:[
        { selectorId:ids.nameTarget, catalogId:ids.catalog, caseId, caseVersion:committedCaseVersion, assessSchemaVersion:'assess-v2-1', targetKind:'case_field', operation:'set_field', fieldId:'name', label:'Case name', contextLabel:'Assessment scope', valueType:'text', currentValue:committedName, currentValueHash:digest('b'), manual:false },
        { selectorId:ids.descriptionTarget, catalogId:ids.catalog, caseId, caseVersion:committedCaseVersion, assessSchemaVersion:'assess-v2-1', targetKind:'case_field', operation:'set_field', fieldId:'description', label:'Case description', contextLabel:'Assessment scope', valueType:'text', currentValue:committedDescription, currentValueHash:digest('c'), manual:true },
        { selectorId:ids.evidenceTarget, catalogId:ids.catalog, caseId, caseVersion:committedCaseVersion, assessSchemaVersion:'assess-v2-1', targetKind:'evidence_only', operation:'link_evidence', fieldId:'evidence', label:'Linked source evidence', contextLabel:'Assessment evidence', valueType:'evidence', currentValueHash:digest('d'), manual:false },
      ] };
      const oldTargetIds = [ids.oldNameTarget, ids.oldDescriptionTarget, ids.oldEvidenceTarget];
      projection.documentMapping.catalogs = [currentCatalog, ...(options.includeHistoricalMappingState ? [{ ...currentCatalog, id:ids.oldCatalog, catalogHash:digest('e'), status:'stale' as const, createdAt:'2026-09-16T07:58:00.000Z', targets:currentCatalog.targets.map((target, index) => ({ ...target, selectorId:oldTargetIds[index], catalogId:ids.oldCatalog, label:`Historical ${target.label}` })) }] : [])];
      const proposal = (id:string, targetSelectorId:string, value:AssessMappingJsonValue, cellAddress:string, excerpt:string) => {
        const cell = xlsx.source.cells.find(item => item.sheet === 'Process' && item.address === cellAddress && item.text === excerpt);
        if (!cell) throw new Error('ASSESS_IMPORT_FIXTURE_ANCHOR_NOT_IN_UPLOADED_WORKBOOK');
        const locator = `sheet:${JSON.stringify(cell.sheet)};cell:${cell.address}`;
        const normalizedHash = sha256(xlsx.source.text);
        return { id, version:1, catalogId:ids.catalog, targetSelectorId, caseId, caseVersion:committedCaseVersion, inputBundleId:ids.bundle, inputBundleVersionId:ids.bundleVersion, extractionJobId:xlsx.jobId, extractionBindingId:ids.binding, sourceId:source.sourceId, sourceVersionId:source.versionSelector, proposedValue:value, effectiveValue:value, confidence:0.91, rationale:'Grounded synthetic suggestion', sourceAnchor:{ sourceVersionId:source.versionSelector, parserVersion:xlsx.source.parserVersion, locator, anchorHash:sha256(`${source.versionSelector}:${normalizedHash}:${locator}:${excerpt}`), safeExcerpt:excerpt }, status:'suggested' as const, relationship:'supporting' as const, reviewState:'pending' as const };
      };
      projection.documentMapping.proposals = [proposal(ids.nameProposal,ids.nameTarget,'AI mapped invoice resolution','B1','AI mapped invoice resolution'), proposal(ids.descriptionProposal,ids.descriptionTarget,'AI proposed replacement description','B2','AI proposed replacement description'), proposal(ids.evidenceProposal,ids.evidenceTarget,null,'B3','Evidence-only supporting note')];
      if (options.includeHistoricalMappingState) projection.documentMapping.proposals.push({
        ...projection.documentMapping.proposals[0], id:ids.oldProposal, catalogId:ids.oldCatalog,
        targetSelectorId:ids.oldNameTarget, proposedValue:'OLD_HISTORY_PROPOSAL_MUST_NOT_RENDER', effectiveValue:'OLD_HISTORY_PROPOSAL_MUST_NOT_RENDER',
      });
      const currentRun: AssessMappingRunProjection = { id:ids.run, catalogId:ids.catalog, caseId, caseVersion:committedCaseVersion, inputBundleId:ids.bundle, inputBundleVersionId:ids.bundleVersion, extractionJobIds:analyzed.map(item => item.jobId), state:'review_required', proposalCount:3, projectionComplete:true, warnings:[], analyzedSources:analyzed.map(({source:item}) => ({ sourceId:item.sourceId, sourceVersionId:item.sourceVersionId, parserVersion:item.parserVersion, extractedByteCount:item.extractedByteCount, sheetCount:item.sheetCount, cellCount:item.cellCount, warnings:item.warnings })), updatedAt:'2026-09-16T08:03:00.000Z' };
      projection.documentMapping.runs = [currentRun, ...(options.includeHistoricalMappingState ? [
        { ...currentRun, id:'a5000000-0000-4000-8000-000000000010', catalogId:ids.oldCatalog, proposalCount:1, warnings:['OLD_HISTORY_RUN_MUST_NOT_RENDER'], updatedAt:'2026-09-16T07:58:00.000Z' },
        { ...currentRun, id:'a5000000-0000-4000-8000-000000000011', inputBundleId:'a3000000-0000-4000-8000-000000000003', inputBundleVersionId:'a3000000-0000-4000-8000-000000000004', proposalCount:0, warnings:['OTHER_BUNDLE_RUN_MUST_NOT_RENDER'], updatedAt:'2026-09-16T08:04:00.000Z' },
      ] : [])];
      analyzeCompletedResolve?.();
      return ok({ id:ids.run, status:'review_required', version:1 });
    }
    if (operation === 'assess.document-map.proposal.review') {
      const proposal = projection.documentMapping.proposals.find(item => item.id === payload.proposalId);
      if (!proposal) return route.fulfill({ status:409, headers, body:JSON.stringify({ ok:false,error:{code:'RESOURCE_STALE'} }) });
      proposal.status = payload.status;
      proposal.reviewState = 'reviewed_by_you';
      proposal.reviewedAt = '2026-09-16T08:04:00.000Z';
      if (payload.status === 'edited') { proposal.effectiveValue = payload.editedValue; proposal.version += 1; }
      return ok({ id:proposal.id, status:proposal.status, version:proposal.version });
    }
    if (operation === 'assess.document-map.preview') {
      const selections = Array.isArray(payload.selections) ? payload.selections : [];
      const descriptionSelected = selections.some((item:any) => item.proposalId === ids.descriptionProposal);
      const conflict = { id:ids.conflict, targetSelectorId:ids.descriptionTarget, label:'Case description', proposalIds:[ids.descriptionProposal], currentValue:committedDescription, material:true, resolution:'unresolved' as const, resolutionVersion:1 };
      projection.documentMapping.conflicts = descriptionSelected ? [conflict] : [];
      const currentPreview: AssessMappingPreviewProjection = { id:ids.preview, catalogId:ids.catalog, catalogHash:digest('a'), caseId:String(payload.caseId), expectedCaseVersion:Number(payload.expectedCaseVersion), inputBundleId:ids.bundle, inputBundleVersionId:ids.bundleVersion, proposalIds:selections.map((item:any) => item.proposalId), changes:selections.map((item:any) => { const proposal = projection.documentMapping.proposals.find(value => value.id === item.proposalId)!; const target = projection.documentMapping.catalogs[0].targets.find(value => value.selectorId === proposal.targetSelectorId)!; return { proposalId:proposal.id, targetSelectorId:proposal.targetSelectorId, label:target.label, currentValue:target.currentValue, proposedValue:proposal.effectiveValue, conflictState:proposal.id === ids.descriptionProposal ? 'manual_conflict' as const : 'none' as const }; }), conflicts:descriptionSelected ? [conflict] : [], manifest:{ previewBatchId:ids.preview, manifestVersion:1, catalogId:ids.catalog, catalogHash:digest('a'), caseId:String(payload.caseId), caseVersion:Number(payload.expectedCaseVersion), inputBundleId:ids.bundle, inputBundleVersionId:ids.bundleVersion, targetCount:3, sourceCount:projection.transcriptFlow.inputBundles[0].sourceCount, itemCount:selections.length, reviewedCount:selections.length, conflictCount:descriptionSelected ? 1 : 0, unresolvedConflictCount:descriptionSelected ? 1 : 0, itemSetHash:digest('1'), conflictSetHash:digest('2'), resolutionSetHash:digest('0'), displayedSetHash:digest('3') }, projectionComplete:options.incompletePreviewProjection !== true, status:'ready', expiresAt:'2026-09-16T09:00:00.000Z' };
      projection.documentMapping.previews = [currentPreview, ...(options.includeHistoricalMappingState ? [
        { ...currentPreview, id:ids.oldPreview, catalogId:ids.oldCatalog, catalogHash:digest('e'), proposalIds:[ids.oldProposal], changes:[{ proposalId:ids.oldProposal, targetSelectorId:ids.oldNameTarget, label:'OLD_HISTORY_PREVIEW_MUST_NOT_RENDER', currentValue:committedName, proposedValue:'Old value', conflictState:'none' as const }], conflicts:[], manifest:{ ...currentPreview.manifest, previewBatchId:ids.oldPreview, catalogId:ids.oldCatalog, catalogHash:digest('e'), itemCount:1, reviewedCount:1, conflictCount:0, unresolvedConflictCount:0, itemSetHash:digest('4'), conflictSetHash:digest('5'), resolutionSetHash:digest('4'), displayedSetHash:digest('6') }, status:'stale' as const, expiresAt:'2026-09-16T08:30:00.000Z' },
        { ...currentPreview, id:'a7000000-0000-4000-8000-000000000011', inputBundleId:'a3000000-0000-4000-8000-000000000003', inputBundleVersionId:'a3000000-0000-4000-8000-000000000004', proposalIds:[], changes:[], conflicts:[], manifest:{ ...currentPreview.manifest, previewBatchId:'a7000000-0000-4000-8000-000000000011', inputBundleId:'a3000000-0000-4000-8000-000000000003', inputBundleVersionId:'a3000000-0000-4000-8000-000000000004', itemCount:0, reviewedCount:0, conflictCount:0, itemSetHash:digest('7'), conflictSetHash:digest('8'), displayedSetHash:digest('9') }, status:'stale' as const, expiresAt:'2026-09-16T08:45:00.000Z' },
      ] : [])];
      return ok({ id:ids.preview, status:'ready', version:1 });
    }
    if (operation === 'assess.document-map.conflict.resolve') {
      const conflict = projection.documentMapping.conflicts[0];
      if (conflict) {
        const selectedProposal = projection.documentMapping.proposals.find(item => item.id === payload.proposalId && conflict.proposalIds.includes(item.id));
        const resolvedValue = payload.resolution === 'retain_manual'
          ? conflict.currentValue
          : payload.resolution === 'choose_candidate'
            ? selectedProposal?.effectiveValue
            : payload.authoredValue;
        if (resolvedValue === undefined) return route.fulfill({ status:409, headers, body:JSON.stringify({ ok:false,error:{code:'ASSESS_DOCUMENT_MAPPING_CONFLICT_INVALID'} }) });
        conflict.resolution = payload.resolution;
        conflict.rationale = String(payload.rationale);
        conflict.resolutionVersion += 1;
        conflict.resolvedValue = resolvedValue;
        projection.documentMapping.previews[0].conflicts = [{...conflict}];
        projection.documentMapping.previews[0].manifest = { ...projection.documentMapping.previews[0].manifest, manifestVersion:2, unresolvedConflictCount:0, resolutionSetHash:digest('a'), displayedSetHash:digest('b') };
      }
      return ok({ id:ids.conflict, status:'resolved', version:conflict?.resolutionVersion || 1 });
    }
    if (operation === 'assess.document-map.commit') {
      commitAttemptBindings.push({ requestId:String(body.requestId || ''), idempotencyKey:String(body.idempotencyKey || '') });
      const expectedManifest = projection.documentMapping.previews[0]?.manifest;
      const actualManifest = payload.previewManifest && typeof payload.previewManifest === 'object' ? payload.previewManifest as Record<string, unknown> : {};
      if (!expectedManifest || Object.keys(actualManifest).length !== Object.keys(expectedManifest).length
        || Object.entries(expectedManifest).some(([key, value]) => actualManifest[key] !== value)) {
        return route.fulfill({ status:409, headers, body:JSON.stringify({ ok:false, error:{ code:'ASSESS_DOCUMENT_MAPPING_STALE' } }) });
      }
      if (options.applyFailure === 'stale') return route.fulfill({ status:409, headers, body:JSON.stringify({ ok:false, error:{ code:'RESOURCE_STALE' } }) });
      if (options.applyFailure === 'unknown') return route.abort('failed');
      const nameProposal = projection.documentMapping.proposals.find(item => item.id === ids.nameProposal);
      const nameSelected = projection.documentMapping.previews[0]?.proposalIds.includes(ids.nameProposal);
      const appliedName = nameSelected && typeof nameProposal?.effectiveValue === 'string' ? nameProposal.effectiveValue : undefined;
      const descriptionSelected = projection.documentMapping.previews[0]?.proposalIds.includes(ids.descriptionProposal);
      const descriptionConflict = projection.documentMapping.previews[0]?.conflicts.find(item => item.targetSelectorId === ids.descriptionTarget);
      const appliedDescription = descriptionSelected && typeof descriptionConflict?.resolvedValue === 'string' ? descriptionConflict.resolvedValue : undefined;
      const version = options.onCommit({ name:appliedName, description:appliedDescription });
      committedName = appliedName ?? committedName;
      committedDescription = appliedDescription ?? committedDescription;
      committedCaseVersion = version;
      projection.documentMapping.previews[0].status = 'applied';
      if (options.loseCommitResponse) return route.abort('failed');
      return ok({ id:String(payload.caseId), status:'draft', version });
    }
    return route.fallback();
  });

  return { operations, projection, commitAttemptBindings, waitForAnalyzeStart:() => analyzeStarted, waitForAnalyzeComplete:() => analyzeCompleted };
};
