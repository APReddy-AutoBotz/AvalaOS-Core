import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { persistBeforeCommit } from './services/persistenceTransition';
import Sidebar from './components/shared/Sidebar';
import Header from './components/shared/Header';
import GovernView from './components/govern/GovernView';
import PublicWebsite from './components/public/PublicWebsite';
import { Scope, View, ScopeType, Task, Project, Epic, Sprint, User, TaskStatus, Team, DocTemplate, Automation, TimesheetEntry, GeneratedArtifacts, ApprovalStatus, Filters, ProjectLifecycleStage, DocumentGeneration, ProjectDetails, WorkItem, TaskType, DocumentArtifactKeys, DocumentSection, AiProviderType, AssessToStudioHandoffPayload } from './types';
import { MOCK_USERS, MOCK_TEAMS, MOCK_AUTOMATIONS, MOCK_TIMESHEET_ENTRIES } from './data/mockData';
import { MOCK_DOC_TEMPLATES } from './data/docTemplates';
import { useAuth } from './components/auth/AuthProvider';
import { useOrganizationContext } from './components/auth/OrganizationProvider';
import { EnterpriseSessionStateView, EnterpriseSessionToolbar } from './components/auth/EnterpriseSessionBoundary';
import OnboardingWizard from './components/auth/OnboardingWizard';
import { useDelivery } from './components/delivery/DeliveryProvider';
import { useDocs } from './components/docs/DocsProvider';
import { useProcessService } from './services/processService';

import { clearLegacyBrowserProviderKey, StorageKeys, usePersistentState } from './services/storage';
import { useHandoffLedger } from './services/handoffLedgerService';
import { isLocalRuntimeEnabled } from './services/supabaseClient';
import { timesheetAdapter } from './services/adapters/timesheetAdapter';
import { buildDocsToDeliveryLineage, collectDocsToDeliveryEvidenceRefs, summarizeDocsToDeliveryLineageCompleteness } from './services/docsToDeliveryLineage';
import { resolveViewAccess } from './services/viewAccessGuard';
import {
  areScopesEqual,
  DEFAULT_PERSISTED_SCOPE,
  DEFAULT_PERSISTED_VIEW,
  normalizePersistedScope,
  normalizePersistedView,
  resolvePersistedViewScopeState,
} from './services/viewStatePersistence';
import {
  buildProductNavigationSearch,
  hasProductNavigationSearch,
  parseProductNavigationSearch,
  resolveProductNavigationState,
} from './services/productNavigationState';
import { resolveProductActionPolicy, type ProductAction, type ProductActionContext } from './services/productActionPolicy';
import { resolveArtifactExportPolicy } from './services/artifactExportPolicy';
import { filterActiveDeliveryTasks, resolveDeliveryImportGuard } from './services/deliveryWorkflowPolicy';
import { resolveGovernPresentationAccess } from './services/governPresentationAccess';
import {
  isApplicationPortfolioMarketingCapture,
  isProductMarketingCapture,
  isStudioMarketingCapture,
  preserveMarketingCaptureSearch,
  resolveMarketingCapture,
} from './services/marketingCapturePolicy';
import {
  MARKETING_CAPTURE_HANDOFFS,
  MARKETING_CAPTURE_MONITOR_SIGNAL,
  MARKETING_CAPTURE_PROCESSES,
  MARKETING_CAPTURE_PROJECTS,
  MARKETING_CAPTURE_TASKS,
} from './data/marketingProductCapture';

const MyWorkView = React.lazy(() => import('./components/delivery/MyWorkView'));
const ProjectView = React.lazy(() => import('./components/delivery/ProjectView'));
const TeamView = React.lazy(() => import('./components/delivery/TeamView'));
const WorkspaceView = React.lazy(() => import('./components/delivery/WorkspaceView'));
const TaskDetailModal = React.lazy(() => import('./components/delivery/TaskDetailModal'));
const ProjectSelectorModal = React.lazy(() => import('./components/delivery/ProjectSelectorModal'));
const DocsForgeView = React.lazy(() => import('./components/docs/DocsForgeView'));
const TemplateStudioView = React.lazy(() => import('./components/docs/TemplateStudioView'));
const DocsView = React.lazy(() => import('./components/docs/DocsView'));
const CustomDashboardView = React.lazy(() => import('./components/shared/CustomDashboardView'));
const PortfolioView = React.lazy(() => import('./components/shared/PortfolioView'));
const OrganizationSetupView = React.lazy(() => import('./components/auth/OrganizationSetupView'));
const ProcessCatalogView = React.lazy(() => import('./components/assess/ProcessCatalogView'));
const TemplateLibraryView = React.lazy(() => import('./components/assess/TemplateLibraryView'));
const ProcessDetailStubView = React.lazy(() => import('./components/assess/ProcessDetailStubView'));
const GuidedAssessmentView = React.lazy(() => import('./components/assess/GuidedAssessmentView'));
const EnterpriseIntelligenceView = React.lazy(() => import('./components/enterprise/EnterpriseIntelligenceView'));

const ViewLoadingFallback = () => (
  <div className="mx-auto max-w-3xl p-8">
    <div className="premium-surface rounded-3xl p-8 text-center">
      <p className="text-[11px] font-black uppercase tracking-[0.16em] text-slate-400">Loading workspace</p>
      <h1 className="mt-2 text-2xl font-black text-[#002C4B] dark:text-white">Preparing this module...</h1>
      <p className="mx-auto mt-3 max-w-xl text-sm font-semibold leading-6 text-slate-600 dark:text-slate-300">
        AvalaOS Core loads major product areas on demand so the first workspace opens faster.
      </p>
    </div>
  </div>
);

function App() {
  const localRuntimeEnabled = isLocalRuntimeEnabled();
  const [theme, setTheme] = usePersistentState<'light' | 'dark'>(StorageKeys.THEME, 'light');
  const [isSidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [isMobileNavigationOpen, setMobileNavigationOpen] = useState(false);
  const [isGovernViewOpen, setGovernViewOpen] = useState(false);

  // App State
  const { user: currentUser, loading: authLoading } = useAuth();
  const {
    currentOrganization,
    currentWorkspace,
    organizations,
    tenantContext,
    sessionState,
    loading: orgLoading,
    createOrg,
  } = useOrganizationContext();
  const [persistedScope, setPersistedScope] = usePersistentState<unknown>(StorageKeys.SCOPE, DEFAULT_PERSISTED_SCOPE);
  const [persistedView, setPersistedView] = usePersistentState<unknown>(StorageKeys.VIEW, DEFAULT_PERSISTED_VIEW);
  const currentScope = useMemo(() => normalizePersistedScope(persistedScope), [persistedScope]);
  const currentView = useMemo(() => normalizePersistedView(persistedView), [persistedView]);
  const setCurrentScope = useCallback((nextScope: Scope | ((previous: Scope) => Scope)) => {
    setPersistedScope(previous => typeof nextScope === 'function'
      ? nextScope(normalizePersistedScope(previous))
      : nextScope
    );
  }, [setPersistedScope]);
  const setCurrentView = useCallback((nextView: View | ((previous: View) => View)) => {
    setPersistedView(previous => typeof nextView === 'function'
      ? nextView(normalizePersistedView(previous))
      : nextView
    );
  }, [setPersistedView]);
  const [quickFilter, setQuickFilter] = useState<Filters | null>(null);
  const lastAppliedUserId = useRef<string | null>(null);

  // Data State
  const {
    tasks,
    projects,
    epics,
    sprints,
    addTask: deliveryAddTask,
    addTasks: deliveryAddTasks,
    addEpics: deliveryAddEpics,
    updateProject: deliveryUpdateProject,
    updateSprint: deliveryUpdateSprint,
    updateTask: deliveryUpdateTask,
    updateTaskStatus: deliveryUpdateTaskStatus,
    updateTaskSprint: deliveryUpdateTaskSprint,
    reorderTask: deliveryReorderTask,
    deleteTask: deliveryDeleteTask,
  } = useDelivery();
  const { processes, loading: processesLoading } = useProcessService();
  const [teams, setTeams] = usePersistentState<Team[]>(StorageKeys.TEAMS, localRuntimeEnabled ? MOCK_TEAMS : [], { enabled: localRuntimeEnabled });
  const [users, setUsers] = usePersistentState<User[]>(StorageKeys.USERS, localRuntimeEnabled ? MOCK_USERS : [], { enabled: localRuntimeEnabled });
  const [docTemplates, setDocTemplates] = usePersistentState<DocTemplate[]>(StorageKeys.DOC_TEMPLATES, localRuntimeEnabled ? MOCK_DOC_TEMPLATES : [], { enabled: localRuntimeEnabled });
  const [automations, setAutomations] = usePersistentState<Automation[]>(StorageKeys.AUTOMATIONS, localRuntimeEnabled ? MOCK_AUTOMATIONS : [], { enabled: localRuntimeEnabled });
  const [timesheetEntries, setTimesheetEntries] = useState<TimesheetEntry[]>(localRuntimeEnabled ? MOCK_TIMESHEET_ENTRIES : []);
  const { documentGenerations, saveGeneration: deliverySaveGeneration } = useDocs();
  const { entries: handoffEntries, recordHandoff } = useHandoffLedger();

  const [activeGenerationId, setActiveGenerationId] = useState<string | null>(null);
  const [tempArtifacts, setTempArtifacts] = useState<GeneratedArtifacts | null>(null);
  const [assessToStudioSourceContext, setAssessToStudioSourceContext] = useState<AssessToStudioHandoffPayload | null>(null);

  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const [isProjectSelectorOpen, setIsProjectSelectorOpen] = useState(false);
  const [isImportProjectSelectorOpen, setImportProjectSelectorOpen] = useState(false);
  const organizationScopeTransition = useRef(false);

  // AI Provider State
  const [aiProviderType, setAiProviderType] = usePersistentState<AiProviderType>(StorageKeys.AI_PROVIDER, 'groq');

  // Assess Detail State
  const [selectedProcessId, setSelectedProcessId] = useState<string | null>(null);
  const enabledModules = currentOrganization?.enabledModules;
  const hasAdminAccess = Boolean(currentUser && (
    currentUser.orgRole === 'Admin' ||
    currentUser.permissions?.some(permission => ['org.admin', 'security.manage', 'byok.manage'].includes(permission)) ||
    tenantContext?.capabilities.some(capability => ['org.admin', 'security.manage', 'byok.manage'].includes(capability))
  ));
  const explicitNavigationIntent = useMemo(
    () => typeof window !== 'undefined' && hasProductNavigationSearch(window.location.search),
    [],
  );
  const navigationHydrated = useRef(false);
  const navigationWriteSuppressed = useRef(false);
  const marketingCapture = useMemo(() => resolveMarketingCapture(
    typeof window === 'undefined' ? '' : window.location.search,
    {
      development: import.meta.env.DEV,
      test: import.meta.env.MODE === 'test',
      dedicatedCaptureBuild: import.meta.env.VITE_AVALA_MARKETING_CAPTURE === 'true',
    },
  ), []);
  const productMarketingCapture = isProductMarketingCapture(marketingCapture);
  const studioMarketingCapture = isStudioMarketingCapture(marketingCapture);
  const applicationPortfolioMarketingCapture = isApplicationPortfolioMarketingCapture(marketingCapture);

  useEffect(() => { clearLegacyBrowserProviderKey(); }, []);

  useEffect(() => {
    if (theme === 'dark') {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [theme]);
  const guardLoading = authLoading || orgLoading;
  const governPresentationAccess = useMemo(() => resolveGovernPresentationAccess({
    user: currentUser,
    organization: currentOrganization,
    workspace: currentWorkspace,
    tenantContext,
    sessionState,
    authLoading: guardLoading,
    localRuntime: localRuntimeEnabled,
  }), [currentOrganization, currentUser, currentWorkspace, guardLoading, localRuntimeEnabled, sessionState, tenantContext]);
  const authoritativeViewCapabilities = useMemo(() => (
    governPresentationAccess.allowed && tenantContext ? tenantContext.capabilities : []
  ), [governPresentationAccess.allowed, governPresentationAccess.contextKey, tenantContext]);
  const governContextKey = useRef<string | null>(null);

  const setScopeIfChanged = useCallback((scope: Scope) => {
    setCurrentScope(previous => {
      return areScopesEqual(previous, scope) ? previous : scope;
    });
  }, [setCurrentScope]);

  const resolveAppViewAccess = useCallback((view: View, scope: Scope = currentScope) => {
    return resolveViewAccess({
      user: currentUser,
      authLoading: guardLoading,
      organization: currentOrganization,
      enabledModules,
      authoritativeCapabilities: authoritativeViewCapabilities,
      view,
      scope,
    });
  }, [authoritativeViewCapabilities, currentOrganization, currentScope, currentUser, enabledModules, guardLoading]);

  useEffect(() => {
    if (!isGovernViewOpen || guardLoading) return;
    if (!governPresentationAccess.allowed) {
      governContextKey.current = null;
      setGovernViewOpen(false);
      return;
    }
    if (governContextKey.current && governContextKey.current !== governPresentationAccess.contextKey) {
      governContextKey.current = null;
      setGovernViewOpen(false);
      return;
    }
    governContextKey.current = governPresentationAccess.contextKey;
  }, [governPresentationAccess, guardLoading, isGovernViewOpen]);

  const applyGuardedView = useCallback((view: View, requestedScope: Scope = currentScope) => {
    if (guardLoading) return false;

    if (requestedScope.type === ScopeType.ORGANIZATION && view === View.WORKSPACE && hasAdminAccess) {
      setScopeIfChanged(requestedScope);
      setCurrentView(view);
      return true;
    }

    const access = resolveAppViewAccess(view, requestedScope);
    if (access.guardSeverity === 'wait') return false;

    const nextScope = access.allowed ? requestedScope : access.fallbackScope ?? requestedScope;
    const nextView = access.allowed ? view : access.fallbackView;

    setScopeIfChanged(nextScope);
    setCurrentView(nextView);

    return access.allowed;
  }, [currentScope, currentUser, guardLoading, hasAdminAccess, resolveAppViewAccess, setCurrentView, setScopeIfChanged]);

  const replaceProductNavigationSearch = useCallback((nextSearch: string) => {
    if (typeof window === 'undefined') return;
    const protectedSearch = preserveMarketingCaptureSearch(nextSearch, marketingCapture);
    const nextUrl = `${window.location.pathname}${protectedSearch}${window.location.hash}`;
    if (nextUrl !== `${window.location.pathname}${window.location.search}${window.location.hash}`) {
      window.history.replaceState(null, '', nextUrl);
    }
  }, [marketingCapture]);

  useEffect(() => {
    if (aiProviderType === 'openai') {
      setAiProviderType('groq');
    }
  }, [aiProviderType, setAiProviderType]);

  useEffect(() => {
    if (guardLoading) return;
    if (!currentUser || lastAppliedUserId.current === currentUser.id) return;
    if (explicitNavigationIntent && !navigationHydrated.current) return;

    const defaultScope = currentUser.defaultScope ?? currentScope;
    setScopeIfChanged(defaultScope);

    if (currentUser.defaultView) {
      applyGuardedView(currentUser.defaultView, defaultScope);
    }

    lastAppliedUserId.current = currentUser.id;
  }, [applyGuardedView, currentScope, currentUser, explicitNavigationIntent, guardLoading, setScopeIfChanged]);

  useEffect(() => {
    if (!currentOrganization) return;
    timesheetAdapter.getEntries(currentOrganization.id)
      .then(setTimesheetEntries)
      .catch(error => console.error('Failed to fetch timesheets:', error));
  }, [currentOrganization]);

  const toggleTheme = () => {
    setTheme(prevTheme => prevTheme === 'light' ? 'dark' : 'light');
  };

  const handleScopeChange = (scope: Scope) => {
    setGovernViewOpen(false);
    if (scope.type === ScopeType.ORGANIZATION) {
      organizationScopeTransition.current = true;
      if (hasAdminAccess) {
        setScopeIfChanged(scope);
        setCurrentView(View.WORKSPACE);
      } else {
        organizationScopeTransition.current = false;
        applyGuardedView(View.DASHBOARD, { type: ScopeType.MY_WORK });
      }
      return;
    }

    organizationScopeTransition.current = false;
    const defaultView = scope.type === ScopeType.MY_WORK ? View.DASHBOARD : View.BOARDS;
    applyGuardedView(defaultView, scope);
  };

  const handleViewChange = (view: View) => {
    setGovernViewOpen(false);
    if (view === View.DOCS_FORGE) {
      setAssessToStudioSourceContext(null);
    }

    const requestedScope: Scope = organizationScopeTransition.current ? { type: ScopeType.ORGANIZATION } : currentScope;
    organizationScopeTransition.current = false;
    applyGuardedView(view, requestedScope);
  };

  const handleDashboardStatClick = (filter: Filters) => {
    setQuickFilter(filter);
    applyGuardedView(View.LIST, { type: ScopeType.MY_WORK });
  };

  const handleProjectSelectedForDocForge = (project: Project) => {
    const projectScope: Scope = { type: ScopeType.PROJECT, id: project.id, name: project.name };
    setAssessToStudioSourceContext(null);
    applyGuardedView(View.DOCS_FORGE, projectScope);
    setIsProjectSelectorOpen(false);
  };

  // Data manipulation handlers
  const surfaceDeliveryError = (error: unknown) => {
    const message = error instanceof Error ? error.message : 'This delivery action could not be completed.';
    window.alert(message);
  };

  const resolveProductActionDecision = useCallback((
    action: ProductAction,
    context: Partial<Omit<ProductActionContext, 'action' | 'authLoading' | 'enabledModules' | 'organization' | 'scope' | 'user'>> & { scope?: Scope } = {},
  ) => resolveProductActionPolicy({
    user: currentUser,
    authLoading: guardLoading,
    organization: currentOrganization,
    enabledModules,
    scope: context.scope ?? currentScope,
    action,
    processId: context.processId,
    projectId: context.projectId,
    documentGenerationId: context.documentGenerationId,
    hasDocumentContext: context.hasDocumentContext,
    targetUserId: context.targetUserId,
  }), [currentOrganization, currentScope, currentUser, enabledModules, guardLoading]);

  const ensureProductAction = useCallback((
    action: ProductAction,
    context: Partial<Omit<ProductActionContext, 'action' | 'authLoading' | 'enabledModules' | 'organization' | 'scope' | 'user'>> & { scope?: Scope } = {},
  ) => {
    const decision = resolveProductActionDecision(action, context);
    if (!decision.allowed) {
      surfaceDeliveryError(new Error(decision.message));
      return false;
    }
    return true;
  }, [resolveProductActionDecision]);

  const handleUpdateTaskStatus = (taskId: string, newStatus: TaskStatus) => {
    const task = tasks.find(item => item.id === taskId);
    if (!ensureProductAction('workflow.status.change', { projectId: task?.projectId })) return;
    deliveryUpdateTaskStatus(taskId, newStatus).catch(surfaceDeliveryError);
  };

  const handleUpdateProjectLifecycleStage = (projectId: string, newStage: ProjectLifecycleStage) => {
    const project = projects.find(item => item.id === projectId);
    if (!project) return;
    if (!ensureProductAction('workflow.status.change', { projectId })) return;
    deliveryUpdateProject({ ...project, lifecycleStage: newStage }).catch(surfaceDeliveryError);
  };

  const handleUpdateTask = (updatedTask: Task) => {
    if (!ensureProductAction('project.task.update', { projectId: updatedTask.projectId })) return;
    deliveryUpdateTask(updatedTask).catch(surfaceDeliveryError);
  };

  const handleAddTask = (taskDetails: Pick<Task, 'title' | 'projectId'> & Partial<Omit<Task, 'title' | 'projectId'>>) => {
    if (!ensureProductAction('project.task.create', { projectId: taskDetails.projectId })) return;
    deliveryAddTask(taskDetails).catch(surfaceDeliveryError);
  };

  const handleDeleteTask = (taskId: string) => {
    const task = tasks.find(item => item.id === taskId);
    if (!ensureProductAction('project.task.delete', { projectId: task?.projectId })) return;
    deliveryDeleteTask(taskId)
      .then(() => {
        if (selectedTask?.id === taskId) {
          setSelectedTask(null);
        }
      })
      .catch(surfaceDeliveryError);
  };

  const handleUpdateTaskSprint = (taskId: string, sprintId: string | null) => {
    const task = tasks.find(item => item.id === taskId);
    if (!ensureProductAction('project.task.update', { projectId: task?.projectId })) return;
    deliveryUpdateTaskSprint(taskId, sprintId).catch(surfaceDeliveryError);
  };

  const handleUpdateSp…6858 tokens truncated…ming projects belong to current org if in project scope, but Process is strictly an org-level concept.
       // The process has an orgId. We need to use the current selected organization, but the scope might be Team/Project.
       // Actually, Module 1 defined Assess views mostly in Organization scope, so we use currentOrganization context globally.
       return <GuidedAssessmentView processId={selectedProcessId} scope={currentScope} onExit={() => applyGuardedView(View.PROCESS_DETAIL)} />;
    }

    // Global Assess Views
    if (currentView === View.PROCESS_CATALOG) {
      return <ProcessCatalogView
        onViewDetail={(id) => { setSelectedProcessId(id); applyGuardedView(View.PROCESS_DETAIL); }}
        createProcessDecision={resolveProductActionDecision('process.create')}
        presentationProcesses={productMarketingCapture ? MARKETING_CAPTURE_PROCESSES : undefined}
        captureMode={productMarketingCapture}
      />;
    }
    if (currentView === View.TEMPLATE_LIBRARY) {
      return <TemplateLibraryView />;
    }

    if (currentView === View.ENTERPRISE_INTELLIGENCE) {
      return <EnterpriseIntelligenceView
        organization={currentOrganization}
        workspace={currentWorkspace}
        currentUser={currentUser}
      />;
    }

    if (currentScope.type === ScopeType.ORGANIZATION) {
      return <OrganizationSetupView currentUser={currentUser} allUsers={users} />;
    }

    switch (currentView) {
      case View.DASHBOARD:
        return <CustomDashboardView currentUser={currentUser} tasks={activeTasksForScope} projects={projectsForScope} sprints={sprintsForScope} handoffEntries={handoffEntries} onSelectTask={setSelectedTask} onStatClick={handleDashboardStatClick} />;
      case View.PORTFOLIO:
        return <PortfolioView
          projects={productMarketingCapture ? MARKETING_CAPTURE_PROJECTS : projects}
          tasks={productMarketingCapture ? MARKETING_CAPTURE_TASKS : activeTasks}
          users={users}
          onUpdateProjectStage={handleUpdateProjectLifecycleStage}
          onScopeChange={handleScopeChange}
          onViewChange={handleViewChange}
          captureMode={productMarketingCapture}
          outcomeSignal={productMarketingCapture ? MARKETING_CAPTURE_MONITOR_SIGNAL : undefined}
        />;
      case View.DOCS_FORGE:
        return <DocsForgeView
          project={currentScope.type === ScopeType.PROJECT ? projectsForScope[0] : null}
          docTemplates={docTemplates}
          onCancel={() => {
            setAssessToStudioSourceContext(null);
            applyGuardedView(View.DASHBOARD, { type: ScopeType.MY_WORK });
          }}
          onComplete={async (projectDetails: ProjectDetails, artifacts: GeneratedArtifacts) => {
            try {
              if (currentScope.type !== ScopeType.PROJECT) {
                throw new Error('Document generation requires an active project before the draft can be saved and opened.');
              }
              const newGeneration: DocumentGeneration = {
                id: `docgen-${Date.now()}`,
                projectId: currentScope.id,
                generatedAt: new Date().toISOString(),
                templateId: projectDetails.templateId,
                artifacts,
              };
              await persistBeforeCommit<DocumentGeneration>(
                () => deliverySaveGeneration(newGeneration),
                saved => {
                  setActiveGenerationId(saved.id);
                  setTempArtifacts(null);
                  setAssessToStudioSourceContext(null);
                  applyGuardedView(View.WORKSPACE);
                },
              );
            } catch (error) {
              surfaceDeliveryError(error);
            }
          }}
          aiProviderType={aiProviderType}
          onAiProviderTypeChange={setAiProviderType}
          sourceContext={assessToStudioSourceContext}
          generationDecision={resolveProductActionDecision('docs.generate', {
            projectId: currentScope.type === ScopeType.PROJECT ? currentScope.id : undefined,
          })}
        />;
      case View.WORKSPACE: {
        const activeGeneration = documentGenerations.find(g => g.id === activeGenerationId && (
          currentScope.type !== ScopeType.PROJECT || g.projectId === currentScope.id
        ));
        const artifactsToShow = activeGeneration?.artifacts || tempArtifacts;

        if (!artifactsToShow) {
          return <div className="p-8 text-center">Avala Studio could not find document generation data for this workspace view. Return to Avala Studio or Document Vault and open a generated review draft with source context attached.</div>;
        }
        // Template finding might be less reliable for global generations
        const templateId = activeGeneration?.templateId || 'brd.v1';
        const template = docTemplates.find(t => t.id === templateId) || docTemplates[0];
        const documentGenerationId = activeGeneration?.id || null;
        const documentEvidenceRefs = artifactsToShow.sourceContext?.evidenceRefs.map(ref => ref.id) || [];
        const documentLineageRefs = artifactsToShow.sourceContext
          ? [artifactsToShow.sourceContext.processId, artifactsToShow.sourceContext.assessmentId].filter(Boolean)
          : [];
        const documentExportDecision = resolveProductActionDecision('docs.export', {
          documentGenerationId,
          hasDocumentContext: Boolean(artifactsToShow),
        });
        const artifactDownloadDecision = resolveProductActionDecision('artifact.download', {
          documentGenerationId,
          hasDocumentContext: Boolean(artifactsToShow),
        });

        return <WorkspaceView
          artifacts={artifactsToShow}
          generationId={documentGenerationId}
          generationVersion={activeGeneration?.versionId}
          template={template}
          error={null}
          onDone={() => {
            setActiveGenerationId(null);
            setTempArtifacts(null);
            setAssessToStudioSourceContext(null);
            applyGuardedView(
              currentScope.type === ScopeType.PROJECT ? View.DOCS : View.DASHBOARD,
              currentScope.type === ScopeType.PROJECT ? currentScope : { type: ScopeType.MY_WORK },
            );
          }}
          users={users} currentUser={currentUser}
          onUpdateApprovalStatus={handleUpdateApprovalStatus}
          onResubmitForApproval={handleResubmitForApproval}
          onInitiateImport={handleInitiateImport}
          onRefineSection={handleRefineSection}
          aiProviderType={aiProviderType}
          actionPolicy={{
            documentExport: documentExportDecision,
            artifactDownload: artifactDownloadDecision,
            refine: resolveProductActionDecision('docs.refine', {
              documentGenerationId,
              hasDocumentContext: Boolean(artifactsToShow),
            }),
            approval: resolveProductActionDecision('approval.execute', {
              documentGenerationId,
              hasDocumentContext: Boolean(artifactsToShow),
            }),
            importWorkItems: resolveProductActionDecision('delivery.import', {
              projectId: currentScope.type === ScopeType.PROJECT ? currentScope.id : projectsForScope[0]?.id,
              documentGenerationId,
              hasDocumentContext: Boolean(artifactsToShow),
            }),
          }}
          artifactPolicy={{
            documentExport: resolveArtifactExportPolicy({
              action: 'document.export',
              artifactType: 'generated_document_export',
              actor: currentUser,
              organization: currentOrganization,
              scope: currentScope,
              productActionDecision: documentExportDecision,
              documentGenerationId,
              hasDocumentContext: Boolean(artifactsToShow),
              projectId: currentScope.type === ScopeType.PROJECT ? currentScope.id : activeGeneration?.projectId,
              evidenceRefs: documentEvidenceRefs,
              lineageRefs: documentLineageRefs,
              requestedOutputs: ['export_file', 'storage_object', 'live_signed_url'],
              sourceSurfaceId: 'workspace.generated-document-export',
            }),
            documentDownload: resolveArtifactExportPolicy({
              action: 'document.download',
              artifactType: 'generated_document_download',
              actor: currentUser,
              organization: currentOrganization,
              scope: currentScope,
              productActionDecision: artifactDownloadDecision,
              documentGenerationId,
              hasDocumentContext: Boolean(artifactsToShow),
              projectId: currentScope.type === ScopeType.PROJECT ? currentScope.id : activeGeneration?.projectId,
              evidenceRefs: documentEvidenceRefs,
              lineageRefs: documentLineageRefs,
              requestedOutputs: ['download_file', 'pdf_file'],
              sourceSurfaceId: 'workspace.generated-document-download',
            }),
            signedUrl: resolveArtifactExportPolicy({
              action: 'storage.signed_url.create',
              artifactType: 'signed_url',
              actor: currentUser,
              organization: currentOrganization,
              scope: currentScope,
              documentGenerationId,
              hasDocumentContext: Boolean(artifactsToShow),
              requestedOutputs: ['live_signed_url', 'public_url'],
              sourceSurfaceId: 'workspace.generated-document-signed-url',
            }),
          }}
        />
      }
      case View.TEMPLATE_STUDIO:
        return <TemplateStudioView templates={docTemplates} onCreate={(t) => setDocTemplates(p => [...p, { ...t, id: `template-${Date.now()}` }])} onUpdate={(t) => setDocTemplates(p => p.map(pt => pt.id === t.id ? t : pt))} onDelete={(id) => setDocTemplates(p => p.filter(pt => pt.id !== id))} />;
      case View.DOCS:
        return <DocsView generations={documentGenerations.filter(g => g.projectId === (currentScope as any).id)} templates={docTemplates} onViewGeneration={(id) => {
          const generation = documentGenerations.find(item => item.id === id && item.projectId === (currentScope as any).id);
          if (!generation) return;
          setActiveGenerationId(id);
          setTempArtifacts(null);
          applyGuardedView(View.WORKSPACE);
        }} captureMode={studioMarketingCapture} />;
      default:
        if (currentScope.type === ScopeType.MY_WORK) {
          return <MyWorkView view={currentView} allTasks={tasksForScope} allProjects={projectsForScope} allEpics={epicsForScope} currentUser={currentUser} onUpdateTaskStatus={handleUpdateTaskStatus} onSelectTask={setSelectedTask} onAddTask={handleAddTask} onDeleteTask={handleDeleteTask} quickFilter={quickFilter} setQuickFilter={setQuickFilter} onUpdateTask={handleUpdateTask} />;
        }
        if (currentScope.type === ScopeType.PROJECT && projectsForScope.length > 0) {
          return <ProjectView
            view={currentView} project={projectsForScope[0]} tasks={tasksForScope} epics={epicsForScope} sprints={sprintsForScope}
            users={users} currentUser={currentUser} automations={automationsForScope} timesheetEntries={timesheetsForScope}
            docTemplates={docTemplates} documentGenerations={documentGenerations.filter(g => g.projectId === projectsForScope[0].id)}
            handoffEntries={handoffEntries}
            deliveryPackArtifactPolicy={{
              exportMarkdown: resolveArtifactExportPolicy({
                action: 'delivery_pack.export',
                artifactType: 'delivery_pack_export',
                actor: currentUser,
                organization: currentOrganization,
                scope: currentScope,
                productActionDecision: resolveProductActionDecision('delivery.pack.review', { projectId: projectsForScope[0].id }),
                projectId: projectsForScope[0].id,
                deliveryPackId: projectsForScope[0].id + '-delivery-pack',
                hasDeliveryPackContext: true,
                evidenceRefs: Array.from(new Set([
                  ...handoffEntries.flatMap(entry => entry.evidenceRefs),
                  ...tasksForScope.flatMap(task => task.sourceLineage?.evidenceRefs || []),
                ])),
                lineageRefs: Array.from(new Set([
                  ...tasksForScope.flatMap(task => [
                    task.sourceLineage?.processId,
                    task.sourceLineage?.assessmentId,
                    task.sourceLineage?.documentGenerationId,
                    ...(task.sourceLineage?.handoffLedgerEntryIds || []),
                  ]),
                ].filter(Boolean) as string[])),
                requestedOutputs: ['export_file', 'download_file'],
                sourceSurfaceId: 'delivery-pack.markdown-export',
              }),
              exportJson: resolveArtifactExportPolicy({
                action: 'delivery_pack.download',
                artifactType: 'delivery_pack_export',
                actor: currentUser,
                organization: currentOrganization,
                scope: currentScope,
                productActionDecision: resolveProductActionDecision('delivery.pack.review', { projectId: projectsForScope[0].id }),
                projectId: projectsForScope[0].id,
                deliveryPackId: projectsForScope[0].id + '-delivery-pack',
                hasDeliveryPackContext: true,
                evidenceRefs: Array.from(new Set([
                  ...handoffEntries.flatMap(entry => entry.evidenceRefs),
                  ...tasksForScope.flatMap(task => task.sourceLineage?.evidenceRefs || []),
                ])),
                lineageRefs: Array.from(new Set([
                  ...tasksForScope.flatMap(task => [
                    task.sourceLineage?.processId,
                    task.sourceLineage?.assessmentId,
                    task.sourceLineage?.documentGenerationId,
                    ...(task.sourceLineage?.handoffLedgerEntryIds || []),
                  ]),
                ].filter(Boolean) as string[])),
                requestedOutputs: ['download_file'],
                sourceSurfaceId: 'delivery-pack.json-download',
              }),
            }}
            onUpdateTaskStatus={handleUpdateTaskStatus} onUpdateTask={handleUpdateTask} onSelectTask={setSelectedTask}
            // Fix: Pass `handleReorderTask` to the `onReorderTask` prop. The original code had a typo `onReorderTask`.
            onUpdateTaskSprint={handleUpdateTaskSprint} onUpdateSprint={handleUpdateSprint} onReorderTask={handleReorderTask} onAddTask={handleAddTask} onDeleteTask={handleDeleteTask}
            onCreateAutomation={(a) => { if (ensureProductAction('automation.create', { projectId: a.projectId })) setAutomations(p => [...p, { ...a, id: `auto-${Date.now()}` }]); }} onUpdateAutomation={(a) => { if (ensureProductAction('automation.update', { projectId: a.projectId })) setAutomations(p => p.map(pa => pa.id === a.id ? a : pa)); }} onDeleteAutomation={(id) => { const automation = automations.find(item => item.id === id); if (ensureProductAction('automation.delete', { projectId: automation?.projectId ?? projectsForScope[0]?.id })) setAutomations(p => p.filter(pa => pa.id !== id)); }} onToggleAutomation={(id, isEnabled) => { const automation = automations.find(item => item.id === id); if (ensureProductAction('automation.toggle', { projectId: automation?.projectId ?? projectsForScope[0]?.id })) setAutomations(p => p.map(pa => pa.id === id ? { ...pa, isEnabled } : pa)); }}
            onUpdateTimesheet={handleUpdateTimesheet}
            onViewGeneration={(generationId: string) => {
              const generation = documentGenerations.find(item => item.id === generationId && item.projectId === projectsForScope[0].id);
              if (!generation) return;
              setTempArtifacts(null);
              setActiveGenerationId(generationId);
              applyGuardedView(View.WORKSPACE);
            }}
          />;
        }
        if (currentScope.type === ScopeType.TEAM && teams.find(t => t.id === currentScope.id)) {
          return <TeamView view={currentView} team={teams.find(t => t.id === currentScope.id)!} members={usersForScope} currentUser={currentUser} tasks={tasksForScope} projects={projectsForScope} epics={epicsForScope} onUpdateTaskStatus={handleUpdateTaskStatus} onSelectTask={setSelectedTask} onAddTask={handleAddTask} onDeleteTask={handleDeleteTask} />;
        }
        return <div className="p-8">Select a scope to get started.</div>;
    }
  };

  if (authLoading || orgLoading) {
    return <div className="h-screen flex items-center justify-center bg-slate-50 dark:bg-abz-ink-950 text-slate-500 font-medium">Loading workspace...</div>;
  }

  if (!currentUser) {
    return <PublicWebsite />;
  }

  if (!localRuntimeEnabled && !['ready', 'read_only'].includes(sessionState)) {
    return <EnterpriseSessionStateView />;
  }

  if (organizations.length === 0) {
    return localRuntimeEnabled
      ? <OnboardingWizard onComplete={(name) => createOrg(name)} />
      : <EnterpriseSessionStateView />;
  }

  return (
    <div className="app-shell flex h-screen text-text-light dark:text-text-dark font-sans" data-marketing-capture={productMarketingCapture ? 'product' : undefined}>
      <a href="#app-main" className="av-skip-link">Skip to main content</a>
      <Sidebar
        currentScope={currentScope}
        currentView={currentView}
        onViewChange={handleViewChange}
        onScopeChange={handleScopeChange}
        collapsed={isSidebarCollapsed}
        onToggleCollapse={() => setSidebarCollapsed(collapsed => !collapsed)}
        canAccessAdmin={hasAdminAccess}
        canAccessGovern={governPresentationAccess.allowed}
        authoritativeViewCapabilities={authoritativeViewCapabilities}
        governOpen={isGovernViewOpen}
        onOpenGovern={() => governPresentationAccess.allowed && setGovernViewOpen(true)}
        mobileOpen={isMobileNavigationOpen}
        onMobileClose={() => setMobileNavigationOpen(false)}
      />
      <div className="flex flex-col flex-1 overflow-hidden relative">
        <Header
          theme={theme}
          toggleTheme={toggleTheme}
          currentScope={currentScope}
          currentView={isGovernViewOpen ? View.PROCESS_CATALOG : currentView}
          currentContextLabel={isGovernViewOpen ? 'Avala Govern' : undefined}
          onScopeChange={handleScopeChange}
          currentUser={currentUser}
          teams={teams}
          projects={projects}
          mobileNavigationOpen={isMobileNavigationOpen}
          onToggleNavigation={() => setMobileNavigationOpen(open => !open)}
        />
        {!localRuntimeEnabled && <EnterpriseSessionToolbar />}
        <main id="app-main" className="view-transition-enter view-transition-enter-active flex-1 overflow-y-auto p-4 sm:p-5 lg:p-6">
          <React.Suspense fallback={<ViewLoadingFallback />}>
            {renderCurrentView()}
          </React.Suspense>
        </main>
      </div>
      <React.Suspense fallback={null}>
        {selectedTask && (
          <TaskDetailModal
            task={selectedTask}
            allTasks={tasks}
            project={projects.find(p => p.id === selectedTask.projectId)}
            epic={epics.find(e => e.id === selectedTask.epicId)}
            users={users}
            currentUser={currentUser}
            onClose={() => setSelectedTask(null)}
            onUpdateTask={handleUpdateTask}
            onAddTask={handleAddTask}
            onDeleteTask={handleDeleteTask}
          />
        )}
        {isImportProjectSelectorOpen && (
          <ProjectSelectorModal
            isOpen={isImportProjectSelectorOpen}
            onClose={() => setImportProjectSelectorOpen(false)}
            projects={projects}
            onProjectSelect={handleProjectSelectedForImport}
          />
        )}
      </React.Suspense>
    </div>
  );
}

export default App;
