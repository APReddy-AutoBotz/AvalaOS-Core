import { User, Team, Project, Task, Epic, Sprint, Automation, TimesheetEntry, DocumentGeneration, AssessProcess, GeneratedArtifacts, ScopeType, View, AssessmentResponses, EvidenceItem, Assumption, ProductModuleKey, Assessment, HandoffLedgerEntry } from '../types';
import { MOCK_DOC_TEMPLATES } from './docTemplates';
import { calculateAssessmentScores } from '../services/scoringEngine';
import { buildAvalaGovernLiteCard } from '../services/avalaGovernLiteService';
import { buildAssessToStudioHandoffPayload } from '../services/assessToStudioHandoff';
import { buildDocsToDeliveryLineage } from '../services/docsToDeliveryLineage';

export const CANONICAL_DEMO_ORG_ID = 'org-1';
export const CANONICAL_DEMO_ORG_NAME = 'Avala Demo Enterprise';
export const CANONICAL_DEMO_ORG_SLUG = 'avala-demo-enterprise';
export const CANONICAL_DEMO_ENABLED_MODULES: ProductModuleKey[] = ['assess', 'docs', 'delivery', 'monitor'];
export const CANONICAL_AP_PROCESS_ID = 'proc-ap-invoice-exception';
export const CANONICAL_AP_ASSESSMENT_ID = `assess-${CANONICAL_AP_PROCESS_ID}`;
export const CANONICAL_AP_PROCESS_NAME = 'AP Invoice Exception Handling';
export const CANONICAL_AP_WORKFLOW_NAME = 'AP Invoice Exception Workflow';
export const CANONICAL_AP_PROJECT_ID = 'proj-ap-invoice-exception';
export const CANONICAL_AP_DOCUMENT_GENERATION_ID = 'docgen-ap-invoice-exception';
export const CANONICAL_AP_DELIVERY_PACK_ID = 'pack-ap-invoice-exception';
export const CANONICAL_AP_HANDOFF_ASSESS_DOCS_ID = 'handoff-ap-assess-docs';
export const CANONICAL_AP_HANDOFF_DOCS_DELIVERY_ID = 'handoff-ap-docs-delivery';
export const CANONICAL_AP_STUDIO_GENERATED_AT = '2026-06-10T14:20:00.000Z';

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
        description: 'Review deterministic scores, evidence, assumptions, Decision Pack content, and Avala Govern controls.',
        accent: 'from-emerald-500 to-teal-500',
        recommendedFor: 'Business owner',
    },
    {
        userId: 'user-9',
        password: 'demo123',
        label: 'Delivery Lead',
        description: 'Review AP work items, source lineage, Delivery Pack readiness, and Monitor status for the canonical workflow.',
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
    {
        id: CANONICAL_AP_PROJECT_ID,
        name: CANONICAL_AP_WORKFLOW_NAME,
        description: 'Governed delivery plan for AP invoice exceptions covering vendor master mismatch review, PO/GRN matching, owner approval routing, evidence capture, and Monitor readiness.',
        ownerId: 'user-9',
        lifecycleStage: 'Development',
        healthStatus: 'On Track',
    },
];

export const CANONICAL_AP_PROCESS: AssessProcess = {
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
};

export const MOCK_ASSESS_PROCESSES: AssessProcess[] = [CANONICAL_AP_PROCESS];

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

export const CANONICAL_AP_ASSESSMENT_METADATA: Assessment['metadata'] = {
    completionQuality: 100,
    templateFit: true,
    lastSavedAt: CANONICAL_AP_PROCESS.updatedAt,
    stakeholderCoverage: 4,
    evidenceQuality: 5,
    assumptionQuality: 5,
};

export const CANONICAL_AP_ASSESSMENT_SCORES = calculateAssessmentScores(
    CANONICAL_AP_ASSESSMENT_RESPONSES,
    CANONICAL_AP_ASSESSMENT_METADATA,
    {
        assessmentId: CANONICAL_AP_ASSESSMENT_ID,
        processId: CANONICAL_AP_PROCESS.id,
        organizationId: CANONICAL_AP_PROCESS.orgId,
        processName: CANONICAL_AP_PROCESS.name,
        processDescription: CANONICAL_AP_PROCESS.description,
        department: CANONICAL_AP_PROCESS.department,
        evidenceItems: CANONICAL_AP_EVIDENCE_ITEMS,
        assumptions: CANONICAL_AP_ASSUMPTIONS,
        status: 'Approved',
    },
);

export const CANONICAL_AP_ASSESSMENT: Assessment = {
    id: CANONICAL_AP_ASSESSMENT_ID,
    processId: CANONICAL_AP_PROCESS.id,
    orgId: CANONICAL_AP_PROCESS.orgId,
    status: 'Approved',
    metadata: CANONICAL_AP_ASSESSMENT_METADATA,
    responses: CANONICAL_AP_ASSESSMENT_RESPONSES,
    evidenceItems: CANONICAL_AP_EVIDENCE_ITEMS,
    assumptions: CANONICAL_AP_ASSUMPTIONS,
    completionBySection: {
        processStructure: 100,
        workPattern: 100,
        dataProfile: 100,
        judgment: 100,
        systems: 100,
        risk: 100,
        evidenceAndAssumptions: 100,
    },
    review: {
        lastReviewedBy: 'user-7',
        lastReviewedAt: '2026-04-25T16:00:00.000Z',
        comments: [
            {
                id: 'review-ap-owner-approval',
                authorId: 'user-7',
                authorName: 'Priya Nair',
                type: 'Approval',
                message: 'AP process owner approval recorded for demo source context; finance owner review remains required before posting, payment release, vendor communication, or external action.',
                createdAt: '2026-04-25T16:00:00.000Z',
                resolved: true,
                linkedField: 'judgment.humanApprovalBeforeAction',
            },
        ],
        approvalHistory: [
            {
                id: 'approval-ap-owner',
                status: 'Approved',
                actorId: 'user-7',
                actorName: 'Priya Nair',
                reason: 'Canonical demo assessment is approved for governed Studio drafting and delivery planning only.',
                createdAt: '2026-04-25T16:00:00.000Z',
            },
        ],
    },
    scores: CANONICAL_AP_ASSESSMENT_SCORES,
};

export const CANONICAL_AP_GOVERN_LITE_CARD = buildAvalaGovernLiteCard(CANONICAL_AP_ASSESSMENT, CANONICAL_AP_PROCESS);

const requireCanonicalStudioSourceContext = () => {
    const payload = buildAssessToStudioHandoffPayload({
        process: CANONICAL_AP_PROCESS,
        assessment: CANONICAL_AP_ASSESSMENT,
        governCard: CANONICAL_AP_GOVERN_LITE_CARD,
        createdAt: '2026-04-25T16:15:00.000Z',
    });
    if (!payload) throw new Error('Canonical AP Studio source context could not be built.');
    return payload;
};

export const CANONICAL_AP_STUDIO_SOURCE_CONTEXT = requireCanonicalStudioSourceContext();

const CANONICAL_AP_GENERATED_WORK_ITEMS: GeneratedArtifacts['workItems'] = [
    {
        type: 'Epic',
        title: 'AP Invoice Exception Workflow Foundation',
        description: 'Create the governed workflow foundation for invoice exceptions, owner review, evidence capture, and SAP handoff readiness.',
        acceptanceCriteria: [
            'Work item candidates trace to the AP assessment, Decision Pack, Handoff Pack, and evidence refs.',
            'Finance owner review remains required before posting, payment release, vendor communication, or external action.',
        ],
    },
    {
        type: 'Story',
        title: 'Route PO mismatch exceptions to AP owner review',
        description: 'Route PO/GRN mismatch and tax variance exceptions into an AP owner review queue with evidence and status context.',
        acceptanceCriteria: [
            'Exception route captures invoice, PO, vendor, and policy evidence reference IDs.',
            'AP owner review state is visible before any downstream handoff.',
        ],
    },
    {
        type: 'Story',
        title: 'Validate duplicate invoice and blocked vendor checks',
        description: 'Define duplicate invoice, blocked vendor, and vendor master mismatch checks with human review for ambiguous cases.',
        acceptanceCriteria: [
            'Duplicate and blocked-vendor checks reference the AP policy evidence ID.',
            'Ambiguous cases stay in review until the finance owner records a decision.',
        ],
    },
    {
        type: 'Task',
        title: 'Configure SAP posting handoff evidence',
        description: 'Prepare SAP sandbox handoff evidence and control notes for review by delivery and finance owners.',
        acceptanceCriteria: [
            'Handoff evidence references the SAP sample and exception handling SOP.',
            'No raw customer source content is included in the generated artifact.',
        ],
    },
    {
        type: 'Task',
        title: 'Add exception aging monitor signal',
        description: 'Add a demo readiness signal for exception aging, review queue status, and handoff evidence counts.',
        acceptanceCriteria: [
            'Monitor signal is presented as demo readiness content, not live production telemetry.',
            'Signal derives from AP delivery tasks and handoff metadata already in the demo fixture.',
        ],
    },
];

export const CANONICAL_AP_DOCUMENT_ARTIFACTS: GeneratedArtifacts = {
    brd: {
        title: `BRD: ${CANONICAL_AP_PROCESS_NAME}`,
        sections: [
            {
                key: 'executive-summary',
                title: 'Executive Summary',
                content: 'This review artifact summarizes the AP Invoice Exception Handling opportunity for human review. It uses the completed Avala Assess record, evidence refs, and assumptions to align finance owners and delivery teams before downstream work begins.',
                citations: ['ev-ap-exception-report', 'ev-ap-owner-review'],
            },
            {
                key: 'business-objectives',
                title: 'Business Objectives',
                content: 'Reduce exception aging, route PO/GRN and vendor master mismatches consistently, and preserve owner approval before payment release, posting, or vendor communication.',
                citations: ['as-ap-volume', 'as-ap-controls'],
            },
            {
                key: 'scope',
                title: 'Scope And Review Boundary',
                content: 'The demo scope covers invoice exception intake, evidence-backed triage, owner review, SAP handoff readiness, and Monitor readiness signals. It does not represent a production execution path or a compliance approval.',
                citations: ['ev-ap-sop', 'ev-ap-po-policy'],
            },
        ],
    },
    pdd: {
        title: `PDD: ${CANONICAL_AP_PROCESS_NAME}`,
        sections: [
            {
                key: 'as-is',
                title: 'As-Is Process',
                content: 'AP analysts triage invoice exceptions across intake queues, SAP payment-block views, vendor master checks, and policy references before escalating ambiguous cases to the AP process owner.',
                citations: ['ev-ap-exception-map', 'ev-ap-sap-sample'],
            },
            {
                key: 'to-be',
                title: 'To-Be Process',
                content: 'A governed queue classifies exceptions, attaches evidence reference IDs, and routes owner-review cases before delivery handoff or SAP posting preparation.',
                citations: ['ev-ap-sop', 'ev-ap-po-policy'],
            },
            {
                key: 'controls',
                title: 'Controls And Human Review',
                content: 'Finance owner review remains mandatory for posting, payment release, vendor communication, and delivery handoff decisions. Generated documents remain review artifacts.',
                citations: ['ev-ap-owner-review', 'as-ap-controls'],
            },
        ],
    },
    frd: {
        title: `FRD: ${CANONICAL_AP_PROCESS_NAME}`,
        sections: [
            {
                key: 'functional-requirements',
                title: 'Functional Requirements',
                content: 'Capture invoice exception category, vendor master state, PO/GRN match result, tax variance indicator, evidence reference IDs, review owner, and handoff status.',
                citations: ['ev-ap-exception-report', 'ev-ap-po-policy'],
            },
            {
                key: 'workflow-requirements',
                title: 'Workflow Requirements',
                content: 'Route exceptions to AP owner review, capture rationale, retain source evidence refs, and create delivery work item candidates with read-only lineage.',
                citations: ['ev-ap-owner-review', 'as-ap-controls'],
            },
            {
                key: 'monitor-requirements',
                title: 'Monitor Requirements',
                content: 'Show demo readiness status for exception aging, open review items, evidence refs, and handoff metadata. These are seeded demo signals, not live production analytics.',
                citations: ['as-ap-data-quality', 'ev-ap-exception-report'],
            },
        ],
    },
    qualityGate: {
        title: `Quality Gate: ${CANONICAL_AP_PROCESS_NAME}`,
        ambiguityPoints: [
            'Confirm whether tax variance thresholds differ by geography before pilot configuration.',
            'Confirm SAP sandbox access owner before any implementation validation.',
        ],
        gapPoints: [
            'Generated artifacts require AP owner and control reviewer sign-off before export or downstream delivery reliance.',
        ],
    },
    diagrams: {
        asIs: {
            title: 'As-Is AP Exception Flow',
            mermaidCode: 'flowchart LR\n  Intake[Invoice intake] --> Match[PO/GRN and vendor checks]\n  Match --> Exception[Exception queue]\n  Exception --> Owner[AP owner review]\n  Owner --> SAP[SAP payment-block update]',
        },
        toBe: {
            title: 'To-Be Governed AP Exception Flow',
            mermaidCode: 'flowchart LR\n  Assess[Avala Assess source] --> Studio[Avala Studio review artifacts]\n  Studio --> Delivery[Delivery work items with lineage]\n  Delivery --> Pack[Delivery Pack review]\n  Pack --> Monitor[Avala Monitor demo readiness]',
        },
    },
    workItems: CANONICAL_AP_GENERATED_WORK_ITEMS,
    approvals: [
        {
            userId: 'user-7',
            role: 'Accountable',
            status: 'Pending',
            approvedAt: null,
            comments: 'AP owner must review generated documents before export or downstream reliance.',
        },
        {
            userId: 'user-5',
            role: 'Consulted',
            status: 'Pending',
            approvedAt: null,
            comments: 'Control reviewer must confirm evidence refs and UAT/control checkpoints.',
        },
    ],
    sourceContext: CANONICAL_AP_STUDIO_SOURCE_CONTEXT,
};

const createCanonicalSourceLineage = (workItem: GeneratedArtifacts['workItems'][number]) => ({
    ...buildDocsToDeliveryLineage({
        artifacts: CANONICAL_AP_DOCUMENT_ARTIFACTS,
        generationId: CANONICAL_AP_DOCUMENT_GENERATION_ID,
        workItem,
        createdAt: CANONICAL_AP_STUDIO_GENERATED_AT,
        handoffLedgerEntryIds: [CANONICAL_AP_HANDOFF_ASSESS_DOCS_ID, CANONICAL_AP_HANDOFF_DOCS_DELIVERY_ID],
    }),
    deliveryPackId: CANONICAL_AP_DELIVERY_PACK_ID,
});

export const CANONICAL_AP_HANDOFF_LEDGER_ENTRIES: HandoffLedgerEntry[] = [
    {
        id: CANONICAL_AP_HANDOFF_ASSESS_DOCS_ID,
        orgId: CANONICAL_DEMO_ORG_ID,
        fromModule: 'assess',
        toModule: 'docs',
        status: 'Accepted',
        sourceType: 'Assessment',
        sourceId: CANONICAL_AP_ASSESSMENT_ID,
        targetType: 'Document Generation',
        targetId: CANONICAL_AP_DOCUMENT_GENERATION_ID,
        title: `${CANONICAL_AP_PROCESS_NAME} Assess to Studio handoff`,
        summary: 'Accepted demo handoff from completed Assess source context to the canonical governed document pack.',
        createdAt: '2026-04-25T16:15:00.000Z',
        createdBy: 'user-2',
        evidenceRefs: CANONICAL_AP_STUDIO_SOURCE_CONTEXT.evidenceRefs.map(ref => ref.id),
        metadata: {
            processId: CANONICAL_AP_PROCESS_ID,
            assessmentId: CANONICAL_AP_ASSESSMENT_ID,
            documentGenerationId: CANONICAL_AP_DOCUMENT_GENERATION_ID,
            scoreVersion: CANONICAL_AP_ASSESSMENT_SCORES.scoreVersion,
            sourceLabel: CANONICAL_AP_STUDIO_SOURCE_CONTEXT.sourceLabel,
        },
    },
    {
        id: CANONICAL_AP_HANDOFF_DOCS_DELIVERY_ID,
        orgId: CANONICAL_DEMO_ORG_ID,
        fromModule: 'docs',
        toModule: 'delivery',
        status: 'Accepted',
        sourceType: 'Document Generation',
        sourceId: CANONICAL_AP_DOCUMENT_GENERATION_ID,
        targetType: 'Project',
        targetId: CANONICAL_AP_PROJECT_ID,
        title: `${CANONICAL_AP_WORKFLOW_NAME} Docs to Delivery handoff`,
        summary: 'Accepted demo handoff from the generated review artifact pack to delivery work items with source lineage and evidence refs.',
        createdAt: '2026-06-10T14:35:00.000Z',
        createdBy: 'user-2',
        evidenceRefs: CANONICAL_AP_STUDIO_SOURCE_CONTEXT.evidenceRefs.map(ref => ref.id),
        metadata: {
            processId: CANONICAL_AP_PROCESS_ID,
            assessmentId: CANONICAL_AP_ASSESSMENT_ID,
            documentGenerationId: CANONICAL_AP_DOCUMENT_GENERATION_ID,
            projectId: CANONICAL_AP_PROJECT_ID,
            deliveryPackId: CANONICAL_AP_DELIVERY_PACK_ID,
        },
    },
];

export const MOCK_EPICS: Epic[] = [
    { id: 'epic-ap-foundation', name: 'AP Invoice Exception Workflow Foundation', projectId: CANONICAL_AP_PROJECT_ID, color: '#0F766E' },
    { id: 'epic-ap-controls', name: 'AP Exception Controls and Evidence', projectId: CANONICAL_AP_PROJECT_ID, color: '#D97706' },
    { id: 'epic-ap-monitor', name: 'AP Monitor Readiness', projectId: CANONICAL_AP_PROJECT_ID, color: '#2563EB' },
];

export const MOCK_SPRINTS: Sprint[] = [
    { id: 'sprint-ap-1', name: 'AP Exception Foundation Review', projectId: CANONICAL_AP_PROJECT_ID, startDate: '2026-06-10', endDate: '2026-06-24', status: 'Active', goal: 'Review canonical AP exception work items, evidence refs, source lineage, and Delivery Pack readiness.', capacity: 30 },
    { id: 'sprint-ap-2', name: 'AP Monitor Readiness Review', projectId: CANONICAL_AP_PROJECT_ID, startDate: '2026-06-25', endDate: '2026-07-08', status: 'Upcoming', goal: 'Validate Monitor readiness signals and handoff evidence review before buyer-demo rehearsal.', capacity: 24 },
];

export const MOCK_TASKS: Task[] = [
    {
        id: 'task-ap-101',
        title: 'Route PO mismatch exceptions to AP owner review',
        description: 'Configure the AP owner review path for PO/GRN mismatch and tax variance exceptions, using evidence refs and owner rationale before handoff.',
        status: 'In Review',
        priority: 'High',
        type: 'Story',
        projectId: CANONICAL_AP_PROJECT_ID,
        epicId: 'epic-ap-foundation',
        sprintId: 'sprint-ap-1',
        assigneeIds: ['user-7', 'user-2'],
        reporterId: 'user-2',
        startDate: '2026-06-10',
        dueDate: '2026-06-18',
        storyPoints: 5,
        sourceLineage: createCanonicalSourceLineage(CANONICAL_AP_GENERATED_WORK_ITEMS[1]),
    },
    {
        id: 'task-ap-102',
        title: 'Validate duplicate invoice and blocked vendor checks',
        description: 'Define duplicate invoice, blocked vendor, and vendor master mismatch checks with AP reviewer rationale for ambiguous cases.',
        status: 'In Progress',
        priority: 'High',
        type: 'Story',
        projectId: CANONICAL_AP_PROJECT_ID,
        epicId: 'epic-ap-controls',
        sprintId: 'sprint-ap-1',
        assigneeIds: ['user-5', 'user-6'],
        reporterId: 'user-7',
        startDate: '2026-06-11',
        dueDate: '2026-06-21',
        storyPoints: 8,
        dependencyIds: ['task-ap-101'],
        sourceLineage: createCanonicalSourceLineage(CANONICAL_AP_GENERATED_WORK_ITEMS[2]),
    },
    {
        id: 'task-ap-103',
        title: 'Configure SAP posting handoff evidence',
        description: 'Prepare SAP sandbox handoff evidence and review notes for AP and delivery owners without exposing raw customer source content.',
        status: 'Testing',
        priority: 'Medium',
        type: 'Task',
        projectId: CANONICAL_AP_PROJECT_ID,
        epicId: 'epic-ap-controls',
        sprintId: 'sprint-ap-1',
        assigneeIds: ['user-6', 'user-8'],
        reporterId: 'user-9',
        startDate: '2026-06-12',
        dueDate: '2026-06-24',
        storyPoints: 5,
        dependencyIds: ['task-ap-102'],
        sourceLineage: createCanonicalSourceLineage(CANONICAL_AP_GENERATED_WORK_ITEMS[3]),
    },
    {
        id: 'task-ap-104',
        title: 'Add exception aging monitor signal',
        description: 'Seed a demo readiness signal for exception aging, review queue status, evidence count, and handoff metadata using AP delivery data.',
        status: 'Ready for Release',
        priority: 'Medium',
        type: 'Task',
        projectId: CANONICAL_AP_PROJECT_ID,
        epicId: 'epic-ap-monitor',
        sprintId: 'sprint-ap-2',
        assigneeIds: ['user-9', 'user-1'],
        reporterId: 'user-2',
        startDate: '2026-06-18',
        dueDate: '2026-06-28',
        storyPoints: 3,
        dependencyIds: ['task-ap-101', 'task-ap-103'],
        sourceLineage: createCanonicalSourceLineage(CANONICAL_AP_GENERATED_WORK_ITEMS[4]),
    },
    {
        id: 'task-ap-105',
        title: 'Review AP workflow foundation with control reviewer',
        description: 'Confirm BRD, PDD, FRD, evidence refs, assumptions, and delivery work item lineage before the buyer-demo rehearsal.',
        status: 'Done',
        priority: 'High',
        type: 'Task',
        projectId: CANONICAL_AP_PROJECT_ID,
        epicId: 'epic-ap-foundation',
        sprintId: 'sprint-ap-1',
        assigneeIds: ['user-5', 'user-7'],
        reporterId: 'user-9',
        startDate: '2026-06-10',
        dueDate: '2026-06-13',
        storyPoints: 3,
        sourceLineage: createCanonicalSourceLineage(CANONICAL_AP_GENERATED_WORK_ITEMS[0]),
    },
];

export const MOCK_AUTOMATIONS: Automation[] = [
    { id: 'auto-ap-1', name: 'Flag AP evidence review on blocked work', description: 'When AP delivery work is blocked, add AP owner context for evidence and control review.', projectId: CANONICAL_AP_PROJECT_ID, isEnabled: true, trigger: { type: 'task_status_changed', config: { toStatus: 'Blocked' } }, conditions: [{ field: 'priority', operator: 'is', value: 'High' }], actions: [{ id: 'action-ap-1', type: 'add_comment', config: { comment: 'Review AP evidence refs, owner rationale, vendor master status, and handoff traceability before rework.' } }] },
    { id: 'auto-ap-2', name: 'Notify control reviewer on AP testing', description: 'When AP work enters Testing, assign Emily White and add the control checklist.', projectId: CANONICAL_AP_PROJECT_ID, isEnabled: true, trigger: { type: 'task_status_changed', config: { toStatus: 'Testing' } }, conditions: [], actions: [{ id: 'action-ap-2a', type: 'set_assignee', config: { assigneeIds: ['user-5'] } }, { id: 'action-ap-2b', type: 'add_comment', config: { comment: 'Control checklist: evidence refs, owner approval, SAP sandbox note, and Monitor readiness signal.' } }] },
    { id: 'auto-ap-3', name: 'Notify buyer viewer on AP review readiness', description: 'Escalate high-priority AP stories to Sarah Chen when they enter review.', projectId: CANONICAL_AP_PROJECT_ID, isEnabled: false, trigger: { type: 'task_status_changed', config: { toStatus: 'In Review' } }, conditions: [{ field: 'priority', operator: 'is', value: 'High' }], actions: [{ id: 'action-ap-3', type: 'add_comment', config: { comment: '@Sarah Chen, this high-priority AP story is ready for buyer-demo review.' } }] },
];

export const MOCK_TIMESHEET_ENTRIES: TimesheetEntry[] = [
    { id: 'ts-ap-1', userId: 'user-6', taskId: 'task-ap-102', date: '2026-06-12', hours: 6.5 },
    { id: 'ts-ap-2', userId: 'user-7', taskId: 'task-ap-101', date: '2026-06-13', hours: 2 },
    { id: 'ts-ap-3', userId: 'user-5', taskId: 'task-ap-105', date: '2026-06-13', hours: 3 },
    { id: 'ts-ap-4', userId: 'user-9', taskId: 'task-ap-104', date: '2026-06-14', hours: 4 },
];

export const MOCK_DOCUMENT_GENERATIONS: DocumentGeneration[] = [
    {
        id: CANONICAL_AP_DOCUMENT_GENERATION_ID,
        projectId: CANONICAL_AP_PROJECT_ID,
        generatedAt: CANONICAL_AP_STUDIO_GENERATED_AT,
        templateId: MOCK_DOC_TEMPLATES.find(t => t.artifactKey === 'pdd')?.id || 'pdd.v1',
        artifacts: CANONICAL_AP_DOCUMENT_ARTIFACTS,
    },
];
