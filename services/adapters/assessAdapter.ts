import { supabase, isSupabaseConfigured } from '../supabaseClient';
import { AssessProcess, Assessment, AssessmentReviewComment, AssessmentResponses, EvidenceItem, Assumption, AssessStatus } from '../../types';
import { MOCK_ASSESS_PROCESSES } from '../../data/mockData';
import { calculateAssessmentScores } from '../scoringEngine';
import { StorageKeys, StorageService } from '../storage';

type AssessProcessRow = {
  id: string;
  org_id: string;
  name: string;
  description?: string | null;
  owner_id?: string | null;
  department?: string | null;
  criticality?: string | null;
  status?: string | null;
  template_id?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
};

type AssessmentRow = {
  id: string;
  process_id: string;
  org_id: string;
  status?: string | null;
  metadata?: Assessment['metadata'] | null;
  responses?: AssessmentResponses | null;
  evidence_items?: EvidenceItem[] | null;
  assumptions?: Assumption[] | null;
  completion_by_section?: Assessment['completionBySection'] | null;
  review?: Assessment['review'] | null;
  scores?: Assessment['scores'] | null;
};

export interface AssessmentReviewAuditInput {
  assessmentId: string;
  processId: string;
  orgId: string;
  actorId: string;
  eventType: AssessmentReviewComment['type'] | 'Status Change';
  status: AssessStatus;
  reason?: string;
  payload?: Record<string, unknown>;
}

const fromProcessRow = (row: AssessProcessRow): AssessProcess => ({
  id: row.id,
  orgId: row.org_id,
  name: row.name,
  description: row.description || '',
  ownerId: row.owner_id || '',
  department: row.department || '',
  criticality: (row.criticality || 'Medium') as AssessProcess['criticality'],
  status: (row.status || 'Not Started') as AssessStatus,
  templateId: row.template_id || undefined,
  createdAt: row.created_at || new Date().toISOString(),
  updatedAt: row.updated_at || new Date().toISOString(),
});

const toProcessInsertRow = (process: Omit<AssessProcess, 'id' | 'createdAt' | 'updatedAt'>) => ({
  org_id: process.orgId,
  name: process.name,
  description: process.description,
  owner_id: process.ownerId,
  department: process.department,
  criticality: process.criticality,
  status: process.status,
  template_id: process.templateId,
});

const fromAssessmentRow = (row: AssessmentRow): Assessment => ({
  id: row.id,
  processId: row.process_id,
  orgId: row.org_id,
  status: (row.status || 'Not Started') as AssessStatus,
  metadata: row.metadata || {
    completionQuality: 0,
    templateFit: false,
    lastSavedAt: new Date().toISOString(),
    stakeholderCoverage: 1,
    evidenceQuality: 1,
    assumptionQuality: 1,
  },
  responses: row.responses || {
    processStructure: {},
    workPattern: {},
    dataProfile: {},
    judgment: {},
    systems: {},
    risk: {},
  },
  evidenceItems: row.evidence_items || [],
  assumptions: row.assumptions || [],
  completionBySection: row.completion_by_section || {
    processStructure: 0,
    workPattern: 0,
    dataProfile: 0,
    judgment: 0,
    systems: 0,
    risk: 0,
    evidenceAndAssumptions: 0,
  },
  review: row.review || undefined,
  scores: row.scores || undefined,
});

const toAssessmentRow = (assessment: Assessment) => ({
  id: assessment.id,
  process_id: assessment.processId,
  org_id: assessment.orgId,
  status: assessment.status,
  metadata: assessment.metadata,
  responses: assessment.responses,
  evidence_items: assessment.evidenceItems,
  assumptions: assessment.assumptions,
  completion_by_section: assessment.completionBySection,
  review: assessment.review || null,
  scores: assessment.scores || null,
  updated_at: new Date().toISOString(),
});

let demoProcesses = [...MOCK_ASSESS_PROCESSES];

const responseFixtures: Record<string, AssessmentResponses> = {
  'proc-ap-invoice': {
    processStructure: { standardization: 4, ruleDeterminism: 5, exceptionPredictability: 4, processMaturity: 4 },
    workPattern: { volume: 62000, manualEffort: 0.18, averageHourlyCost: 58, reworkPain: 4, cycleTimePain: 4 },
    dataProfile: { inputStructure: 76, unstructuredLoad: 4, dataSensitivity: 3 },
    judgment: { judgmentIntensity: 2, goalAmbiguity: 2 },
    systems: { systemReadiness: 4, orchestrationComplexity: 3 },
    risk: { riskCriticality: 4, governanceSensitivity: 4, errorReversibility: 4 },
  },
  'proc-support-ai': {
    processStructure: { standardization: 3, ruleDeterminism: 2, exceptionPredictability: 3, processMaturity: 3 },
    workPattern: { volume: 18000, manualEffort: 0.17, averageHourlyCost: 52, reworkPain: 3, cycleTimePain: 4 },
    dataProfile: { inputStructure: 48, unstructuredLoad: 5, dataSensitivity: 4 },
    judgment: { judgmentIntensity: 4, goalAmbiguity: 3 },
    systems: { systemReadiness: 4, orchestrationComplexity: 4 },
    risk: { riskCriticality: 3, governanceSensitivity: 4, errorReversibility: 3 },
  },
  'proc-hr-onboarding': {
    processStructure: { standardization: 3, ruleDeterminism: 4, exceptionPredictability: 3, processMaturity: 3 },
    workPattern: { volume: 9000, manualEffort: 0.65, averageHourlyCost: 48, reworkPain: 4, cycleTimePain: 5 },
    dataProfile: { inputStructure: 82, unstructuredLoad: 2, dataSensitivity: 4 },
    judgment: { judgmentIntensity: 3, goalAmbiguity: 2 },
    systems: { systemReadiness: 3, orchestrationComplexity: 4 },
    risk: { riskCriticality: 4, governanceSensitivity: 4, errorReversibility: 3 },
  },
  'proc-close-pack': {
    processStructure: { standardization: 4, ruleDeterminism: 4, exceptionPredictability: 3, processMaturity: 4 },
    workPattern: { volume: 7200, manualEffort: 0.75, averageHourlyCost: 68, reworkPain: 4, cycleTimePain: 3 },
    dataProfile: { inputStructure: 68, unstructuredLoad: 4, dataSensitivity: 4 },
    judgment: { judgmentIntensity: 3, goalAmbiguity: 2 },
    systems: { systemReadiness: 4, orchestrationComplexity: 3 },
    risk: { riskCriticality: 5, governanceSensitivity: 5, errorReversibility: 3 },
  },
};

const defaultResponses: AssessmentResponses = {
  processStructure: { standardization: 3, ruleDeterminism: 3, exceptionPredictability: 3, processMaturity: 3 },
  workPattern: { volume: 5000, manualEffort: 0.25, averageHourlyCost: 55, reworkPain: 3, cycleTimePain: 3 },
  dataProfile: { inputStructure: 60, unstructuredLoad: 3, dataSensitivity: 3 },
  judgment: { judgmentIntensity: 3, goalAmbiguity: 3 },
  systems: { systemReadiness: 3, orchestrationComplexity: 3 },
  risk: { riskCriticality: 3, governanceSensitivity: 3, errorReversibility: 3 },
};

const demoEvidence = (process: AssessProcess): EvidenceItem[] => [
  { id: `ev-${process.id}-map`, type: 'Process Map', description: `${process.name} current-state flow and exception paths captured from discovery.` },
  { id: `ev-${process.id}-sop`, type: 'SOP', description: `${process.department} operating procedure and control checkpoints reviewed.` },
  { id: `ev-${process.id}-sample`, type: 'System Screenshot', description: `Representative system evidence validated with the process owner.` },
];

const demoAssumptions = (process: AssessProcess): Assumption[] => [
  { id: `as-${process.id}-volume`, category: 'Volume', description: 'Volume is based on the latest operating month and should be refreshed before delivery sizing.' },
  { id: `as-${process.id}-cost`, category: 'Cost', description: 'Benefit model assumes current manual handling cost and rework effort remain materially unchanged.' },
  { id: `as-${process.id}-risk`, category: 'Risk', description: `${process.criticality} criticality requires control owner confirmation before automated execution.` },
];

const buildDemoAssessment = (process: AssessProcess): Assessment => {
  const responses = responseFixtures[process.id] || defaultResponses;
  const evidenceItems = demoEvidence(process);
  const assumptions = demoAssumptions(process);
  const isCompleted = process.status === 'Completed';
  const metadata = {
    completionQuality: isCompleted ? 100 : 72,
    templateFit: Boolean(process.templateId),
    lastSavedAt: process.updatedAt,
    stakeholderCoverage: isCompleted ? 4 : 3,
    evidenceQuality: isCompleted ? 4 : 3,
    assumptionQuality: isCompleted ? 4 : 3,
  };
  const assessment: Assessment = {
    id: `assess-${process.id}`,
    processId: process.id,
    orgId: process.orgId,
    status: isCompleted ? 'Approved' : process.status,
    metadata,
    responses,
    evidenceItems,
    assumptions,
    completionBySection: {
      processStructure: isCompleted ? 100 : 80,
      workPattern: isCompleted ? 100 : 75,
      dataProfile: isCompleted ? 100 : 70,
      judgment: isCompleted ? 100 : 70,
      systems: isCompleted ? 100 : 65,
      risk: isCompleted ? 100 : 70,
      evidenceAndAssumptions: isCompleted ? 100 : 60,
    },
  };

  if (isCompleted) {
    assessment.scores = calculateAssessmentScores(responses, metadata, {
      assessmentId: assessment.id,
      processId: process.id,
      organizationId: process.orgId,
      processName: process.name,
      processDescription: process.description,
      department: process.department,
      evidenceItems,
      assumptions,
      status: assessment.status,
    });
  }

  return assessment;
};

let demoAssessments: Assessment[] = MOCK_ASSESS_PROCESSES
  .filter(process => process.status !== 'Not Started')
  .map(buildDemoAssessment);

const upsertDemoAssessment = (assessment: Assessment): Assessment => {
  const existing = demoAssessments.find(item => item.id === assessment.id);
  demoAssessments = existing
    ? demoAssessments.map(item => item.id === assessment.id ? assessment : item)
    : [assessment, ...demoAssessments];

  if (assessment.processId) {
    demoProcesses = demoProcesses.map(process => process.id === assessment.processId
      ? { ...process, status: assessment.status, updatedAt: new Date().toISOString() }
      : process);
  }

  return assessment;
};

export const assessAdapter = {
  async getProcesses(orgId: string) {
    if (!isSupabaseConfigured()) {
      return demoProcesses.filter(process => process.orgId === orgId);
    }

    const { data, error } = await supabase
      .from('assess_processes')
      .select('*')
      .eq('org_id', orgId);

    if (error) throw error;
    return (data || []).map(fromProcessRow);
  },

  async createProcess(process: Omit<AssessProcess, 'id' | 'createdAt' | 'updatedAt'>) {
    if (!isSupabaseConfigured()) {
      const saved = { ...process, id: `proc-${Date.now()}`, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
      demoProcesses = [saved, ...demoProcesses];
      return saved;
    }

    const { data, error } = await supabase
      .from('assess_processes')
      .insert([toProcessInsertRow(process)])
      .select()
      .single();

    if (error) throw error;
    return fromProcessRow(data);
  },

  async getAssessment(processId: string, orgId: string) {
    if (!isSupabaseConfigured()) {
      return demoAssessments.find(assessment => assessment.processId === processId && assessment.orgId === orgId) || null;
    }

    const { data, error } = await supabase
      .from('assessments')
      .select('*')
      .eq('process_id', processId)
      .eq('org_id', orgId)
      .maybeSingle();

    if (error) throw error;
    return data ? fromAssessmentRow(data) : null;
  },

  async saveAssessment(assessment: Partial<Assessment>) {
    if (!isSupabaseConfigured()) {
      return upsertDemoAssessment(assessment as Assessment);
    }

    const { data, error } = await supabase
      .from('assessments')
      .upsert([toAssessmentRow(assessment as Assessment)])
      .select()
      .single();

    if (error) throw error;
    return fromAssessmentRow(data);
  },

  async transitionAssessmentWithAudit(assessment: Assessment, event: AssessmentReviewAuditInput) {
    if (!isSupabaseConfigured()) {
      const saved = upsertDemoAssessment(assessment);
      await this.recordAssessmentReviewEvent(event);
      return saved;
    }

    const { data, error } = await supabase
      .rpc('transition_assessment_with_audit', {
        p_assessment: toAssessmentRow(assessment),
        p_review_event: {
          org_id: event.orgId,
          assessment_id: event.assessmentId,
          process_id: event.processId,
          actor_id: event.actorId,
          event_type: event.eventType,
          status: event.status,
          reason: event.reason || null,
          payload: {
            ...(event.payload || {}),
            status: event.status,
            eventType: event.eventType,
            reason: event.reason,
          },
        },
      });

    if (error) throw error;
    return fromAssessmentRow(data);
  },

  async recordAssessmentReviewEvent(event: AssessmentReviewAuditInput) {
    const now = new Date().toISOString();
    const payload = {
      ...(event.payload || {}),
      status: event.status,
      eventType: event.eventType,
      reason: event.reason,
    };

    if (!isSupabaseConfigured()) {
      const existing = StorageService.load<any[]>(StorageKeys.AUDIT_LOGS, []);
      const reviewEvent = {
        id: `audit-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        orgId: event.orgId,
        userId: event.actorId,
        action: `assessment.${event.eventType.toLowerCase().replace(/\s+/g, '_')}`,
        entityId: event.assessmentId,
        newValues: payload,
        timestamp: now,
      };
      StorageService.save(StorageKeys.AUDIT_LOGS, [reviewEvent, ...existing]);
      return reviewEvent;
    }

    const reviewRow = {
      org_id: event.orgId,
      assessment_id: event.assessmentId,
      process_id: event.processId,
      actor_id: event.actorId,
      event_type: event.eventType,
      status: event.status,
      reason: event.reason || null,
      payload,
    };

    const { data: reviewEvent, error: reviewError } = await supabase
      .from('assessment_review_events')
      .insert([reviewRow])
      .select()
      .single();

    if (reviewError) throw reviewError;

    const { error: auditError } = await supabase
      .from('audit_events')
      .insert([{
        org_id: event.orgId,
        user_id: event.actorId,
        action: `assessment.${event.eventType.toLowerCase().replace(/\s+/g, '_')}`,
        entity_type: 'assessment',
        entity_id: event.assessmentId,
        payload: {
          ...payload,
          assessmentReviewEventId: reviewEvent.id,
          processId: event.processId,
        },
      }]);

    if (auditError) throw auditError;
    return reviewEvent;
  },

  async calculateScores(assessmentId: string) {
    // In a real production app, this would be a call to a Supabase Edge Function
    // to ensure the scoring logic is executed in a secure, server-side environment.
    if (!isSupabaseConfigured()) {
      return null;
    }
    
    // Simulate Edge Function call
    // const { data, error } = await supabase.functions.invoke('calculate-scores', { body: { assessmentId } });
    return { success: true };
  }
};
