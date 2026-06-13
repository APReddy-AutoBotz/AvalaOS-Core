import { User, Team, Project, Task, Epic, Sprint, Automation, TimesheetEntry, DocumentGeneration, AssessProcess, GeneratedArtifacts, ScopeType, View, AssessmentResponses, EvidenceItem, Assumption, ProductModuleKey } from '../types';
import { INVOICE_PROCESSING_ARTIFACTS } from '../constants';
import { MOCK_DOC_TEMPLATES } from './docTemplates';

export const CANONICAL_DEMO_ORG_ID = 'org-1';
export const CANONICAL_DEMO_ORG_NAME = 'Avala Demo Enterprise';
export const CANONICAL_DEMO_ORG_SLUG = 'avala-demo-enterprise';
export const CANONICAL_DEMO_ENABLED_MODULES: ProductModuleKey[] = ['assess', 'docs', 'delivery', 'monitor'];
export const CANONICAL_AP_PROCESS_ID = 'proc-ap-invoice-exception';
export const CANONICAL_AP_ASSESSMENT_ID = `assess-${CANONICAL_AP_PROCESS_ID}`;
export const CANONICAL_AP_PROCESS_NAME = 'AP Invoice Exception Handling';
export const CANONICAL_AP_WORKFLOW_NAME = 'AP Invoice Exception Workflow';

export const CANONICAL_DEMO_ORG_PROFILE = {
    industry: 'Finance Operations / Shared Services',
    size: '1000+',
    geography: 'North America, Europe, India',
    strategicGoals: 'Reduce AP invoice exception aging while preserving finance-owner review, evidence, and governed delivery handoffs.',
};

export const MOCK_USERS: User[] = [
    { id: 'user-2', name: 'Maya Patel', email: 'maya.patel@avala-demo.example', roleTitle: 'Process Analyst', orgRole: 'Contributor', persona: 'Process analyst', defaultScope: { type: ScopeType.MY_WORK }, defaultView: View.PROCESS_CATALOG, permissions: ['project.read', 'team.read', 'task.read', 'backlog.read', 'roadmap.read', 'capacity.read', 'assessment.create', 'assessment.edit', 'process.create', 'docs.generate', 'docs.read', 'workitems.import', 'comments.manage'], skills: ['Business Analysis', 'Requirements', 'Process Mapping'] },
    { id: 'user-7', name: 'Priya Nair', email: 'priya.nair@avala-demo.example', roleTitle: 'AP Process Owner', orgRole: 'Reviewer', persona: 'Process owner', defaultScope: { type: ScopeType.MY_WORK }, defaultView: View.PROCESS_CATALOG, permissions: ['project.read', 'portfolio.read', 'assessment.review', 'process.approve', 'docs.read', 'docs.approve', 'controls.review', 'approvals.review'], skills: ['Finance Operations', 'Accounts Payable', 'Process Controls'] },
    { id: 'user-9', name: 'Alicia Morgan', email: 'alicia.morgan@avala-demo.example', roleTitle: 'Delivery Lead', orgRole: 'Contributor', persona: 'Delivery lead', defaultScope: { type: ScopeType.MY_WORK }, defaultView: View.BOARDS, permissions: ['project.manage', 'project.read', 'team.read', 'task.read', 'task.create', 'task.update', 'task.assign', 'task.delete', 'backlog.manage', 'sprint.manage', 'roadmap.manage', 'capacity.read', 'timesheets.read', 'timesheets.approve', 'risks.manage', 'reports.read', 'docs.read', 'docs.review', 'automation.view'], skills: ['Delivery Leadership', 'Agile Delivery', 'Risk Management'] },
    { id: 'user-5', name: 'Emily White', email: 'emily.white@avala-demo.example', roleTitle: 'Control Reviewer', orgRole: 'Reviewer', persona: 'Control reviewer', defaultScope: { type: ScopeType.MY_WORK }, defaultView: View.DOCS, permissions: ['project.read', 'task.read', 'defects.manage', 'uat.execute', 'testcases.manage', 'approvals.review', 'docs.read', 'docs.review', 'controls.review'], skills: ['Quality Review', 'UAT', 'Controls Testing'] },
    { id: 'user-6', name: 'Frank Miller', email: 'frank.miller@avala-demo.example', roleTitle: 'Automation Contributor', orgRole: 'Contributor', persona: 'Automation contributor', defaultScope: { type: ScopeType.MY_WORK }, defaultView: View.BOARDS, permissions: ['project.read', 'task.read', 'task.update.own', 'timesheets.log', 'automation.execute', 'docs.read'], skills: ['Workflow Implementation', 'SAP Integration Support', 'Test Automation'] },
    { id: 'user-1', name: 'Sarah Chen', email: 'sarah.chen@avala-demo.example', roleTitle: 'Buyer Viewer', orgRole: 'Buyer', persona: 'Buyer viewer', defaultScope: { type: ScopeType.MY_WORK }, defaultView: View.PORTFOLIO, permissions: ['portfolio.read', 'reports.read', 'approvals.review', 'strategy.read'], skills: ['Finance Transformation', 'Process Governance', 'Executive Reporting'] },
    { id: 'user-8', name: 'Henry Wilson', email: 'henry.wilson@avala-demo.example', roleTitle: 'Platform Admin', orgRole: 'Admin', persona: 'Platform admin', defaultScope: { type: ScopeType.ORGANIZATION }, defaultView: View.WORKSPACE, permissions: ['org.admin', 'users.manage', 'roles.manage', 'integrations.manage', 'security.manage', 'byok.manage', 'audit.read'], skills: ['Workspace Administration', 'Access Governance', 'Integration Architecture'] },
];

export const MOCK_LOGIN_PROFILES = [
    {
        userId: 'user-2',
        password: 'demo123',
        label: 'Process Analyst',
        description: 'Open the AP Invoice Exception process, review the completed assessment, and prepare the governed Studio handoff.',
        accent: 'from-indigo-500 to-violet-500',
        recommendedFor: 'Assess walkthrough',
    },
    {
        userId: 'user-7',
        password: 'demo123',
        label: 'AP Process Owner',
        description: 'Review deterministic scores, evidence, assumptions, Decision Pack content, and Govern Lite controls.',
        accent: 'from-emerald-500 to-teal-500',
        recommendedFor: 'Business owner',
    },
    {
        userId: 'user-9',
        password: 'demo123',
        label: 'Delivery Lead',
        description: 'Preview delivery ownership for the later Studio, work item, Delivery Pack, and Monitor data milestone.',
        accent: 'from-blue-600 to-cyan-500',
        recommendedFor: 'Delivery review',
    },
    {
        userId: 'user-5',
        password: 'demo123',
        label: 'Control Reviewer',
        description: 'Review evidence, control checkpoints, generated document approvals, and UAT readiness.',
        accent: 'from-rose-500 to-red-500',
        recommendedFor: 'Controls / QA',
    },
    {
        userId: 'user-6',
        password: 'demo123',
        label: 'Automation Contributor',
        description: 'Work assigned implementation tasks after human-approved Assess and delivery handoffs.',
        accent: 'from-amber-500 to-orange-500',
        recommendedFor: 'Builder',
    },
    {
        userId: 'user-1',
        password: 'demo123',
        label: 'Buyer Viewer',
        description: 'Inspect AP value, risk, status, blockers, and executive-facing readiness signals without editing data.',
        accent: 'from-sky-500 to-indigo-500',
        recommendedFor: 'Buyer demo',
    },
    {
        userId: 'user-8',
        password: 'demo123',
        label: 'Platform Admin',
        description: 'Manage Avala Demo Enterprise modules, roles, integrations, and audit/security governance.',
        accent: 'from-slate-700 to-cyan-500',
        recommendedFor: 'IT / admin',
    },
];

export const MOCK_TEAMS: Team[] = [
    { id: 'team-1', name: 'AP Exception Review Team', memberIds: ['user-7', 'user-2', 'user-5'] },
    { id: 'team-2', name: 'Avala Demo Platform Admins', memberIds: ['user-8'] },
    { id: 'team-3', name: 'AP Workflow Delivery Pod', memberIds: ['user-9', 'user-6', 'user-2', 'user-5'] },
    { id: 'team-4', name: 'Finance Buyer Review Group', memberIds: ['user-1', 'user-7', 'user-9'] },
];

export const MOCK_PROJECTS: Project[] = [
    { id: 'proj-1', name: 'AP Invoice Automation', description: 'Automate invoice intake, validation, exception routing, and SAP posting for Accounts Payable.', ownerId: 'user-9', lifecycleStage: 'Development', healthStatus: 'On Track' },
    { id: 'proj-2', name: 'Customer Support AI Assist', description: 'GenAI-assisted case summarization, suggested responses, and human handoff for Tier 1 support.', ownerId: 'user-4', lifecycleStage: 'Testing', healthStatus: 'At Risk' },
    { id: 'proj-3', name: 'Employee Onboarding Workflow', description: 'Workflow orchestration for HR, IT access, equipment, policy acknowledgements, and first-week tasks.', ownerId: 'user-2', lifecycleStage: 'Analysis & Design', healthStatus: 'On Track' },
    { id: 'proj-4', name: 'Claims Intake Agentic Triage', description: 'Bounded agentic triage for claims intake, document classification, validation, and adjuster escalation.', ownerId: 'user-8', lifecycleStage: 'Planning', healthStatus: 'At Risk' },
    { id: 'proj-5', name: 'Month-End Close Control Pack', description: 'Finance close documentation, reconciliations, evidence collection, and approval control automation.', ownerId: 'user-7', lifecycleStage: 'Deployment', healthStatus: 'On Track' },
];

export const MOCK_ASSESS_PROCESSES: AssessProcess[] = [
    {
        id: CANONICAL_AP_PROCESS_ID,
        orgId: CANONICAL_DEMO_ORG_ID,
        name: CANONICAL_AP_PROCESS_NAME,
        description: 'Finance operations receives invoice exceptions from vendor master mismatches, PO/GRN match gaps, approval routing ambiguity, exception aging, and manual SAP rework. Human owners approve risk, controls, and downstream delivery decisions before action.',
        ownerId: 'user-7',
        department: 'Finance Operations / Accounts Payable',
        criticality: 'High',
        status: 'Completed',
        templateId: 'tpl-p2p-invoice-ingestion',
        createdAt: '2026-04-02T09:00:00.000Z',
        updatedAt: '2026-04-25T16:00:00.000Z',
    },
];

export const CANONICAL_AP_ASSESSMENT_RESPONSES: AssessmentResponses = {
    processStructure: {
        standardization: 4,
        ruleDeterminism: 4,
        exceptionPredictability: 4,
        processMaturity: 3,
        sopAvailability: 4,
        processMapAvailability: 4,
        processVariants: 3,
        handoffs: 4,
        manualSteps: 5,
        approvalSteps: 3,
        processStability: 4,
        changeFrequency: 2,
        bottlenecks: 'Vendor master mismatches, PO/GRN match gaps, approval routing ambiguity, and exception aging drive manual AP rework.',
    },
    workPattern: {
        volume: 48000,
        rawVolumeValue: 4000,
        rawVolumePeriod: 'Month',
        manualEffort: 0.28,
        rawEffortValue: 17,
        rawEffortUnit: 'Minutes',
        reworkPain: 4,
        cycleTimePain: 4,
        averageCycleTimeHours: 42,
        waitTimePercentage: 35,
        reworkFrequency: 18,
        reworkEffortHours: 2.5,
        fteInvolved: 12,
        averageHourlyCost: 62,
        customerImpact: 3,
        expectedBenefitConfidence: 4,
    },
    dataProfile: {
        inputStructure: 72,
        unstructuredLoad: 3,
        dataSensitivity: 3,
        dataQuality: 4,
        dataAvailability: 4,
        dataOwnershipClarity: 4,
        sourceOfTruthClarity: 4,
        historicalDataAvailability: 4,
        labelledTrainingData: 3,
        piiOrFinancialData: true,
        retentionConstraints: true,
    },
    judgment: {
        judgmentIntensity: 3,
        goalAmbiguity: 2,
        domainExpertiseRequired: 4,
        decisionSubjectivity: 2,
        exceptionComplexity: 3,
        humanInterpretationRequired: 3,
        hallucinationTolerance: 1,
        falsePositiveTolerance: 2,
        falseNegativeTolerance: 2,
        explainabilityNeed: 4,
        reviewerRationaleNeed: 4,
        autonomyLevel: 2,
        autonomousExecutionAllowed: false,
        externalCommunicationAllowed: false,
        humanApprovalBeforeAction: true,
        rollbackPossible: true,
        killSwitchRequired: true,
        realTimeMonitoringRequired: true,
    },
    systems: {
        systemReadiness: 4,
        orchestrationComplexity: 3,
        primarySystems: 'Invoice intake mailbox, SAP ECC, vendor master, PO/GRN matching report',
        secondarySystems: 'AP workflow queue, shared evidence repository, payment status dashboard',
        apiAvailability: 3,
        apiQuality: 3,
        uiStability: 4,
        authenticationComplexity: 3,
        accessRestrictions: 3,
        testSystemAvailability: 4,
        sandboxAvailability: 4,
        integrationOwnership: 4,
        realTimeNeed: false,
        externalPartyDependency: true,
        vendorDependency: true,
        loggingAvailability: 4,
    },
    risk: {
        riskCriticality: 3,
        governanceSensitivity: 3,
        errorReversibility: 4,
        regulatoryExposure: 3,
        auditRequirement: 4,
        financialImpactRisk: 4,
        legalImpactRisk: 2,
        customerImpactRisk: 2,
        employeeImpactRisk: 1,
        vulnerableUserImpact: 1,
        biasFairnessConcern: 1,
        securityConcern: 3,
        promptInjectionExposure: 2,
        modelDriftConcern: 2,
        thirdPartyModelRisk: 2,
    },
};

export const CANONICAL_AP_EVIDENCE_ITEMS: EvidenceItem[] = [
    {
        id: 'ev-ap-exception-map',
        type: 'Process Map',
        description: 'Demo evidence: AP invoice exception current-state map covering vendor master, PO/GRN match, duplicate, tax variance, and approval routing paths.',
        owner: 'Priya Nair',
        sensitivity: 'Internal',
        linkedField: 'processStructure.processMapAvailability',
    },
    {
        id: 'ev-ap-sop',
        type: 'SOP',
        description: 'Demo evidence: AP exception handling SOP with owner review checkpoints and finance approval responsibilities.',
        owner: 'Priya Nair',
        sensitivity: 'Internal',
        linkedField: 'processStructure.sopAvailability',
    },
    {
        id: 'ev-ap-exception-report',
        type: 'Exception Report',
        description: 'Demo evidence: monthly invoice exception volume and aging pattern summarized by exception category.',
        owner: 'Maya Patel',
        sensitivity: 'Confidential',
        linkedField: 'workPattern.volume',
    },
    {
        id: 'ev-ap-sap-sample',
        type: 'System Screenshot',
        description: 'Demo evidence: representative SAP invoice and payment-block status summary with no real customer source content.',
        owner: 'Emily White',
        sensitivity: 'Confidential',
        linkedField: 'systems.primarySystems',
    },
    {
        id: 'ev-ap-po-policy',
        type: 'Policy Document',
        description: 'Demo evidence: PO/GRN mismatch, blocked vendor, tax variance, and duplicate invoice review policy summary.',
        owner: 'Emily White',
        sensitivity: 'Internal',
        linkedField: 'risk.auditRequirement',
    },
    {
        id: 'ev-ap-owner-review',
        type: 'Control Document',
        description: 'Demo evidence: AP process owner review note confirming that human approval remains required before downstream posting or external communication.',
        owner: 'Priya Nair',
        sensitivity: 'Internal',
        linkedField: 'judgment.humanApprovalBeforeAction',
    },
];

export const CANONICAL_AP_ASSUMPTIONS: Assumption[] = [
    {
        id: 'as-ap-volume',
        category: 'Volume',
        description: 'Demo assumption: Avala Demo Enterprise receives about 48,000 invoices annually, with exception volume concentrated in vendor master mismatch, PO/GRN mismatch, blocked vendor, and tax variance queues.',
        confidence: 82,
        owner: 'Maya Patel',
        reviewDate: '2026-05-15',
        validated: true,
        linkedField: 'workPattern.volume',
    },
    {
        id: 'as-ap-effort',
        category: 'Time/Motion',
        description: 'Demo assumption: exception review averages 17 minutes of AP analyst effort before owner approval or payment-block resolution.',
        confidence: 78,
        owner: 'Maya Patel',
        reviewDate: '2026-05-15',
        validated: true,
        linkedField: 'workPattern.manualEffort',
    },
    {
        id: 'as-ap-system-access',
        category: 'System Access',
        description: 'Demo assumption: SAP sandbox, invoice intake sample data, vendor master extracts, and AP workflow queue access are available for governed delivery validation.',
        confidence: 75,
        owner: 'Henry Wilson',
        reviewDate: '2026-05-20',
        validated: true,
        linkedField: 'systems.testSystemAvailability',
    },
    {
        id: 'as-ap-controls',
        category: 'Governance',
        description: 'Demo assumption: finance owner approval remains required before posting, payment release, vendor communication, or delivery handoff decisions.',
        confidence: 86,
        owner: 'Priya Nair',
        reviewDate: '2026-05-15',
        validated: true,
        linkedField: 'judgment.humanApprovalBeforeAction',
    },
    {
        id: 'as-ap-data-quality',
        category: 'Data Quality',
        description: 'Demo assumption: invoice metadata is sufficiently structured for triage, while PDF line-item extraction and vendor master matching still require evidence review.',
        confidence: 74,
        owner: 'Emily White',
        reviewDate: '2026-05-20',
        validated: false,
        linkedField: 'dataProfile.dataQuality',
    },
];

export const MOCK_EPICS: Epic[] = [
    { id: 'epic-101', name: 'Capture and Classify Invoices', projectId: 'proj-1', color: '#0F766E' },
    { id: 'epic-102', name: 'Validation and Exception Rules', projectId: 'proj-1', color: '#D97706' },
    { id: 'epic-103', name: 'SAP Posting and Controls', projectId: 'proj-1', color: '#2563EB' },
    { id: 'epic-201', name: 'Knowledge Retrieval and Guardrails', projectId: 'proj-2', color: '#7C3AED' },
    { id: 'epic-202', name: 'Agent Assist Experience', projectId: 'proj-2', color: '#0891B2' },
    { id: 'epic-203', name: 'Human Handoff and QA', projectId: 'proj-2', color: '#DC2626' },
    { id: 'epic-301', name: 'Onboarding Intake and Approvals', projectId: 'proj-3', color: '#4F46E5' },
    { id: 'epic-302', name: 'Provisioning Orchestration', projectId: 'proj-3', color: '#16A34A' },
    { id: 'epic-303', name: 'Employee Readiness Experience', projectId: 'proj-3', color: '#CA8A04' },
    { id: 'epic-401', name: 'Document Classification', projectId: 'proj-4', color: '#0E7490' },
    { id: 'epic-402', name: 'Agentic Triage Controls', projectId: 'proj-4', color: '#BE123C' },
    { id: 'epic-403', name: 'Adjuster Escalation Workflow', projectId: 'proj-4', color: '#4338CA' },
    { id: 'epic-501', name: 'Evidence Collection', projectId: 'proj-5', color: '#059669' },
    { id: 'epic-502', name: 'Close Review and Sign-off', projectId: 'proj-5', color: '#B45309' },
    { id: 'epic-503', name: 'Control Pack Reporting', projectId: 'proj-5', color: '#2563EB' },
];

export const MOCK_SPRINTS: Sprint[] = [
    { id: 'sprint-1', name: 'AP Automation Pilot', projectId: 'proj-1', startDate: '2026-04-15', endDate: '2026-04-28', status: 'Active', goal: 'Prove invoice capture, PO match, and exception routing with real AP samples.', capacity: 34 },
    { id: 'sprint-2', name: 'AP Posting Hardening', projectId: 'proj-1', startDate: '2026-04-29', endDate: '2026-05-12', status: 'Upcoming', goal: 'Harden SAP posting, controls, and audit evidence before UAT.', capacity: 31 },
    { id: 'sprint-3', name: 'Support AI UAT', projectId: 'proj-2', startDate: '2026-04-08', endDate: '2026-04-21', status: 'Completed', goal: 'Validate draft replies and escalation triggers with support leads.', capacity: 29 },
    { id: 'sprint-4', name: 'Support AI Governance Fixes', projectId: 'proj-2', startDate: '2026-04-22', endDate: '2026-05-05', status: 'Active', goal: 'Close guardrail findings before pilot expansion.', capacity: 24 },
    { id: 'sprint-5', name: 'Onboarding Discovery', projectId: 'proj-3', startDate: '2026-04-22', endDate: '2026-05-05', status: 'Active', goal: 'Map onboarding requests, approval paths, and provisioning bottlenecks.', capacity: 26 },
];

const MONTH_END_CLOSE_LINEAGE = {
    deliveryPackId: 'pack-month-end-close',
    processId: 'proc-close-pack',
    assessmentId: 'assess-proc-close-pack',
    documentGenerationId: 'docgen-5',
    handoffLedgerEntryIds: ['handoff-close-assess-docs', 'handoff-close-docs-delivery'],
    evidenceRefs: ['ev-close-map', 'ev-close-sop', 'ev-close-sample'],
    sourceLabel: 'Month-End Close Evidence Pack',
    sourceStatus: 'Accepted',
};

export const MOCK_TASKS: Task[] = [
    { id: 'task-101', title: 'Map current invoice intake paths', description: 'Document email, supplier portal, shared drive, and manual handoff intake paths with volume split and owners.', status: 'Done', priority: 'High', type: 'Task', projectId: 'proj-1', epicId: 'epic-101', sprintId: 'sprint-1', assigneeIds: ['user-2', 'user-7'], startDate: '2026-04-15', dueDate: '2026-04-17', storyPoints: 3 },
    { id: 'task-102', title: 'Build OCR confidence threshold rules', description: 'Define confidence bands for auto-post, AP review, and vendor clarification queues.', status: 'In Progress', priority: 'High', type: 'Task', projectId: 'proj-1', epicId: 'epic-101', sprintId: 'sprint-1', assigneeIds: ['user-6'], startDate: '2026-04-18', dueDate: '2026-04-29', storyPoints: 8, dependencyIds: ['task-101'] },
    { id: 'task-103', title: 'PO match exception policy review', description: 'Review policy for PO mismatch, duplicate invoice, blocked vendor, and tax variance exceptions.', status: 'In Review', priority: 'High', type: 'Story', projectId: 'proj-1', epicId: 'epic-102', sprintId: 'sprint-1', assigneeIds: ['user-7', 'user-1'], startDate: '2026-04-19', dueDate: '2026-04-28', storyPoints: 5 },
    { id: 'task-104', title: 'SAP posting connector smoke test', description: 'Run controlled posting into SAP sandbox and capture audit evidence for approvals.', status: 'To Do', priority: 'High', type: 'Task', projectId: 'proj-1', epicId: 'epic-103', sprintId: 'sprint-2', assigneeIds: ['user-6', 'user-8'], startDate: '2026-04-29', dueDate: '2026-05-06', storyPoints: 8 },
    { id: 'task-105', title: 'Bug: duplicate invoice check misses credit memos', description: 'Credit memo documents with negative values bypass the duplicate check rule.', status: 'Blocked', priority: 'Medium', type: 'Bug', projectId: 'proj-1', epicId: 'epic-102', sprintId: 'sprint-1', assigneeIds: ['user-5', 'user-6'], reporterId: 'user-7', startDate: '2026-04-24', dueDate: '2026-04-30', storyPoints: 3 },

    { id: 'task-201', title: 'Review knowledge base gaps for top 30 intents', description: 'Identify missing or stale support policy articles before the AI assistant pilot.', status: 'Done', priority: 'High', type: 'Task', projectId: 'proj-2', epicId: 'epic-201', sprintId: 'sprint-3', assigneeIds: ['user-4', 'user-2'], startDate: '2026-04-08', dueDate: '2026-04-12', storyPoints: 5 },
    { id: 'task-202', title: 'Configure PII redaction in case summaries', description: 'Mask customer IDs, payment references, and sensitive free-text values before prompt construction.', status: 'Testing', priority: 'High', type: 'Task', projectId: 'proj-2', epicId: 'epic-201', sprintId: 'sprint-4', assigneeIds: ['user-4', 'user-8'], startDate: '2026-04-22', dueDate: '2026-04-30', storyPoints: 8 },
    { id: 'task-203', title: 'Design agent handoff banner for support reps', description: 'Show why a case needs human review and what the model already checked.', status: 'In Progress', priority: 'Medium', type: 'Task', projectId: 'proj-2', epicId: 'epic-202', sprintId: 'sprint-4', assigneeIds: ['user-3'], startDate: '2026-04-23', dueDate: '2026-05-02', storyPoints: 5 },
    { id: 'task-204', title: 'Validate escalation triggers with compliance', description: 'Confirm mandatory human handoff for refund disputes, legal threats, and vulnerable customer signals.', status: 'In Review', priority: 'High', type: 'Story', projectId: 'proj-2', epicId: 'epic-203', sprintId: 'sprint-4', assigneeIds: ['user-1', 'user-5'], startDate: '2026-04-22', dueDate: '2026-04-29', storyPoints: 5 },

    { id: 'task-301', title: 'Facilitate onboarding process discovery workshop', description: 'Run a joint HR, IT, facilities, and manager workshop to capture current delays and handoffs.', status: 'Done', priority: 'High', type: 'Task', projectId: 'proj-3', epicId: 'epic-301', sprintId: 'sprint-5', assigneeIds: ['user-2', 'user-3'], startDate: '2026-04-22', dueDate: '2026-04-24', storyPoints: 3 },
    { id: 'task-302', title: 'Draft onboarding BRD from transcript notes', description: 'Use discovery notes to generate a first BRD covering request intake, approvals, SLAs, and exceptions.', status: 'In Progress', priority: 'High', type: 'Story', projectId: 'proj-3', epicId: 'epic-301', sprintId: 'sprint-5', assigneeIds: ['user-2'], startDate: '2026-04-24', dueDate: '2026-05-01', storyPoints: 5 },
    { id: 'task-303', title: 'Prototype access provisioning checklist', description: 'Create role-based checklist rules for application access, equipment, and manager readiness.', status: 'To Do', priority: 'Medium', type: 'Task', projectId: 'proj-3', epicId: 'epic-302', sprintId: 'sprint-5', assigneeIds: ['user-8'], startDate: '2026-04-29', dueDate: '2026-05-05', storyPoints: 5 },

    { id: 'task-401', title: 'Define claims document taxonomy', description: 'Create classes for FNOL form, policy, medical bill, photo evidence, police report, and missing evidence notice.', status: 'To Do', priority: 'High', type: 'Task', projectId: 'proj-4', epicId: 'epic-401', assigneeIds: ['user-8', 'user-4'], startDate: '2026-05-01', dueDate: '2026-05-10', storyPoints: 8 },
    { id: 'task-402', title: 'Assess agent decision boundaries', description: 'Document what the agent can decide, recommend, or must escalate to an adjuster.', status: 'To Do', priority: 'High', type: 'Story', projectId: 'proj-4', epicId: 'epic-402', assigneeIds: ['user-1', 'user-4'], startDate: '2026-05-03', dueDate: '2026-05-15', storyPoints: 13 },
    { id: 'task-403', title: 'Design adjuster review queue', description: 'Create review states for high-value, low-confidence, and legally sensitive claim packets.', status: 'On Hold', priority: 'Medium', type: 'Task', projectId: 'proj-4', epicId: 'epic-403', assigneeIds: ['user-3'], startDate: '2026-05-08', dueDate: '2026-05-20', storyPoints: 5 },

    { id: 'task-501', title: 'Collect close evidence sources', description: 'Inventory reconciliation files, sign-off emails, variance comments, and system screenshots used in close.', status: 'Done', priority: 'High', type: 'Task', projectId: 'proj-5', epicId: 'epic-501', assigneeIds: ['user-7', 'user-2'], startDate: '2026-04-01', dueDate: '2026-04-05', storyPoints: 3, sourceLineage: MONTH_END_CLOSE_LINEAGE },
    { id: 'task-502', title: 'Build control pack approval checklist', description: 'Create required review items for reconciliations, material variances, and controller sign-off.', status: 'Ready for Release', priority: 'High', type: 'Story', projectId: 'proj-5', epicId: 'epic-502', assigneeIds: ['user-7', 'user-5'], startDate: '2026-04-08', dueDate: '2026-04-22', storyPoints: 8, sourceLineage: MONTH_END_CLOSE_LINEAGE },
    { id: 'task-503', title: 'Create executive close dashboard metrics', description: 'Expose close readiness, missing evidence, late approvals, and unresolved material variances.', status: 'Testing', priority: 'Medium', type: 'Task', projectId: 'proj-5', epicId: 'epic-503', assigneeIds: ['user-8'], startDate: '2026-04-16', dueDate: '2026-04-29', storyPoints: 5, sourceLineage: MONTH_END_CLOSE_LINEAGE },
];

export const MOCK_AUTOMATIONS: Automation[] = [
    { id: 'auto-1', name: 'Route low OCR confidence invoices', description: 'When a high-priority invoice validation task is blocked, add AP owner context for review.', projectId: 'proj-1', isEnabled: true, trigger: { type: 'task_status_changed', config: { toStatus: 'Blocked' } }, conditions: [{ field: 'priority', operator: 'is', value: 'Medium' }], actions: [{ id: 'action-1', type: 'add_comment', config: { comment: 'Review OCR confidence, vendor master match, and duplicate invoice rule before reprocessing.' } }] },
    { id: 'auto-2', name: 'Send testing tasks to QA owner', description: 'When delivery work enters Testing, assign Emily White and add the control checklist.', projectId: 'proj-2', isEnabled: true, trigger: { type: 'task_status_changed', config: { toStatus: 'Testing' } }, conditions: [], actions: [{ id: 'action-2a', type: 'set_assignee', config: { assigneeIds: ['user-5'] } }, { id: 'action-2b', type: 'add_comment', config: { comment: 'QA checklist: privacy redaction, human handoff, source citation, and policy alignment.' } }] },
    { id: 'auto-3', name: 'Notify transformation lead on high-priority stories', description: 'Escalate high-priority stories to Sarah Chen when they enter review.', projectId: 'proj-1', isEnabled: false, trigger: { type: 'task_status_changed', config: { toStatus: 'In Review' } }, conditions: [{ field: 'priority', operator: 'is', value: 'High' }], actions: [{ id: 'action-3', type: 'add_comment', config: { comment: '@Sarah Chen, this high-priority story is ready for process governance review.' } }] },
];

export const MOCK_TIMESHEET_ENTRIES: TimesheetEntry[] = [
    { id: 'ts-1', userId: 'user-6', taskId: 'task-102', date: '2026-04-24', hours: 7.5 },
    { id: 'ts-2', userId: 'user-6', taskId: 'task-102', date: '2026-04-25', hours: 6 },
    { id: 'ts-3', userId: 'user-7', taskId: 'task-103', date: '2026-04-25', hours: 3 },
    { id: 'ts-4', userId: 'user-4', taskId: 'task-202', date: '2026-04-24', hours: 8 },
    { id: 'ts-5', userId: 'user-3', taskId: 'task-203', date: '2026-04-26', hours: 4.5 },
    { id: 'ts-6', userId: 'user-2', taskId: 'task-302', date: '2026-04-26', hours: 5 },
    { id: 'ts-7', userId: 'user-8', taskId: 'task-503', date: '2026-04-27', hours: 6 },
];

const createArtifacts = (
    projectName: string,
    domain: string,
    summary: string,
    workItems: GeneratedArtifacts['workItems'],
): GeneratedArtifacts => ({
    ...INVOICE_PROCESSING_ARTIFACTS,
    brd: {
        title: `BRD: ${projectName}`,
        sections: [
            { key: 'executive-summary', title: 'Executive Summary', content: summary, citations: ['Discovery workshop transcript', 'Process assessment scorecard'] },
            { key: 'business-objectives', title: 'Business Objectives', content: `Improve ${domain} cycle time, reduce avoidable manual work, and provide auditable human-in-the-loop checkpoints.` },
            { key: 'scope', title: 'Scope', content: 'The initial release covers intake, validation, exception routing, approval visibility, and operational reporting.' },
        ],
    },
    pdd: {
        title: `PDD: ${projectName}`,
        sections: [
            { key: 'as-is', title: 'As-Is Process', content: 'Current work is split across email, spreadsheets, business applications, and manual status follow-ups.' },
            { key: 'to-be', title: 'To-Be Process', content: 'AvalaOS Core routes work through assessed automation decisions, generated requirements, governance review, and a managed delivery backlog.' },
            { key: 'controls', title: 'Controls and HITL', content: 'Human review remains mandatory for low-confidence inputs, policy exceptions, sensitive data, and high-impact approvals.' },
        ],
    },
    workItems,
});

export const MOCK_DOCUMENT_GENERATIONS: DocumentGeneration[] = [
    {
        id: 'docgen-1',
        projectId: 'proj-1',
        generatedAt: '2026-04-25T14:20:00.000Z',
        templateId: MOCK_DOC_TEMPLATES.find(t => t.artifactKey === 'pdd')?.id || 'pdd.v1',
        artifacts: INVOICE_PROCESSING_ARTIFACTS,
    },
    {
        id: 'docgen-2',
        projectId: 'proj-2',
        generatedAt: '2026-04-23T11:10:00.000Z',
        templateId: MOCK_DOC_TEMPLATES.find(t => t.artifactKey === 'brd')?.id || 'brd.v1',
        artifacts: createArtifacts(
            'Customer Support AI Assist',
            'support operations',
            'Customer support leaders need a governed AI assistant that summarizes cases, drafts policy-aligned responses, and escalates sensitive conversations to humans.',
            [
                { type: 'Epic', title: 'Governed AI Support Assistant', description: 'Deliver a bounded assistant for support reps.', acceptanceCriteria: ['PII is redacted before model calls', 'Draft replies cite approved policy sources'] },
                { type: 'Story', title: 'Show source citations on every draft reply', description: 'As a support rep, I need citations so I can trust the suggested answer.', acceptanceCriteria: ['Every generated reply includes at least one source link', 'Low-confidence answers require manual review'] },
            ],
        ),
    },
    {
        id: 'docgen-3',
        projectId: 'proj-3',
        generatedAt: '2026-04-26T09:45:00.000Z',
        templateId: MOCK_DOC_TEMPLATES.find(t => t.artifactKey === 'brd')?.id || 'brd.v1',
        artifacts: createArtifacts(
            'Employee Onboarding Workflow',
            'employee onboarding',
            'HR and IT need one guided workflow for onboarding requests, approvals, equipment, access provisioning, and manager readiness.',
            [
                { type: 'Epic', title: 'Onboarding Workflow Foundation', description: 'Create the intake, approval, and task orchestration foundation.', acceptanceCriteria: ['Request intake captures role, location, start date, and manager', 'Provisioning tasks are generated from role templates'] },
                { type: 'Task', title: 'Create role-based provisioning checklist', description: 'Define access and equipment rules by employee role.', acceptanceCriteria: ['Checklist supports exceptions', 'Managers can see incomplete readiness items'] },
            ],
        ),
    },
    {
        id: 'docgen-5',
        projectId: 'proj-5',
        generatedAt: '2026-04-26T18:10:00.000Z',
        templateId: MOCK_DOC_TEMPLATES.find(t => t.artifactKey === 'pdd')?.id || 'pdd.v1',
        artifacts: createArtifacts(
            'Month-End Close Control Pack',
            'finance close operations',
            'Finance owners need a governed evidence pack that references reconciliations, sign-offs, variance explanations, and close readiness metadata without exporting source document bodies.',
            [
                { type: 'Epic', title: 'Close Evidence Collection', description: 'Collect and reference close evidence sources for review.', acceptanceCriteria: ['Evidence references use IDs and summaries only', 'Owner review status is visible before handoff'] },
                { type: 'Story', title: 'Build control pack approval checklist', description: 'Create required review items for reconciliations, material variances, and controller sign-off.', acceptanceCriteria: ['Checklist includes owner, evidence reference, and status', 'Open blockers are visible in the handoff view'] },
                { type: 'Task', title: 'Create executive close dashboard metrics', description: 'Expose close readiness, missing evidence, late approvals, and unresolved material variances.', acceptanceCriteria: ['Metrics reference source systems by name only', 'No raw confidential source content is exported'] },
            ],
        ),
    },
];
