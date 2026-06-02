const stringify = (value: unknown) => JSON.stringify(value ?? null, null, 2);

const asRecord = (value: unknown): Record<string, unknown> =>
  value && typeof value === 'object' ? value as Record<string, unknown> : {};

const asArray = (value: unknown): unknown[] => Array.isArray(value) ? value : [];

const titleFor = (value: string) =>
  value
    .replace(/[-_]+/g, ' ')
    .replace(/\b\w/g, (letter) => letter.toUpperCase());

const markdownFromSectionMap = (artifactName: string, artifact: unknown) => {
  const record = asRecord(artifact);
  const sections = asRecord(record.sections);
  const lines = [`## ${titleFor(artifactName)}`, ''];

  if (!Object.keys(sections).length) {
    lines.push('_No generated sections were found for this artifact._', '');
    return lines.join('\n');
  }

  for (const [sectionTitle, content] of Object.entries(sections)) {
    lines.push(`### ${sectionTitle}`, '');
    lines.push(typeof content === 'string' ? content : stringify(content), '');
  }

  return lines.join('\n');
};

const markdownList = (items: unknown[]) => {
  if (!items.length) return '_None recorded._';
  return items.map((item) => {
    if (typeof item === 'string') return `- ${item}`;
    const record = asRecord(item);
    const title = String(record.title || record.name || record.id || 'Item');
    const details = Object.entries(record)
      .filter(([key]) => !['title', 'name', 'id'].includes(key))
      .map(([key, value]) => `${key}: ${typeof value === 'string' ? value : stringify(value)}`)
      .join('; ');
    return `- **${title}**${details ? ` - ${details}` : ''}`;
  }).join('\n');
};

export const renderGeneratedDocumentMarkdown = (documentRow: Record<string, unknown>) => {
  const artifacts = asRecord(documentRow.artifacts);
  const lines = [
    '# KlarityPM Generated Document',
    '',
    `Document ID: ${documentRow.id || 'N/A'}`,
    `Project ID: ${documentRow.project_id || 'N/A'}`,
    `Template ID: ${documentRow.template_id || 'N/A'}`,
    `Generated At: ${documentRow.generated_at || documentRow.created_at || new Date().toISOString()}`,
    '',
  ];

  for (const artifactName of ['brd', 'frd', 'pdd']) {
    lines.push(markdownFromSectionMap(artifactName, artifacts[artifactName]), '');
  }

  const qualityGate = asRecord(artifacts.qualityGate);
  lines.push('## Quality Gate', '');
  lines.push(`Status: ${qualityGate.status || qualityGate.decision || 'Not recorded'}`, '');
  lines.push('### Gaps', '');
  lines.push(markdownList(asArray(qualityGate.gaps || qualityGate.qualityGaps)), '');
  lines.push('### Assumptions', '');
  lines.push(markdownList(asArray(qualityGate.assumptions)), '');

  const diagrams = asRecord(artifacts.diagrams);
  const diagramEntries = Object.entries(diagrams).filter(([, value]) => typeof value === 'string' && value.trim());
  lines.push('## Diagrams', '');
  if (!diagramEntries.length) {
    lines.push('_No diagrams were generated._', '');
  } else {
    for (const [name, code] of diagramEntries) {
      lines.push(`### ${titleFor(name)}`, '', '```mermaid', String(code), '```', '');
    }
  }

  lines.push('## Work Items', '');
  lines.push(markdownList(asArray(artifacts.workItems)), '');
  lines.push('## Approvals', '');
  lines.push(markdownList(asArray(artifacts.approvals)), '');

  return `${lines.join('\n').trim()}\n`;
};

export const renderDecisionPackMarkdown = (assessmentRow: Record<string, unknown>) => {
  const scores = asRecord(assessmentRow.scores);
  const decisionPack = asRecord(scores.decisionPack);
  const handoffPack = asRecord(scores.handoffPack);
  const recommendation = asRecord(scores.recommendation);
  const supportingScores = asRecord(scores.supportingScores);
  const businessValue = asRecord(decisionPack.businessValue);

  const lines = [
    '# KlarityPM Assessment Decision Pack',
    '',
    `Assessment ID: ${assessmentRow.id || 'N/A'}`,
    `Process ID: ${assessmentRow.process_id || 'N/A'}`,
    `Status: ${assessmentRow.status || 'N/A'}`,
    `Score Version: ${scores.scoreVersion || 'N/A'}`,
    `Calculated At: ${scores.calculatedAt || 'N/A'}`,
    '',
    '## Final Decision',
    '',
    `Decision: ${decisionPack.finalDecision || scores.gateDecision || 'Not recorded'}`,
    `Risk Tier: ${scores.riskTier || 'Not recorded'}`,
    `Confidence: ${scores.confidenceBand || supportingScores.confidence || 'Not recorded'}`,
    `Recommendation: ${recommendation.category || recommendation.label || 'Not recorded'}`,
    '',
    '## Technology Fit Scores',
    '',
    markdownList(Object.entries(asRecord(scores.techFitScores)).map(([name, score]) => ({ name, score }))),
    '',
    '## Gate Outcomes',
    '',
    markdownList(asArray(scores.gatesTriggered)),
    '',
    '## Business Value',
    '',
    markdownList(Object.entries(businessValue).map(([name, value]) => ({ name, value }))),
    '',
    '## Scoring Formula Summary',
    '',
    markdownList(asArray(decisionPack.scoringFormulaSummary)),
    '',
    '## Decision Pack',
    '',
    stringify(decisionPack),
    '',
    '## Handoff Pack',
    '',
    stringify(handoffPack),
    '',
    '## Evidence Items',
    '',
    markdownList(asArray(assessmentRow.evidence_items)),
    '',
    '## Assumptions',
    '',
    markdownList(asArray(assessmentRow.assumptions)),
    '',
  ];

  return `${lines.join('\n').trim()}\n`;
};

export const renderDecisionPackJson = (assessmentRow: Record<string, unknown>) =>
  stringify({
    assessmentId: assessmentRow.id,
    processId: assessmentRow.process_id,
    status: assessmentRow.status,
    scores: assessmentRow.scores,
    evidenceItems: assessmentRow.evidence_items,
    assumptions: assessmentRow.assumptions,
    exportedAt: new Date().toISOString(),
  });
