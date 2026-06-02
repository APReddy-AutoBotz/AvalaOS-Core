import { calculateAssessmentScores, CURRENT_SCORE_VERSION } from './scoringEngine';
import { AssessmentResponses } from '../types';

console.log('Starting deterministic Assess scoring test suite...');

const assert = (condition: unknown, message: string) => {
    if (!condition) throw new Error(message);
};

const assertIncludes = <T>(items: T[], expected: T, message: string) => {
    assert(items.includes(expected), message);
};

const baseResponses: AssessmentResponses = {
    processStructure: { standardization: 4, ruleDeterminism: 4, exceptionPredictability: 3, processMaturity: 3 },
    workPattern: { volume: 50000, manualEffort: 0.04, averageHourlyCost: 65, reworkPain: 3, cycleTimePain: 4 },
    dataProfile: { inputStructure: 80, unstructuredLoad: 2, dataSensitivity: 3 },
    judgment: { judgmentIntensity: 2, goalAmbiguity: 2 },
    systems: { systemReadiness: 4, orchestrationComplexity: 2 },
    risk: { riskCriticality: 4, governanceSensitivity: 3, errorReversibility: 4 },
};

const baseMetadata = {
    completionQuality: 100,
    evidenceQuality: 3,
    templateFit: true,
    assumptionQuality: 4,
    stakeholderCoverage: 4,
};

const run1 = calculateAssessmentScores(baseResponses, baseMetadata);
const run2 = calculateAssessmentScores(baseResponses, baseMetadata);
assert(JSON.stringify(run1.techFitScores) === JSON.stringify(run2.techFitScores), 'Math instability detected for technology fit scores.');
assert(run1.scoreVersion === CURRENT_SCORE_VERSION, 'Score version did not match engine version.');
assert(run1.recommendation && run1.decisionPack && run1.handoffPack && run1.engineOutputs?.length, 'Enterprise output contract missing recommendation, decision pack, handoff pack, or engine trace.');
assert(run1.handoffPack.requiredDocumentTypes.includes('BRD') && run1.handoffPack.suggestedBacklogItems.length >= 3, 'Handoff pack missing required document types or backlog seed items.');
assert(run1.engineOutputs.some(output => output.engine === 'Final Recommendation Engine'), 'Engine traceability missing final recommendation engine output.');
assert(run1.decisionPack.scoringFormulaSummary.length >= 5, 'Decision pack does not expose scoring formula summary.');
console.log('Determinism and enterprise output contract passed.');

const needsDiscovery = calculateAssessmentScores(baseResponses, { ...baseMetadata, completionQuality: 40 });
assertIncludes(needsDiscovery.gatesTriggered, 'Needs Discovery', 'Gate failed to trap Needs Discovery when completion quality is below 50%.');

const redesign = calculateAssessmentScores({
    ...baseResponses,
    processStructure: { ...baseResponses.processStructure, processMaturity: 1, standardization: 1 },
}, baseMetadata);
assertIncludes(redesign.gatesTriggered, 'Process Redesign First', 'Gate failed to trap Process Redesign First.');

try {
    calculateAssessmentScores({ ...baseResponses, judgment: { goalAmbiguity: 2 } } as any, baseMetadata);
    throw new Error('Did not throw on missing input.');
} catch (err: any) {
    assert(err.name === 'ScoringValidationError', `Wrong error type for missing input: ${err.name}`);
}

try {
    calculateAssessmentScores(baseResponses, { ...baseMetadata, evidenceQuality: 8 });
    throw new Error('Did not throw on out-of-bounds input.');
} catch (err: any) {
    assert(err.name === 'ScoringValidationError', `Wrong error type for out-of-bounds input: ${err.name}`);
}
console.log('Validation and gate safety passed.');

const apInvoice = calculateAssessmentScores({
    processStructure: { standardization: 4, ruleDeterminism: 5, exceptionPredictability: 4, processMaturity: 4 },
    workPattern: { volume: 50000, manualEffort: 0.1, averageHourlyCost: 58, reworkPain: 3, cycleTimePain: 4 },
    dataProfile: { inputStructure: 80, unstructuredLoad: 4, dataSensitivity: 3 },
    judgment: { judgmentIntensity: 2, goalAmbiguity: 2 },
    systems: { systemReadiness: 4, orchestrationComplexity: 3 },
    risk: { riskCriticality: 3, governanceSensitivity: 3, errorReversibility: 4 },
}, { ...baseMetadata, evidenceQuality: 4, assumptionQuality: 4 });
assert(apInvoice.decisionPack.businessValue.annualManualEffortHours === 5000, 'AP fixture should derive 5,000 annual manual hours.');
assert(apInvoice.decisionPack.businessValue.annualEffortSavedHours === 2750, 'AP fixture should derive 2,750 annual saved hours.');
assert(apInvoice.decisionPack.businessValue.estimatedAnnualSavings === 159500, 'AP fixture should convert saved hours into annual savings.');
assert(apInvoice.decisionPack.businessValue.rawValueScore >= 80, 'AP fixture should be a high-value automation candidate.');
assert(apInvoice.priorityTier === 'Tier 1 - Strategic Quick Win' || apInvoice.priorityTier === 'Tier 2 - Standard Backlog', 'AP fixture should not be deprioritized.');

const supportSummarization = calculateAssessmentScores({
    processStructure: { standardization: 3, ruleDeterminism: 2, exceptionPredictability: 3, processMaturity: 3 },
    workPattern: { volume: 18000, manualEffort: 0.17, averageHourlyCost: 52, reworkPain: 3, cycleTimePain: 4 },
    dataProfile: { inputStructure: 45, unstructuredLoad: 5, dataSensitivity: 4 },
    judgment: { judgmentIntensity: 4, goalAmbiguity: 3 },
    systems: { systemReadiness: 4, orchestrationComplexity: 4 },
    risk: { riskCriticality: 3, governanceSensitivity: 4, errorReversibility: 3 },
}, baseMetadata);
assert(supportSummarization.techFitScores.GenAI > supportSummarization.techFitScores.RPA, 'Support fixture should favor GenAI over RPA.');
assertIncludes(supportSummarization.gatesTriggered, 'Governance Review Required', 'Sensitive support data should trigger governance review.');
assert(supportSummarization.handoffEligibility !== 'Ready for Delivery', 'Sensitive GenAI support fixture should not go straight to delivery.');

const hrOnboarding = calculateAssessmentScores({
    processStructure: { standardization: 3, ruleDeterminism: 4, exceptionPredictability: 3, processMaturity: 3 },
    workPattern: { volume: 9000, manualEffort: 0.65, averageHourlyCost: 48, reworkPain: 4, cycleTimePain: 5 },
    dataProfile: { inputStructure: 82, unstructuredLoad: 2, dataSensitivity: 3 },
    judgment: { judgmentIntensity: 3, goalAmbiguity: 2 },
    systems: { systemReadiness: 3, orchestrationComplexity: 4 },
    risk: { riskCriticality: 3, governanceSensitivity: 3, errorReversibility: 4 },
}, baseMetadata);
assert(hrOnboarding.techFitScores.Workflow > hrOnboarding.techFitScores.RPA, 'HR onboarding fixture should favor workflow orchestration over RPA.');
assert(hrOnboarding.decisionPack.businessValue.annualManualEffortHours === 5850, 'HR fixture should derive annual effort from volume and per-case effort.');

const highRiskClaims = calculateAssessmentScores({
    processStructure: { standardization: 2, ruleDeterminism: 2, exceptionPredictability: 2, processMaturity: 3 },
    workPattern: { volume: 7200, manualEffort: 0.5, averageHourlyCost: 70, reworkPain: 4, cycleTimePain: 5 },
    dataProfile: { inputStructure: 45, unstructuredLoad: 5, dataSensitivity: 5 },
    judgment: { judgmentIntensity: 5, goalAmbiguity: 5 },
    systems: { systemReadiness: 3, orchestrationComplexity: 5 },
    risk: { riskCriticality: 5, governanceSensitivity: 5, errorReversibility: 1 },
}, baseMetadata);
assertIncludes(highRiskClaims.gatesTriggered, 'No-Go', 'High-risk claims fixture should trigger No-Go.');
assert(highRiskClaims.techFitScores.Agentic === 0, 'High-risk claims fixture should block agentic automation fit.');
assert(highRiskClaims.riskTier === 'Unacceptable', 'High-risk claims fixture should be unacceptable risk.');

const lowValue = calculateAssessmentScores({
    processStructure: { standardization: 4, ruleDeterminism: 4, exceptionPredictability: 4, processMaturity: 4 },
    workPattern: { volume: 200, manualEffort: 0.05, averageHourlyCost: 45, reworkPain: 1, cycleTimePain: 1 },
    dataProfile: { inputStructure: 90, unstructuredLoad: 1, dataSensitivity: 1 },
    judgment: { judgmentIntensity: 1, goalAmbiguity: 1 },
    systems: { systemReadiness: 5, orchestrationComplexity: 1 },
    risk: { riskCriticality: 1, governanceSensitivity: 1, errorReversibility: 5 },
}, baseMetadata);
assertIncludes(lowValue.gatesTriggered, 'Monitor / Deprioritize', 'Low-value fixture should be monitored/deprioritized.');
assert(lowValue.decisionPack.businessValue.annualManualEffortHours === 10, 'Low-value fixture should preserve small annual effort.');
console.log('Golden scoring fixtures passed.');

const lowAnnualEffort = calculateAssessmentScores(baseResponses, baseMetadata);
const highAnnualEffort = calculateAssessmentScores({
    ...baseResponses,
    workPattern: { ...baseResponses.workPattern, volume: baseResponses.workPattern.volume! * 2 },
}, baseMetadata);
assert(highAnnualEffort.decisionPack.businessValue.rawValueScore >= lowAnnualEffort.decisionPack.businessValue.rawValueScore, 'Higher annual effort should not reduce value score.');

const lowRisk = calculateAssessmentScores({ ...baseResponses, risk: { ...baseResponses.risk, riskCriticality: 2, governanceSensitivity: 2, errorReversibility: 5 }, dataProfile: { ...baseResponses.dataProfile, dataSensitivity: 2 } }, baseMetadata);
const highRisk = calculateAssessmentScores({ ...baseResponses, risk: { ...baseResponses.risk, riskCriticality: 5, governanceSensitivity: 5, errorReversibility: 1 }, dataProfile: { ...baseResponses.dataProfile, dataSensitivity: 5 } }, baseMetadata);
assert((highRisk.supportingScores.governanceRisk || 0) > (lowRisk.supportingScores.governanceRisk || 0), 'Higher risk and lower reversibility should increase governance risk.');

const lowEvidence = calculateAssessmentScores(baseResponses, { ...baseMetadata, evidenceQuality: 1 });
const highEvidence = calculateAssessmentScores(baseResponses, { ...baseMetadata, evidenceQuality: 5 });
assert(highEvidence.supportingScores.confidence > lowEvidence.supportingScores.confidence, 'Higher evidence quality should increase confidence.');

const clearGoal = calculateAssessmentScores({ ...baseResponses, judgment: { ...baseResponses.judgment, goalAmbiguity: 1 }, risk: { ...baseResponses.risk, riskCriticality: 5 } }, baseMetadata);
const ambiguousGoal = calculateAssessmentScores({ ...baseResponses, judgment: { ...baseResponses.judgment, goalAmbiguity: 5 }, risk: { ...baseResponses.risk, riskCriticality: 5 } }, baseMetadata);
assert(!clearGoal.gatesTriggered.includes('Human-Led / Do Not Automate'), 'Clear goals should not trigger human-led gate by polarity.');
assertIncludes(ambiguousGoal.gatesTriggered, 'Human-Led / Do Not Automate', 'Ambiguous high-risk goals should trigger human-led gate.');
console.log('Monotonic and polarity regressions passed.');

console.log('All deterministic Assess scoring tests passed.');
