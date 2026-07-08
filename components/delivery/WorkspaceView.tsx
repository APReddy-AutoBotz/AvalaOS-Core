import React, { useState, useRef } from 'react';
import { GeneratedArtifacts, DocTemplate, User, ApprovalStatus, Approver, WorkItem, DocumentSection, DocumentArtifactKeys, AiProviderType } from '../../types';
import MermaidRenderer from '../shared/MermaidRenderer';
import { 
    DocumentTextIcon, ChartPieIcon, ClipboardListIcon,
    ExclamationTriangleIcon, LightBulbIcon, ArrowPathIcon,
    UserCheckIcon, PencilSquareIcon, CheckCircleIcon, ClockIcon, XCircleIcon, SparklesIcon,
    ChatBubbleLeftIcon, InformationCircleIcon, DocumentDuplicateIcon
} from '../shared/icons';
import ApprovalModal from './ApprovalModal';
import ImportWorkItemsModal from './ImportWorkItemsModal';
import RefineSectionModal from '../docs/RefineSectionModal';
import Modal from '../shared/Modal';
import { Tooltip } from '../shared/ui/Tooltip';
import { useOrganizationContext } from '../auth/OrganizationProvider';
import { isModuleEnabled } from '../../constants/moduleConfig';
import { aiEdgeClient, isAiEdgeEnabled } from '../../services/aiEdgeClient';
import { downloadGeneratedArtifacts } from '../../services/documentExportService';
import type { ProductActionDecision } from '../../services/productActionPolicy';
import { assertArtifactExportExecutionAllowed, type ArtifactExportDecision } from '../../services/artifactExportPolicy';


// Make marked available globally from the script tag in index.html
declare global {
  interface Window {
    marked: any;
  }
}

interface WorkspaceViewProps {
  artifacts: GeneratedArtifacts | null;
  generationId?: string | null;
  template: DocTemplate | null;
  error: string | null;
  onDone: () => void;
  users: User[];
  currentUser: User;
  onUpdateApprovalStatus: (userId: string, status: ApprovalStatus, comments?: string) => void;
  onResubmitForApproval: (userId: string) => void;
  onInitiateImport: (items: WorkItem[]) => void;
  onRefineSection: (artifactKey: DocumentArtifactKeys, sectionKey: string, newContent: string) => void;
  aiProviderType: AiProviderType;
  actionPolicy?: {
    documentExport?: ProductActionDecision;
    artifactDownload?: ProductActionDecision;
    refine?: ProductActionDecision;
    approval?: ProductActionDecision;
    importWorkItems?: ProductActionDecision;
  };
  artifactPolicy?: {
    documentExport?: ArtifactExportDecision;
    documentDownload?: ArtifactExportDecision;
    signedUrl?: ArtifactExportDecision;
  };
}

type RightPanelTab = 'quality' | 'diagrams' | 'work' | 'approvals';

const renderMarkdownWithMermaid = (content: string, sectionKey: string) => {
  const mermaidFence = /```mermaid\s*([\s\S]*?)```/gi;
  const parts: Array<{ type: 'markdown' | 'mermaid'; content: string }> = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = mermaidFence.exec(content)) !== null) {
    if (match.index > lastIndex) {
      parts.push({ type: 'markdown', content: content.slice(lastIndex, match.index) });
    }
    parts.push({ type: 'mermaid', content: match[1].trim() });
    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < content.length) {
    parts.push({ type: 'markdown', content: content.slice(lastIndex) });
  }

  if (parts.length === 0) {
    parts.push({ type: 'markdown', content });
  }

  return parts.map((part, index) => {
    if (part.type === 'mermaid') {
      return <MermaidRenderer key={`${sectionKey}-diagram-${index}`} code={part.content} id={`${sectionKey}-${index}`} />;
    }
    return (
      <div
        key={`${sectionKey}-markdown-${index}`}
        dangerouslySetInnerHTML={{ __html: window.marked ? window.marked.parse(part.content) : part.content.replace(/\n/g, '<br />') }}
      />
    );
  });
};

const toSafeFileName = (value: string) =>
  value
    .replace(/[^a-z0-9]+/gi, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase() || 'avalaos-core-document';

const WorkspaceView: React.FC<WorkspaceViewProps> = ({ artifacts, generationId, template, error, onDone, users, currentUser, onUpdateApprovalStatus, onResubmitForApproval, onInitiateImport, onRefineSection, aiProviderType, actionPolicy, artifactPolicy }) => {
  const { currentOrganization } = useOrganizationContext();
  const [activeTab, setActiveTab] = useState<RightPanelTab>('quality');
  const [exportingDocument, setExportingDocument] = useState<'json' | 'markdown' | null>(null);
  const [isApprovalModalOpen, setApprovalModalOpen] = useState(false);
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [refineModalState, setRefineModalState] = useState<{
    isOpen: boolean;
    section: DocumentSection | null;
  }>({ isOpen: false, section: null });
  const [editModalState, setEditModalState] = useState<{
    isOpen: boolean;
    section: DocumentSection | null;
    content: string;
  }>({ isOpen: false, section: null, content: '' });
  const mainContentRef = useRef<HTMLDivElement>(null);

  if (!artifacts || !template) {
    return <div className="text-center py-10">Loading artifacts...</div>;
  }

  const documentData = artifacts[template.artifactKey];
  const deliveryEnabled = isModuleEnabled('delivery', currentOrganization?.enabledModules);
  const isActionAllowed = (decision?: ProductActionDecision) => decision?.allowed ?? true;
  const isArtifactActionAllowed = (decision?: ArtifactExportDecision) => decision?.allowed ?? false;
  const blockedMessage = (decision: ProductActionDecision | ArtifactExportDecision | undefined, fallback: string) => decision && !decision.allowed ? decision.message : fallback;
  const blockAction = (decision: ProductActionDecision | ArtifactExportDecision | undefined, fallback: string) => alert(blockedMessage(decision, fallback));
  const canDownloadArtifact = isArtifactActionAllowed(artifactPolicy?.documentDownload);
  const canExportDocument = isArtifactActionAllowed(artifactPolicy?.documentExport);
  const canRefineDocument = isActionAllowed(actionPolicy?.refine);
  const canExecuteApproval = isActionAllowed(actionPolicy?.approval);
  const canImportWorkItems = isActionAllowed(actionPolicy?.importWorkItems);

  const getExportHtml = () => {
    const root = mainContentRef.current?.querySelector('.document-export-root') as HTMLElement | null;
    return root?.innerHTML || '';
  };

  const handleDownloadWord = () => {
    if (!canDownloadArtifact) {
      blockAction(artifactPolicy?.documentDownload, 'Document downloads are blocked until a later approved artifact boundary.');
      return;
    }
    assertArtifactExportExecutionAllowed({
      helperId: 'WorkspaceView.handleDownloadWord',
      operation: 'download',
      decision: artifactPolicy?.documentDownload,
      expectedAction: 'document.download',
      expectedArtifactType: 'generated_document_download',
      sourceSurfaceId: artifactPolicy?.documentDownload?.sourceSurfaceId || 'workspace.generated-document-word-download',
    });
    const html = getExportHtml();
    if (!html) return;

    const documentHtml = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <title>${documentData.title}</title>
  <style>
    body { font-family: Arial, sans-serif; color: #0f172a; line-height: 1.55; }
    h1 { color: #002c4b; font-size: 28px; margin-bottom: 6px; }
    h2 { color: #002c4b; font-size: 20px; margin-top: 28px; border-bottom: 1px solid #d9e2ec; padding-bottom: 8px; }
    h3 { color: #0f172a; font-size: 16px; margin-top: 18px; }
    table { border-collapse: collapse; width: 100%; margin: 12px 0 18px; }
    th, td { border: 1px solid #cbd5e1; padding: 8px 10px; vertical-align: top; }
    th { background: #eef3f7; color: #002c4b; }
    blockquote { border-left: 4px solid #ffbc03; margin: 12px 0; padding: 8px 12px; background: #fff8e1; }
    pre { background: #f8fafc; border: 1px solid #e2e8f0; padding: 12px; white-space: pre-wrap; }
    .section-actions, button { display: none !important; }
  </style>
</head>
<body>
  <h1>${documentData.title}</h1>
  <p><strong>Generated by AvalaOS Core</strong> using ${template.title}. Review and sign off before external distribution.</p>
  ${html}
</body>
</html>`;

    const blob = new Blob(['\ufeff', documentHtml], { type: 'application/msword' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${toSafeFileName(documentData.title)}.doc`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  };

  const handlePrintPdf = () => {
    if (!canDownloadArtifact) {
      blockAction(artifactPolicy?.documentDownload, 'Document downloads are blocked until a later approved artifact boundary.');
      return;
    }
    assertArtifactExportExecutionAllowed({
      helperId: 'WorkspaceView.handlePrintPdf',
      operation: 'download',
      decision: artifactPolicy?.documentDownload,
      expectedAction: 'document.download',
      expectedArtifactType: 'generated_document_download',
      sourceSurfaceId: artifactPolicy?.documentDownload?.sourceSurfaceId || 'workspace.generated-document-pdf-print',
    });
    const html = getExportHtml();
    if (!html) return;

    const printWindow = window.open('', '_blank', 'noopener,noreferrer');
    if (!printWindow) return;
    printWindow.document.write(`<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <title>${documentData.title}</title>
  <style>
    @page { margin: 18mm; }
    body { font-family: Inter, Arial, sans-serif; color: #0f172a; line-height: 1.55; }
    h1 { color: #002c4b; font-size: 28px; margin-bottom: 6px; }
    h2 { color: #002c4b; font-size: 20px; margin-top: 28px; border-bottom: 1px solid #d9e2ec; padding-bottom: 8px; break-after: avoid; }
    h3 { color: #0f172a; font-size: 16px; break-after: avoid; }
    p, li, td { font-size: 12px; }
    table { border-collapse: collapse; width: 100%; margin: 12px 0 18px; break-inside: avoid; }
    th, td { border: 1px solid #cbd5e1; padding: 8px 10px; vertical-align: top; }
    th { background: #eef3f7; color: #002c4b; }
    blockquote { border-left: 4px solid #ffbc03; margin: 12px 0; padding: 8px 12px; background: #fff8e1; }
    pre { background: #f8fafc; border: 1px solid #e2e8f0; padding: 12px; white-space: pre-wrap; }
    .section-actions, button { display: none !important; }
  </style>
</head>
<body>
  <h1>${documentData.title}</h1>
  <p><strong>Generated by AvalaOS Core</strong> using ${template.title}. Review and sign off before external distribution.</p>
  ${html}
  <script>window.onload = () => { window.print(); };</script>
</body>
</html>`);
    printWindow.document.close();
  };

  const handleStructuredExport = async (format: 'json' | 'markdown') => {
    if (!canExportDocument) {
      blockAction(artifactPolicy?.documentExport, 'Structured document export is blocked until a later approved artifact boundary.');
      return;
    }
    setExportingDocument(format);
    try {
      if (isAiEdgeEnabled() && generationId) {
        if (!isArtifactActionAllowed(artifactPolicy?.signedUrl)) {
          blockAction(artifactPolicy?.signedUrl, 'Signed URL generation is blocked until a later approved artifact boundary.');
          return;
        }
        const exportResult = await aiEdgeClient.exportDocument({
          documentId: generationId,
          exportType: format,
        }, artifactPolicy?.documentExport);
        const signedUrl = await aiEdgeClient.createSignedDownloadUrl(exportResult.downloadReference, artifactPolicy?.signedUrl);
        window.open(signedUrl, '_blank', 'noopener,noreferrer');
      } else {
        downloadGeneratedArtifacts(artifacts, template, format, artifactPolicy?.documentExport);
      }
    } catch (err: any) {
      alert(err.message || 'Unable to export this generated document.');
    } finally {
      setExportingDocument(null);
    }
  };
  
  const openEditSection = (section: DocumentSection) => {
    if (!canRefineDocument) {
      blockAction(actionPolicy?.refine, 'Document refinement is not authorized for this workspace.');
      return;
    }
    setEditModalState({ isOpen: true, section, content: section.content });
  };

  const openRefineSection = (section: DocumentSection) => {
    if (!canRefineDocument) {
      blockAction(actionPolicy?.refine, 'Document refinement is not authorized for this workspace.');
      return;
    }
    setRefineModalState({ isOpen: true, section });
  };

  const handleGoToSection = (sectionKey: string) => {
    const sectionEl = mainContentRef.current?.querySelector(`[data-section-key="${sectionKey}"]`);
    if (sectionEl) {
        sectionEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
        // Use a glowing animation to draw attention
        sectionEl.classList.add('animate-glow');
        setTimeout(() => {
            sectionEl.classList.remove('animate-glow');
        }, 2500); // Duration of the glow animation
    }
  };

  if (
    !documentData || typeof documentData !== 'object' || !('title' in documentData) ||
    !('sections' in documentData) || !Array.isArray((documentData as any).sections)
  ) {
    return (
        <div className="bg-red-500/10 border-l-4 border-abz-danger text-red-700 dark:text-red-300 p-4 rounded-2xl" role="alert">
          <p className="font-bold">Display Error</p>
          <p className="text-sm">Could not display the main document. The selected template artifact key does not correspond to a valid document format.</p>
        </div>
    );
  }

  const rightPanelTabs: { id: RightPanelTab, label: string, icon: React.FC<{className?: string}>}[] = [
      { id: 'quality', label: 'Quality Gate', icon: LightBulbIcon },
      { id: 'approvals', label: 'Approvals', icon: UserCheckIcon },
      { id: 'diagrams', label: 'Diagrams', icon: ChartPieIcon },
      { id: 'work', label: 'Work Items', icon: ClipboardListIcon },
  ];

  return (
    <div className="space-y-8">
      {error && (
        <div className="bg-red-500/10 border-l-4 border-abz-danger text-red-700 dark:text-red-300 p-4 rounded-2xl" role="alert">
          <div className="flex">
            <div className="py-1"><ExclamationTriangleIcon className="h-6 w-6 mr-3" /></div>
            <div>
              <p className="font-bold">Generation Error</p>
              <p className="text-sm">{error} The app has loaded sample data to demonstrate the workspace view.</p>
            </div>
          </div>
        </div>
      )}

       <div className="flex justify-between items-center">
            <div>
                <h1 className="text-3xl font-bold">Generated Artifacts</h1>
                <p className="text-slate-500 dark:text-slate-400 mt-1">Review editable drafts, diagrams, and work items before human sign-off.</p>
            </div>
            <div className="flex items-center gap-3">
              <button onClick={handleDownloadWord} disabled={!canDownloadArtifact} title={!canDownloadArtifact ? blockedMessage(artifactPolicy?.documentDownload, 'Document downloads are blocked until a later approved artifact boundary.') : undefined} className="flex items-center gap-2 px-4 py-2 text-sm font-semibold btn-secondary disabled:cursor-not-allowed disabled:opacity-50">
                  <DocumentTextIcon className="h-5 w-5" />
                  <span>Download Word</span>
              </button>
              <button onClick={handlePrintPdf} disabled={!canDownloadArtifact} title={!canDownloadArtifact ? blockedMessage(artifactPolicy?.documentDownload, 'Document downloads are blocked until a later approved artifact boundary.') : undefined} className="flex items-center gap-2 px-4 py-2 text-sm font-semibold btn-secondary disabled:cursor-not-allowed disabled:opacity-50">
                  <DocumentDuplicateIcon className="h-5 w-5" />
                  <span>Print / PDF</span>
              </button>
              <button
                onClick={() => handleStructuredExport('markdown')}
                disabled={Boolean(exportingDocument) || !canExportDocument}
                title={!canExportDocument ? blockedMessage(artifactPolicy?.documentExport, 'Structured document export is blocked until a later approved artifact boundary.') : undefined}
                className="flex items-center gap-2 px-4 py-2 text-sm font-semibold btn-secondary disabled:cursor-not-allowed disabled:opacity-60"
              >
                  <ClipboardListIcon className="h-5 w-5" />
                  <span>{exportingDocument === 'markdown' ? 'Exporting...' : 'Markdown'}</span>
              </button>
              <button
                onClick={() => handleStructuredExport('json')}
                disabled={Boolean(exportingDocument) || !canExportDocument}
                title={!canExportDocument ? blockedMessage(artifactPolicy?.documentExport, 'Structured document export is blocked until a later approved artifact boundary.') : undefined}
                className="flex items-center gap-2 px-4 py-2 text-sm font-semibold btn-secondary disabled:cursor-not-allowed disabled:opacity-60"
              >
                  <DocumentDuplicateIcon className="h-5 w-5" />
                  <span>{exportingDocument === 'json' ? 'Exporting...' : 'JSON'}</span>
              </button>
              <button onClick={onDone} className="flex items-center gap-2 px-4 py-2 text-sm font-semibold btn-ghost">
                <ArrowPathIcon className="h-5 w-5" />
                <span>Finish & Return</span>
              </button>
            </div>
        </div>
        <div className="rounded-lg bg-slate-50 px-3 py-2 text-xs font-semibold leading-5 text-slate-600 ring-1 ring-slate-200 dark:bg-slate-900/60 dark:text-slate-300 dark:ring-slate-800">
          Export, download, storage, and signed URL controls are blocked by the artifact boundary until a later approved execution gate. Continue review in-app and preserve source lineage, evidence refs, and human sign-off context.
        </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div ref={mainContentRef} className="lg:col-span-2 bg-white dark:bg-surface-dark rounded-2xl shadow-soft border border-slate-200 dark:border-gray-700 overflow-hidden">
          <div className="flex justify-between items-center p-6 border-b border-slate-200 dark:border-gray-700">
            <div className="flex items-center gap-3">
              <DocumentTextIcon className="h-8 w-8 text-abz-primary" />
              <div>
                <h2 className="text-2xl font-bold">{documentData.title}</h2>
                <p className="text-sm text-slate-500 dark:text-slate-400">Based on your '{template.title}' template</p>
              </div>
            </div>
          </div>
          <div className="document-export-root generated-document p-7">
            {documentData.sections.map(section => (
              <section key={section.key} data-section-key={section.key} className="doc-section group/section relative">
                 <div className="flex justify-between items-start gap-4">
                    <div className="flex items-center gap-2">
                      <h2>{section.title}</h2>
                      {section.citations && section.citations.length > 0 && (
                          <Tooltip content={`Sources: ${section.citations.join(', ')}`} position="right">
                              <InformationCircleIcon className="w-5 h-5 text-slate-400" />
                          </Tooltip>
                      )}
                    </div>
                    <div className="section-actions flex items-center gap-2 opacity-0 group-hover/section:opacity-100 transition-opacity">
                      <button
                          onClick={() => openEditSection(section)}
                          disabled={!canRefineDocument}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 text-xs font-semibold text-slate-600 hover:text-abz-primary hover:border-abz-primary/50 bg-white/80"
                          title="Edit section"
                      >
                          <PencilSquareIcon className="w-4 h-4" />
                          Edit
                      </button>
                      <button
                          onClick={() => openRefineSection(section)}
                          disabled={!canRefineDocument}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 text-xs font-semibold text-slate-600 hover:text-abz-primary hover:border-abz-primary/50 bg-white/80"
                          title="Refine draft section"
                      >
                          <SparklesIcon className="w-4 h-4" />
                          Refine Draft
                      </button>
                    </div>
                </div>
                <div>{renderMarkdownWithMermaid(section.content, section.key)}</div>
              </section>
            ))}
          </div>
        </div>

        <div className="space-y-4">
            <div className="bg-white dark:bg-surface-dark rounded-2xl shadow-soft border border-slate-200 dark:border-gray-700">
                <div className="border-b border-slate-200 dark:border-gray-700">
                    <nav className="flex -mb-px p-2 space-x-1" aria-label="Tabs">
                        {rightPanelTabs.map((tab) => (
                            <button
                                key={tab.id}
                                onClick={() => setActiveTab(tab.id)}
                                className={`whitespace-nowrap flex-1 flex items-center justify-center gap-2 py-2 px-1 border-b-2 font-medium text-sm transition-colors rounded-lg ${
                                    activeTab === tab.id
                                    ? 'border-abz-primary text-abz-primary bg-abz-primary/10'
                                    : 'border-transparent text-slate-500 hover:text-slate-700 hover:bg-slate-100 dark:text-slate-400 dark:hover:text-slate-200 dark:hover:bg-abz-ink'
                                }`}
                            >
                                <tab.icon className="w-5 h-5"/>
                                <span>{tab.label}</span>
                            </button>
                        ))}
                    </nav>
                </div>
                <div className="p-6">
                    {activeTab === 'quality' && <QualityGatePanel artifacts={artifacts} onGoToSection={handleGoToSection} />}
                    {activeTab === 'approvals' && <ApprovalsPanel approvers={artifacts.approvals} users={users} currentUser={currentUser} onSign={() => canExecuteApproval ? setApprovalModalOpen(true) : blockAction(actionPolicy?.approval, 'Approval execution is not authorized for this workspace.')} onResubmit={(userId) => canExecuteApproval ? onResubmitForApproval(userId) : blockAction(actionPolicy?.approval, 'Approval execution is not authorized for this workspace.')} />}
                    {activeTab === 'diagrams' && <DiagramsPanel artifacts={artifacts} />}
                    {activeTab === 'work' && <WorkItemsPanel artifacts={artifacts} deliveryEnabled={deliveryEnabled} canImport={canImportWorkItems} importBlockedReason={blockedMessage(actionPolicy?.importWorkItems, 'Backlog import is not authorized for this workspace.')} onImport={() => canImportWorkItems ? setIsImportModalOpen(true) : blockAction(actionPolicy?.importWorkItems, 'Backlog import is not authorized for this workspace.')} />}
                </div>
            </div>
        </div>
      </div>

      <ApprovalModal
        isOpen={isApprovalModalOpen}
        onClose={() => setApprovalModalOpen(false)}
        onSubmit={({ status, comments }) => {
            if (!canExecuteApproval) {
              blockAction(actionPolicy?.approval, 'Approval execution is not authorized for this workspace.');
              return;
            }
            onUpdateApprovalStatus(currentUser.id, status, comments);
            setApprovalModalOpen(false);
        }}
      />
      {deliveryEnabled && (
        <ImportWorkItemsModal
          isOpen={isImportModalOpen}
          onClose={() => setIsImportModalOpen(false)}
          workItems={artifacts.workItems}
          onImport={(selectedItems) => {
              if (!canImportWorkItems) {
                blockAction(actionPolicy?.importWorkItems, 'Backlog import is not authorized for this workspace.');
                return;
              }
              onInitiateImport(selectedItems);
              setIsImportModalOpen(false);
          }}
        />
      )}
       <RefineSectionModal
        isOpen={refineModalState.isOpen}
        onClose={() => setRefineModalState({ isOpen: false, section: null })}
        section={refineModalState.section}
        onSave={(newContent) => {
          if (refineModalState.section) {
            onRefineSection(template.artifactKey, refineModalState.section.key, newContent);
          }
        }}
        aiProviderType={aiProviderType}
      />
      <Modal
        isOpen={editModalState.isOpen}
        onClose={() => setEditModalState({ isOpen: false, section: null, content: '' })}
        title={`Edit Section: ${editModalState.section?.title || ''}`}
      >
        <div className="space-y-4">
          <p className="text-sm text-slate-600 dark:text-slate-300">
            Edit the Markdown directly. Tables, numbered lists, bullets, and Mermaid blocks will render in the document after saving.
          </p>
          <textarea
            value={editModalState.content}
            onChange={(event) => setEditModalState(prev => ({ ...prev, content: event.target.value }))}
            className="w-full min-h-[360px] rounded-xl border border-slate-200 bg-white p-4 font-mono text-sm leading-6 text-slate-800 shadow-inner focus:border-abz-primary focus:outline-none focus:ring-3 focus:ring-abz-primary/15 dark:bg-abz-ink-900 dark:text-slate-100 dark:border-slate-700"
          />
          <div className="flex justify-end gap-3 border-t border-slate-200 pt-4 dark:border-slate-700">
            <button
              type="button"
              onClick={() => setEditModalState({ isOpen: false, section: null, content: '' })}
              className="btn-ghost px-4 py-2 text-sm font-semibold rounded-xl"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => {
                if (editModalState.section) {
                  onRefineSection(template.artifactKey, editModalState.section.key, editModalState.content);
                }
                setEditModalState({ isOpen: false, section: null, content: '' });
              }}
              className="btn-primary px-4 py-2 text-sm font-semibold rounded-xl"
            >
              Save Section
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
};

const QualityGatePanel: React.FC<{artifacts: GeneratedArtifacts, onGoToSection: (key: string) => void}> = ({artifacts, onGoToSection}) => {
    // A regex to find a section key like `(some_key)` at the end of a string.
    const keyRegex = /\s*\(([^)]+)\)$/;

    const renderPoint = (point: string, type: 'amb' | 'gap', index: number) => {
        const match = point.match(keyRegex);
        const key = match ? match[1] : null;
        const text = point.replace(keyRegex, '').trim();

        return (
            <li key={`${type}-${index}`} className="group flex items-start justify-between gap-2">
                <span>{text}</span>
                {key && (
                    <button 
                        onClick={() => onGoToSection(key)} 
                        className="text-xs font-semibold text-abz-primary hover:underline flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                        Go to section
                    </button>
                )}
            </li>
        );
    }

    return (
        <div className="space-y-4 text-sm">
            <h3 className="text-xl font-bold flex items-center gap-3"><LightBulbIcon className="h-7 w-7 text-abz-emerald-500" />{artifacts.qualityGate.title}</h3>
            <div>
                <h4 className="font-semibold text-abz-amber-500 mb-2">Ambiguities to Clarify</h4>
                <ul className="list-disc list-inside space-y-2 text-slate-600 dark:text-slate-300">
                    {artifacts.qualityGate.ambiguityPoints.map((point, i) => renderPoint(point, 'amb', i))}
                </ul>
            </div>
                <div>
                <h4 className="font-semibold text-abz-red-500 mb-2">Gaps to Address</h4>
                <ul className="list-disc list-inside space-y-2 text-slate-600 dark:text-slate-300">
                    {artifacts.qualityGate.gapPoints.map((point, i) => renderPoint(point, 'gap', i))}
                </ul>
            </div>
        </div>
    );
};

const ApprovalsPanel: React.FC<{approvers: Approver[], users: User[], currentUser: User, onSign: () => void, onResubmit: (userId: string) => void}> = ({ approvers, users, currentUser, onSign, onResubmit }) => {
    const statusMap: Record<ApprovalStatus, {icon: React.FC<{className?:string}>, color: string}> = {
        'Pending': { icon: ClockIcon, color: 'text-abz-amber-500' },
        'Approved': { icon: CheckCircleIcon, color: 'text-abz-emerald-500' },
        'Rejected': { icon: XCircleIcon, color: 'text-abz-red-500' },
    };

    const isCurrentUserAnApprover = approvers.some(a => a.userId === currentUser.id && a.status === 'Pending');
    const allApproved = approvers.every(a => a.status === 'Approved');

    return (
        <div className="space-y-4">
             <h3 className="text-xl font-bold flex items-center gap-3"><UserCheckIcon className="h-7 w-7 text-abz-primary" />Approvals</h3>
             <div className="space-y-3">
                {approvers.map(approver => {
                    const user = users.find(u => u.id === approver.userId);
                    const status = statusMap[approver.status];
                    return (
                        <div key={approver.userId} className="p-3 rounded-lg bg-slate-50 dark:bg-abz-ink">
                            <div className="flex items-center justify-between">
                                <div>
                                    <p className="font-semibold text-sm">{user?.name}</p>
                                    <p className="text-xs text-slate-500">{approver.role}</p>
                                </div>
                                <div className={`flex items-center gap-1.5 text-sm font-medium ${status.color}`}>
                                    <status.icon className="w-5 h-5" />
                                    <span>{approver.status}</span>
                                    {approver.status === 'Rejected' && approver.comments && (
                                        <Tooltip content={approver.comments} position="top">
                                            <ChatBubbleLeftIcon className="w-5 h-5 ml-1 cursor-help" />
                                        </Tooltip>
                                    )}
                                </div>
                            </div>
                             {approver.status === 'Rejected' && (
                                <div className="mt-2 pt-2 border-t border-slate-200 dark:border-gray-700 flex justify-end">
                                    <button 
                                      onClick={() => onResubmit(approver.userId)}
                                      className="text-xs font-semibold text-abz-primary hover:underline"
                                    >
                                        Resubmit for Approval
                                    </button>
                                </div>
                            )}
                        </div>
                    );
                })}
             </div>
             {isCurrentUserAnApprover && (
                <button onClick={onSign} className="w-full flex items-center justify-center gap-2 btn-primary mt-4">
                    <PencilSquareIcon className="w-5 h-5" />
                    Review & Sign
                </button>
             )}
             {allApproved && (
                <div className="p-3 text-center bg-abz-emerald-500/10 text-abz-emerald-500 font-semibold text-sm rounded-lg">
                    This document has been fully approved.
                </div>
             )}
        </div>
    );
};

const DiagramsPanel: React.FC<{artifacts: GeneratedArtifacts}> = ({artifacts}) => (
     <div className="space-y-6">
        <h3 className="text-xl font-bold flex items-center gap-3"><ChartPieIcon className="h-7 w-7 text-abz-accent" />Process Flows</h3>
        <div>
            <h4 className="font-semibold">{artifacts.diagrams.asIs.title}</h4>
            <MermaidRenderer code={artifacts.diagrams.asIs.mermaidCode} id="as-is-diag" />
        </div>
        <hr className="dark:border-gray-700"/>
        <div>
            <h4 className="font-semibold">{artifacts.diagrams.toBe.title}</h4>
            <MermaidRenderer code={artifacts.diagrams.toBe.mermaidCode} id="to-be-diag" />
        </div>
    </div>
);

const WorkItemsPanel: React.FC<{artifacts: GeneratedArtifacts, deliveryEnabled: boolean, canImport: boolean, importBlockedReason?: string, onImport: () => void}> = ({artifacts, deliveryEnabled, canImport, importBlockedReason, onImport}) => {
    const sourceContext = artifacts.sourceContext;
    const lineageSummary = sourceContext
        ? `${sourceContext.sourceLabel} · ${sourceContext.evidenceRefs.length} evidence ref${sourceContext.evidenceRefs.length === 1 ? '' : 's'}`
        : 'Docs-only import context · no Assess evidence refs attached';

    return (
        <div className="space-y-4">
            <div className="flex justify-between items-center">
                <h3 className="text-xl font-bold flex items-center gap-3"><ClipboardListIcon className="h-7 w-7 text-abz-warn" />Work Items</h3>
                 {deliveryEnabled && artifacts.workItems && artifacts.workItems.length > 0 && (
                    <button
                        onClick={onImport}
                        disabled={!canImport}
                        title={!canImport ? importBlockedReason : undefined}
                        className="flex items-center gap-2 px-3 py-1.5 text-sm font-semibold btn-primary disabled:cursor-not-allowed disabled:opacity-50"
                    >
                        Import to Backlog
                    </button>
                )}
            </div>
            <div className="rounded-lg bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-600 ring-1 ring-slate-200 dark:bg-slate-900/60 dark:text-slate-300 dark:ring-slate-800">
                Lineage: {lineageSummary}
            </div>
            <p className="text-xs font-semibold leading-5 text-slate-500 dark:text-slate-400">
                Import preserves available lineage on selected work items. Treat partial lineage as review-needed until a later AP-approved artifact execution gate authorizes and verifies export behavior.
            </p>
            {!deliveryEnabled && (
                <div className="rounded-2xl bg-slate-50 p-4 text-sm font-semibold text-slate-500 ring-1 ring-slate-200 dark:bg-slate-900/60 dark:text-slate-400 dark:ring-slate-800">
                    Avala Delivery is not enabled. Work items are still generated for review, but backlog import is unavailable for this workspace.
                </div>
            )}
            {artifacts.workItems.map((item, index) => (
            <div key={index} className="border border-slate-200 dark:border-gray-600 rounded-2xl p-4">
                <div className="flex justify-between items-start">
                    <div>
                            <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                                item.type === 'Epic' ? 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200' :
                                item.type === 'Story' ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200' :
                                'bg-sky-100 text-sky-800 dark:bg-sky-900 dark:text-sky-200'
                            }`}>
                            {item.type}
                        </span>
                        <p className="font-semibold mt-1">{item.title}</p>
                    </div>
                </div>
            </div>
            ))}
        </div>
    );
};


export default WorkspaceView;
