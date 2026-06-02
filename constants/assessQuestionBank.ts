import { Assessment, AssessmentSectionKey, Assumption, EvidenceItem } from '../types';

export type AssessQuestionKind = 'scale' | 'percent' | 'number' | 'textarea' | 'toggle' | 'workVolume' | 'workEffort';

export interface AssessSectionDefinition {
    key: AssessmentSectionKey;
    label: string;
    description: string;
    outputs: string[];
}

export interface AssessQuestionDefinition {
    section: AssessmentSectionKey;
    field: string;
    kind: AssessQuestionKind;
    label: string;
    description: string;
    labels?: string[];
    placeholder?: string;
    allowDecimal?: boolean;
    protectedScoringField?: boolean;
    evidenceRecommended?: boolean;
    condition?: (assessment: Assessment) => boolean;
}

export interface AssessTemplateRule {
    templateId: string;
    label: string;
    focus: string;
    priorityFields: string[];
    evidenceFields: string[];
    defaultResponsePatch?: Partial<Record<AssessmentSectionKey, Record<string, number | string | boolean>>>;
}

export interface AssessReviewerCheckpointDefinition {
    id: string;
    section: AssessmentSectionKey;
    label: string;
    description: string;
    requiredFor?: 'review' | 'approval' | 'handoff';
    condition?: (assessment: Assessment, templateRule?: AssessTemplateRule) => boolean;
}

export const ASSESS_SECTIONS: AssessSectionDefinition[] = [
    {
        key: 'processStructure',
        label: 'Opportunity & Process Readiness',
        description: 'Confirm whether the opportunity is clear, owned, standardized, mature, and ready for automation or AI evaluation.',
        outputs: ['Process readiness', 'Redesign need', 'Documentation maturity'],
    },
    {
        key: 'workPattern',
        label: 'Work Pattern & Business Value',
        description: 'Capture volume, manual effort, rework pain, and turnaround pressure so the engine can estimate value and priority.',
        outputs: ['Business value', 'Effort saving estimate', 'Priority contribution'],
    },
    {
        key: 'dataProfile',
        label: 'Data Readiness',
        description: 'Assess input structure, unstructured content, sensitivity, and data risk for RPA, GenAI, RAG, or document intelligence.',
        outputs: ['Data readiness', 'Data risk', 'Data sensitivity tier'],
    },
    {
        key: 'judgment',
        label: 'Decision Complexity',
        description: 'Determine how much human judgment, ambiguity, and interpretation must remain in the operating model.',
        outputs: ['Human judgment need', 'Agentic suitability', 'HITL signal'],
    },
    {
        key: 'systems',
        label: 'Systems & Integration Readiness',
        description: 'Evaluate system readiness, integration friction, handoffs, and orchestration complexity.',
        outputs: ['System readiness', 'API/RPA feasibility', 'Implementation complexity'],
    },
    {
        key: 'risk',
        label: 'Governance, Risk & HITL',
        description: 'Capture business impact, compliance sensitivity, reversibility, and required human-in-the-loop controls.',
        outputs: ['Risk tier', 'Governance decision', 'Mandatory controls'],
    },
    {
        key: 'evidenceAndAssumptions',
        label: 'Evidence, Confidence & Handoff',
        description: 'Record supporting evidence, assumptions, confidence inputs, and handoff readiness for Docs and Delivery.',
        outputs: ['Confidence band', 'Decision pack readiness', 'Handoff pack'],
    },
];

const scale5 = ['Very Low', 'Low', 'Medium', 'High', 'Very High'];

export const ASSESS_QUESTION_BANK: AssessQuestionDefinition[] = [
    { section: 'processStructure', field: 'standardization', kind: 'scale', label: 'Process Standardization', description: 'How consistent is this process from one case to the next?', labels: scale5, protectedScoringField: true, evidenceRecommended: true },
    { section: 'processStructure', field: 'ruleDeterminism', kind: 'scale', label: 'Rule Clarity', description: 'How clear and stable are the business rules for this process?', labels: ['Unclear', 'Vague', 'Mixed', 'Clear', 'Very Clear'], protectedScoringField: true, evidenceRecommended: true },
    { section: 'processStructure', field: 'processMaturity', kind: 'scale', label: 'Process Maturity', description: 'How well-defined and established is this process today?', labels: ['Brand New', 'Evolving', 'Stable', 'Mature', 'Optimized'], protectedScoringField: true, evidenceRecommended: true },
    { section: 'processStructure', field: 'exceptionPredictability', kind: 'scale', label: 'Exception Predictability', description: 'When exceptions happen, how predictable and manageable are they?', labels: ['Unpredictable', 'Chaotic', 'Manageable', 'Predictable', 'Always Known'], protectedScoringField: true, evidenceRecommended: true },
    { section: 'processStructure', field: 'sopAvailability', kind: 'scale', label: 'SOP Availability', description: 'Is there a current written procedure that explains how the work is performed?', labels: ['None', 'Draft', 'Partial', 'Current', 'Controlled'], evidenceRecommended: true },
    { section: 'processStructure', field: 'processMapAvailability', kind: 'scale', label: 'Process Map Availability', description: 'Is there a visual map of steps, handoffs, decisions, and exception paths?', labels: ['None', 'Informal', 'Partial', 'Current', 'Validated'], evidenceRecommended: true },
    { section: 'processStructure', field: 'processVariants', kind: 'number', label: 'Known Process Variants', description: 'How many major process variants exist today?' },
    { section: 'processStructure', field: 'handoffs', kind: 'number', label: 'Handoffs', description: 'How many team or system handoffs are required?' },
    { section: 'processStructure', field: 'manualSteps', kind: 'number', label: 'Manual Steps', description: 'How many steps currently require manual action?' },
    { section: 'processStructure', field: 'approvalSteps', kind: 'number', label: 'Approval Steps', description: 'How many approval or control steps are required?' },
    { section: 'processStructure', field: 'processStability', kind: 'scale', label: 'Process Stability', description: 'How stable is the process over the next 3 to 6 months?', labels: ['Changing', 'Unstable', 'Mixed', 'Stable', 'Locked'] },
    { section: 'processStructure', field: 'changeFrequency', kind: 'scale', label: 'Change Frequency', description: 'How often do rules, teams, systems, or policies change?', labels: ['Rarely', 'Quarterly', 'Monthly', 'Weekly', 'Daily'] },
    { section: 'processStructure', field: 'bottlenecks', kind: 'textarea', label: 'Known Bottlenecks', description: 'Capture the current bottlenecks, workarounds, or repeated pain points.', placeholder: 'Example: invoice exceptions wait for AP manager review; vendor master mismatches require manual email follow-up.' },

    { section: 'workPattern', field: 'volume', kind: 'workVolume', label: 'Transaction Volume', description: 'How many cases, transactions, tickets, or requests pass through this process?', protectedScoringField: true, evidenceRecommended: true },
    { section: 'workPattern', field: 'manualEffort', kind: 'workEffort', label: 'Average Manual Effort per Transaction', description: 'How much human time is usually spent on one transaction, case, or instance?', protectedScoringField: true, evidenceRecommended: true },
    { section: 'workPattern', field: 'reworkPain', kind: 'scale', label: 'Rework Impact', description: 'If this work has to be redone, how much extra effort, delay, or cost does it create?', labels: scale5, protectedScoringField: true },
    { section: 'workPattern', field: 'cycleTimePain', kind: 'scale', label: 'SLA / Turnaround Pressure', description: 'How time-sensitive is this process?', labels: scale5, protectedScoringField: true },
    { section: 'workPattern', field: 'averageCycleTimeHours', kind: 'number', label: 'Average Cycle Time', description: 'How many elapsed hours does a typical case take from start to finish?', allowDecimal: true },
    { section: 'workPattern', field: 'waitTimePercentage', kind: 'number', label: 'Wait Time Percentage', description: 'What percentage of the cycle time is waiting or queue time?' },
    { section: 'workPattern', field: 'reworkFrequency', kind: 'number', label: 'Rework Frequency', description: 'What percentage of cases are reworked or corrected?' },
    { section: 'workPattern', field: 'fteInvolved', kind: 'number', label: 'FTEs Involved', description: 'How many full-time-equivalent people contribute to this process?', allowDecimal: true },
    { section: 'workPattern', field: 'averageHourlyCost', kind: 'number', label: 'Average Hourly Cost', description: 'Estimated blended hourly cost for people doing or reviewing this work.', allowDecimal: true },
    { section: 'workPattern', field: 'reworkEffortHours', kind: 'number', label: 'Average Rework Effort', description: 'How many extra hours are spent when one case needs rework?', allowDecimal: true },
    { section: 'workPattern', field: 'customerImpact', kind: 'scale', label: 'Customer or Internal Impact', description: 'How much does this process affect customers, employees, suppliers, or internal service quality?', labels: scale5 },
    { section: 'workPattern', field: 'expectedBenefitConfidence', kind: 'scale', label: 'Expected Benefit Confidence', description: 'How confident are stakeholders that automation or AI would create measurable benefit?', labels: scale5 },

    { section: 'dataProfile', field: 'inputStructure', kind: 'percent', label: 'Input Structure', description: 'How structured are the inputs used in this process?', labels: ['Mostly Free-text & Conversations (0%)', 'Mix of Texts & Forms (25%)', 'Balanced Structured/Unstructured (50%)', 'Mostly Databases & APIs (75%)', '100% Highly Structured (100%)'], protectedScoringField: true, evidenceRecommended: true },
    { section: 'dataProfile', field: 'unstructuredLoad', kind: 'scale', label: 'Unstructured Content Load', description: 'How much of this process depends on reading emails, documents, notes, or other free-text content?', labels: scale5, protectedScoringField: true },
    { section: 'dataProfile', field: 'dataSensitivity', kind: 'scale', label: 'Data Sensitivity', description: 'How sensitive is the information handled in this process?', labels: ['Public', 'Internal', 'Confidential', 'Restricted', 'Highly Regulated'], protectedScoringField: true, evidenceRecommended: true },
    { section: 'dataProfile', field: 'dataQuality', kind: 'scale', label: 'Data Quality', description: 'How complete, accurate, and consistent is the data used by this process?', labels: ['Poor', 'Weak', 'Mixed', 'Good', 'Trusted'], evidenceRecommended: true },
    { section: 'dataProfile', field: 'dataAvailability', kind: 'scale', label: 'Data Availability', description: 'How easy is it to access the data required for automation or AI?', labels: ['Unavailable', 'Restricted', 'Manual', 'Available', 'API-ready'] },
    { section: 'dataProfile', field: 'sourceOfTruthClarity', kind: 'scale', label: 'Source-of-Truth Clarity', description: 'Is there a clearly trusted source for each key data element?', labels: ['Unknown', 'Conflicting', 'Partial', 'Clear', 'Governed'] },
    { section: 'dataProfile', field: 'historicalDataAvailability', kind: 'scale', label: 'Historical Data Availability', description: 'Is enough past data available for analysis, validation, or AI-assisted design?', labels: ['None', 'Limited', 'Partial', 'Good', 'Extensive'], condition: assessment => (assessment.responses.dataProfile.unstructuredLoad || 0) >= 3 },
    { section: 'dataProfile', field: 'labelledTrainingData', kind: 'scale', label: 'Labelled / Training Data', description: 'For AI use cases, is labelled or reviewed example data available?', labels: ['None', 'Limited', 'Partial', 'Good', 'Production-ready'], condition: assessment => (assessment.responses.dataProfile.unstructuredLoad || 0) >= 3 },
    { section: 'dataProfile', field: 'piiOrFinancialData', kind: 'toggle', label: 'PII / Financial Data Present', description: 'This process handles personal, payroll, financial, health, or similarly sensitive data.' },
    { section: 'dataProfile', field: 'retentionConstraints', kind: 'toggle', label: 'Retention Constraints', description: 'Evidence, logs, or generated outputs must follow retention or deletion policies.' },

    { section: 'judgment', field: 'judgmentIntensity', kind: 'scale', label: 'Human Judgment Required', description: 'How much human interpretation or decision-making is needed in this process?', labels: scale5, protectedScoringField: true },
    { section: 'judgment', field: 'goalAmbiguity', kind: 'scale', label: 'Goal Clarity', description: 'How clear is the expected outcome for each case?', labels: ['Unclear', 'Vague', 'Understandable', 'Clear', 'Very Clear'], protectedScoringField: true },
    { section: 'judgment', field: 'domainExpertiseRequired', kind: 'scale', label: 'Domain Expertise Required', description: 'How much specialist business knowledge is required to make the right decision?', labels: scale5 },
    { section: 'judgment', field: 'decisionSubjectivity', kind: 'scale', label: 'Decision Subjectivity', description: 'How subjective are the decisions or recommendations in this process?', labels: ['Objective', 'Mostly Objective', 'Mixed', 'Subjective', 'Highly Subjective'] },
    { section: 'judgment', field: 'exceptionComplexity', kind: 'scale', label: 'Exception Complexity', description: 'How difficult are unusual or edge cases to interpret correctly?', labels: scale5 },
    { section: 'judgment', field: 'explainabilityNeed', kind: 'scale', label: 'Explainability Need', description: 'How important is it to explain why a decision or recommendation was made?', labels: ['Very Low', 'Low', 'Medium', 'High', 'Mandatory'] },
    { section: 'judgment', field: 'autonomyLevel', kind: 'scale', label: 'Target Autonomy Level', description: 'What is the maximum autonomy stakeholders are considering for this use case?', labels: ['Suggest', 'Draft', 'Internal action', 'System update', 'External action'] },
    { section: 'judgment', field: 'humanApprovalBeforeAction', kind: 'toggle', label: 'Human Approval Before Action', description: 'A person must approve before the system takes action.', condition: assessment => (assessment.responses.judgment.autonomyLevel || 0) >= 2 },
    { section: 'judgment', field: 'autonomousExecutionAllowed', kind: 'toggle', label: 'Autonomous Execution Allowed', description: 'The organization may allow bounded autonomous execution after approval.', condition: assessment => (assessment.responses.judgment.autonomyLevel || 0) >= 3 },
    { section: 'judgment', field: 'externalCommunicationAllowed', kind: 'toggle', label: 'External Communication Allowed', description: 'The system may contact customers, vendors, regulators, or external parties.', condition: assessment => (assessment.responses.judgment.autonomyLevel || 0) >= 4 },
    { section: 'judgment', field: 'rollbackPossible', kind: 'toggle', label: 'Rollback Possible', description: 'Incorrect action can be reversed without major customer, legal, or financial impact.', condition: assessment => (assessment.responses.judgment.autonomyLevel || 0) >= 3 },
    { section: 'judgment', field: 'killSwitchRequired', kind: 'toggle', label: 'Kill Switch Required', description: 'Operations must be stoppable immediately by an authorized person.', condition: assessment => (assessment.responses.judgment.autonomyLevel || 0) >= 3 },
    { section: 'judgment', field: 'realTimeMonitoringRequired', kind: 'toggle', label: 'Real-Time Monitoring Required', description: 'This use case needs active monitoring after launch.', condition: assessment => (assessment.responses.judgment.autonomyLevel || 0) >= 3 },

    { section: 'systems', field: 'primarySystems', kind: 'textarea', label: 'Primary Systems', description: 'List the main systems of record or work execution systems.', placeholder: 'Example: SAP S/4HANA, Coupa, Outlook, ServiceNow.' },
    { section: 'systems', field: 'secondarySystems', kind: 'textarea', label: 'Secondary Systems and Channels', description: 'List supporting tools, spreadsheets, email inboxes, shared folders, bots, or reporting tools.', placeholder: 'Example: shared AP mailbox, Excel tracker, vendor portal, Power BI report.' },
    { section: 'systems', field: 'systemReadiness', kind: 'scale', label: 'System Readiness', description: 'How ready are the current systems for automation or AI support?', labels: ['Not Ready', 'Legacy', 'Basic UI', 'Modern UI', 'API Ready'], protectedScoringField: true, evidenceRecommended: true },
    { section: 'systems', field: 'orchestrationComplexity', kind: 'scale', label: 'Orchestration Complexity', description: 'How many systems, handoffs, or coordinated steps are involved in completing this process?', labels: ['Very Simple', 'Simple', 'Moderate', 'Complex', 'Very Complex'], protectedScoringField: true },
    { section: 'systems', field: 'apiAvailability', kind: 'scale', label: 'API Availability', description: 'Are stable APIs available for the systems involved?', labels: ['None', 'Limited', 'Partial', 'Good', 'Complete'], evidenceRecommended: true },
    { section: 'systems', field: 'apiQuality', kind: 'scale', label: 'API Quality', description: 'How usable, documented, and reliable are those APIs?', labels: ['Poor', 'Weak', 'Mixed', 'Good', 'Enterprise-grade'], condition: assessment => (assessment.responses.systems.apiAvailability || 0) >= 2 },
    { section: 'systems', field: 'uiStability', kind: 'scale', label: 'UI Stability', description: 'If RPA is considered, how stable are screens, selectors, and UI paths?', labels: ['Unstable', 'Often Changes', 'Mixed', 'Stable', 'Very Stable'] },
    { section: 'systems', field: 'authenticationComplexity', kind: 'scale', label: 'Authentication Complexity', description: 'How complex are authentication, MFA, session, and service-account requirements?', labels: ['Simple', 'Low', 'Moderate', 'High', 'Very High'] },
    { section: 'systems', field: 'testSystemAvailability', kind: 'scale', label: 'Test Environment Availability', description: 'Is there a safe test or UAT environment for validation?', labels: ['None', 'Limited', 'Shared', 'Available', 'Production-like'] },
    { section: 'systems', field: 'loggingAvailability', kind: 'scale', label: 'Logging Availability', description: 'Can the process be monitored through logs, events, or operational telemetry?', labels: ['None', 'Limited', 'Partial', 'Good', 'Complete'] },
    { section: 'systems', field: 'realTimeNeed', kind: 'toggle', label: 'Real-Time Processing Needed', description: 'The process requires immediate response or near-real-time updates.' },
    { section: 'systems', field: 'externalPartyDependency', kind: 'toggle', label: 'External Party Dependency', description: 'The process depends on customers, vendors, regulators, or third-party systems.' },
    { section: 'systems', field: 'vendorDependency', kind: 'toggle', label: 'Vendor Dependency', description: 'A vendor must provide access, API support, configuration, or approval.' },

    { section: 'risk', field: 'riskCriticality', kind: 'scale', label: 'Business Risk Criticality', description: 'If this process goes wrong, how serious is the business impact?', labels: scale5, protectedScoringField: true, evidenceRecommended: true },
    { section: 'risk', field: 'governanceSensitivity', kind: 'scale', label: 'Governance / Compliance Sensitivity', description: 'How much governance, auditability, or compliance control is needed for this process?', labels: ['Unregulated', 'Light Policy', 'Audited', 'Strictly Audited', 'Heavily Regulated'], protectedScoringField: true, evidenceRecommended: true },
    { section: 'risk', field: 'errorReversibility', kind: 'scale', label: 'Error Reversibility', description: 'If a mistake happens, how easy is it to detect and correct?', labels: ['Impossible', 'Hard', 'Moderate', 'Easy', 'Very Easy'], protectedScoringField: true },
    { section: 'risk', field: 'regulatoryExposure', kind: 'scale', label: 'Regulatory Exposure', description: 'How much regulation, legal obligation, or policy enforcement surrounds this process?', labels: ['None', 'Low', 'Moderate', 'High', 'Critical'], evidenceRecommended: true },
    { section: 'risk', field: 'auditRequirement', kind: 'scale', label: 'Audit Requirement', description: 'How likely is this process to require evidence, review history, and defensible audit trails?', labels: ['None', 'Light', 'Periodic', 'Strict', 'Continuous'] },
    { section: 'risk', field: 'financialImpactRisk', kind: 'scale', label: 'Financial Impact Risk', description: 'Could a wrong action create financial loss, leakage, penalties, or incorrect payment?', labels: scale5 },
    { section: 'risk', field: 'legalImpactRisk', kind: 'scale', label: 'Legal Impact Risk', description: 'Could a wrong action create legal, contractual, or compliance exposure?', labels: scale5 },
    { section: 'risk', field: 'customerImpactRisk', kind: 'scale', label: 'Customer Impact Risk', description: 'Could a wrong action affect customer experience, commitments, or service quality?', labels: scale5 },
    { section: 'risk', field: 'biasFairnessConcern', kind: 'scale', label: 'Bias / Fairness Concern', description: 'Could the process create biased, unfair, or inconsistent outcomes for users or employees?', labels: ['None', 'Low', 'Medium', 'High', 'Critical'] },
    { section: 'risk', field: 'securityConcern', kind: 'scale', label: 'Security Concern', description: 'How much security risk exists due to data, access, credentials, or integrations?', labels: scale5 },
    { section: 'risk', field: 'promptInjectionExposure', kind: 'scale', label: 'Prompt Injection Exposure', description: 'For AI use cases, how exposed is the system to untrusted documents, messages, or user instructions?', labels: ['None', 'Low', 'Medium', 'High', 'Very High'], condition: assessment => (assessment.responses.dataProfile.unstructuredLoad || 0) >= 3 || (assessment.responses.judgment.autonomyLevel || 0) >= 2 },
    { section: 'risk', field: 'modelDriftConcern', kind: 'scale', label: 'Model Drift Concern', description: 'How likely is performance to degrade because policies, data, or user behavior changes?', labels: scale5, condition: assessment => (assessment.responses.dataProfile.unstructuredLoad || 0) >= 3 || (assessment.responses.judgment.autonomyLevel || 0) >= 2 },
    { section: 'risk', field: 'thirdPartyModelRisk', kind: 'scale', label: 'Third-Party Model / Vendor Risk', description: 'How much dependency exists on external model providers, vendors, or black-box services?', labels: ['None', 'Low', 'Medium', 'High', 'Very High'], condition: assessment => (assessment.responses.dataProfile.unstructuredLoad || 0) >= 3 || (assessment.responses.judgment.autonomyLevel || 0) >= 2 },
];

export const EVIDENCE_TYPES: EvidenceItem['type'][] = [
    'SOP',
    'Process Map',
    'Sample Transaction',
    'System Screenshot',
    'Export Report',
    'System Log',
    'Time Study',
    'Meeting Transcript',
    'Policy Document',
    'Control Document',
    'Exception Report',
    'Business Case File',
    'Other',
];

export const ASSUMPTION_CATEGORIES: Assumption['category'][] = [
    'Volume',
    'Time/Motion',
    'Cost',
    'Risk',
    'System Access',
    'API Availability',
    'Governance',
    'Data Quality',
    'Timeline',
];

export const ASSESS_TEMPLATE_RULES: AssessTemplateRule[] = [
    {
        templateId: 'tpl-p2p-invoice-ingestion',
        label: 'P2P Invoice Ingestion',
        focus: 'Document-heavy finance automation with AP controls, invoice evidence, OCR/document intelligence, duplicate prevention, and ERP handoff.',
        priorityFields: [
            'processStructure.standardization',
            'processStructure.ruleDeterminism',
            'dataProfile.unstructuredLoad',
            'dataProfile.dataQuality',
            'systems.primarySystems',
            'systems.apiAvailability',
            'risk.governanceSensitivity',
            'risk.financialImpactRisk',
        ],
        evidenceFields: [
            'processStructure.sopAvailability',
            'processStructure.processMapAvailability',
            'dataProfile.inputStructure',
            'dataProfile.dataQuality',
            'systems.systemReadiness',
            'risk.auditRequirement',
        ],
        defaultResponsePatch: {
            dataProfile: { unstructuredLoad: 4, dataSensitivity: 3 },
            risk: { financialImpactRisk: 4, auditRequirement: 4 },
        },
    },
    {
        templateId: 'tpl-o2c-credit-check',
        label: 'O2C Credit Checking',
        focus: 'Decision-heavy finance workflow with policy interpretation, credit risk, external-data dependency, and human approval controls.',
        priorityFields: [
            'judgment.judgmentIntensity',
            'judgment.domainExpertiseRequired',
            'judgment.explainabilityNeed',
            'risk.riskCriticality',
            'risk.financialImpactRisk',
            'systems.apiAvailability',
            'systems.externalPartyDependency',
        ],
        evidenceFields: [
            'processStructure.ruleDeterminism',
            'judgment.goalAmbiguity',
            'risk.governanceSensitivity',
            'risk.auditRequirement',
            'systems.primarySystems',
        ],
        defaultResponsePatch: {
            judgment: { judgmentIntensity: 4, explainabilityNeed: 4, humanApprovalBeforeAction: true },
            risk: { financialImpactRisk: 5, legalImpactRisk: 4 },
        },
    },
];

export const ASSESS_REVIEWER_CHECKPOINTS: AssessReviewerCheckpointDefinition[] = [
    {
        id: 'process-owner-validated',
        section: 'processStructure',
        label: 'Process owner validated current state',
        description: 'Reviewer confirms the process owner validated standardization, variants, handoffs, exceptions, and documented bottlenecks.',
        requiredFor: 'review',
    },
    {
        id: 'template-fields-reviewed',
        section: 'processStructure',
        label: 'Template priority fields reviewed',
        description: 'Reviewer confirms all priority fields from the selected template pack have been considered.',
        requiredFor: 'approval',
        condition: (_assessment, templateRule) => Boolean(templateRule),
    },
    {
        id: 'value-model-challenged',
        section: 'workPattern',
        label: 'Value assumptions challenged',
        description: 'Reviewer confirms volume, effort, rework, wait time, and hourly cost assumptions are realistic or flagged.',
        requiredFor: 'review',
    },
    {
        id: 'data-controls-reviewed',
        section: 'dataProfile',
        label: 'Data controls reviewed',
        description: 'Reviewer confirms sensitivity, retention, evidence quality, and source-of-truth risks are understood.',
        requiredFor: 'approval',
    },
    {
        id: 'autonomy-boundary-approved',
        section: 'judgment',
        label: 'Autonomy boundary approved',
        description: 'Reviewer confirms any draft/action/system-update/external-action autonomy is bounded with HITL controls.',
        requiredFor: 'approval',
        condition: assessment => (assessment.responses.judgment.autonomyLevel || 0) >= 2,
    },
    {
        id: 'system-feasibility-reviewed',
        section: 'systems',
        label: 'System feasibility reviewed',
        description: 'Reviewer confirms APIs, UI stability, test environment, authentication, logging, and dependencies are feasible.',
        requiredFor: 'approval',
    },
    {
        id: 'governance-controls-approved',
        section: 'risk',
        label: 'Governance controls approved',
        description: 'Reviewer confirms risk tier, HITL controls, audit needs, AI risks, and red flags are ready for decision.',
        requiredFor: 'approval',
    },
    {
        id: 'handoff-evidence-complete',
        section: 'evidenceAndAssumptions',
        label: 'Handoff evidence complete',
        description: 'Reviewer confirms evidence and assumptions are linked to fields and sufficient for Docs or Delivery handoff.',
        requiredFor: 'handoff',
    },
];

export function getAssessQuestionsForSection(section: AssessmentSectionKey, assessment: Assessment): AssessQuestionDefinition[] {
    return ASSESS_QUESTION_BANK.filter(question => question.section === section && (!question.condition || question.condition(assessment)));
}

export function getAssessFieldOptions(assessment?: Assessment | null) {
    return ASSESS_QUESTION_BANK
        .filter(question => !assessment || !question.condition || question.condition(assessment))
        .map(question => ({
            id: `${question.section}.${question.field}`,
            label: question.label,
            section: ASSESS_SECTIONS.find(section => section.key === question.section)?.label || question.section,
            recommended: Boolean(question.evidenceRecommended || question.protectedScoringField),
        }));
}

export function getAssessTemplateRule(templateId?: string | null): AssessTemplateRule | undefined {
    return templateId ? ASSESS_TEMPLATE_RULES.find(rule => rule.templateId === templateId) : undefined;
}

export function getReviewerCheckpointsForSection(section: AssessmentSectionKey, assessment: Assessment, templateRule?: AssessTemplateRule) {
    return ASSESS_REVIEWER_CHECKPOINTS.filter(checkpoint => checkpoint.section === section && (!checkpoint.condition || checkpoint.condition(assessment, templateRule)));
}
