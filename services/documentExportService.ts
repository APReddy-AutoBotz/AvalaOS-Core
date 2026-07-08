import { DocTemplate, GeneratedArtifacts, DocumentArtifactKeys } from '../types';
import {
  ArtifactExportDecision,
  assertArtifactExportExecutionAllowed,
} from './artifactExportPolicy';

type DocumentExportFormat = 'json' | 'markdown';

const safeFileName = (value: string) =>
  value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80) || 'generated-document';

const renderDocArtifactMarkdown = (artifactKey: DocumentArtifactKeys, artifact: any) => {
  const lines = [`## ${artifact?.title || artifactKey.toUpperCase()}`, ''];
  const sections = Array.isArray(artifact?.sections) ? artifact.sections : [];

  if (!sections.length) {
    lines.push('_No sections were generated for this artifact._', '');
    return lines.join('\n');
  }

  sections.forEach((section: any) => {
    lines.push(`### ${section.title || section.key || 'Section'}`, '');
    lines.push(section.content || '_No content generated._', '');
    if (section.citations?.length) {
      lines.push(`Sources: ${section.citations.join(', ')}`, '');
    }
  });

  return lines.join('\n');
};

const renderList = (items: unknown[]) => {
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

export const renderGeneratedArtifactsMarkdown = (artifacts: GeneratedArtifacts, template?: DocTemplate | null) => [
  '# AvalaOS Core Generated Document',
  '',
  `Template: ${template?.title || 'Selected template'}`,
  `Exported At: ${new Date().toISOString()}`,
  '',
  renderDocArtifactMarkdown('brd', artifacts.brd),
  renderDocArtifactMarkdown('frd', artifacts.frd),
  renderDocArtifactMarkdown('pdd', artifacts.pdd),
  '## Quality Gate',
  '',
  `Status: ${artifacts.qualityGate?.gapPoints?.length ? 'Review required' : 'Ready for review'}`,
  '',
  '### Ambiguities',
  '',
  renderList(artifacts.qualityGate?.ambiguityPoints || []),
  '',
  '### Gaps',
  '',
  renderList(artifacts.qualityGate?.gapPoints || []),
  '',
  '## Diagrams',
  '',
  '### As-Is',
  '',
  '```mermaid',
  artifacts.diagrams?.asIs?.mermaidCode || '',
  '```',
  '',
  '### To-Be',
  '',
  '```mermaid',
  artifacts.diagrams?.toBe?.mermaidCode || '',
  '```',
  '',
  '## Work Items',
  '',
  renderList(artifacts.workItems || []),
  '',
  '## Approvals',
  '',
  renderList(artifacts.approvals || []),
  '',
].join('\n');

export const downloadGeneratedArtifacts = (
  artifacts: GeneratedArtifacts,
  template: DocTemplate | null | undefined,
  format: DocumentExportFormat,
  artifactDecision?: ArtifactExportDecision | null,
) => {
  assertArtifactExportExecutionAllowed({
    helperId: 'documentExportService.downloadGeneratedArtifacts',
    operation: 'export',
    decision: artifactDecision,
    expectedAction: 'document.export',
    expectedArtifactType: 'generated_document_export',
    sourceSurfaceId: artifactDecision?.sourceSurfaceId || 'document-export-service.local-download',
  });
  const title = (artifacts[template?.artifactKey || 'brd'] as any)?.title || template?.title || 'generated-document';
  const isJson = format === 'json';
  const content = isJson
    ? JSON.stringify({ templateId: template?.id, templateTitle: template?.title, artifacts, exportedAt: new Date().toISOString(), exportMode: 'local-demo' }, null, 2)
    : renderGeneratedArtifactsMarkdown(artifacts, template);
  const blob = new Blob([content], { type: isJson ? 'application/json' : 'text/markdown' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `${safeFileName(title)}.${isJson ? 'json' : 'md'}`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
};
