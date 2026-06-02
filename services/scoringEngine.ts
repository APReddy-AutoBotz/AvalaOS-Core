import {
    AssessmentResponses,
    AssessmentScoreResult,
    BusinessValueSummary,
    ConfidenceBand,
    DecisionPack,
    EngineOutput,
    GateDecision,
    GatingOutcome,
    GovernanceSummary,
    HandoffEligibility,
    HandoffPack,
    OperatingModelRecommendation,
    PriorityTier,
    RiskTier,
    TechnologyFitScores,
} from '../types';

export const CURRENT_SCORE_VERSION = 'assess-core-2026-05';
const ENGINE_VERSION = 'assess-core-2026-05';
const DEFAULT_AVERAGE_HOURLY_COST = 65;

export class ScoringValidationError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'ScoringValidationError';
    }
}

interface ScoringMetadata {
    completionQuality: number;
    templateFit: boolean;
    stakeholderCoverage: number;
    evidenceQuality: number;
    assumptionQuality: number;
}

interface ScoringContext {
    assessmentId?: string;
    processId?: string;
    organizationId?: string;
    processName?: string;
    processDescription?: string;
    department?: string;
    evidenceItems?: { id: string; type: string; description: string }[];
    assumptions?: { id: string; category: string; description: string }[];
    status?: string;
}

interface NormalizedInputs {
    standardization: number;
    ruleDeterminism: number;
    exceptionPredictability: number;
    processMaturity: number;
    inputStructure: number;
    unstructuredLoad: number;
    dataSensitivity: number;
    judgmentIntensity: number;
    goalAmbiguity: number;
    systemReadiness: number;
    orchestrationComplexity: number;
    riskCriticality: number;
    governanceSensitivity: number;
    errorReversibility: number;
    volume: number;
    manualEffort: number;
    averageHourlyCost: number;
    reworkPain: number;
    cycleTimePain: number;
    completionQuality: number;
    templateFit: boolean;
    stakeholderCoverage: number;
    evidenceQuality: number;
    assumptionQuality: number;
}

const clamp = (value: number) => Math.max(0, Math.min(100, value));
const round = (value: number) => Math.round(value * 10) / 10;
const toBand = (score: number): ConfidenceBand => {
    if (score >= 85) return 'Very High';
    if (score >= 70) return 'High';
    if (score >= 50) return 'Medium';
    if (score >= 30) return 'Low';
    return 'Very Low';
};

const stableStringify = (value: unknown): string => {
    if (value === null || typeof value !== 'object') return JSON.stringify(value);
    if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
    return `{${Object.entries(value as Record<string, unknown>)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, val]) => `${JSON.stringify(key)}:${stableStringify(val)}`)
        .join(',')}}`;
};

const hashPayload = (payload: unknown): string => {
    const text = stableStringify(payload);
    let hash = 0;
    for (let index = 0; index < text.length; index += 1) {
        hash = ((hash << 5) - hash + text.charCodeAt(index)) | 0;
    }
    return `sha-lite-${Math.abs(hash).toString(16)}`;
};

function validateInputs(responses: AssessmentResponses, metadata: ScoringMetadata) {
    interface ValidationReq {
        name: string;
        val: number | boolean | undefined | null;
        min?: number;
        max?: number;
        type?: 'boolean';
    }

    const requiredResponses: ValidationReq[] = [
        { name: 'standardization', val: responses.processStructure?.standardization, min: 1, max: 5 },
        { name: 'ruleDeterminism', val: responses.processStructure?.ruleDeterminism, min: 1, max: 5 },
        { name: 'exceptionPredictability', val: responses.processStructure?.exceptionPredictability, min: 1, max: 5 },
        { name: 'processMaturity', val: responses.processStructure?.processMaturity, min: 1, max: 5 },
        { name: 'inputStructure', val: responses.dataProfile?.inputStructure, min: 0, max: 100 },
        { name: 'unstructuredLoad', val: responses.dataProfile?.unstructuredLoad, min: 1, max: 5 },
        { name: 'systemReadiness', val: responses.systems?.systemReadiness, min: 1, max: 5 },
        { name: 'orchestrationComplexity', val: responses.systems?.orchestrationComplexity, min: 1, max: 5 },
        { name: 'judgmentIntensity', val: responses.judgment?.judgmentIntensity, min: 1, max: 5 },
        { name: 'riskCriticality', val: responses.risk?.riskCriticality, min: 1, max: 5 },
        { name: 'governanceSensitivity', val: responses.risk?.governanceSensitivity, min: 1, max: 5 },
        { name: 'dataSensitivity', val: responses.dataProfile?.dataSensitivity, min: 1, max: 5 },
        { name: 'errorReversibility', val: responses.risk?.errorReversibility, min: 1, max: 5 },
        { name: 'goalAmbiguity', val: responses.judgment?.goalAmbiguity, min: 1, max: 5 },
        { name: 'volume', val: responses.workPattern?.volume, min: 0, max: Number.MAX_SAFE_INTEGER },
        { name: 'manualEffort', val: responses.workPattern?.manualEffort, min: 0, max: Number.MAX_SAFE_INTEGER },
        ...(responses.workPattern?.averageHourlyCost !== undefined && responses.workPattern?.averageHourlyCost !== null
            ? [{ name: 'averageHourlyCost', val: responses.workPattern.averageHourlyCost, min: 0, max: Number.MAX_SAFE_INTEGER }]
            : []),
        { name: 'reworkPain', val: responses.workPattern?.reworkPain, min: 1, max: 5 },
        { name: 'cycleTimePain', val: responses.workPattern?.cycleTimePain, min: 1, max: 5 },
    ];

    const requiredMetadata: ValidationReq[] = [
        { name: 'completionQuality', val: metadata.completionQuality, min: 0, max: 100 },
        { name: 'templateFit', val: metadata.templateFit, type: 'boolean' },
        { name: 'evidenceQuality', val: metadata.evidenceQuality, min: 1, max: 5 },
        { name: 'assumptionQuality', val: metadata.assumptionQuality, min: 1, max: 5 },
        { name: 'stakeholderCoverage', val: metadata.stakeholderCoverage, min: 1, max: 5 },
    ];

    for (const req of [...requiredResponses, ...requiredMetadata]) {
        if (req.val === undefined || req.val === null) {
            throw new ScoringValidationError(`Missing required scoring input: ${req.name}`);
        }
        if (req.type === 'boolean') {
            if (typeof req.val !== 'boolean') {
                throw new ScoringValidationError(`Invalid type for ${req.name}, expected boolean.`);
            }
        } else if (typeof req.val !== 'number' || Number.isNaN(req.val)) {
            throw new ScoringValidationError(`Invalid type for ${req.name}, expected number.`);
        } else if (req.val < req.min! || req.val > req.max!) {
            throw new ScoringValidationError(`Input ${req.name} value ${req.val} is out of bounds (${req.min}-${req.max}).`);
        }
    }
}

function normalizeInputs(responses: AssessmentResponses, metadata: ScoringMetadata): NormalizedInputs {
    validateInputs(responses, metadata);
    return {
        standardization: responses.processStructure.standardization!,
        ruleDeterminism: responses.processStructure.ruleDeterminism!,
        exceptionPredictability: responses.processStructure.exceptionPredictability!,
        processMaturity: responses.processStructure.processMaturity!,
        inputStructure: responses.dataProfile.inputStructure!,
        unstructuredLoad: responses.dataProfile.unstructuredLoad!,
        dataSensitivity: responses.dataProfile.dataSensitivity!,
        judgmentIntensity: responses.judgment.judgmentIntensity!,
        goalAmbiguity: responses.judgment.goalAmbiguity!,
        systemReadiness: responses.systems.systemReadiness!,
        orchestrationComplexity: responses.systems.orchestrationComplexity!,
        riskCriticality: responses.risk.riskCriticality!,
        governanceSensitivity: responses.risk.governanceSensitivity!,
        errorReversibility: responses.risk.errorReversibility!,
        volume: responses.workPattern.volume!,
        manualEffort: responses.workPattern.manualEffort!,
        averageHourlyCost: responses.workPattern.averageHourlyCost ?? DEFAULT_AVERAGE_HOURLY_COST,
        reworkPain: responses.workPattern.reworkPain!,
        cycleTimePain: responses.workPattern.cycleTimePain!,
        completionQuality: metadata.completionQuality,
        templateFit: metadata.templateFit,
        stakeholderCoverage: metadata.stakeholderCoverage,
        evidenceQuality: metadata.evidenceQuality,
        assumptionQuality: metadata.assumptionQuality,
    };
}

const engineOutput = (engine: string, input: unknown, output: Record<string, unknown>, createdAt: string): EngineOutput => ({
    engine,
    engineVersion: ENGINE_VERSION,
    inputHash: hashPayload(input),
    output,
    createdAt,
});

function runGateEngine(input: NormalizedInputs) {
    const gatesTriggered: GatingOutcome[] = [];
    const annualManualEffortHours = input.volume * input.manualEffort;

    if (input.completionQuality < 50 || input.stakeholderCoverage < 2) gatesTriggered.push('Needs Discovery');
    if (input.processMaturity < 2 && input.standardization < 2) gatesTriggered.push('Process Redesign First');
    if (annualManualEffortHours < 100 && input.cycleTimePain < 3 && input.reworkPain < 3) gatesTriggered.push('Monitor / Deprioritize');
    if (input.goalAmbiguity > 4 && input.riskCriticality > 4) gatesTriggered.push('Human-Led / Do Not Automate');
    if (input.dataSensitivity >= 4 || input.governanceSensitivity >= 4 || input.riskCriticality >= 4) gatesTriggered.push('Governance Review Required');
    if (input.riskCriticality === 5 && input.errorReversibility <= 2 && input.governanceSensitivity >= 4) gatesTriggered.push('No-Go');

    let primaryGatingOutcome: GatingOutcome | 'Passed' = 'Passed';
    if (gatesTriggered.includes('No-Go')) primaryGatingOutcome = 'No-Go';
    else if (gatesTriggered.includes('Process Redesign First')) primaryGatingOutcome = 'Process Redesign First';
    else if (gatesTriggered.includes('Human-Led / Do Not Automate')) primaryGatingOutcome = 'Human-Led / Do Not Automate';
    else if (gatesTriggered.includes('Needs Discovery')) primaryGatingOutcome = 'Needs Discovery';
    else if (gatesTriggered.includes('Governance Review Required')) primaryGatingOutcome = 'Governance Review Required';
    else if (gatesTriggered.includes('Monitor / Deprioritize')) primaryGatingOutcome = 'Monitor / Deprioritize';

    return { gatesTriggered, primaryGatingOutcome };
}

function runReadinessEngines(input: NormalizedInputs) {
    const processReadiness = clamp(((input.standardization + input.ruleDeterminism + input.exceptionPredictability + input.processMaturity) / 20) * 100);
    const dataReadiness = clamp((input.inputStructure * 0.55) + ((6 - input.dataSensitivity) / 5) * 15 + (input.evidenceQuality / 5) * 30);
    const systemsReadiness = clamp((input.systemReadiness / 5) * 70 + ((6 - input.orchestrationComplexity) / 5) * 30);
    const implementationReadiness = clamp((processReadiness * 0.35) + (dataReadiness * 0.25) + (systemsReadiness * 0.25) + ((input.stakeholderCoverage / 5) * 15));
    const handoffReadiness = clamp((implementationReadiness * 0.45) + ((input.evidenceQuality / 5) * 30) + ((input.assumptionQuality / 5) * 25));
    return { processReadiness, dataReadiness, systemsReadiness, implementationReadiness, handoffReadiness };
}

function runTechnologyFitEngine(input: NormalizedInputs): TechnologyFitScores {
    let RPA = ((input.ruleDeterminism / 5) * 35) + ((input.inputStructure / 100) * 35) + ((input.standardization / 5) * 20) + ((input.systemReadiness / 5) * 10);
    if (input.orchestrationComplexity > 3) RPA *= 0.7;
    if (input.judgmentIntensity > 2) RPA *= 0.5;

    const Workflow = ((input.orchestrationComplexity / 5) * 40) + ((input.cycleTimePain / 5) * 30) + ((input.exceptionPredictability / 5) * 20) + ((input.standardization / 5) * 10);

    let GenAI = ((input.unstructuredLoad / 5) * 50) + (((5 - input.ruleDeterminism) / 5) * 30) + ((input.standardization / 5) * 20);
    if (input.riskCriticality > 3 && input.errorReversibility < 3) GenAI *= 0.6;

    let Agentic = ((input.judgmentIntensity / 5) * 35) + ((input.unstructuredLoad / 5) * 25) + ((input.systemReadiness / 5) * 30) + (((5 - input.goalAmbiguity) / 5) * 10);
    if (input.riskCriticality > 4 || input.systemReadiness < 3) Agentic = 0;

    const APIAutomation = clamp(((input.systemReadiness / 5) * 45) + ((input.inputStructure / 100) * 35) + ((input.ruleDeterminism / 5) * 20));
    const RAG = clamp(((input.unstructuredLoad / 5) * 35) + ((input.evidenceQuality / 5) * 30) + ((input.dataSensitivity <= 3 ? 1 : 0.55) * 20) + ((input.goalAmbiguity <= 3 ? 1 : 0.5) * 15));
    const DocumentIntelligence = clamp(((input.unstructuredLoad / 5) * 45) + ((input.inputStructure < 70 ? 1 : 0.65) * 25) + ((input.ruleDeterminism / 5) * 20) + ((input.evidenceQuality / 5) * 10));
    const HITLControlTower = clamp(((input.riskCriticality / 5) * 35) + ((input.governanceSensitivity / 5) * 30) + ((input.judgmentIntensity / 5) * 20) + (((6 - input.errorReversibility) / 5) * 15));
    const ProcessRedesign = clamp(((6 - input.processMaturity) / 5) * 35 + ((6 - input.standardization) / 5) * 30 + ((input.orchestrationComplexity / 5) * 20) + ((6 - input.exceptionPredictability) / 5) * 15);
    const HumanLed = clamp((input.judgmentIntensity / 5) * 35 + (input.riskCriticality / 5) * 30 + (input.goalAmbiguity / 5) * 20 + ((6 - input.errorReversibility) / 5) * 15);

    return {
        RPA: round(clamp(RPA)),
        APIAutomation: round(APIAutomation),
        Workflow: round(clamp(Workflow)),
        GenAI: round(clamp(GenAI)),
        RAG: round(RAG),
        DocumentIntelligence: round(DocumentIntelligence),
        Agentic: round(clamp(Agentic)),
        HITLControlTower: round(HITLControlTower),
        ProcessRedesign: round(ProcessRedesign),
        HumanLed: round(HumanLed),
    };
}

function runGovernanceRiskEngine(input: NormalizedInputs): GovernanceSummary & { governanceRisk: number; hitlScore: number; mandatoryHITL: boolean } {
    const governanceRisk = clamp((input.riskCriticality / 5) * 30 + (input.governanceSensitivity / 5) * 25 + (input.dataSensitivity / 5) * 20 + ((6 - input.errorReversibility) / 5) * 15 + (input.goalAmbiguity / 5) * 10);
    const hitlScore = clamp((input.riskCriticality / 5) * 30 + (input.governanceSensitivity / 5) * 25 + (input.dataSensitivity / 5) * 20 + ((6 - input.errorReversibility) / 5) * 15 + (input.judgmentIntensity / 5) * 10);
    const riskTier: RiskTier = governanceRisk >= 85 ? 'Unacceptable' : governanceRisk >= 70 ? 'High' : governanceRisk >= 50 ? 'Moderate' : governanceRisk >= 30 ? 'Limited' : 'Minimal';
    const gateDecision: GateDecision = riskTier === 'Unacceptable' ? 'No-Go' : riskTier === 'High' ? 'Governance Review Required' : governanceRisk >= 50 ? 'Conditional Go' : 'Go';
    const redFlags = [
        input.dataSensitivity >= 4 ? 'Sensitive data requires access controls and evidence read logging.' : '',
        input.governanceSensitivity >= 4 ? 'Formal governance review is required before Docs or Delivery handoff.' : '',
        input.errorReversibility <= 2 ? 'Errors are difficult to reverse; pre-action approval is required.' : '',
        input.riskCriticality >= 5 ? 'Business consequence is severe; autonomous execution is not allowed.' : '',
    ].filter(Boolean);

    return {
        governanceRisk: round(governanceRisk),
        hitlScore: round(hitlScore),
        mandatoryHITL: hitlScore > 65,
        riskTier,
        gateDecision,
        requiredApprovalLevel: riskTier === 'High' || riskTier === 'Unacceptable' ? 'Governance board + executive sponsor' : riskTier === 'Moderate' ? 'Process owner + CoE reviewer' : 'Process owner',
        auditControls: ['Score version retained', 'Decision pack archived', 'Reviewer comments captured', 'Handoff payload snapshot preserved'],
        dataControls: input.dataSensitivity >= 4 ? ['RBAC on evidence', 'Sensitive document read logging', 'Retention policy required'] : ['Evidence owner recorded', 'Retention policy recommended'],
        monitoringControls: riskTier === 'High' || riskTier === 'Unacceptable' ? ['Continuous monitoring', 'Exception review queue', 'Kill switch'] : ['Periodic QA sampling'],
        securityControls: ['Tenant isolation', 'Permission checks on review and handoff actions'],
        modelProviderControls: input.unstructuredLoad >= 3 ? ['BYOK/provider approval', 'Prompt injection controls', 'Model output review'] : [],
        redFlags,
    };
}

function runBusinessValueEngine(input: NormalizedInputs): BusinessValueSummary {
    const annualVolume = input.volume;
    const avgEffortHoursPerCase = input.manualEffort;
    const annualManualEffortHours = annualVolume * avgEffortHoursPerCase;
    const rawEffortPoints = Math.min(60, (annualManualEffortHours / 5000) * 60);
    const reworkPoints = (input.reworkPain / 5) * 40;
    const rawValueScore = round(clamp(rawEffortPoints + reworkPoints));
    const automationCaptureRate = input.ruleDeterminism >= 4 && input.inputStructure >= 70 ? 0.55 : input.ruleDeterminism >= 3 ? 0.4 : 0.25;
    const annualEffortSavedHours = Math.round(annualManualEffortHours * automationCaptureRate);
    const buildComplexity = input.orchestrationComplexity >= 5 || input.systemReadiness <= 2 ? 'Very High' : input.orchestrationComplexity >= 4 ? 'High' : input.orchestrationComplexity >= 3 ? 'Medium' : 'Low';
    const runComplexity = input.governanceSensitivity >= 4 || input.dataSensitivity >= 4 ? 'High' : input.orchestrationComplexity >= 4 ? 'Medium' : 'Low';
    const buildCostByComplexity = {
        Low: 30000,
        Medium: 75000,
        High: 150000,
        'Very High': 250000,
    } as const;
    const runCostRatioByComplexity = {
        Low: 0.15,
        Medium: 0.2,
        High: 0.28,
    } as const;
    const averageHourlyCost = input.averageHourlyCost;
    const annualLaborCost = Math.round(annualManualEffortHours * averageHourlyCost);
    const estimatedAnnualSavings = Math.round(annualEffortSavedHours * averageHourlyCost);
    const estimatedBuildCost = buildCostByComplexity[buildComplexity];
    const estimatedAnnualRunCost = Math.round(estimatedBuildCost * runCostRatioByComplexity[runComplexity]);
    const estimatedNetFirstYearSavings = estimatedAnnualSavings - estimatedBuildCost - estimatedAnnualRunCost;
    const monthlyNetSavingsAfterRun = Math.max(0, (estimatedAnnualSavings - estimatedAnnualRunCost) / 12);
    const paybackMonths = monthlyNetSavingsAfterRun > 0 ? estimatedBuildCost / monthlyNetSavingsAfterRun : Number.POSITIVE_INFINITY;
    const paybackBand = annualManualEffortHours === 0
        ? 'Not enough data'
        : paybackMonths <= 3
            ? 'Less than 3 months'
            : paybackMonths <= 6
                ? '3 to 6 months'
                : paybackMonths <= 12
                    ? '6 to 12 months'
                    : '12+ months';
    const roiConfidence = toBand(clamp((input.evidenceQuality / 5) * 45 + (input.assumptionQuality / 5) * 30 + (input.stakeholderCoverage / 5) * 25));
    return {
        rawValueScore,
        annualVolume: round(annualVolume),
        avgEffortHoursPerCase: round(avgEffortHoursPerCase),
        annualManualEffortHours: Math.round(annualManualEffortHours),
        annualEffortSavedHours,
        averageHourlyCost: round(averageHourlyCost),
        annualLaborCost,
        estimatedAnnualSavings,
        estimatedBuildCost,
        estimatedAnnualRunCost,
        estimatedNetFirstYearSavings,
        paybackBand,
        buildComplexity,
        runComplexity,
        roiConfidence,
    };
}

function runConfidenceEngine(input: NormalizedInputs) {
    let confidence = ((input.completionQuality / 100) * 40) + ((input.evidenceQuality / 5) * 25) + ((input.assumptionQuality / 5) * 20) + ((input.stakeholderCoverage / 5) * 15);
    if (input.templateFit) confidence = Math.min(100, confidence * 1.1);
    confidence = round(clamp(confidence));
    return { confidence, confidenceBand: toBand(confidence) };
}

function runFinalRecommendationEngine(
    input: NormalizedInputs,
    gates: ReturnType<typeof runGateEngine>,
    technologyFitScores: TechnologyFitScores,
    governance: GovernanceSummary & { governanceRisk: number; hitlScore: number; mandatoryHITL: boolean },
    value: BusinessValueSummary,
    confidence: { confidence: number; confidenceBand: ConfidenceBand },
) {
    const oversightPenalty = governance.mandatoryHITL ? 15 : 0;
    const adjustedPriorityScores = {
        RPA: clamp((technologyFitScores.RPA * 0.4) + (value.rawValueScore * 0.4) + (confidence.confidence * 0.2) - oversightPenalty - (input.systemReadiness <= 3 ? 20 : 0)),
        APIAutomation: clamp((technologyFitScores.APIAutomation * 0.4) + (value.rawValueScore * 0.4) + (confidence.confidence * 0.2) - oversightPenalty - (input.systemReadiness < 4 ? 10 : 0)),
        Workflow: clamp((technologyFitScores.Workflow * 0.4) + (value.rawValueScore * 0.4) + (confidence.confidence * 0.2) - oversightPenalty - (input.orchestrationComplexity > 4 ? 10 : 0)),
        GenAI: clamp((technologyFitScores.GenAI * 0.4) + (value.rawValueScore * 0.4) + (confidence.confidence * 0.2) - oversightPenalty - (input.unstructuredLoad > 4 ? 10 : 0)),
        Agentic: clamp((technologyFitScores.Agentic * 0.4) + (value.rawValueScore * 0.4) + (confidence.confidence * 0.2) - oversightPenalty - 15),
    };

    const sorted = Object.entries(adjustedPriorityScores).sort((a, b) => b[1] - a[1]);
    const [winningTech, winningPriority] = sorted[0];
    const secondary = sorted.find(([tech, score]) => tech !== winningTech && score > 60)?.[0];

    let category = `${winningTech}-first Automation`;
    let primaryTechnology = winningTech;
    if (gates.primaryGatingOutcome === 'Needs Discovery') {
        category = 'Discovery Required';
        primaryTechnology = 'Discovery';
    } else if (gates.primaryGatingOutcome === 'Process Redesign First') {
        category = 'Process Redesign First';
        primaryTechnology = 'Process Redesign';
    } else if (gates.primaryGatingOutcome === 'No-Go') {
        category = 'Do Not Automate Yet';
        primaryTechnology = 'Human-Led Operation';
    } else if (gates.primaryGatingOutcome === 'Human-Led / Do Not Automate') {
        category = 'Manual / Human-Led';
        primaryTechnology = 'Human-Led Operation';
    } else if (gates.primaryGatingOutcome === 'Governance Review Required' && governance.riskTier === 'High') {
        category = 'Governance Review Required';
    } else if (winningPriority < 50) {
        category = 'Do Not Automate Yet';
    } else if (winningTech === 'Workflow') {
        category = secondary ? `Workflow + ${secondary} Assist` : 'Workflow-first Orchestration';
    } else if (winningTech === 'RPA') {
        category = input.orchestrationComplexity > 3 ? 'Workflow + RPA Execution' : 'RPA-first Automation';
    } else if (winningTech === 'APIAutomation') {
        category = 'API-first Automation';
    } else if (winningTech === 'GenAI') {
        category = input.unstructuredLoad >= 4 ? 'GenAI Document Intelligence with Human Review' : 'Workflow + GenAI Assist';
    } else if (winningTech === 'Agentic') {
        category = governance.mandatoryHITL ? 'Agentic Assist, Not Autonomous' : 'Bounded Agentic Orchestration';
    }

    const priorityTier: PriorityTier = gates.primaryGatingOutcome === 'Needs Discovery'
        ? 'Blocked - Needs Discovery'
        : gates.primaryGatingOutcome === 'Process Redesign First'
            ? 'Blocked - Redesign First'
            : gates.primaryGatingOutcome === 'No-Go' || gates.primaryGatingOutcome === 'Governance Review Required'
                ? 'Blocked - Governance Risk'
                : winningPriority > 75
                    ? 'Tier 1 - Strategic Quick Win'
                    : winningPriority >= 50
                        ? 'Tier 2 - Standard Backlog'
                        : 'Tier 3 - Monitor / Deprioritize';

    const handoffEligibility: HandoffEligibility = priorityTier === 'Blocked - Needs Discovery'
        ? 'Needs Discovery'
        : priorityTier === 'Blocked - Redesign First'
            ? 'Needs Process Redesign'
            : priorityTier === 'Blocked - Governance Risk'
                ? 'Needs Governance Review'
                : confidence.confidence < 50
                    ? 'Needs Discovery'
                    : governance.riskTier === 'Moderate' || governance.riskTier === 'High'
                        ? 'Ready for Docs, Not Delivery'
                        : 'Ready for Delivery';

    const recommendation: OperatingModelRecommendation = {
        category,
        primaryTechnology,
        secondaryTechnology: secondary,
        executionLayer: primaryTechnology === 'APIAutomation' ? 'API integration' : primaryTechnology === 'RPA' ? 'RPA/UI automation' : primaryTechnology === 'Workflow' ? 'Workflow orchestration' : 'Assisted execution',
        controlLayer: governance.mandatoryHITL ? 'Pre-action human approval' : 'Exception review and QA sampling',
        governanceLayer: governance.requiredApprovalLevel,
        requiredHumanOversight: governance.mandatoryHITL ? 'Pre-action approval' : 'Sampling-based QA',
        notRecommendedTechnologies: sorted.slice(2).map(([tech]) => tech),
        whyThis: [
            `${primaryTechnology} has the strongest adjusted priority after value, confidence, and risk penalties.`,
            `Business value score is ${value.rawValueScore}/100 from ${value.annualManualEffortHours} annual manual hours and estimated ${value.annualEffortSavedHours} annual hours that could be saved.`,
            `Confidence is ${confidence.confidence}% (${confidence.confidenceBand}) based on evidence, assumptions, and stakeholder coverage.`,
        ],
        whyNotOthers: sorted.slice(1, 4).map(([tech, score]) => `${tech} ranked lower after risk, readiness, and cost penalties (${round(score)}/100).`),
        cautionNotes: [
            ...governance.redFlags,
            confidence.confidence < 70 ? 'Confidence is not high enough for delivery handoff without reviewer approval.' : '',
            governance.mandatoryHITL ? 'Human oversight must be designed before any autonomous or semi-autonomous execution.' : '',
        ].filter(Boolean),
        nextActions: [
            handoffEligibility === 'Ready for Delivery' ? 'Generate Docs pack and create delivery backlog seed items.' : 'Generate Docs handoff pack for reviewer-ready requirements.',
            governance.gateDecision === 'Governance Review Required' ? 'Assign governance reviewer and capture approval notes.' : 'Confirm process owner acceptance.',
            confidence.confidence < 70 ? 'Collect missing evidence and validate open assumptions.' : 'Archive score version and decision pack.',
        ],
    };

    return {
        adjustedPriorityScores: Object.fromEntries(Object.entries(adjustedPriorityScores).map(([key, value]) => [key, round(value)])),
        winningTech,
        winningPriority: round(winningPriority),
        priorityTier,
        handoffEligibility,
        recommendation,
    };
}

function createDecisionPack(
    context: ScoringContext,
    final: ReturnType<typeof runFinalRecommendationEngine>,
    governance: GovernanceSummary & { governanceRisk: number; hitlScore: number; mandatoryHITL: boolean },
    value: BusinessValueSummary,
    confidence: { confidence: number; confidenceBand: ConfidenceBand },
    technologyFitScores: TechnologyFitScores,
): DecisionPack {
    const finalDecision: GateDecision = final.handoffEligibility === 'Needs Governance Review'
        ? 'Governance Review Required'
        : final.handoffEligibility === 'Needs Discovery'
            ? 'Needs Discovery'
            : final.handoffEligibility === 'Needs Process Redesign'
                ? 'Redesign First'
                : governance.gateDecision;

    return {
        executiveSummary: `${context.processName || 'This process'} is recommended for ${final.recommendation.category}. The decision is deterministic and based on value, readiness, risk, confidence, and governance controls.`,
        finalDecision,
        recommendedOperatingModel: final.recommendation,
        businessValue: value,
        governance,
        confidenceBand: confidence.confidenceBand,
        priorityTier: final.priorityTier,
        handoffEligibility: final.handoffEligibility,
        docsHandoffReadiness: final.handoffEligibility === 'Ready for Delivery' ? 'Ready for Docs' : final.handoffEligibility,
        deliveryHandoffReadiness: final.handoffEligibility,
        evidenceSummary: context.evidenceItems?.length ? context.evidenceItems.map(item => `${item.type}: ${item.description}`) : ['No evidence captured yet.'],
        assumptionSummary: context.assumptions?.length ? context.assumptions.map(item => `${item.category}: ${item.description}`) : ['No assumptions captured yet.'],
        scoringFormulaSummary: [
            `Value score weights: annual manual effort contributes up to 60 points; rework impact contributes up to 40 points.`,
            `Annual manual effort = annual volume ${value.annualVolume} * average effort ${value.avgEffortHoursPerCase} hours per case = ${value.annualManualEffortHours} hours.`,
            `Savings estimate = ${value.annualEffortSavedHours} saved hours * ${value.averageHourlyCost}/hour = ${value.estimatedAnnualSavings}.`,
            `Governance risk weights: risk criticality 30, governance sensitivity 25, data sensitivity 20, error irreversibility 15, goal ambiguity 10.`,
            `HITL score weights: risk criticality 30, governance sensitivity 25, data sensitivity 20, error irreversibility 15, judgment intensity 10; mandatory HITL triggers above 65.`,
            `Final priority weights: technology fit 40, business value 40, confidence 20, then readiness and oversight penalties.`,
        ],
        reviewerComments: [],
        approvalHistory: [],
        auditTrailRef: `audit-${context.assessmentId || 'pending'}-${CURRENT_SCORE_VERSION}`,
    };
}

function createHandoffPack(context: ScoringContext, decisionPack: DecisionPack): HandoffPack {
    const risks = [
        ...decisionPack.governance.redFlags,
        ...decisionPack.recommendedOperatingModel.cautionNotes,
    ];
    return {
        assessmentId: context.assessmentId || 'pending-assessment',
        processId: context.processId || 'pending-process',
        organizationId: context.organizationId || 'pending-org',
        assessmentVersion: '1',
        scoreVersion: CURRENT_SCORE_VERSION,
        recommendationCategory: decisionPack.recommendedOperatingModel.category,
        operatingModelRecommendation: decisionPack.recommendedOperatingModel,
        approvedDecision: decisionPack.finalDecision,
        processSummary: context.processDescription || context.processName || 'Process summary pending.',
        currentStateSummary: `Department: ${context.department || 'Not specified'}. Decision generated from guided assessment responses.`,
        painPoints: ['Manual effort', 'Cycle-time pressure', 'Rework risk'],
        systemsInvolved: ['Captured in assessment systems section'],
        dataSources: ['Captured in assessment data profile'],
        evidenceReferences: context.evidenceItems?.map(item => item.id) || [],
        assumptions: context.assumptions?.map(item => item.description) || [],
        risks,
        governanceControls: [
            ...decisionPack.governance.auditControls,
            ...decisionPack.governance.dataControls,
            ...decisionPack.governance.monitoringControls,
        ],
        hitlDesign: decisionPack.recommendedOperatingModel.requiredHumanOversight,
        businessValueEstimate: decisionPack.businessValue,
        requiredDocumentTypes: ['BRD', 'PRD', 'PDD', 'Risk Register', 'Control Matrix', 'UAT Plan'],
        suggestedBacklogItems: [
            { type: 'Epic', title: `Implement ${decisionPack.recommendedOperatingModel.category}`, rationale: 'Seeded from approved Assess recommendation.' },
            { type: 'Governance Review Task', title: 'Validate controls and HITL design', rationale: 'Required before production execution.' },
            { type: 'Data Validation Task', title: 'Validate evidence and assumptions', rationale: 'Improves confidence before delivery.' },
            { type: 'UAT Task', title: 'Create test scenarios from assessment risks', rationale: 'Ensures delivery verifies decision assumptions.' },
        ],
        openQuestions: decisionPack.confidenceBand === 'High' || decisionPack.confidenceBand === 'Very High' ? [] : ['Which assumptions can be replaced with evidence before delivery?'],
        reviewerNotes: [],
        approvalMetadata: { status: (context.status as any) || 'Draft', generatedAt: new Date().toISOString() },
    };
}

export function calculateAssessmentScores(
    responses: AssessmentResponses,
    metadata: ScoringMetadata,
    context: ScoringContext = {},
): AssessmentScoreResult {
    const calculatedAt = new Date().toISOString();
    const input = normalizeInputs(responses, metadata);
    const engineOutputs: EngineOutput[] = [];

    const gates = runGateEngine(input);
    engineOutputs.push(engineOutput('Gate Engine', input, gates, calculatedAt));

    const readiness = runReadinessEngines(input);
    engineOutputs.push(engineOutput('Readiness Engines', input, readiness, calculatedAt));

    const technologyFitScores = runTechnologyFitEngine(input);
    engineOutputs.push(engineOutput('Technology Fit Engine', input, technologyFitScores as unknown as Record<string, unknown>, calculatedAt));

    const governance = runGovernanceRiskEngine(input);
    engineOutputs.push(engineOutput('Governance Risk + HITL Engine', input, governance as unknown as Record<string, unknown>, calculatedAt));

    const businessValue = runBusinessValueEngine(input);
    engineOutputs.push(engineOutput('Business Value Engine', input, businessValue as unknown as Record<string, unknown>, calculatedAt));

    const confidence = runConfidenceEngine(input);
    engineOutputs.push(engineOutput('Confidence Engine', input, confidence, calculatedAt));

    const final = runFinalRecommendationEngine(input, gates, technologyFitScores, governance, businessValue, confidence);
    engineOutputs.push(engineOutput('Final Recommendation Engine', { input, technologyFitScores, governance, businessValue, confidence }, final as unknown as Record<string, unknown>, calculatedAt));

    const decisionPack = createDecisionPack(context, final, governance, businessValue, confidence, technologyFitScores);
    const handoffPack = createHandoffPack(context, decisionPack);
    engineOutputs.push(engineOutput('Handoff Readiness Engine', { decisionPack }, handoffPack as unknown as Record<string, unknown>, calculatedAt));

    return {
        scoreVersion: CURRENT_SCORE_VERSION,
        calculatedAt,
        gatesTriggered: gates.gatesTriggered,
        primaryGatingOutcome: gates.primaryGatingOutcome,
        techFitScores: technologyFitScores,
        adjustedPriorityScores: final.adjustedPriorityScores,
        supportingScores: {
            rawValue: businessValue.rawValueScore,
            annualManualEffortHours: businessValue.annualManualEffortHours,
            annualEffortSavedHours: businessValue.annualEffortSavedHours,
            estimatedAnnualSavings: businessValue.estimatedAnnualSavings,
            estimatedNetFirstYearSavings: businessValue.estimatedNetFirstYearSavings,
            hitlScore: governance.hitlScore,
            mandatoryHITL: governance.mandatoryHITL,
            confidence: confidence.confidence,
            processReadiness: round(readiness.processReadiness),
            dataReadiness: round(readiness.dataReadiness),
            systemsReadiness: round(readiness.systemsReadiness),
            governanceRisk: governance.governanceRisk,
            implementationReadiness: round(readiness.implementationReadiness),
            handoffReadiness: round(readiness.handoffReadiness),
        },
        riskTier: governance.riskTier,
        gateDecision: governance.gateDecision,
        confidenceBand: confidence.confidenceBand,
        priorityTier: final.priorityTier,
        handoffEligibility: final.handoffEligibility,
        recommendation: final.recommendation,
        decisionPack,
        handoffPack,
        engineOutputs,
    };
}
