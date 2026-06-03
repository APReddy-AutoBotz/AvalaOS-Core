import { DeliveryPack } from '../types';

const safe = (value: unknown) => {
  if (value === undefined || value === null || value === '') return 'Not available';
  return String(value);
};

const list = (items: string[]) => items.length > 0 ? items.map(item => `- ${item}`).join('\n') : '- None recorded';

export const renderDeliveryPackMarkdown = (pack: DeliveryPack) => {
  const lines: string[] = [
    '# AvalaOS Core Governed Delivery Pack',
    '',
    `Pack: ${pack.title}`,
    `Project: ${pack.projectName}`,
    `Status: ${pack.status}`,
    `Generated At: ${pack.exportMetadata.generatedAt}`,
    `Exported At: ${pack.exportMetadata.exportedAt}`,
    '',
    '## Source References',
    list(pack.sources.map(source => `${source.type}: ${source.title} (${source.id}) - ${safe(source.status)}`)),
    '',
    '## Decision Summary',
    pack.decisionSummary
      ? list([
          `Assessment: ${safe(pack.decisionSummary.assessmentId)}`,
          `Score Version: ${safe(pack.decisionSummary.scoreVersion)}`,
          `Gate Decision: ${safe(pack.decisionSummary.gateDecision)}`,
          `Risk Tier: ${safe(pack.decisionSummary.riskTier)}`,
          `Recommendation: ${safe(pack.decisionSummary.recommendationCategory)}`,
          `Primary Technology: ${safe(pack.decisionSummary.primaryTechnology)}`,
          `Handoff Eligibility: ${safe(pack.decisionSummary.handoffEligibility)}`,
        ])
      : '- No assessment decision summary is linked.',
    '',
    '## Avala Govern Lite',
    pack.governLite
      ? list([
          `Status: ${pack.governLite.governanceStatus}`,
          `Autonomy Level: ${pack.governLite.autonomyLevel}`,
          `Risk Level: ${pack.governLite.riskLevel}`,
          `Approval Policy: ${pack.governLite.approvalPolicy}`,
          `Evidence Policy: ${pack.governLite.evidencePolicy}`,
          `Next Action: ${pack.governLite.nextGovernanceAction}`,
        ])
      : '- No Govern Lite snapshot is linked.',
    '',
    '## Studio Document References',
    list(pack.documents.map(document => `${document.title} (${document.id}) - artifacts: ${document.artifactKeys.join(', ') || 'none'}; approval: ${document.approvalStatus}; quality: ${document.qualityGateStatus}; summary: ${document.summary}`)),
    '',
    '## Delivery Work Items',
    list(pack.workItems.map(item => `${item.title} (${item.id}) - ${item.status}; owners: ${item.ownerNames.join(', ')}; lineage: ${item.lineageStatus}; evidence refs: ${item.evidenceRefs.join(', ') || 'none'}`)),
    '',
    '## Approval Checklist',
    list(pack.approvalChecklist.map(item => `${item.label} - ${item.status}; source: ${item.source}; ${item.detail}`)),
    '',
    '## Evidence Checklist',
    list(pack.evidenceChecklist.map(item => `${item.label} - ${item.status}; source: ${item.source}; ${item.detail}`)),
    '',
    '## Blockers',
    list(pack.blockers.map(blocker => `${blocker.severity}: ${blocker.label}; source: ${blocker.source}; ${blocker.detail}`)),
    '',
    '## Audit Summary',
    list(pack.auditSummary.map(event => `${event.label} (${event.id}) - ${event.status}; ${event.sourceType}:${event.sourceId} -> ${safe(event.targetType)}:${safe(event.targetId)}; evidence refs: ${event.evidenceRefs.join(', ') || 'none'}`)),
    '',
    '## Export Metadata',
    list([
      `Source Count: ${pack.exportMetadata.sourceCount}`,
      `Export Mode: ${pack.exportMetadata.exportMode}`,
      `Omitted Content Policy: ${pack.exportMetadata.omittedContentPolicy}`,
    ]),
    '',
  ];

  return lines.join('\n');
};

export const renderDeliveryPackJson = (pack: DeliveryPack) => JSON.stringify(pack, null, 2);

export type DeliveryPackExportFormat = 'markdown' | 'json';

export const getDeliveryPackExport = (pack: DeliveryPack, format: DeliveryPackExportFormat) => ({
  fileName: `${pack.id}.${format === 'markdown' ? 'md' : 'json'}`,
  mimeType: format === 'markdown' ? 'text/markdown;charset=utf-8' : 'application/json;charset=utf-8',
  content: format === 'markdown' ? renderDeliveryPackMarkdown(pack) : renderDeliveryPackJson(pack),
});

export const downloadDeliveryPackExport = (pack: DeliveryPack, format: DeliveryPackExportFormat) => {
  const { fileName, mimeType, content } = getDeliveryPackExport(pack, format);
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
};
