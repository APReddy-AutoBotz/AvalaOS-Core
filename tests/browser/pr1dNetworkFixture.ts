import type { Page } from '@playwright/test';
import { CANONICAL_AP_ASSESSMENT } from '../../data/mockData';
import { ASSESS_V1_SCORE_VERSION, cloneV1AssessmentToV2 } from '../../services/assessV1Compatibility';
import { ASSESS_V2_CAPABILITIES } from '../../services/assessV2/capabilities';
import { buildDecisionVersionV2 } from '../../services/assessV2/decisionVersion';
import { AP_INVOICE_EXCEPTION_V2_FIXTURE } from '../../services/assessV2/fixture';
import { parseAssessV2DraftPayload } from '../../supabase/functions/_shared/assessV2Command';
import { PROCESS_CREATE_CAPABILITY, parseProcessCreateEnvelope } from '../../services/processCreationContract';
import { ASSESS_V2_RULE_SET_VERSION, ASSESS_V2_SCHEMA_VERSION, type AssessmentCaseV2, createUnknownAgentNecessityFacts } from '../../services/assessV2/types';

export const USER='11111111-1111-4111-8111-111111111111';
export const ORG='22222222-2222-4222-8222-222222222222';
export const WS='33333333-3333-4333-8333-333333333333';
export const SECONDARY_WS='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
export const PROCESS='44444444-4444-4444-8444-444444444444';
export const ASSESSMENT='55555555-5555-4555-8555-555555555555';
export const HANDOFF='66666666-6666-4666-8666-666666666666';
export const V2_HEAD_VERSION='77777777-7777-4777-8777-777777777777';
export const V2_CLONE_VERSION='99999999-9999-4999-8999-999999999999';
export const API='https://127.0.0.1:59999';
export const ALL_CAPABILITIES = [
  'assess.read','assess.create','assess.response.write','assess.finalize',
  'govern.resolve','studio.handoff.create',
  ASSESS_V2_CAPABILITIES.read, ASSESS_V2_CAPABILITIES.create, ASSESS_V2_CAPABILITIES.clone,
  ASSESS_V2_CAPABILITIES.draftWrite, ASSESS_V2_CAPABILITIES.finalize,
];

type BoundaryCode = 'AUTHENTICATION_REQUIRED' | 'AUTHORITY_STALE' |
  'RESOURCE_NOT_AVAILABLE' | 'PERMISSION_DENIED' | 'VERSION_CONFLICT' | 'READ_ONLY';

export type FixtureOptions = {
  capabilities?: string[];
  failCommand?: { type: string; code: BoundaryCode };
  failV2Command?: { type: string; code: BoundaryCode };
  v2Offline?: boolean;
  initialStatus?: 'Draft' | 'Ready for Review' | 'Changes Requested' | 'Approved' | 'Handed Off to Docs';
  initialScoreVersion?: string | null;
  trustedApproval?: boolean;
  holdFirstProcessResponse?: boolean;
  failProcessCommand?: BoundaryCode;
  includeSecondaryWorkspace?: boolean;
};

type AssessmentRow = {
  id: string;
  process_id: string;
  org_id: string;
  workspace_id: string;
  version: number;
  score_version?: string | null;
  status: string;
  metadata: unknown;
  responses: unknown;
  evidence_items: unknown[];
  assumptions: unknown[];
  completion_by_section: unknown;
  review?: unknown;
  scores?: unknown;
};

export const jsonHeaders = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': '*',
  'content-type': 'application/json',
};

export const installEnterpriseFixture = async (page: Page, options: FixtureOptions = {}) => {
  const capabilities = options.capabilities ?? ALL_CAPABILITIES;
  const committedCommands: Array<Record<string, any>> = [];
  const processCommandRequests: Array<Record<string, any>> = [];
  const processReceipts = new Map<string,{ signature: string; response: unknown }>();
  const processRows: Array<Record<string,any>> = [{
    id:PROCESS,org_id:ORG,workspace_id:WS,name:'Invoice exception handling',
    description:'Resolve invoice exceptions before payment release.',owner_id:USER,
    department:'Finance',criticality:'High',status:'Not Started',template_id:null,
    created_at:'2026-07-13T00:00:00.000Z',updated_at:'2026-07-13T00:00:00.000Z',
  }];
  const receipts = new Map<string,{ signature: string; response: unknown }>();
  let failV2Command = options.failV2Command;
  let trustedApproval = options.trustedApproval ?? false;
  let v2Version = 0;
  let v2Decision: Record<string,any> | null = null;
  let v2Name = 'Invoice exception handling';
  let v2Description = 'V2 case';
  let v2Case: AssessmentCaseV2 | null = null;
  let immutableCloneEvidence: AssessmentCaseV2['evidence'] = [];
  let v2HeadEvidence: AssessmentCaseV2['evidence'] = [];
  const cloneVersionQueries: Array<Record<string, string | null>> = [];
  const cloneEvidenceVersionReads: Array<string | null> = [];
  let handoffId: string | null = options.initialStatus === 'Handed Off to Docs' ? HANDOFF : null;
  let assessment: AssessmentRow | null = options.initialStatus ? {
    id: ASSESSMENT,
    process_id: PROCESS,
    org_id: ORG,
    workspace_id: WS,
    version: options.initialStatus === 'Handed Off to Docs' ? 3 : 1,
    score_version: options.initialScoreVersion === undefined
      ? CANONICAL_AP_ASSESSMENT.scores?.scoreVersion || ASSESS_V1_SCORE_VERSION
      : options.initialScoreVersion,
    status: options.initialStatus,
    metadata: CANONICAL_AP_ASSESSMENT.metadata,
    responses: CANONICAL_AP_ASSESSMENT.responses,
    evidence_items: CANONICAL_AP_ASSESSMENT.evidenceItems,
    assumptions: CANONICAL_AP_ASSESSMENT.assumptions,
    completion_by_section: CANONICAL_AP_ASSESSMENT.completionBySection,
    review: CANONICAL_AP_ASSESSMENT.review,
    scores: options.initialScoreVersion === undefined
      ? CANONICAL_AP_ASSESSMENT.scores
      : { ...CANONICAL_AP_ASSESSMENT.scores, scoreVersion: options.initialScoreVersion },
  } : null;

  const user = {
    id: USER,
    email: 'reviewer@avala.test',
    role: 'authenticated',
    user_metadata: { full_name: 'Enterprise Reviewer' },
    aud: 'authenticated',
    created_at: '2026-07-13T00:00:00.000Z',
  };
  await page.addInitScript(({ user }) => {
    const now = Math.floor(Date.now()/1000);
    localStorage.setItem('sb-127-auth-token',JSON.stringify({
      access_token:'browser-fixture-token',
      refresh_token:'browser-fixture-refresh',
      token_type:'bearer',
      expires_in:3600,
      expires_at:now+3600,
      user,
    }));
    if (!localStorage.getItem('avalaos-core-v1-view')) {
      localStorage.setItem('avalaos-core-v1-view',JSON.stringify('process_catalog'));
    }
    if (!localStorage.getItem('avalaos-core-v1-scope')) {
      localStorage.setItem('avalaos-core-v1-scope',JSON.stringify({ type:'my_work' }));
    }
  },{ user });

  let primaryAuthorizationVersion = 9;
  let firstProcessHeld = false;
  let releaseFirstProcessResponse: (() => void) | null = null;
  let firstProcessReceived: (() => void) | null = null;
  const firstProcessReceivedPromise = new Promise<void>(resolve => { firstProcessReceived = resolve; });
  const firstProcessReleasePromise = new Promise<void>(resolve => { releaseFirstProcessResponse = resolve; });
  const processReadbacks: string[] = [];

  const fail = async (route: any, code: string, status = 409) => route.fulfill({
    status,
    headers:jsonHeaders,
    body:JSON.stringify({ ok:false,error:{ code,message:'The command could not be completed.' } }),
  });

  await page.route('**/*',async route => {
    const request = route.request();
    const url = new URL(request.url());
    if (['http://127.0.0.1:4173', 'http://127.0.0.1:4183', 'http://127.0.0.1:4189'].includes(url.origin)) return route.continue();
    if (url.origin !== API) return route.abort();
    if (request.method() === 'OPTIONS') return route.fulfill({ status:204,headers:jsonHeaders,body:'' });

    if (url.pathname === '/auth/v1/user') {
      return route.fulfill({ status:200,headers:jsonHeaders,body:JSON.stringify(user) });
    }
    if (url.pathname === '/auth/v1/token') {
      return route.fulfill({ status:200,headers:jsonHeaders,body:JSON.stringify({
        access_token:'browser-fixture-token',refresh_token:'browser-fixture-refresh',
        token_type:'bearer',expires_in:3600,user,
      }) });
    }
    if (url.pathname === '/functions/v1/tenant-session') {
      const contexts = [{
        userId:USER,organizationId:ORG,organizationName:'Avala Enterprise',
        workspaceId:WS,workspaceName:'Governed Assess',authorizationVersion:primaryAuthorizationVersion,capabilities,
      }];
      if (options.includeSecondaryWorkspace) contexts.push({
        userId:USER,organizationId:ORG,organizationName:'Avala Enterprise',
        workspaceId:SECONDARY_WS,workspaceName:'Other synthetic Assess',authorizationVersion:11,capabilities,
      });
      return route.fulfill({ status:200,headers:jsonHeaders,body:JSON.stringify({ contexts }) });
    }
    if (url.pathname === '/functions/v1/process-command') {
      const body = request.postDataJSON() as Record<string,any>;
      processCommandRequests.push(body);
      if (!capabilities.includes(PROCESS_CREATE_CAPABILITY) || !capabilities.includes('assess.read')) return fail(route,'PERMISSION_DENIED',403);
      if (options.failProcessCommand) return fail(route,options.failProcessCommand,options.failProcessCommand === 'PERMISSION_DENIED' ? 403 : 409);
      let envelope;
      try { envelope = parseProcessCreateEnvelope(body); } catch { return fail(route,'INVALID_COMMAND',400); }
      const expectedAuthorizationVersion = envelope.workspaceId === WS ? primaryAuthorizationVersion : envelope.workspaceId === SECONDARY_WS && options.includeSecondaryWorkspace ? 11 : null;
      if (envelope.organizationId !== ORG || envelope.authorizationVersion !== expectedAuthorizationVersion) return fail(route,'AUTHORITY_STALE',409);
      const signature = JSON.stringify({ organizationId:body.organizationId,workspaceId:body.workspaceId,expectedVersion:body.expectedVersion,payload:body.payload });
      const receiptKey = `${USER}:${body.idempotencyKey}`;
      const replay = processReceipts.get(receiptKey);
      if (replay) {
        if (replay.signature !== signature) return fail(route,'IDEMPOTENCY_CONFLICT',409);
        return route.fulfill({ status:200,headers:jsonHeaders,body:JSON.stringify(replay.response) });
      }
      if (processRows.some(row => row.id === envelope.payload.processId)) return fail(route,'IDEMPOTENCY_CONFLICT',409);
      const now = '2026-07-13T00:03:00.000Z';
      const receiptId = crypto.randomUUID();
      const row = {
        id:envelope.payload.processId,org_id:ORG,workspace_id:envelope.workspaceId,owner_id:USER,
        name:envelope.payload.name.trim(),description:envelope.payload.description,
        department:envelope.payload.department,criticality:envelope.payload.criticality,
        status:'Not Started',template_id:envelope.payload.templateId ?? null,
        created_at:now,updated_at:now,creation_receipt_id:receiptId,
        creation_request_id:envelope.requestId,creation_idempotency_key:envelope.idempotencyKey,
      };
      processRows.push(row);
      const response = { ok:true,outcome:'committed',resource:{
        id:row.id,orgId:ORG,workspaceId:envelope.workspaceId,ownerId:USER,name:row.name,
        description:row.description,department:row.department,criticality:row.criticality,
        status:row.status,templateId:row.template_id,version:1,receiptId,
        requestId:row.creation_request_id,idempotencyKey:row.creation_idempotency_key,
        createdAt:now,updatedAt:now,
      } };
      processReceipts.set(receiptKey,{ signature,response });
      committedCommands.push(body);
      if (options.holdFirstProcessResponse && !firstProcessHeld) {
        firstProcessHeld = true;
        firstProcessReceived?.();
        await firstProcessReleasePromise;
      }
      return route.fulfill({ status:200,headers:jsonHeaders,body:JSON.stringify(response) });
    }
    if (url.pathname === '/functions/v1/assess-v2-command') {
      const body = request.postDataJSON() as Record<string,any>;
      if (options.v2Offline) return route.abort('internetdisconnected');
      if (failV2Command?.type === body.commandType) {
        return fail(route, failV2Command.code, failV2Command.code === 'AUTHENTICATION_REQUIRED' ? 401 : failV2Command.code === 'PERMISSION_DENIED' ? 403 : 409);
      }
      if (body.commandType === 'assessment_v2.create' || body.commandType === 'assessment_v2.clone_from_v1') {
        v2Version = 1; v2Name = body.payload.name; v2Description = body.payload.description;
        const cloned = body.commandType === 'assessment_v2.clone_from_v1';
        if (cloned) {
          const source = {
            ...structuredClone(CANONICAL_AP_ASSESSMENT), id:ASSESSMENT, processId:PROCESS, orgId:ORG, workspaceId:WS,
            status:'Approved' as const, scoreVersion:ASSESS_V1_SCORE_VERSION,
            scores:{ ...structuredClone(CANONICAL_AP_ASSESSMENT.scores!), scoreVersion:ASSESS_V1_SCORE_VERSION },
          };
          v2Case = cloneV1AssessmentToV2(source, { caseId:body.payload.caseId, organizationId:ORG, workspaceId:WS, ownerId:USER, clonedAt:'2026-07-13T00:00:00.000Z' });
          immutableCloneEvidence = structuredClone(v2Case.evidence);
        } else {
          v2Case = { id:body.payload.caseId, organizationId:ORG, workspaceId:WS, sourceProcessId:PROCESS, ownerId:USER, status:'draft', version:1, schemaVersion:ASSESS_V2_SCHEMA_VERSION, ruleSetVersion:ASSESS_V2_RULE_SET_VERSION, importedFacts:[], primitives:[], edges:[], decisionPoints:[], exceptionPaths:[], assets:[], interactions:[], evidence:[], agentNecessity:createUnknownAgentNecessityFacts(), createdAt:'2026-07-13T00:00:00.000Z', updatedAt:'2026-07-13T00:00:00.000Z' };
          immutableCloneEvidence = [];
        }
        v2HeadEvidence = [];
      } else if (body.commandType === 'assessment_v2.draft.upsert') {
        const parsed = JSON.parse(JSON.stringify(parseAssessV2DraftPayload(body.payload))) as ReturnType<typeof parseAssessV2DraftPayload>;
        if (!v2Case || body.expectedVersion !== v2Version) return fail(route,'VERSION_CONFLICT',409);
        v2Version += 1; v2Name = parsed.name; v2Description = parsed.description;
        const immutableIds = new Set(immutableCloneEvidence.map(item => item.id));
        v2HeadEvidence = parsed.evidence.filter(item => !immutableIds.has(item.id));
        v2Case = { ...v2Case, id:parsed.caseId, version:v2Version, primitives:parsed.primitives, edges:parsed.edges, decisionPoints:parsed.decisionPoints, exceptionPaths:parsed.exceptionPaths, assets:parsed.assets, interactions:parsed.interactions as unknown as AssessmentCaseV2['interactions'], evidence:[...v2HeadEvidence, ...immutableCloneEvidence].sort((left,right) => left.id.localeCompare(right.id)), agentNecessity:parsed.agentNecessity, updatedAt:'2026-07-13T00:01:00.000Z' };
      } else if (body.commandType === 'assessment_v2.finalize') {
        if (!v2Case || body.expectedVersion !== v2Version) return fail(route,'VERSION_CONFLICT',409);
        v2Decision = await buildDecisionVersionV2(v2Case, USER, '2026-07-13T00:02:00.000Z');
        v2Version += 1; v2Case = { ...v2Case, status:'reviewer-ready', version:v2Version };
      }
      committedCommands.push(body);
      return route.fulfill({status:200,headers:jsonHeaders,body:JSON.stringify({ok:true,outcome:'committed', resource:{id:body.payload.caseId,status:body.commandType==='assessment_v2.finalize'?'reviewer_ready':'draft', version:v2Version,headVersionId:body.commandType === 'assessment_v2.clone_from_v1' ? V2_CLONE_VERSION : V2_HEAD_VERSION, ...(body.commandType === 'assessment_v2.clone_from_v1' ? { importedFactCount:v2Case?.importedFacts?.length ?? 0, importedEvidenceCount:v2Case?.evidence.length ?? 0 } : {}), ...(v2Decision?{decisionId:'88888888-8888-4888-8888-888888888888'}:{})}})});
    }
    if (url.pathname === '/rest/v1/assess_v2_decision_versions') {
      return route.fulfill({status:200,headers:{...jsonHeaders,'content-range':'0-0/1'},body:JSON.stringify(v2Decision ? {
        case_id:v2Decision.caseId,source_version_id:'77777777-7777-4777-8777-777777777777',
        schema_version:v2Decision.schemaVersion,
        rule_set_version:v2Decision.ruleSetVersion,decision_version:v2Decision.decisionVersion,
        validation_status:v2Decision.validationStatus,input_snapshot:v2Decision.inputSnapshot,
        evidence_snapshot:v2Decision.evidenceSnapshot,output_snapshot:v2Decision.outputSnapshot,
        input_hash:v2Decision.inputHash,evidence_hash:v2Decision.evidenceHash,output_hash:v2Decision.outputHash,
        input_canonical:v2Decision.inputCanonical,evidence_canonical:v2Decision.evidenceCanonical,output_canonical:v2Decision.outputCanonical,
        supersedes_decision_id:null,created_by:v2Decision.createdBy,created_at:v2Decision.createdAt
      } : null)});
    }
    if (url.pathname === '/rest/v1/assess_v2_cases') {
      return route.fulfill({status:200,headers:{...jsonHeaders,'content-range':v2Case?'0-0/1':'*/0'},body:JSON.stringify(v2Case ? { id:v2Case.id,org_id:ORG,workspace_id:WS,process_id:PROCESS,owner_id:USER,status:v2Case.status === 'reviewer-ready'?'reviewer_ready':'draft',version:v2Case.version,schema_version:v2Case.schemaVersion,rule_set_version:v2Case.ruleSetVersion,source_v1_assessment_id:v2Case.sourceV1?.assessmentId ?? null,source_v1_score_version:v2Case.sourceV1?.scoreVersion ?? null,created_at:v2Case.createdAt,updated_at:v2Case.updatedAt,head_version_id:v2Case.sourceV1 && v2Case.version === 1 ? V2_CLONE_VERSION : V2_HEAD_VERSION } : null)});
    }
    if (url.pathname === '/rest/v1/assess_v2_case_versions') {
      if (url.searchParams.get('source_kind') === 'eq.v1_clone') {
        const query = { caseId:url.searchParams.get('case_id'),orgId:url.searchParams.get('org_id'),workspaceId:url.searchParams.get('workspace_id'),version:url.searchParams.get('version'),sourceKind:url.searchParams.get('source_kind') };
        cloneVersionQueries.push(query);
        const isScopedClone = v2Case?.sourceV1 && query.caseId === `eq.${v2Case.id}` && query.orgId === `eq.${ORG}` && query.workspaceId === `eq.${WS}` && query.version === 'eq.1';
        return route.fulfill({status:200,headers:{...jsonHeaders,'content-range':isScopedClone?'0-0/1':'*/0'},body:JSON.stringify(isScopedClone ? { id:V2_CLONE_VERSION,source_snapshot:{clonedAt:v2Case!.sourceV1!.clonedAt},created_at:v2Case!.createdAt } : null)});
      }
      const full = url.searchParams.get('select')?.includes('agent_necessity');
      return route.fulfill({status:200,headers:{...jsonHeaders,'content-range':'0-0/1'},body:JSON.stringify(full ? { name:v2Name,description:v2Description,agent_necessity:v2Case?.agentNecessity,imported_facts:v2Case?.importedFacts ?? [] } : { name:v2Name,description:v2Description })});
    }
    const v2Children: Record<string, unknown[]> = { assess_v2_primitives:v2Case?.primitives ?? [], assess_v2_edges:v2Case?.edges ?? [], assess_v2_decision_points:v2Case?.decisionPoints ?? [], assess_v2_exception_paths:v2Case?.exceptionPaths ?? [], assess_v2_application_assets:v2Case?.assets ?? [], assess_v2_application_interactions:v2Case?.interactions ?? [], assess_v2_evidence_links:v2Case?.evidence ?? [] };
    const childName = url.pathname.split('/').pop()!;
    if (childName === 'assess_v2_evidence_links') {
      const versionId = url.searchParams.get('version_id');
      const evidence = versionId === `eq.${V2_CLONE_VERSION}` ? immutableCloneEvidence : v2HeadEvidence;
      if (versionId === `eq.${V2_CLONE_VERSION}`) cloneEvidenceVersionReads.push(versionId);
      return route.fulfill({status:200,headers:{...jsonHeaders,'content-range':evidence.length?'0-0/1':'*/0'},body:JSON.stringify(evidence.map(payload => ({ payload })))});
    }
    if (childName in v2Children) return route.fulfill({status:200,headers:{...jsonHeaders,'content-range':v2Children[childName].length?'0-0/1':'*/0'},body:JSON.stringify(v2Children[childName].map(payload => ({ payload })))});
    if (url.pathname === '/functions/v1/assess-command') {
      const body = request.postDataJSON() as Record<string,any>;
      if (options.failCommand?.type === body.commandType) {
        return fail(route,options.failCommand.code,options.failCommand.code === 'AUTHENTICATION_REQUIRED' ? 401 : 409);
      }
      if (body.commandType === 'studio_handoff.create' &&
          (assessment?.status !== 'Approved' || !trustedApproval)) {
        return fail(route,'COMMAND_UNAVAILABLE',409);
      }
      const key = `${body.commandType}:${body.idempotencyKey}`;
      const signature = JSON.stringify({
        organizationId:body.organizationId,workspaceId:body.workspaceId,
        expectedVersion:body.expectedVersion,payload:body.payload,
      });
      const receipt = receipts.get(key);
      if (receipt) {
        if (receipt.signature !== signature) return fail(route,'IDEMPOTENCY_CONFLICT',409);
        return route.fulfill({ status:200,headers:jsonHeaders,body:JSON.stringify(receipt.response) });
      }
      if (body.commandType !== 'assessment.create' &&
          (!assessment || body.expectedVersion !== assessment.version)) {
        return fail(route,'VERSION_CONFLICT',409);
      }

      if (body.commandType === 'assessment.create') {
        assessment = {
          id:body.requestId,process_id:body.payload.processId,org_id:ORG,workspace_id:WS,
          version:1,status:'Draft',metadata:{ completionQuality:0,templateFit:false,lastSavedAt:new Date().toISOString(),
            stakeholderCoverage:1,evidenceQuality:1,assumptionQuality:1 },
          responses:{ processStructure:{},workPattern:{},dataProfile:{},judgment:{},systems:{},risk:{} },
          evidence_items:[],assumptions:[],completion_by_section:{
            processStructure:0,workPattern:0,dataProfile:0,judgment:0,systems:0,risk:0,evidenceAndAssumptions:0,
          },
        };
      } else if (body.commandType === 'assessment.response.upsert' && assessment) {
        const reopensRequestedChanges = assessment.status === 'Changes Requested';
        assessment = {
          ...assessment,version:assessment.version+1,status:'Draft',
          responses:body.payload.responses,metadata:body.payload.metadata,
          evidence_items:body.payload.evidenceItems,assumptions:body.payload.assumptions,
          ...(reopensRequestedChanges ? { score_version:null,scores:undefined } : {}),
        };
      } else if (body.commandType === 'assessment.finalize' && assessment) {
        assessment = {
          ...assessment,version:assessment.version+1,status:'Ready for Review',
          score_version:CANONICAL_AP_ASSESSMENT.scores?.scoreVersion || 'assess-core-2026-05',
          metadata:CANONICAL_AP_ASSESSMENT.metadata,responses:CANONICAL_AP_ASSESSMENT.responses,
          evidence_items:CANONICAL_AP_ASSESSMENT.evidenceItems,assumptions:CANONICAL_AP_ASSESSMENT.assumptions,
          completion_by_section:CANONICAL_AP_ASSESSMENT.completionBySection,
          review:CANONICAL_AP_ASSESSMENT.review,scores:CANONICAL_AP_ASSESSMENT.scores,
        };
      } else if (body.commandType === 'govern.resolve' && assessment) {
        const status = body.payload.resolution === 'submit' ? 'In Review'
          : body.payload.resolution === 'approve' ? 'Approved'
          : body.payload.resolution === 'request_changes' ? 'Changes Requested' : 'Rejected';
        assessment = { ...assessment,version:assessment.version+1,status };
        if (body.payload.resolution === 'approve') trustedApproval = true;
      } else if (body.commandType === 'studio_handoff.create' && assessment) {
        assessment = { ...assessment,version:assessment.version+1,status:'Handed Off to Docs' };
        handoffId = HANDOFF;
      }

      const resource = {
        assessmentId:assessment!.id,version:assessment!.version,status:assessment!.status,
        ...(assessment!.score_version ? { scoreVersion:assessment!.score_version } : {}),
        ...(body.commandType === 'studio_handoff.create' ? { handoffId } : {}),
      };
      const response = { ok:true,outcome:'committed',resource };
      receipts.set(key,{ signature,response });
      committedCommands.push(body);
      return route.fulfill({ status:200,headers:jsonHeaders,body:JSON.stringify(response) });
    }

    if (url.pathname === '/rest/v1/assess_processes') {
      const id = url.searchParams.get('id');
      if (id) processReadbacks.push(id);
      const scoped = processRows.filter(row => (!id || id === `eq.${row.id}`) &&
        (!url.searchParams.has('org_id') || url.searchParams.get('org_id') === `eq.${row.org_id}`) &&
        (!url.searchParams.has('workspace_id') || url.searchParams.get('workspace_id') === `eq.${row.workspace_id}`));
      const single = request.headers()['accept']?.includes('application/vnd.pgrst.object+json');
      return route.fulfill({ status:200,headers:{...jsonHeaders,'content-range':scoped.length?`0-${scoped.length-1}/${scoped.length}`:'*/0'},body:JSON.stringify(single ? (scoped[0] ?? null) : scoped) });
    }
    if (url.pathname === '/rest/v1/assessments') {
      const processId = url.searchParams.get('process_id');
      const scoped = assessment && (!processId || processId === `eq.${assessment.process_id}`) ? assessment : null;
      return route.fulfill({
        status:200,headers:{...jsonHeaders,'content-range':scoped ? '0-0/1' : '*/0'},
        body:JSON.stringify(scoped),
      });
    }
    if (url.pathname === '/rest/v1/assessment_studio_handoffs') {
      return route.fulfill({
        status:200,headers:{...jsonHeaders,'content-range':handoffId ? '0-0/1' : '*/0'},
        body:JSON.stringify(handoffId ? { id:handoffId } : null),
      });
    }
    return route.fulfill({ status:200,headers:{...jsonHeaders,'content-range':'*/0'},body:'[]' });
  });

  return {
    committedCommands,
    processCommandRequests,
    processRows,
    processReadbacks,
    waitForFirstProcessCommand: () => firstProcessReceivedPromise,
    releaseFirstProcessResponse: () => releaseFirstProcessResponse?.(),
    setPrimaryAuthorizationVersion: (version: number) => { primaryAuthorizationVersion = version; },
    get assessment(){ return assessment; },
    get v2Case(){ return v2Case; },
    get v2Decision(){ return v2Decision; },
    get cloneVersionQueries(){ return cloneVersionQueries; },
    get cloneEvidenceVersionReads(){ return cloneEvidenceVersionReads; },
    setAssessmentStatus(status: string){ if (assessment) assessment={...assessment,status}; },
    setV2CommandFailure(failure: FixtureOptions['failV2Command']){ failV2Command = failure; },
    commitDocumentMapping(values: { name?: string; description?: string }) {
      if (!v2Case) throw new Error('A V2 case must exist before document mapping can commit.');
      v2Version += 1;
      v2Name = values.name ?? v2Name;
      v2Description = values.description ?? v2Description;
      v2Case = { ...v2Case, version: v2Version, updatedAt:'2026-07-13T00:04:00.000Z' };
      return v2Version;
    },
    async seedReviewerReadyV2Decision(){
      if (!v2Case) throw new Error('A V2 case must exist before a reviewer-ready decision can be seeded.');
      v2Case = {
        ...v2Case,
        primitives:structuredClone(AP_INVOICE_EXCEPTION_V2_FIXTURE.primitives),
        edges:structuredClone(AP_INVOICE_EXCEPTION_V2_FIXTURE.edges),
        decisionPoints:structuredClone(AP_INVOICE_EXCEPTION_V2_FIXTURE.decisionPoints),
        exceptionPaths:structuredClone(AP_INVOICE_EXCEPTION_V2_FIXTURE.exceptionPaths),
        assets:structuredClone(AP_INVOICE_EXCEPTION_V2_FIXTURE.assets),
        interactions:structuredClone(AP_INVOICE_EXCEPTION_V2_FIXTURE.interactions),
        evidence:structuredClone(AP_INVOICE_EXCEPTION_V2_FIXTURE.evidence),
      };
      v2Decision = await buildDecisionVersionV2(v2Case, USER, '2026-07-13T00:02:00.000Z');
      v2Version += 1;
      v2Case = { ...v2Case, status:'reviewer-ready', version:v2Version };
    },
    get handoffId(){ return handoffId; },
  };
};
