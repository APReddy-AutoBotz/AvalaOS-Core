import { Assessment, AvalaGovernLiteCard } from '../types';

type DecisionPackExportFormat = 'json' | 'markdown';

const safeFileName = (value: string) =>
  value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80) || 'decision-pack';

const formatList = (items: unknown[]) => {
  if (!items.length) return '- None recorded';
  return items.map((item) => {
    if (typeof item === 'string') return `- ${item}`;
    if (!item || typeof item !== 'object') return `- ${String(item)}`;
    const record = item as Record<string, unknown>;
    const title = String(record.title || record.name || record.id || 'Item');
    const detail = Object.entries(record)
      .filter(([key]) => !['title', 'name', 'id'].includes(key))
      .map(([key, value]) => `${key}: ${typeof value === 'string' ? value : JSON.stringify(value)}`)
      .join('; ');
    return `- **${title}**${detail ? ` - ${detail}` : ''}`;
  }).join('\n');
};

const renderGovernLiteMarkdown = (governCard?: AvalaGovernLiteCard) => {
  if (!governCard) return ['## Avala Govern', '', '- Not available for this export.', ''];

  return [
    '## Avala Govern',
    '',
    `Governance Status: ${governCard.governanceStatus}`,
    `Agent / Automation: ${governCard.agentOrAutomationName}`,
    `Mapped Process: ${governCard.mappedProcessId}`,
    `Business Owner: ${governCard.businessOwner}`,
    `Technical Owner: ${governCard.technicalOwner}`,
    `Technology Pattern: ${governCard.technologyPattern}`,
    `Systems Accessed: ${governCard.systemsAccessed.join(', ') || 'Not documented'}`,
    `Tools Used: ${governCard.toolsUsed.join(', ') || 'Not documented'}`,
    `Data Sensitivity: ${governCard.dataSensitivity}`,
    `Autonomy Level: ${governCard.autonomyLevel}`,
    `Risk Level: ${governCard.riskLevel}`,
    `Approval Policy: ${governCard.approvalPolicy}`,
    `Evidence Policy: ${governCard.evidencePolicy}`,
    `Review Frequency: ${governCard.reviewFrequency}`,
    `Audit Status: ${governCard.auditStatus}`,
    `Next Governance Action: ${governCard.nextGovernanceAction}`,
    governCard.blockedReason ? `Blocked Reason: ${governCard.blockedReason}` : '',
    '',
    '### Autonomy Rationale',
    '',
    formatList(governCard.autonomyRationale),
    '',
    '### Risk Rationale',
    '',
    formatList(governCard.riskRationale),
    '',
    '### Approval Rationale',
    '',
    formatList(governCard.approvalRationale),
    '',
    '### Evidence Gaps',
    '',
    formatList(governCard.evidenceGaps),
    '',
    '### Allowed Actions',
    '',
    formatList(governCard.allowedActions),
    '',
    '### Blocked Actions',
    '',
    formatList(governCard.blockedActions),
    '',
  ].filter(line => line !== '');
};

export const renderAssessmentDecisionPackMarkdown = (assessment: Assessment, processName = 'Process', governCard?: AvalaGovernLiteCard) => {
  const scores = assessment.scores;
  if (!scores) throw new Error('Assessment has not been scored yet.');

  return [
    '# AvalaOS Core Assessment Decision Pack',
    '',
    `Process: ${processName}`,
    `Assessment ID: ${assessment.id}`,
    `Status: ${assessment.status}`,
    `Score Version: ${scores.scoreVersion}`,
    `Calculated At: ${scores.calculatedAt}`,
    '',
    '## Executive Summary',
    '',
    scores.decisionPack?.executiveSummary || 'No executive summary recorded.',
    '',
    '## Final Recommendation',
    '',
    `Decision: ${scores.decisionPack?.finalDecision || scores.gateDecision || 'Not recorded'}`,
    `Operating Model: ${scores.recommendation?.category || 'Not recorded'}`,
    `Primary Technology: ${scores.recommendation?.primaryTechnology || 'Not recorded'}`,
    `Secondary Technology: ${scores.recommendation?.secondaryTechnology || 'None'}`,
    `Risk Tier: ${scores.riskTier || 'Not recorded'}`,
    `Confidence: ${scores.confidenceBand || scores.supportingScores.confidence}`,
    `Handoff Eligibility: ${scores.handoffEligibility || 'Not recorded'}`,
    '',
    '## Technology Fit Scores',
    '',
    formatList(Object.entries(scores.techFitScores).map(([name, score]) => ({ name, score }))),
    '',
    '## Why This Recommendation',
    '',
    formatList(scores.decisionPack?.recommendedOperatingModel?.whyThis || scores.recommendation?.whyThis || []),
    '',
    '## Business Value',
    '',
    formatList(Object.entries(scores.decisionPack?.businessValue || {}).map(([name, value]) => ({ name, value }))),
    '',
    '## Scoring Formula Summary',
    '',
    formatList(scores.decisionPack?.scoringFormulaSummary || []),
    '',
    '## Governance Controls',
    '',
    formatList([
      ...(scores.decisionPack?.governance.auditControls || []),
      ...(scores.decisionPack?.governance.dataControls || []),
      ...(scores.decisionPack?.governance.monitoringControls || []),
      ...(scores.decisionPack?.governance.securityControls || []),
      ...(scores.handoffPack?.governanceControls || []),
    ]),
    '',
    ...renderGovernLiteMarkdown(governCard),
    '## Gate Outcomes',
    '',
    formatList(scores.gatesTriggered || []),
    '',
    '## Required Documents',
    '',
    formatList(scores.handoffPack?.requiredDocumentTypes || []),
    '',
    '## Suggested Backlog Items',
    '',
    formatList(scores.handoffPack?.suggestedBacklogItems || []),
    '',
    '## Evidence',
    '',
    formatList(assessment.evidenceItems || []),
    '',
    '## Assumptions',
    '',
    formatList(assessment.assumptions || []),
    '',
    '## Engine Trace',
    '',
    '```json',
    JSON.stringify(scores.engineOutputs || [], null, 2),
    '```',
    '',
  ].join('\n');
};

export const renderAssessmentDecisionPackJson = (assessment: Assessment, processName = 'Process', governCard?: AvalaGovernLiteCard) =>
  JSON.stringify({
    processName,
    assessmentId: assessment.id,
    processId: assessment.processId,
    orgId: assessment.orgId,
    status: assessment.status,
    scores: assessment.scores,
    evidenceItems: assessment.evidenceItems,
    assumptions: assessment.assumptions,
    review: assessment.review,
    avalaGovernLite: governCard,
    exportedAt: new Date().toISOString(),
    exportMode: 'local-demo',
  }, null, 2);

export const downloadAssessmentDecisionPack = (
  assessment: Assessment,
  processName: string | undefined,
  format: DecisionPackExportFormat,
  governCard?: AvalaGovernLiteCard,
) => {
  const isJson = format === 'json';
  const content = isJson
    ? renderAssessmentDecisionPackJson(assessment, processName, governCard)
    : renderAssessmentDecisionPackMarkdown(assessment, processName, governCard);
  const blob = new Blob([content], { type: isJson ? 'application/json' : 'text/markdown' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `${safeFileName(processName || 'decision-pack')}-decision-pack.${isJson ? 'json' : 'md'}`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
};
