export enum ScopeType {
    MY_WORK = 'my_work',
    TEAM = 'team',
    PROJECT = 'project',
    ORGANIZATION = 'organization',
}

// ===================================
// ORGANIZATION & PLATFORM FOUNDATION
// ===================================

export type SubscriptionTier = 'Free_Trial' | 'Premium' | 'Enterprise';
export type OrgRole = 'Buyer' | 'Contributor' | 'Reviewer' | 'Admin';
export type ProductModuleKey = 'assess' | 'docs' | 'delivery' | 'monitor';
export type HandoffStatus = 'Draft' | 'Submitted' | 'Accepted' | 'Completed' | 'Blocked';
export type HandoffSourceType = 'Assessment' | 'Decision Pack' | 'Document Generation' | 'Work Items' | 'Project' | 'Manual';

export interface SubscriptionPolicy {
    maxOrgs: number;
    maxProcesses: number;
    maxTemplates: number;
    reportVisibility: 'Truncated' | 'Full';
    hasExport: boolean;
}

export interface CompanyProfile {
    industry: string;
    size: string; // e.g., '1-50', '51-200', '201-1000', '1000+'
    geography: string;
    strategicGoals: string;
}

export interface OrgMember {
    userId: string;
    role: OrgRole;
}

export interface Organization {
    id: string;
    name: string;
    profile: CompanyProfile;
    subscriptionTier: SubscriptionTier;
    members: OrgMember[];
    enabledModules?: ProductModuleKey[];
}

export interface EnterpriseWorkspace {
    id: string;
    organizationId: string;
    name: string;
}

export interface TenantContextProjection {
    userId: string;
    organizationId: string;
    organizationName: string;
    workspaceId: string;
    workspaceName: string;
    authorizationVersion: number;
    capabilities: string[];
}

export type EnterpriseSessionState =
    | 'loading'
    | 'ready'
    | 'empty'
    | 'error'
    | 'offline'
    | 'stale'
    | 'revoked'
    | 'blocked'
    | 'expired_session'
    | 'read_only';

export interface AuditLogEntry {
    id: string;
    orgId: string;
    userId: string;
    action: string;
    entityId: string;
    oldValues?: Record<string, any>;
    newValues?: Record<string, any>;
    timestamp: string; // ISO 8601
}

export interface HandoffLedgerEntry {
    id: string;
    orgId: string;
    fromModule: ProductModuleKey;
    toModule: ProductModuleKey;
    status: HandoffStatus;
    sourceType: HandoffSourceType;
    sourceId: string;
    targetType?: HandoffSourceType;
    targetId?: string;
    title: string;
    summary: string;
    createdAt: string;
    createdBy: string;
    evidenceRefs: string[];
    metadata?: Record<string, string | number | boolean | string[] | undefined>;
}

// ===================================
// ASSESS PROCESS TYPES
// ===================================

export type AssessStatus =
    | 'Not Started'
    | 'Draft'
    | 'Ready for Review'
    | 'In Review'
    | 'Changes Requested'
    | 'Approved'
    | 'Rejected'
    | 'Handed Off to Docs'
    | 'Handed Off to Delivery'
    | 'Archived'
    | 'Recalculation Required'
    | 'Completed';
export type CriticalityLevel = 'Low' | 'Medium' | 'High' | 'Critical';

export interface AssessProcess {
    id: string;
    orgId: string;
    workspaceId?: string;
    name: string;
    description: string;
    ownerId: string;
    department: string;
    criticality: CriticalityLevel;
    status: AssessStatus;
    templateId?: string;
    createdAt: string;
    updatedAt: string;
}

export interface ProcessTemplate {
    id: string;
    family: string; // e.g., 'Procure-to-Pay'
    name: string;
    description: string;
    defaultFields: Record<string, any>;
    protectedScoringFields: string[]; // Fields that cannot be removed
    defaultRisks: string[];
    recommendationHints: string[];
    systemContextLayer: string[]; // e.g. ['SAP', 'Outlook']
    optionalCustomFields: string[];
}

export interface TemplatePack {
    id: string;
    name: string;
    description: string;
    templates: ProcessTemplate[];
    isPremium: boolean;
}

export type AssessmentSectionKey = 'processStructure' | 'workPattern' | 'dataProfile' | 'judgment' | 'systems' | 'risk' | 'evidenceAndAssumptions';

export interface EvidenceItem {
    id: string;
    type:
        | 'Process Map'
        | 'SOP'
        | 'System Screenshot'
        | 'Sample Transaction'
        | 'Export Report'
        | 'System Log'
        | 'Time Study'
        | 'Meeting Transcript'
        | 'Policy Document'
        | 'Control Document'
        | 'Exception Report'
        | 'Business Case File'
        | 'Other';
    description: string;
    url?: string;
    owner?: string;
    sensitivity?: 'Public' | 'Internal' | 'Confidential' | 'Restricted';
    linkedField?: string;
}

export interface Assumption {
    id: string;
    category:
        | 'Volume'
        | 'Time/Motion'
        | 'Cost'
        | 'Risk'
        | 'System Access'
        | 'API Availability'
        | 'Governance'
        | 'Data Quality'
        | 'Timeline';
    description: string;
    confidence?: number;
    owner?: string;
    reviewDate?: string;
    validated?: boolean;
    linkedField?: string;
}

export interface AssessmentResponses {
    processStructure: {
        standardization?: number;
        ruleDeterminism?: number;
        exceptionPredictability?: number;
        processMaturity?: number;
        sopAvailability?: number;
        processMapAvailability?: number;
        processVariants?: number;
        handoffs?: number;
        manualSteps?: number;
        approvalSteps?: number;
        processStability?: number;
        changeFrequency?: number;
        bottlenecks?: string;
    };
    workPattern: {
        volume?: number;
        rawVolumeValue?: number;
        rawVolumePeriod?: 'Day' | 'Week' | 'Month' | 'Year';
        manualEffort?: number;
        rawEffortValue?: number;
        rawEffortUnit?: 'Minutes' | 'Hours';
        reworkPain?: number;
        cycleTimePain?: number;
        averageCycleTimeHours?: number;
        waitTimePercentage?: number;
        reworkFrequency?: number;
        reworkEffortHours?: number;
        fteInvolved?: number;
        averageHourlyCost?: number;
        customerImpact?: number;
        expectedBenefitConfidence?: number;
    };
    dataProfile: {
        inputStructure?: number;
        unstructuredLoad?: number;
        dataSensitivity?: number;
        dataQuality?: number;
        dataAvailability?: number;
        dataOwnershipClarity?: number;
        sourceOfTruthClarity?: number;
        historicalDataAvailability?: number;
        labelledTrainingData?: number;
        piiOrFinancialData?: boolean;
        retentionConstraints?: boolean;
    };
    judgment: {
        judgmentIntensity?: number;
        goalAmbiguity?: number;
        domainExpertiseRequired?: number;
        decisionSubjectivity?: number;
        exceptionComplexity?: number;
        humanInterpretationRequired?: number;
        hallucinationTolerance?: number;
        falsePositiveTolerance?: number;
        falseNegativeTolerance?: number;
        explainabilityNeed?: number;
        reviewerRationaleNeed?: number;
        autonomyLevel?: number;
        autonomousExecutionAllowed?: boolean;
        externalCommunicationAllowed?: boolean;
        humanApprovalBeforeAction?: boolean;
        rollbackPossible?: boolean;
        killSwitchRequired?: boolean;
        realTimeMonitoringRequired?: boolean;
    };
    systems: {
        systemReadiness?: number;
        orchestrationComplexity?: number;
        primarySystems?: string;
        secondarySystems?: string;
        apiAvailability?: number;
        apiQuality?: number;
        uiStability?: number;
        authenticationComplexity?: number;
        accessRestrictions?: number;
        testSystemAvailability?: number;
        sandboxAvailability?: number;
        integrationOwnership?: number;
        realTimeNeed?: boolean;
        externalPartyDependency?: boolean;
        vendorDependency?: boolean;
        loggingAvailability?: number;
    };
    risk: {
        riskCriticality?: number;
        governanceSensitivity?: number;
        errorReversibility?: number;
        regulatoryExposure?: number;
        auditRequirement?: number;
        financialImpactRisk?: number;
        legalImpactRisk?: number;
        customerImpactRisk?: number;
        employeeImpactRisk?: number;
        vulnerableUserImpact?: number;
        biasFairnessConcern?: number;
        securityConcern?: number;
        promptInjectionExposure?: number;
        modelDriftConcern?: number;
        thirdPartyModelRisk?: number;
    };
}

export interface AssessmentReviewState {
    reviewerNotes?: Partial<Record<AssessmentSectionKey, string>>;
    checkpoints?: Record<string, boolean>;
    overrideReason?: string;
    lastReviewedBy?: string;
    lastReviewedAt?: string;
    comments?: AssessmentReviewComment[];
    approvalHistory?: AssessmentApprovalEvent[];
    overrideReasons?: AssessmentApprovalEvent[];
    lockedAt?: string;
    lockedBy?: string;
    lockReason?: string;
}

export type AssessmentReviewCommentType = 'Comment' | 'Change Request' | 'Approval' | 'Rejection' | 'Override' | 'Handoff';

export interface AssessmentReviewComment {
    id: string;
    section?: AssessmentSectionKey;
    authorId: string;
    authorName?: string;
    type: AssessmentReviewCommentType;
    message: string;
    createdAt: string;
    resolved?: boolean;
    linkedField?: string;
}

export interface AssessmentApprovalEvent {
    id: string;
    status: AssessStatus;
    actorId: string;
    actorName?: string;
    reason?: string;
    createdAt: string;
}

// ===================================
// SCORING ENGINE TYPES (Module 4)
// ===================================

export type GatingOutcome =
    | 'Needs Discovery'
    | 'Process Redesign First'
    | 'Monitor / Deprioritize'
    | 'Deprioritize'
    | 'Human-Led / Do Not Automate'
    | 'Human-Led'
    | 'Governance Review Required'
    | 'No-Go';

export type RiskTier = 'Minimal' | 'Limited' | 'Moderate' | 'High' | 'Unacceptable';
export type GateDecision = 'Go' | 'Conditional Go' | 'No-Go' | 'Needs Discovery' | 'Governance Review Required' | 'Redesign First';
export type ConfidenceBand = 'Very Low' | 'Low' | 'Medium' | 'High' | 'Very High';
export type PriorityTier =
    | 'Tier 1 - Strategic Quick Win'
    | 'Tier 2 - Standard Backlog'
    | 'Tier 3 - Monitor / Deprioritize'
    | 'Blocked - Needs Discovery'
    | 'Blocked - Governance Risk'
    | 'Blocked - Redesign First';
export type HandoffEligibility =
    | 'Ready for Docs'
    | 'Ready for Delivery'
    | 'Ready for Docs, Not Delivery'
    | 'Needs Discovery'
    | 'Needs Governance Review'
    | 'Needs Technical Review'
    | 'Needs Process Redesign'
    | 'Not Eligible';

export interface EngineOutput {
    engine: string;
    engineVersion: string;
    inputHash: string;
    output: Record<string, unknown>;
    createdAt: string;
}

export interface TechnologyFitScores {
    RPA: number;
    APIAutomation: number;
    Workflow: number;
    GenAI: number;
    RAG: number;
    DocumentIntelligence: number;
    Agentic: number;
    HITLControlTower: number;
    ProcessRedesign: number;
    HumanLed: number;
}

export interface OperatingModelRecommendation {
    category: string;
    primaryTechnology: string;
    secondaryTechnology?: string;
    executionLayer: string;
    controlLayer: string;
    governanceLayer: string;
    requiredHumanOversight: string;
    notRecommendedTechnologies: string[];
    whyThis: string[];
    whyNotOthers: string[];
    cautionNotes: string[];
    nextActions: string[];
}

export interface BusinessValueSummary {
    rawValueScore: number;
    annualVolume: number;
    avgEffortHoursPerCase: number;
    annualManualEffortHours: number;
    annualEffortSavedHours: number;
    averageHourlyCost: number;
    annualLaborCost: number;
    estimatedAnnualSavings: number;
    estimatedBuildCost: number;
    estimatedAnnualRunCost: number;
    estimatedNetFirstYearSavings: number;
    paybackBand: 'Less than 3 months' | '3 to 6 months' | '6 to 12 months' | '12+ months' | 'Not enough data';
    buildComplexity: 'Low' | 'Medium' | 'High' | 'Very High';
    runComplexity: 'Low' | 'Medium' | 'High' | 'Very High';
    roiConfidence: ConfidenceBand;
}

export interface GovernanceSummary {
    riskTier: RiskTier;
    gateDecision: GateDecision;
    requiredApprovalLevel: string;
    auditControls: string[];
    dataControls: string[];
    monitoringControls: string[];
    securityControls: string[];
    modelProviderControls: string[];
    redFlags: string[];
}

export interface DecisionPack {
    executiveSummary: string;
    finalDecision: GateDecision;
    recommendedOperatingModel: OperatingModelRecommendation;
    businessValue: BusinessValueSummary;
    governance: GovernanceSummary;
    confidenceBand: ConfidenceBand;
    priorityTier: PriorityTier;
    handoffEligibility: HandoffEligibility;
    docsHandoffReadiness: HandoffEligibility;
    deliveryHandoffReadiness: HandoffEligibility;
    evidenceSummary: string[];
    assumptionSummary: string[];
    scoringFormulaSummary: string[];
    reviewerComments: string[];
    approvalHistory: string[];
    auditTrailRef: string;
}

export interface HandoffPack {
    assessmentId: string;
    processId: string;
    organizationId: string;
    assessmentVersion: string;
    scoreVersion: string;
    recommendationCategory: string;
    operatingModelRecommendation: OperatingModelRecommendation;
    approvedDecision: GateDecision;
    processSummary: string;
    currentStateSummary: string;
    painPoints: string[];
    systemsInvolved: string[];
    dataSources: string[];
    evidenceReferences: string[];
    assumptions: string[];
    risks: string[];
    governanceControls: string[];
    hitlDesign: string;
    businessValueEstimate: BusinessValueSummary;
    requiredDocumentTypes: string[];
    suggestedBacklogItems: { type: string; title: string; rationale: string }[];
    openQuestions: string[];
    reviewerNotes: string[];
    approvalMetadata: { status: AssessStatus; generatedAt: string };
}

export type AvalaGovernAutonomyLevel =
    | 'L1 Observe'
    | 'L2 Advise'
    | 'L3 Act With Approval'
    | 'L4 Autonomous Within Guardrails'
    | 'L5 Blocked / Not Allowed';

export type AvalaGovernRiskLevel = 'Low' | 'Medium' | 'High' | 'Critical' | 'Blocked';
export type AvalaGovernStatus = 'Ready for Review' | 'Approval Required' | 'Evidence Review Required' | 'Blocked';

export interface AvalaGovernEvidenceGap {
    label: string;
    severity: AvalaGovernRiskLevel;
    nextAction: string;
}

export interface AvalaGovernLiteCard {
    agentOrAutomationName: string;
    mappedProcessId: string;
    businessOwner: string;
    technicalOwner: string;
    technologyPattern: string;
    systemsAccessed: string[];
    toolsUsed: string[];
    dataSensitivity: string;
    autonomyLevel: AvalaGovernAutonomyLevel;
    riskLevel: AvalaGovernRiskLevel;
    autonomyRationale: string[];
    riskRationale: string[];
    approvalPolicy: string;
    approvalRationale: string[];
    evidencePolicy: string;
    evidenceGaps: AvalaGovernEvidenceGap[];
    allowedActions: string[];
    blockedActions: string[];
    humanApprovalRequired: boolean;
    evidenceRequired: boolean;
    reviewFrequency: string;
    auditStatus: string;
    governanceStatus: AvalaGovernStatus;
    blockedReason?: string;
    nextGovernanceAction: string;
}

export type AssessToStudioSourceType = 'Decision Pack / Handoff Pack';
export type AssessToStudioEvidenceType =
    | EvidenceItem['type']
    | 'Assessment'
    | 'Decision Pack'
    | 'Handoff Pack'
    | 'Avala Govern Lite';

export interface AssessToStudioEvidenceRef {
    id: string;
    type: AssessToStudioEvidenceType;
    description: string;
    owner?: string;
    sensitivity?: EvidenceItem['sensitivity'];
    linkedField?: string;
}

export interface AssessToStudioAssumptionSummary {
    id: string;
    category: Assumption['category'];
    description: string;
    confidence?: number;
    owner?: string;
    validated?: boolean;
    linkedField?: string;
}

export interface AssessToStudioGovernLiteSummary {
    governanceStatus: AvalaGovernStatus;
    riskLevel: AvalaGovernRiskLevel;
    autonomyLevel: AvalaGovernAutonomyLevel;
    approvalPolicy: string;
    evidencePolicy: string;
    nextGovernanceAction: string;
    evidenceGaps: string[];
    blockedActions: string[];
}

export interface AssessToStudioHandoffPayload {
    sourceModule: 'assess';
    targetModule: 'docs';
    sourceType: AssessToStudioSourceType;
    sourceLabel: string;
    createdAt: string;
    processId: string;
    processName: string;
    assessmentId: string;
    studioHandoffId?: string;
    assessmentStatus: AssessStatus;
    gateDecision?: GateDecision;
    riskTier?: RiskTier;
    confidenceBand?: ConfidenceBand;
    priorityTier?: PriorityTier;
    recommendationCategory?: string;
    operatingModelRecommendation?: OperatingModelRecommendation;
    scoreVersion?: string;
    calculatedAt?: string;
    decisionPack?: DecisionPack;
    handoffPack?: HandoffPack;
    governLiteSummary?: AssessToStudioGovernLiteSummary;
    evidenceRefs: AssessToStudioEvidenceRef[];
    assumptionSummary: AssessToStudioAssumptionSummary[];
    readiness: {
        handoffEligibility?: HandoffEligibility;
        docsHandoffReadiness?: HandoffEligibility;
        deliveryHandoffReadiness?: HandoffEligibility;
    };
}

export type DeliveryPackStatus =
    | 'Ready for Review'
    | 'Approval Required'
    | 'Evidence Review Required'
    | 'Blocked'
    | 'Lineage Incomplete';

export type DeliveryPackLineageStatus = 'Linked' | 'Partial' | 'Missing';
export type DeliveryPackChecklistStatus = 'Complete' | 'Action Required' | 'Missing' | 'Not Required';
export type DeliveryPackBlockerSeverity = 'Low' | 'Medium' | 'High' | 'Critical';
export type DeliverySourceLineageCompleteness = 'complete' | 'partial' | 'missing';

export interface TaskSourceLineageMetadata {
    deliveryPackId?: string;
    processId?: string;
    assessmentId?: string;
    documentGenerationId?: string;
    sourceModule?: 'docs';
    upstreamSourceModule?: 'assess';
    sourceType?: 'Generated Work Item' | 'Generated Document' | 'Avala Studio';
    sourceGenerationId?: string;
    sourceArtifactKey?: string;
    sourceArtifactTitle?: string;
    sourceWorkItemTitle?: string;
    sourceContextLabel?: string;
    sourceDecisionPackRef?: string;
    sourceHandoffPackRef?: string;
    handoffLedgerEntryIds?: string[];
    evidenceRefs?: string[];
    assumptionRefs?: string[];
    sourceLabel?: string;
    sourceStatus?: string;
    lineageCompleteness?: DeliverySourceLineageCompleteness;
    lineageNotes?: string[];
    createdAt?: string;
}

export interface DeliveryPackSourceRef {
    id: string;
    type: HandoffSourceType | 'Delivery Pack';
    title: string;
    module?: ProductModuleKey;
    status?: string;
    createdAt?: string;
    metadata?: Record<string, string | number | boolean | string[] | undefined>;
}

export interface DeliveryPackDecisionSummary {
    assessmentId?: string;
    processId?: string;
    scoreVersion?: string;
    calculatedAt?: string;
    finalDecision?: GateDecision;
    recommendationCategory?: string;
    primaryTechnology?: string;
    riskTier?: RiskTier;
    gateDecision?: GateDecision;
    confidenceBand?: ConfidenceBand;
    priorityTier?: PriorityTier;
    handoffEligibility?: HandoffEligibility;
}

export interface DeliveryPackDocumentRef {
    id: string;
    title: string;
    templateId: string;
    generatedAt: string;
    artifactKeys: string[];
    qualityGateStatus: DeliveryPackChecklistStatus;
    approvalStatus: DeliveryPackChecklistStatus;
    summary: string;
    sectionCount: number;
    workItemCount: number;
    sourceRef?: DeliveryPackSourceRef;
}

export interface DeliveryPackWorkItemRef {
    id: string;
    title: string;
    type: TaskType;
    status: TaskStatus;
    priority: TaskPriority;
    ownerNames: string[];
    blockerSummary?: string;
    sourceLineage?: TaskSourceLineageMetadata;
    lineageStatus: DeliveryPackLineageStatus;
    evidenceRefs: string[];
}

export interface DeliveryPackChecklistItem {
    id: string;
    label: string;
    status: DeliveryPackChecklistStatus;
    owner?: string;
    source: string;
    detail: string;
}

export interface DeliveryPackBlocker {
    id: string;
    label: string;
    severity: DeliveryPackBlockerSeverity;
    source: string;
    detail: string;
}

export interface DeliveryPackAuditEvent {
    id: string;
    label: string;
    sourceType: HandoffSourceType;
    sourceId: string;
    targetType?: HandoffSourceType;
    targetId?: string;
    status: HandoffStatus;
    createdAt: string;
    createdBy: string;
    evidenceRefs: string[];
}

export interface DeliveryPackExportMetadata {
    generatedAt: string;
    exportedAt: string;
    exportMode: 'local-demo' | 'review';
    sourceCount: number;
    omittedContentPolicy: string;
}

export interface DeliveryPack {
    id: string;
    title: string;
    organizationId: string;
    projectId: string;
    projectName: string;
    status: DeliveryPackStatus;
    processRef?: DeliveryPackSourceRef;
    assessmentRef?: DeliveryPackSourceRef;
    sources: DeliveryPackSourceRef[];
    decisionSummary?: DeliveryPackDecisionSummary;
    governLite?: AvalaGovernLiteCard;
    documents: DeliveryPackDocumentRef[];
    workItems: DeliveryPackWorkItemRef[];
    approvalChecklist: DeliveryPackChecklistItem[];
    evidenceChecklist: DeliveryPackChecklistItem[];
    blockers: DeliveryPackBlocker[];
    auditSummary: DeliveryPackAuditEvent[];
    exportMetadata: DeliveryPackExportMetadata;
}

export interface AssessmentScoreResult {
    scoreVersion: string; // e.g., "v1.0"
    calculatedAt: string; // ISO 8601

    gatesTriggered: GatingOutcome[];
    primaryGatingOutcome: GatingOutcome | 'Passed';

    techFitScores: {
        RPA: number;
        APIAutomation?: number;
        Workflow: number;
        GenAI: number;
        RAG?: number;
        DocumentIntelligence?: number;
        Agentic: number;
        HITLControlTower?: number;
        ProcessRedesign?: number;
        HumanLed?: number;
    };
    adjustedPriorityScores?: Record<string, number>;

    supportingScores: {
        rawValue: number;
        annualManualEffortHours?: number;
        annualEffortSavedHours?: number;
        estimatedAnnualSavings?: number;
        estimatedNetFirstYearSavings?: number;
        hitlScore: number;
        mandatoryHITL: boolean;
        confidence: number;
        processReadiness?: number;
        dataReadiness?: number;
        systemsReadiness?: number;
        governanceRisk?: number;
        implementationReadiness?: number;
        handoffReadiness?: number;
    };
    riskTier?: RiskTier;
    gateDecision?: GateDecision;
    confidenceBand?: ConfidenceBand;
    priorityTier?: PriorityTier;
    handoffEligibility?: HandoffEligibility;
    recommendation?: OperatingModelRecommendation;
    decisionPack?: DecisionPack;
    handoffPack?: HandoffPack;
    engineOutputs?: EngineOutput[];
}

export interface Assessment {
    id: string;
    processId: string;
    orgId: string;
    workspaceId?: string;
    version?: number;
    scoreVersion?: string;
    studioHandoffId?: string;
    status: AssessStatus;
    metadata: {
        completionQuality: number;
        templateFit: boolean;
        lastSavedAt: string;
        stakeholderCoverage: number;
        evidenceQuality: number;
        assumptionQuality: number;
    };
    responses: AssessmentResponses;
    evidenceItems: EvidenceItem[];
    assumptions: Assumption[];
    completionBySection: Record<AssessmentSectionKey, number>;
    review?: AssessmentReviewState;
    scores?: AssessmentScoreResult;
}


export type Scope =
    | { type: ScopeType.MY_WORK }
    | { type: ScopeType.ORGANIZATION }
    | { type: ScopeType.TEAM, id: string, name: string }
    | { type: ScopeType.PROJECT, id: string, name: string };

export enum View {
    DASHBOARD = 'dashboard',
    TEAMS = 'teams',
    BOARDS = 'boards',
    LIST = 'list',
    CALENDAR = 'calendar',
    GANTT = 'gantt',
    WORKLOAD = 'workload',
    ROADMAP = 'roadmap',
    BACKLOG = 'backlog',
    SPRINT_PLANNING = 'sprint_planning',
    REPORTS = 'reports',
    DOCS = 'docs',
    DOCS_FORGE = 'docs_forge',
    TEMPLATE_STUDIO = 'template_studio',
    AUTOMATIONS = 'automations',
    DELIVERY_PACK = 'delivery_pack',
    TIMESHEETS = 'timesheets',
    PORTFOLIO = 'portfolio',
    WORKSPACE = 'workspace',
    PROCESS_CATALOG = 'process_catalog',
    TEMPLATE_LIBRARY = 'template_library',
    PROCESS_DETAIL = 'process_detail',
    GUIDED_ASSESSMENT = 'guided_assessment',
}

export interface User {
    id: string;
    name: string;
    email: string;
    avatarUrl?: string;
    skills?: string[];
    roleTitle?: string;
    orgRole?: OrgRole;
    persona?: string;
    defaultScope?: Scope;
    defaultView?: View;
    permissions?: string[];
}

export interface Team {
    id: string;
    name: string;
    memberIds: string[];
}

export type ProjectLifecycleStage = 'Planning' | 'Analysis & Design' | 'Development' | 'Testing' | 'Deployment' | 'Maintenance';
export type ProjectHealthStatus = 'On Track' | 'At Risk' | 'Off Track';
export const ALL_HEALTH_STATUSES: ProjectHealthStatus[] = ['On Track', 'At Risk', 'Off Track'];


export interface Project {
    id: string;
    name: string;
    description: string;
    ownerId: string;
    lifecycleStage: ProjectLifecycleStage;
    healthStatus: ProjectHealthStatus;
}

export const ALL_STATUSES = ['To Do', 'In Progress', 'In Review', 'Testing', 'Ready for Release', 'Done', 'Blocked', 'On Hold'] as const;
export type TaskStatus = typeof ALL_STATUSES[number];

export const ALL_PRIORITIES = ['High', 'Medium', 'Low'] as const;
export type TaskPriority = typeof ALL_PRIORITIES[number];

export const ALL_TASK_TYPES = ['Story', 'Task', 'Bug', 'Subtask'] as const;
export type TaskType = typeof ALL_TASK_TYPES[number];
export type DeliveryDeletionState = 'active' | 'soft_deleted' | 'retained';
export type DeliveryDeletionMode = 'soft_delete' | 'retained_lineage';
export type DeliveryRetentionClass = 'none' | 'dependency' | 'child' | 'lineage' | 'terminal' | 'unknown_context';

export interface Task {
    id: string;
    title: string;
    description: string;
    status: TaskStatus;
    priority: TaskPriority;
    type: TaskType;
    projectId: string;
    epicId?: string;
    sprintId?: string;
    assigneeIds: string[];
    reporterId?: string;
    storyPoints?: number;
    startDate: string; // YYYY-MM-DD
    dueDate: string; // YYYY-MM-DD
    parentId?: string;
    subtaskIds?: string[];
    dependencyIds?: string[];
    orderRank?: number;
    comments?: Comment[];
    userStories?: UserStory[];
    activityLog?: ActivityLogItem[];
    sourceLineage?: TaskSourceLineageMetadata;
    deletionState?: DeliveryDeletionState;
    deletionMode?: DeliveryDeletionMode;
    deletionRequestedAt?: string;
    deletionRequestedBy?: string;
    deletedAt?: string;
    deletedBy?: string;
    deletionReason?: string;
    retentionReason?: string;
    retentionClass?: DeliveryRetentionClass;
    restoreEligible?: boolean;
}

export interface Epic {
    id: string;
    name: string;
    projectId: string;
    color: string;
}

export interface Sprint {
    id: string;
    name: string;
    projectId: string;
    startDate: string; // YYYY-MM-DD
    endDate: string; // YYYY-MM-DD
    status: 'Upcoming' | 'Active' | 'Completed';
    goal?: string;
    capacity?: number; // in story points
}

export interface Comment {
    id: string;
    userId: string;
    content: string;
    createdAt: string; // ISO 8601
}

export interface UserStory {
    id: string;
    asA: string;
    iWant: string;
    soThat: string;
    acceptanceCriteria: AcceptanceCriterion[];
    attachments?: Attachment[];
}

export interface AcceptanceCriterion {
    id: string;
    text: string;
    completed: boolean;
}

export interface Attachment {
    id: string;
    fileName: string;
    fileType: 'Image' | 'PDF' | 'Word' | 'Excel' | 'Other';
    fileSize: string;
    url: string;
}

export interface ActivityLogItem {
    id: string;
    userId: string;
    change: string;
    previousValue?: string;
    newValue?: string;
    createdAt: string; // ISO 8601
}

export interface Filters {
    assigneeIds?: string[];
    projectIds?: string[];
    epicIds?: string[];
    priorities?: TaskPriority[];
    types?: TaskType[];
    statuses?: TaskStatus[];
    dateRange?: 'overdue' | 'dueSoon';
}

export type AutomationTriggerType = 'task_status_changed' | 'task_created';
export type AutomationActionType = 'change_status' | 'set_assignee' | 'add_comment';
export type AutomationConditionField = 'priority' | 'type';
export type AutomationConditionOperator = 'is' | 'is_not';

export interface Automation {
    id: string;
    name: string;
    description: string;
    projectId: string;
    isEnabled: boolean;
    trigger: {
        type: AutomationTriggerType;
        config: any;
    };
    conditions: {
        field: AutomationConditionField;
        operator: AutomationConditionOperator;
        value: any;
    }[];
    actions: {
        id: string;
        type: AutomationActionType;
        config: any;
    }[];
}

export interface TimesheetEntry {
    id: string;
    userId: string;
    taskId: string;
    date: string; // YYYY-MM-DD
    hours: number;
}

// ===================================
// DOCS FORGE TYPES
// ===================================

export interface ProjectDetails {
    company: string;
    project: string;
    domain: string;
    templateId: string;
}

export type DocumentArtifactKeys = 'brd' | 'frd' | 'pdd';

export interface DocTemplate {
    id: string;
    title: string;
    description: string;
    artifactKey: DocumentArtifactKeys;
    sections: TemplateSection[];
}

export interface TemplateSection {
    key: string;
    title: string;
    description: string;
    required?: boolean;
    promptInjection?: string;
}

export interface IndustryProfile {
    id: string;
    name: string;
    description: string;
    nfr_overrides: string[];
    risk_taxonomy: string[];
    policy_checks: string[];
}

export type ApprovalStatus = 'Pending' | 'Approved' | 'Rejected';

export interface Approver {
    userId: string;
    role: 'Accountable' | 'Responsible' | 'Consulted' | 'Informed';
    status: ApprovalStatus;
    approvedAt: string | null;
    comments?: string;
}

// Types for the generated artifacts from Gemini
export interface DocumentSection {
    key: string;
    title: string;
    content: string;
    citations?: string[];
}

interface DocumentArtifact {
    title: string;
    sections: DocumentSection[];
}

interface QualityGateArtifact {
    title: string;
    ambiguityPoints: string[];
    gapPoints: string[];
}

interface DiagramArtifact {
    title: string;
    mermaidCode: string;
}

interface DiagramsArtifact {
    asIs: DiagramArtifact;
    toBe: DiagramArtifact;
}

export interface WorkItem {
    type: 'Epic' | 'Story' | 'Task';
    title: string;
    description: string;
    acceptanceCriteria: string[];
}

export interface GeneratedArtifacts {
    brd: DocumentArtifact;
    frd: DocumentArtifact;
    pdd: DocumentArtifact;
    qualityGate: QualityGateArtifact;
    diagrams: DiagramsArtifact;
    workItems: WorkItem[];
    approvals: Approver[];
    sourceContext?: AssessToStudioHandoffPayload;
}

export interface DocumentGeneration {
    id: string;
    projectId: string;
    generatedAt: string; // ISO timestamp
    versionId?: string; // authoritative server version used for export binding
    templateId: string;
    artifacts: GeneratedArtifacts;
}


// ===================================
// AI SPRINT PLANNER TYPES
// ===================================

export interface AiTaskAssignment {
    taskId: string;
    assigneeId: string;
    reason: string;
}

export interface AiSprintPlan {
    rationale: string;
    sprintTaskIds: string[];
    taskAssignments: AiTaskAssignment[];
}


// ===================================
// DASHBOARD TYPES
// ===================================

export enum WidgetType {
    WELCOME = 'welcome',
    STATS = 'stats',
    MY_TASKS = 'my_tasks',
    PROJECT_HEALTH = 'project_health',
    BURNDOWN_CHART = 'burndown_chart',
    TASKS_BY_STATUS = 'tasks_by_status',
    AI_INSIGHTS = 'ai_insights',
}

export interface WidgetDefinition {
    id: WidgetType;
    title: string;
    description: string;
    gridArea: string; // For CSS Grid Area
}

export type WidgetConfig = Record<string, any>;
export type WidgetConfigs = Partial<Record<WidgetType, WidgetConfig>>;


// ===================================
// AI INSIGHTS WIDGET TYPES
// ===================================
export interface AiInsight {
    type: 'risk' | 'priority' | 'summary' | 'bottleneck';
    title: string;
    content: string;
}


// ===================================
// AI PROVIDER TYPES
// ===================================

export type AiProviderType = 'gemini' | 'openai' | 'groq';

export interface IAiProvider {
    generateProjectArtifacts(
        projectDetails: ProjectDetails,
        fileContent: string | null,
        fileName: string
    ): Promise<GeneratedArtifacts>;

    refineSectionContent(
        originalContent: string,
        refinementPrompt: string
    ): Promise<string>;

    generateSprintPlan(
        backlogTasks: Task[],
        teamMembers: User[],
        sprintDurationDays: number,
        sprintCapacity: number
    ): Promise<AiSprintPlan>;

    generateDashboardInsights(
        currentUser: User,
        tasks: Task[],
        projects: Project[]
    ): Promise<AiInsight[]>;
}
