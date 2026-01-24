import React, { useState, useRef } from 'react';
import { GeneratedArtifacts, DocTemplate, User, ApprovalStatus, Approver, WorkItem, DocumentSection, DocumentArtifactKeys, AiProviderType } from '../types';
import MermaidRenderer from './MermaidRenderer';
import { 
    DocumentTextIcon, ChartPieIcon, ClipboardListIcon,
    ExclamationTriangleIcon, LightBulbIcon, ArrowPathIcon,
    UserCheckIcon, PencilSquareIcon, CheckCircleIcon, ClockIcon, XCircleIcon, SparklesIcon,
    ChatBubbleLeftIcon, InformationCircleIcon
} from './icons';
import ApprovalModal from './ApprovalModal';
import ImportWorkItemsModal from './ImportWorkItemsModal';
import RefineSectionModal from './RefineSectionModal';
import { Tooltip } from './ui/Tooltip';


// Make marked available globally from the script tag in index.html
declare global {
  interface Window {
    marked: any;
  }
}

interface WorkspaceViewProps {
  artifacts: GeneratedArtifacts | null;
  template: DocTemplate | null;
  error: string | null;
  onDone: () => void;
  users: User[];
  currentUser: User;
  onUpdateApprovalStatus: (userId: string, status: ApprovalStatus, comments?: string) => void;
  onResubmitForApproval: (userId: string) => void;
  onInitiateImport: (items: WorkItem[]) => void;
  onRefineSection: (artifactKey: DocumentArtifactKeys, sectionKey: string, newContent: string) => void;
  userApiKey: string | null;
  aiProviderType: AiProviderType;
}

type RightPanelTab = 'quality' | 'diagrams' | 'work' | 'approvals';

const WorkspaceView: React.FC<WorkspaceViewProps> = ({ artifacts, template, error, onDone, users, currentUser, onUpdateApprovalStatus, onResubmitForApproval, onInitiateImport, onRefineSection, userApiKey, aiProviderType }) => {
  const [activeTab, setActiveTab] = useState<RightPanelTab>('quality');
  const [isApprovalModalOpen, setApprovalModalOpen] = useState(false);
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [refineModalState, setRefineModalState] = useState<{
    isOpen: boolean;
    section: DocumentSection | null;
  }>({ isOpen: false, section: null });
  const mainContentRef = useRef<HTMLDivElement>(null);

  if (!artifacts || !template) {
    return <div className="text-center py-10">Loading artifacts...</div>;
  }

  const documentData = artifacts[template.artifactKey];
  
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
                <p className="text-slate-500 dark:text-slate-400 mt-1">Review the generated documents, diagrams, and work items.</p>
            </div>
            <button onClick={onDone} className="flex items-center gap-2 px-4 py-2 text-sm font-semibold btn-ghost">
                <ArrowPathIcon className="h-5 w-5" />
                <span>Finish & Return</span>
            </button>
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
          <div className="p-6 prose prose-slate dark:prose-invert max-w-none">
            {documentData.sections.map(section => (
              <div key={section.key} data-section-key={section.key} className="mt-4 group/section relative rounded-md p-2 -m-2">
                 <div className="flex justify-between items-center">
                    <div className="flex items-center gap-2">
                      <h3 className="font-semibold text-lg">{section.title}</h3>
                      {section.citations && section.citations.length > 0 && (
                          <Tooltip content={`Sources: ${section.citations.join(', ')}`} position="right">
                              <InformationCircleIcon className="w-5 h-5 text-slate-400" />
                          </Tooltip>
                      )}
                    </div>
                    <button
                        onClick={() => setRefineModalState({ isOpen: true, section: section })}
                        className="absolute top-0 right-0 p-1.5 rounded-full bg-white/50 dark:bg-surface-dark/50 backdrop-blur-sm text-slate-400 hover:text-abz-primary hover:bg-abz-primary/10 transition-all opacity-0 group-hover/section:opacity-100"
                        title="Refine with AI"
                    >
                        <SparklesIcon className="w-4 h-4" />
                    </button>
                </div>
                <div dangerouslySetInnerHTML={{ __html: window.marked ? window.marked.parse(section.content) : section.content.replace(/\n/g, '<br />') }} />
              </div>
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
                    {activeTab === 'approvals' && <ApprovalsPanel approvers={artifacts.approvals} users={users} currentUser={currentUser} onSign={() => setApprovalModalOpen(true)} onResubmit={onResubmitForApproval} />}
                    {activeTab === 'diagrams' && <DiagramsPanel artifacts={artifacts} />}
                    {activeTab === 'work' && <WorkItemsPanel artifacts={artifacts} onImport={() => setIsImportModalOpen(true)} />}
                </div>
            </div>
        </div>
      </div>

      <ApprovalModal
        isOpen={isApprovalModalOpen}
        onClose={() => setApprovalModalOpen(false)}
        onSubmit={({ status, comments }) => {
            onUpdateApprovalStatus(currentUser.id, status, comments);
            setApprovalModalOpen(false);
        }}
      />
      <ImportWorkItemsModal
        isOpen={isImportModalOpen}
        onClose={() => setIsImportModalOpen(false)}
        workItems={artifacts.workItems}
        onImport={(selectedItems) => {
            onInitiateImport(selectedItems);
            setIsImportModalOpen(false);
        }}
      />
       <RefineSectionModal
        isOpen={refineModalState.isOpen}
        onClose={() => setRefineModalState({ isOpen: false, section: null })}
        section={refineModalState.section}
        onSave={(newContent) => {
          if (refineModalState.section) {
            onRefineSection(template.artifactKey, refineModalState.section.key, newContent);
          }
        }}
        userApiKey={userApiKey}
        aiProviderType={aiProviderType}
      />
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

const WorkItemsPanel: React.FC<{artifacts: GeneratedArtifacts, onImport: () => void}> = ({artifacts, onImport}) => (
    <div className="space-y-4">
        <div className="flex justify-between items-center">
            <h3 className="text-xl font-bold flex items-center gap-3"><ClipboardListIcon className="h-7 w-7 text-abz-warn" />Work Items</h3>
             {artifacts.workItems && artifacts.workItems.length > 0 && (
                <button
                    onClick={onImport}
                    className="flex items-center gap-2 px-3 py-1.5 text-sm font-semibold btn-primary"
                >
                    Import to Backlog
                </button>
            )}
        </div>
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


export default WorkspaceView;