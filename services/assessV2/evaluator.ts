import { validateEvidenceLinks, validateFieldRegistry } from './registry';
import { ASSESS_V2_DECISION_VERSION, ASSESS_V2_RULE_SET_VERSION, ASSESS_V2_SCHEMA_VERSION, AgentNecessityFacts, ApplicationInteraction, AssessmentCaseV2, CandidateEvaluation, Component, DecisionPackV2, EvidenceConfidence, InteractionDecision, InteractionMode, ModernizationDisposition, ProcessPrimitive, Readiness } from './types';

const unique = <T>(items: readonly T[]): T[] => [...new Set(items)];
const modes: readonly InteractionMode[] = ['read', 'write', 'event', 'ui', 'operational'];
const requiredEvidence = (c: AssessmentCaseV2) => unique([...c.primitives.flatMap(x => x.evidenceIds), ...c.assets.flatMap(x => x.evidenceIds), ...c.interactions.flatMap(x => x.evidenceIds), ...(c.decisionPoints ?? []).flatMap(x => x.evidenceIds), ...(c.exceptionPaths ?? []).flatMap(x => x.evidenceIds)]);
const verified = (e: AssessmentCaseV2['evidence'][number]) => e.sourceType !== 'template' && e.status === 'validated' && e.validated && Boolean(e.owner?.trim()) && Boolean(e.claimIds.length) && !e.contradictory;

export const deriveEvidenceConfidence = (c: AssessmentCaseV2): EvidenceConfidence => {
  const required = requiredEvidence(c); if (!required.length || !c.evidence.length) return 'Insufficient Evidence';
  const byId = new Map(c.evidence.map(e => [e.id, e])); const count = required.filter(id => byId.has(id) && verified(byId.get(id)!)).length;
  return count === required.length ? 'Verified' : count ? 'Partially Evidenced' : 'Assumption-Led';
};

const agentRules = ['AGENT-001', 'AGENT-002', 'AGENT-003', 'AGENT-004', 'AGENT-005'];
export const evaluateAgentNecessity = (primitiveId: string, facts: AgentNecessityFacts): CandidateEvaluation => {
  const values = Object.values(facts), all = values.every(v => v === true), unknown = values.some(v => v === null);
  return { primitiveId, component: 'Bounded Agent', fit: all ? 'Conditional Fit' : unknown ? 'Weak Fit' : 'Ineligible', rationale: all ? ['All five agent-necessity gates are evidenced; bounded agency remains conditional on action-specific controls and human approval.'] : ['Bounded agency requires all five evidenced necessity conditions.'], ruleIds: agentRules };
};

const componentMap: Record<ProcessPrimitive['type'], Component[]> = {
  Capture: ['Event Automation'], Extract: ['Document Intelligence', 'Validation'], Classify: ['Deterministic Rules', 'Validation'], Validate: ['Deterministic Rules', 'Validation'], Calculate: ['Deterministic Rules', 'Validation'], Reconcile: ['Deterministic Rules', 'Workflow Orchestration'], Retrieve: ['Native API Integration'], Investigate: ['Dynamic Case Management', 'GenAI Assistant', 'Human Approval'], Decide: ['Deterministic Rules', 'Human Approval'], Approve: ['Workflow Orchestration', 'Human Approval', 'Segregation of Duties'], Route: ['Workflow Orchestration'], Execute: ['Native API Integration', 'Human Approval', 'Rollback / Compensation'], Communicate: ['Workflow Orchestration', 'Human Approval'], Monitor: ['Monitoring'], Audit: ['Audit'],
};
const apiReadiness = (i: ApplicationInteraction): Readiness => i.facts.interfaceAvailable === false || i.facts.operationCovered === false ? 'Prohibited' : i.facts.interfaceAvailable === null || i.facts.operationCovered === null ? 'Unknown' : 'Ready';

export const evaluateInteractionReadiness = (i: ApplicationInteraction): InteractionDecision => {
  const f = i.facts, readiness: Record<InteractionMode, Readiness> = { read: apiReadiness(i), write: apiReadiness(i), event: 'Unknown', ui: 'Unknown', operational: 'Unknown' };
  if (readiness.read === 'Ready' && (f.dataClassified === false || i.dataClassification === 'Unknown')) readiness.read = 'Conditional';
  if (readiness.write === 'Ready') {
    if (f.machineIdentity === false || f.leastPrivilege === false) readiness.write = 'Prohibited';
    else if (f.machineIdentity === null || f.leastPrivilege === null) readiness.write = 'Unknown';
    else if (f.highImpact && f.auditable === false) readiness.write = 'Prohibited';
    else if (f.highImpact && f.auditable === null) readiness.write = 'Unknown';
    else if (f.financialAction && (f.idempotent === false || f.compensatable === false)) readiness.write = 'Prohibited';
    else if (f.financialAction && (f.idempotent === null || f.compensatable === null)) readiness.write = 'Unknown';
    else if (f.highImpact && f.rollback !== true) readiness.write = f.rollback === false ? 'Conditional' : 'Unknown';
  }
  const api = apiReadiness(i); readiness.event = api === 'Prohibited' ? 'Prohibited' : api === 'Unknown' || f.eventSemantics === null ? 'Unknown' : f.eventSemantics ? 'Ready' : 'Prohibited';
  readiness.ui = f.uiStable === null ? 'Unknown' : f.uiStable ? 'Conditional' : 'Prohibited';
  readiness.operational = f.accountableOwner === false ? 'Prohibited' : f.accountableOwner === null || f.testEnvironment === null || f.monitored === null ? 'Unknown' : f.testEnvironment === false || f.monitored === false || f.capacityKnown === false ? 'Conditional' : 'Ready';
  const controls = ['Audit correlation'];
  if (f.highImpact || f.financialAction || readiness.write === 'Conditional') controls.push('Human approval', 'Controlled execution');
  if (f.highImpact && f.rollback !== true) controls.push('Rollback or documented compensation');
  if (f.untrustedContentWithTools) controls.push('Prompt-injection controls', 'Bounded permissions');
  if (f.dataClassified === false || i.dataClassification === 'Unknown') controls.push('Data classification before AI access');
  if (readiness.ui === 'Conditional') controls.push('Bounded UI scope', 'Change monitoring');
  const allowed = modes.flatMap(m => readiness[m] === 'Ready' ? [`${m}: ${i.operationName}`] : readiness[m] === 'Conditional' ? [`${m} with controls: ${i.operationName}`] : []);
  const prohibited = modes.flatMap(m => readiness[m] === 'Prohibited' ? [`${m}: ${i.operationName}`] : []);
  if (f.financialAction) prohibited.push(`autonomous financial action: ${i.operationName}`); if (f.highImpact && f.rollback !== true) prohibited.push(`unapproved high-impact action: ${i.operationName}`);
  return { interactionId: i.id, readiness, allowedActions: unique(allowed), prohibitedActions: unique(prohibited), requiredControls: unique(controls), evidenceGaps: Object.entries(f).filter(([,v]) => v === null).map(([k]) => `${k} is unknown`), ruleIds: ['INT-001','INT-002','INT-003','INT-004','INT-005','INT-006','INT-007','INT-008','INT-009','INT-010','INT-011','INT-012', ...(f.untrustedContentWithTools ? ['INT-013'] : [])] };
};

const modernization = (a: AssessmentCaseV2['assets'][number]): {assetId:string; dispositions:ModernizationDisposition[]; rationale:string[]} => {
  if (a.strategicLifespan === 'long') return { assetId:a.id, dispositions:a.technicalHealth === 'constrained' ? ['Retain','API Facade'] : ['Retain','Native Integration'], rationale:['Strategic lifespan supports retention; interaction controls are evaluated separately.'] };
  if (a.strategicLifespan === 'short' && a.technicalHealth === 'end-of-life') return { assetId:a.id, dispositions:['Replace'], rationale:['Short strategic lifespan and end-of-life technical health support replacement planning.'] };
  if (a.technicalHealth === 'end-of-life') return { assetId:a.id, dispositions:['Replatform'], rationale:['End-of-life technical health requires modernization independently from agent readiness.'] };
  return { assetId:a.id, dispositions:['Retain'], rationale:['Available lifecycle evidence does not justify destructive modernization.'] };
};

export const validateAssessmentV2 = (c: AssessmentCaseV2): string[] => {
  const errors = [...validateFieldRegistry(), ...validateEvidenceLinks(c.evidence)];
  if (c.schemaVersion !== ASSESS_V2_SCHEMA_VERSION) errors.push('Unsupported Assess V2 schema version.'); if (c.ruleSetVersion !== ASSESS_V2_RULE_SET_VERSION) errors.push('Unsupported Assess V2 rule-set version.');
  if (!c.organizationId || !c.workspaceId || !c.ownerId) errors.push('Organization, workspace, and owner ancestry are required.'); if (!Number.isSafeInteger(c.version) || c.version < 1) errors.push('Case version must be a positive safe integer.');
  const duplicate = (label:string, ids:string[]) => { if (new Set(ids).size !== ids.length) errors.push(`${label} IDs must be unique.`); };
  duplicate('Primitive',c.primitives.map(x=>x.id)); duplicate('Edge',c.edges.map(x=>x.id)); duplicate('Asset',c.assets.map(x=>x.id)); duplicate('Interaction',c.interactions.map(x=>x.id)); duplicate('Evidence',c.evidence.map(x=>x.id));
  const p = new Set(c.primitives.map(x=>x.id)), a = new Set(c.assets.map(x=>x.id)), e = new Set(c.evidence.map(x=>x.id));
  for (const x of c.edges) if (!p.has(x.fromPrimitiveId)||!p.has(x.toPrimitiveId)) errors.push(`${x.id}: edge references an unknown primitive.`);
  for (const x of c.interactions) { if(!p.has(x.primitiveId)) errors.push(`${x.id}: interaction references an unknown primitive.`); if(!a.has(x.assetId)) errors.push(`${x.id}: interaction references an unknown asset.`); }
  for (const id of requiredEvidence(c)) if(!e.has(id)) errors.push(`${id}: referenced evidence does not exist.`);
  if(c.importedFacts?.some(x=>x.source==='v1-import'&&x.status!=='assumed'&&x.status!=='unknown')) errors.push('Imported V1 facts must be assumptions or unknown.');
  return unique(errors);
};

export const evaluateAssessmentV2 = (c: AssessmentCaseV2): DecisionPackV2 => {
  const errors=validateAssessmentV2(c); if(errors.length) throw new Error(`Invalid Assess V2 case: ${errors.join(' ')}`);
  const interactions=c.interactions.map(evaluateInteractionReadiness); const candidates=c.primitives.flatMap(p=>{const base=componentMap[p.type].map(component=>({primitiveId:p.id,component,fit:'Strong Fit' as const,rationale:[`${component} is the least-complex compatible baseline for ${p.type}.`],ruleIds:['COMPOSE-001']})); return p.type==='Investigate'||p.type==='Decide'?[...base,evaluateAgentNecessity(p.id,p.agentNecessity??c.agentNecessity)]:base;});
  const composition=c.primitives.map(p=>{const components=[...componentMap[p.type]], owned=c.interactions.filter(x=>x.primitiveId===p.id); if(owned.some(x=>['read','write'].includes(x.mode)&&['Ready','Conditional'].includes(interactions.find(y=>y.interactionId===x.id)?.readiness[x.mode]??'Unknown')))components.push('Native API Integration'); if(owned.some(x=>x.mode==='ui'&&interactions.find(y=>y.interactionId===x.id)?.readiness.ui==='Conditional'))components.push('RPA / UI Automation'); return {primitiveId:p.id,...(p.businessDisposition?{businessDisposition:p.businessDisposition}:{}),components:unique([...components,'Audit' as const,'Monitoring' as const])};});
  const confidence=deriveEvidenceConfidence(c), byId=new Map(c.evidence.map(x=>[x.id,x])); const gaps=unique([...requiredEvidence(c).filter(id=>!byId.has(id)||!verified(byId.get(id)!)).map(id=>`${id} is missing, contradictory, unowned, or unvalidated.`),...interactions.flatMap(x=>x.evidenceGaps.map(g=>`${x.interactionId}: ${g}`))]); const assumptions=unique([...(c.importedFacts??[]).filter(x=>x.status==='assumed'||x.status==='suggested').map(x=>x.fieldId),...c.evidence.filter(x=>!verified(x)).map(x=>x.id)]); const controls=unique(['Human approval for material state changes','Segregation of duties','Audit','Monitoring','Rollback / Compensation',...interactions.flatMap(x=>x.requiredControls)]);
  return {schemaVersion:ASSESS_V2_SCHEMA_VERSION,ruleSetVersion:ASSESS_V2_RULE_SET_VERSION,decisionVersion:ASSESS_V2_DECISION_VERSION,caseId:c.id,caseVersion:c.version,validationStatus:'reviewer-ready',executiveDecision:'Use a controlled hybrid operating model mapped to process primitives and eligible components.',assessmentBoundary:`Process ${c.sourceProcessId} in workspace ${c.workspaceId}.`,confidence,processReadiness:confidence==='Insufficient Evidence'?'Insufficient evidence':gaps.length||confidence!=='Verified'?'Provisional':'Ready for controlled design',candidateEvaluations:candidates,gateResults:interactions.flatMap(x=>modes.map(m=>({ruleId:x.ruleIds[0],subjectId:x.interactionId,status:x.readiness[m]==='Ready'?'pass' as const:x.readiness[m]==='Conditional'?'conditional' as const:x.readiness[m]==='Prohibited'?'fail' as const:'unknown' as const,reason:`${m} readiness is ${x.readiness[m]}.`}))),composedOperatingModel:composition,interactionDecisions:interactions,modernization:c.assets.map(modernization),controls,evidenceGaps:gaps,assumptions,alternativesConsidered:['Human-led operation','Rules and workflow without bounded agency','GenAI assistance without tool autonomy','Temporary UI automation for unsupported operations'],openRemediationActions:gaps.map(g=>`Resolve evidence gap: ${g}`),whatWouldChangeDecision:['Validated contradictory evidence','Loss of accountable application ownership or least-privilege authorization','Evidence that deterministic rules and workflow cannot address the ambiguity','A verified supported interface that removes a temporary UI automation need'],trace:unique(candidates.flatMap(x=>x.ruleIds)).map(ruleId=>({ruleId,fieldIds:[],outcome:'Applied deterministic categorical rule.'})),nonClaims:['Not scientifically validated','Not production calibrated','No guaranteed ROI','No deployment, pilot, production, security, or compliance readiness claim','No V2 approval or Studio handoff is authorized']};
};
