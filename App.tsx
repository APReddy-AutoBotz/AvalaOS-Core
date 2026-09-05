import React, { useState, useEffect, useLayoutEffect, useMemo, useRef, useCallback } from 'react';
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
import ControlledHumanNonProductionBanner from './components/auth/ControlledHumanNonProductionBanner';
import OnboardingWizard from './components/auth/OnboardingWizard';
import { useDelivery } from './components/delivery/DeliveryProvider';
import { useDocs } from './components/docs/DocsProvider';
import { useProcessService } from './services/processService';

import { clearLegacyBrowserProviderKey, StorageKeys, usePersistentState } from './services/storage';
import { useHandoffLedger } from './services/handoffLedgerService';
import { getControlledHumanBrowserBinding, isLocalRuntimeEnabled } from './services/supabaseClient';
import { timesheetAdapter } from './services/adapters/timesheetAdapter';
import { buildDocsToDeliveryLineage, collectDocsToDeliveryEvidenceRefs, summarizeDocsToDeliveryLineageCompleteness } from './services/docsToDeliveryLineage';
import {
  bindAuthoritativePresentationCapabilities,
  resolveViewAccess,
} from './services/viewAccessGuard';
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
  hasDurableProductNavigationAgreement,
  hasProductNavigationSearch,
  parseProductNavigationSearch,
  resolveProductNavigationState,
  isStructurallyValidProductNavigationSearch,
} from './services/productNavigationState';
import { canApplyDefaultNavigation, createProductNavigationController, type ProductNavigationTransition, type ProductNavigationWrite } from './services/productNavigationController';
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
const TemplateStudioView = React.lazy(() => import('./components/docs/TemplateManagerView'));
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
  const controlledHumanBrowserBinding = getControlledHumanBrowserBinding();
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
  const pendingNavigationHydration = useRef<{
    view: View;
    scope: Scope;
    selectedProcessId: string | null;
    activeGenerationId: string | null;
  } | null>(null);
  const navigationController = useRef(createProductNavigationController(explicitNavigationIntent));
  const pendingNavigationTransition = useRef<ProductNavigationTransition | null>(null);
  const navigationAuthorityKey = [currentUser?.id ?? 'anonymous', currentOrganization?.id ?? 'no-organization', currentWorkspace?.id ?? 'no-workspace', tenantContext?.authorizationVersion ?? 'no-authorization', sessionState].join(':');
  const previousNavigationAuthorityKey = useRef(navigationAuthorityKey);
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
    bindAuthoritativePresentationCapabilities({
      userId: currentUser?.id,
      organizationId: currentOrganization?.id,
      workspaceId: currentWorkspace?.id,
      sessionState,
      tenantContext,
    })
  ), [
    currentOrganization?.id,
    currentUser?.id,
    currentWorkspace?.id,
    sessionState,
    tenantContext,
  ]);
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

  const applyGuardedView = useCallback((view: View, requestedScope: Scope = currentScope, origin: 'user' | 'authority-rebind' = 'user') => {
    if (guardLoading) return false;

    pendingNavigationTransition.current = origin === 'user'
      ? navigationController.current.begin('user')
      : navigationController.current.rebind();
    pendingNavigationHydration.current = null;
    if (origin === 'user' && currentUser) lastAppliedUserId.current = currentUser.id;

    if (requestedScope.type === ScopeType.ORGANIZATION && view === View.WORKSPACE && hasAdminAccess) {
      setScopeIfChanged(requestedScope);
      setCurrentView(view);
      return true;
    }

    // A real selection supersedes fail-closed hydration settlement. The next
    // committed tuple must therefore be allowed to reconverge the URL.
    const access = resolveAppViewAccess(view, requestedScope);
    if (access.guardSeverity === 'wait') return false;

    const nextScope = access.allowed ? requestedScope : access.fallbackScope ?? requestedScope;
    const nextView = access.allowed ? view : access.fallbackView;

    setScopeIfChanged(nextScope);
    setCurrentView(nextView);

    return access.allowed;
  }, [currentScope, currentUser, guardLoading, hasAdminAccess, resolveAppViewAccess, setCurrentView, setScopeIfChanged]);

  const writeProductNavigationSearch = useCallback((nextSearch: string, mode: ProductNavigationWrite = 'replace') => {
    if (typeof window === 'undefined') return;
    const protectedSearch = preserveMarketingCaptureSearch(nextSearch, marketingCapture);
    const nextUrl = `${window.location.pathname}${protectedSearch}${window.location.hash}`;
    if (nextUrl !== `${window.location.pathname}${window.location.search}${window.location.hash}`) {
      window.history[mode === 'push' ? 'pushState' : 'replaceState'](null, '', nextUrl);
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
    if (!canApplyDefaultNavigation({
      explicitNavigationIntent,
      settlement: navigationController.current.settlement(),
    })) return;

    const defaultScope = currentUser.defaultScope ?? currentScope;
    setScopeIfChanged(defaultScope);

    if (currentUser.defaultView) {
      applyGuardedView(currentUser.defaultView, defaultScope, 'authority-rebind');
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

  const handleUpdateSprint = (sprint: Sprint) => {
    if (!ensureProductAction('workflow.status.change', { projectId: sprint.projectId })) return;
    deliveryUpdateSprint(sprint).catch(surfaceDeliveryError);
  };

  const handleAssessToDocsHandoff = (payload: AssessToStudioHandoffPayload) => {
    const docsForgeScope: Scope = currentScope.type === ScopeType.ORGANIZATION
      ? { type: ScopeType.MY_WORK }
      : currentScope;
    const access = resolveAppViewAccess(View.DOCS_FORGE, docsForgeScope);
    if (!access.allowed) {
      setAssessToStudioSourceContext(null);
      applyGuardedView(access.fallbackView, access.fallbackScope ?? docsForgeScope);
      return;
    }

    setAssessToStudioSourceContext(payload);
    recordHandoff({
      fromModule: 'assess',
      toModule: 'docs',
      status: 'Submitted',
      sourceType: 'Decision Pack',
      sourceId: payload.assessmentId,
      targetType: 'Document Generation',
      targetId: 'pending-doc-generation',
      title: `${payload.processName} moved to Docs`,
      summary: `${payload.sourceType} context was handed off to Avala Studio for BRD, PRD, PDD, and diagram generation.`,
      evidenceRefs: payload.evidenceRefs.map(ref => ref.id),
      metadata: {
        processId: payload.processId,
        assessmentId: payload.assessmentId,
        assessmentStatus: payload.assessmentStatus,
        gateDecision: payload.gateDecision,
        riskTier: payload.riskTier,
        confidenceBand: payload.confidenceBand,
        priorityTier: payload.priorityTier,
        recommendationCategory: payload.recommendationCategory,
        scoreVersion: payload.scoreVersion,
        sourceLabel: payload.sourceLabel,
        evidenceRefCount: payload.evidenceRefs.length,
        assumptionCount: payload.assumptionSummary.length,
        requiredDocumentTypes: payload.handoffPack?.requiredDocumentTypes,
      },
    });
    applyGuardedView(View.DOCS_FORGE, docsForgeScope);
  };

  useEffect(() => {
    if (guardLoading || !currentUser || !currentOrganization) return;
    // Explicit URL reconstruction owns the whole navigation tuple until React
    // commits it. Persisted view/scope normalization must not race that
    // transition and replace process_detail with a fallback computed from the
    // pre-hydration render.
    if (navigationController.current.needsClassification()) return;
    if (navigationController.current.settlementPending()) return;

    const resolvedState = resolvePersistedViewScopeState({
      view: persistedView,
      scope: persistedScope,
      user: currentUser,
      authLoading: guardLoading,
      organization: currentOrganization,
      enabledModules,
      authoritativeCapabilities: authoritativeViewCapabilities,
      preserveOrganizationWorkspace: true,
    });

    if (resolvedState.access.guardSeverity === 'wait') return;

    if (resolvedState.scopeChanged || !areScopesEqual(currentScope, resolvedState.scope)) {
      setCurrentScope(resolvedState.scope);
    }

    if (resolvedState.viewChanged || currentView !== resolvedState.view) {
      setCurrentView(resolvedState.view);
    }
  }, [
    currentOrganization,
    currentScope,
    currentUser,
    authoritativeViewCapabilities,
    currentView,
    enabledModules,
    explicitNavigationIntent,
    guardLoading,
    persistedScope,
    persistedView,
    setCurrentScope,
    setCurrentView,
  ]);

  useLayoutEffect(() => {
    if (guardLoading || !currentUser || !currentOrganization) return;
    if (!explicitNavigationIntent || !navigationController.current.needsClassification()) return;

    if (!hasDurableProductNavigationAgreement(window.location.search, persistedView, persistedScope)) {
      pendingNavigationHydration.current = {
        view: DEFAULT_PERSISTED_VIEW,
        scope: DEFAULT_PERSISTED_SCOPE,
        selectedProcessId: null,
        activeGenerationId: null,
      };
      setCurrentScope(DEFAULT_PERSISTED_SCOPE);
      setCurrentView(DEFAULT_PERSISTED_VIEW);
      setSelectedProcessId(null);
      setActiveGenerationId(null);
      pendingNavigationTransition.current = navigationController.current.beginSettlement(false);
      writeProductNavigationSearch('');
      return;
    }

    // Invalid durable navigation is rejected immediately. Only valid entity
    // reconstruction waits for process data required by route resolution.
    if (processesLoading) return;

    const resolvedNavigation = resolveProductNavigationState({
      ...parseProductNavigationSearch(window.location.search),
      user: currentUser,
      authLoading: guardLoading,
      organization: currentOrganization,
      enabledModules,
      authoritativeCapabilities: authoritativeViewCapabilities,
      processes,
      projects,
      documentGenerations,
      preserveOrganizationWorkspace: true,
    });

    pendingNavigationHydration.current = {
      view: resolvedNavigation.view,
      scope: resolvedNavigation.scope,
      selectedProcessId: resolvedNavigation.selectedProcessId,
      activeGenerationId: resolvedNavigation.activeGenerationId,
    };
    setScopeIfChanged(resolvedNavigation.scope);
    setCurrentView(resolvedNavigation.view);
    setSelectedProcessId(resolvedNavigation.selectedProcessId);
    setActiveGenerationId(resolvedNavigation.activeGenerationId);
    if (resolvedNavigation.activeGenerationId) {
      setTempArtifacts(null);
    }
    pendingNavigationTransition.current = navigationController.current.beginSettlement(true);
    writeProductNavigationSearch(buildProductNavigationSearch({
      view: resolvedNavigation.view,
      scope: resolvedNavigation.scope,
      selectedProcessId: resolvedNavigation.selectedProcessId,
      activeGenerationId: resolvedNavigation.activeGenerationId,
    }));
  }, [
    currentOrganization,
    currentUser,
    authoritativeViewCapabilities,
    documentGenerations,
    enabledModules,
    explicitNavigationIntent,
    guardLoading,
    processes,
    processesLoading,
    persistedScope,
    persistedView,
    projects,
    writeProductNavigationSearch,
    setCurrentView,
    setScopeIfChanged,
  ]);

  useEffect(() => {
    if (guardLoading || !currentUser || !currentOrganization) return;
    if (navigationController.current.needsClassification()) return;
    if (processesLoading) return;

    // Effects later in the same flush can observe ref writes from URL hydration
    // while still closing over the pre-hydration render. Keep reconciliation
    // suppressed until a committed render contains the complete hydrated
    // navigation tuple; otherwise a null process selection can downgrade a
    // valid process-detail route to the catalog.
    if (navigationController.current.settlementPending()) {
      const pending = pendingNavigationHydration.current;
      const hydrationCommitted = Boolean(pending
        && currentView === pending.view
        && areScopesEqual(currentScope, pending.scope)
        && selectedProcessId === pending.selectedProcessId
        && activeGenerationId === pending.activeGenerationId);
      if (!hydrationCommitted) return;
      pendingNavigationHydration.current = null;
      const transition = pendingNavigationTransition.current;
      if (!transition || !navigationController.current.commitSettlement(transition)) return;
      if (currentUser) lastAppliedUserId.current = currentUser.id;
    }

    if (tempArtifacts && currentView === View.WORKSPACE) {
      writeProductNavigationSearch(buildProductNavigationSearch({
        view: currentView,
        scope: currentScope,
        selectedProcessId: null,
        activeGenerationId,
      }));
      return;
    }

    const resolvedNavigation = resolveProductNavigationState({
      view: currentView,
      scope: currentScope,
      processId: selectedProcessId,
      documentGenerationId: activeGenerationId,
      user: currentUser,
      authLoading: guardLoading,
      organization: currentOrganization,
      enabledModules,
      authoritativeCapabilities: authoritativeViewCapabilities,
      processes,
      projects,
      documentGenerations,
      preserveOrganizationWorkspace: true,
    });

    if (!areScopesEqual(currentScope, resolvedNavigation.scope)) {
      setScopeIfChanged(resolvedNavigation.scope);
    }
    if (currentView !== resolvedNavigation.view) {
      setCurrentView(resolvedNavigation.view);
    }
    if (selectedProcessId !== resolvedNavigation.selectedProcessId) {
      setSelectedProcessId(resolvedNavigation.selectedProcessId);
    }
    if (!tempArtifacts && activeGenerationId !== resolvedNavigation.activeGenerationId) {
      setActiveGenerationId(resolvedNavigation.activeGenerationId);
    }

    const transition = pendingNavigationTransition.current ?? navigationController.current.begin('hydrate');
    const writeMode = navigationController.current.writeFor(transition);
    pendingNavigationTransition.current = null;
    if (writeMode) writeProductNavigationSearch(buildProductNavigationSearch({
      view: resolvedNavigation.view,
      scope: resolvedNavigation.scope,
      selectedProcessId: resolvedNavigation.selectedProcessId,
      activeGenerationId: resolvedNavigation.activeGenerationId,
    }), writeMode);
  }, [
    activeGenerationId,
    authoritativeViewCapabilities,
    currentOrganization,
    currentScope,
    currentUser,
    currentView,
    documentGenerations,
    enabledModules,
    explicitNavigationIntent,
    guardLoading,
    processes,
    processesLoading,
    projects,
    writeProductNavigationSearch,
    selectedProcessId,
    setCurrentView,
    setScopeIfChanged,
    tempArtifacts,
  ]);

  useEffect(() => {
    if (previousNavigationAuthorityKey.current === navigationAuthorityKey) return;
    previousNavigationAuthorityKey.current = navigationAuthorityKey;
    // Auth, organization, and workspace data commonly finish in separate
    // renders during cold start. Those completions belong to the current
    // durable-classification epoch and must not cancel it as an identity
    // switch. A later authority change is a new replace-only epoch.
    if (navigationController.current.needsClassification()
      || navigationController.current.settlementPending()) return;
    pendingNavigationTransition.current = navigationController.current.rebind();
  }, [navigationAuthorityKey]);

  useEffect(() => {
    if (guardLoading || !currentUser || !currentOrganization || processesLoading) return;
    const handlePopState = () => {
      const search = window.location.search;
      const target = isStructurallyValidProductNavigationSearch(search)
        ? parseProductNavigationSearch(search)
        : { view: DEFAULT_PERSISTED_VIEW, scope: DEFAULT_PERSISTED_SCOPE };
      const resolved = resolveProductNavigationState({ ...target, user: currentUser, authLoading: guardLoading, organization: currentOrganization, enabledModules, authoritativeCapabilities: authoritativeViewCapabilities, processes, projects, documentGenerations, preserveOrganizationWorkspace: true });
      pendingNavigationTransition.current = navigationController.current.beginSettlement(
        isStructurallyValidProductNavigationSearch(search),
        'popstate',
      );
      pendingNavigationHydration.current = { view: resolved.view, scope: resolved.scope, selectedProcessId: resolved.selectedProcessId, activeGenerationId: resolved.activeGenerationId };
      setScopeIfChanged(resolved.scope);
      setCurrentView(resolved.view);
      setSelectedProcessId(resolved.selectedProcessId);
      setActiveGenerationId(resolved.activeGenerationId);
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, [authoritativeViewCapabilities, currentOrganization, currentUser, documentGenerations, enabledModules, guardLoading, processes, processesLoading, projects, setCurrentView, setScopeIfChanged]);
  const handleReorderTask = (taskIdToMove: string, referenceTaskId: string | null, newEpicId: string) => {
    const task = tasks.find(item => item.id === taskIdToMove);
    if (!ensureProductAction('project.task.reorder', { projectId: task?.projectId })) return;
    deliveryReorderTask(taskIdToMove, referenceTaskId, newEpicId).catch(surfaceDeliveryError);
  };

  const handleUpdateTimesheet = (userId: string, taskId: string, date: string, hours: number) => {
    if (!currentOrganization || !currentUser) return;
    const task = tasks.find(item => item.id === taskId);
    if (!ensureProductAction('timesheet.update', { projectId: task?.projectId, targetUserId: userId })) return;

    const existingEntry = timesheetEntries.find(entry => entry.userId === userId && entry.taskId === taskId && entry.date === date);
    const optimisticEntry: TimesheetEntry = existingEntry || { id: `ts-${Date.now()}`, userId, taskId, date, hours };

    setTimesheetEntries(prev => {
      if (hours === 0) {
        return prev.filter(entry => !(entry.userId === userId && entry.taskId === taskId && entry.date === date));
      }
      const nextEntry = { ...optimisticEntry, hours };
      const hasExistingEntry = prev.some(entry => entry.id === nextEntry.id);
      return hasExistingEntry ? prev.map(entry => entry.id === nextEntry.id ? nextEntry : entry) : [...prev, nextEntry];
    });

    const persistence = hours === 0
      ? timesheetAdapter.deleteEntry(currentOrganization.id, userId, taskId, date).then(() => undefined)
      : timesheetAdapter.saveEntry({ ...optimisticEntry, hours }, currentOrganization.id);

    persistence
      .then(saved => {
        if (!saved) return;
        setTimesheetEntries(prev => prev.map(entry => entry.id === optimisticEntry.id ? saved : entry));
      })
      .catch(error => {
        surfaceDeliveryError(error);
        timesheetAdapter.getEntries(currentOrganization.id).then(setTimesheetEntries).catch(console.error);
      });
  };

  const handleUpdateApprovalStatus = (userId: string, status: ApprovalStatus, comments?: string) => {
    const generationId = activeGenerationId;
    if (!generationId && !tempArtifacts) return;
    if (!ensureProductAction('approval.execute', { documentGenerationId: generationId, hasDocumentContext: Boolean(tempArtifacts) })) return;

    if (tempArtifacts) {
      const newApprovals = tempArtifacts.approvals.map(approver =>
        approver.userId === userId
          ? { ...approver, status, comments: status === 'Rejected' ? comments : undefined, approvedAt: status === 'Approved' ? new Date().toISOString() : null }
          : approver
      );
      setTempArtifacts({ ...tempArtifacts, approvals: newApprovals });
      return;
    }

    const gen = documentGenerations.find(g => g.id === generationId);
    if (gen) {
        const newApprovals = gen.artifacts.approvals.map(approver =>
            approver.userId === userId
              ? { ...approver, status, comments: status === 'Rejected' ? comments : undefined, approvedAt: status === 'Approved' ? new Date().toISOString() : null }
              : approver
          );
        deliverySaveGeneration({ ...gen, artifacts: { ...gen.artifacts, approvals: newApprovals } });
    }
  };

  const handleResubmitForApproval = (userId: string) => {
    const generationId = activeGenerationId;
    if (!generationId && !tempArtifacts) return;
    if (!ensureProductAction('approval.execute', { documentGenerationId: generationId, hasDocumentContext: Boolean(tempArtifacts) })) return;

    if (tempArtifacts) {
      const newApprovals = tempArtifacts.approvals.map(approver =>
        approver.userId === userId
          ? { ...approver, status: 'Pending' as ApprovalStatus, comments: undefined, approvedAt: null }
          : approver
      );
      setTempArtifacts({ ...tempArtifacts, approvals: newApprovals });
      return;
    }

    const gen = documentGenerations.find(g => g.id === generationId);
    if (gen) {
        const newApprovals = gen.artifacts.approvals.map(approver =>
            approver.userId === userId
              ? { ...approver, status: 'Pending' as ApprovalStatus, comments: undefined, approvedAt: null }
              : approver
          );
        deliverySaveGeneration({ ...gen, artifacts: { ...gen.artifacts, approvals: newApprovals } });
    }
  };


  const handleImportWorkItems = async (
    itemsToImport: WorkItem[],
    projectId: string,
    importSource: {
      artifacts?: GeneratedArtifacts | null;
      generationId?: string | null;
      generationCreatedAt?: string;
    } = {},
  ) => {
    const importedAt = new Date().toISOString();
    const handoffLedgerEntryId = `handoff-docs-delivery-${Date.now()}`;
    const activeGeneration = activeGenerationId
      ? documentGenerations.find(generation => generation.id === activeGenerationId)
      : undefined;
    const sourceArtifacts = importSource.artifacts ?? activeGeneration?.artifacts ?? null;
    const sourceGenerationId = importSource.generationId || activeGeneration?.id || activeGenerationId || undefined;
    if (!ensureProductAction('delivery.import', { projectId, documentGenerationId: sourceGenerationId, hasDocumentContext: Boolean(sourceArtifacts) })) return false;
    const importDecision = resolveDeliveryImportGuard({
      actor: currentUser,
      organizationId: currentOrganization?.id,
      projectId,
      documentGenerationId: sourceGenerationId,
      hasDocumentContext: Boolean(sourceArtifacts),
      itemsToImport,
    });
    if (!importDecision.allowed) {
      surfaceDeliveryError(new Error(importDecision.message));
      return false;
    }
    const sourceCreatedAt = importSource.generationCreatedAt || importedAt;
    const sourceContext = sourceArtifacts?.sourceContext;
    const newEpics: Epic[] = [];
    const newTasks: Task[] = [];
    const tempEpicTitleToNewId = new Map<string, string>();

    itemsToImport.forEach((item, index) => {
      if (item.type === 'Epic') {
        const newEpicId = `epic-${Date.now()}-${index}`;
        newEpics.push({ id: newEpicId, name: item.title, projectId: projectId, color: ['#EF4444', '#F59E0B', '#10B981', '#3B82F6', '#8B5CF6', '#EC4899'][(epics.length + newEpics.length) % 6] });
        tempEpicTitleToNewId.set(item.title, newEpicId);
      }
    });

    let lastSeenEpicId: string | undefined = undefined;

    itemsToImport.forEach((item, index) => {
      if (item.type === 'Epic') {
        lastSeenEpicId = tempEpicTitleToNewId.get(item.title);
      } else if (item.type === 'Story' || item.type === 'Task') {
        const descriptionWithAC = `${item.description}${item.acceptanceCriteria.length > 0 ? `\n\nAcceptance Criteria:\n${item.acceptanceCriteria.map(ac => `- ${ac}`).join('\n')}` : ''}`;
        const sourceLineage = buildDocsToDeliveryLineage({
          artifacts: sourceArtifacts,
          generationId: sourceGenerationId,
          workItem: item,
          createdAt: sourceCreatedAt,
          handoffLedgerEntryIds: [handoffLedgerEntryId],
        });
        newTasks.push({
          id: `task-${Date.now()}-${index}`, title: item.title, description: descriptionWithAC, status: 'To Do',
          priority: 'Medium', type: item.type as TaskType, projectId: projectId, epicId: lastSeenEpicId,
          assigneeIds: [], startDate: new Date().toISOString().split('T')[0],
          dueDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
          sourceLineage,
        });
      }
    });

    await deliveryAddEpics(newEpics);
    await deliveryAddTasks(newTasks);

    const evidenceRefs = collectDocsToDeliveryEvidenceRefs(newTasks.map(task => task.sourceLineage));
    const assumptionRefs = Array.from(new Set(newTasks.flatMap(task => task.sourceLineage?.assumptionRefs || [])));
    const lineageCounts = summarizeDocsToDeliveryLineageCompleteness(newTasks.map(task => task.sourceLineage));
    const projectName = projects.find(p => p.id === projectId)?.name || 'the selected project';

    await recordHandoff({
      id: handoffLedgerEntryId,
      fromModule: 'docs',
      toModule: 'delivery',
      status: 'Accepted',
      sourceType: 'Work Items',
      sourceId: sourceGenerationId || 'temporary-document-generation',
      targetType: 'Project',
      targetId: projectId,
      title: `${itemsToImport.length} generated work items imported`,
      summary: `Generated document work items were accepted into ${projectName} backlog.`,
      evidenceRefs,
      metadata: {
        itemCount: itemsToImport.length,
        epicCount: newEpics.length,
        taskCount: newTasks.length,
        sourceGenerationId,
        sourceProcessId: sourceContext?.processId,
        sourceAssessmentId: sourceContext?.assessmentId,
        sourceContextLabel: sourceContext?.sourceLabel,
        lineageCompleteCount: lineageCounts.complete,
        lineagePartialCount: lineageCounts.partial,
        lineageMissingCount: lineageCounts.missing,
        evidenceRefCount: evidenceRefs.length,
        assumptionRefCount: assumptionRefs.length,
        importedWorkItemTitles: itemsToImport.map(item => item.title),
      },
    });

    alert(`${newEpics.length} epic(s) and ${newTasks.length} task(s) have been imported to your backlog.`);

    applyGuardedView(View.BACKLOG, { type: ScopeType.PROJECT, id: projectId, name: projectName });
    return true;
  };

  const handleInitiateImport = (itemsToImport: WorkItem[]) => {
    // If we are already in a project, import directly.
    if (currentScope.type === ScopeType.PROJECT) {
      const runProjectImport = async () => {
        const artifactsToImport = tempArtifacts;
        if (artifactsToImport) {
          const newGeneration: DocumentGeneration = {
            id: `docgen-${Date.now()}`,
            projectId: currentScope.id,
            generatedAt: new Date().toISOString(),
            templateId: 'unknown',
            artifacts: artifactsToImport,
          };
          const finalizedGeneration = await deliverySaveGeneration(newGeneration);
          const imported = await handleImportWorkItems(itemsToImport, currentScope.id, {
            artifacts: finalizedGeneration.artifacts,
            generationId: finalizedGeneration.id,
            generationCreatedAt: finalizedGeneration.generatedAt,
          });
          if (!imported) return;
          setActiveGenerationId(finalizedGeneration.id);
          setTempArtifacts(null);
          return;
        }

        const activeGeneration = activeGenerationId
          ? documentGenerations.find(generation => generation.id === activeGenerationId)
          : undefined;
        const imported = await handleImportWorkItems(itemsToImport, currentScope.id, {
          artifacts: activeGeneration?.artifacts || null,
          generationId: activeGeneration?.id || activeGenerationId,
          generationCreatedAt: activeGeneration?.generatedAt,
        });
        if (!imported) return;
      };

      runProjectImport().catch(surfaceDeliveryError);
    } else {
      // If it's a global generation, open the project selector.
      setImportProjectSelectorOpen(true);
    }
  };

  const handleProjectSelectedForImport = (project: Project) => {
    const artifactsToImport = tempArtifacts;
    if (!artifactsToImport) return;

    const runGlobalImport = async () => {
      const newGeneration: DocumentGeneration = {
        id: `docgen-${Date.now()}`,
        projectId: project.id,
        generatedAt: new Date().toISOString(),
        templateId: 'unknown',
        artifacts: artifactsToImport,
      };
      const finalizedGeneration = await deliverySaveGeneration(newGeneration);

      const imported = await handleImportWorkItems(artifactsToImport.workItems, project.id, {
        artifacts: finalizedGeneration.artifacts,
        generationId: finalizedGeneration.id,
        generationCreatedAt: finalizedGeneration.generatedAt,
      });
      if (!imported) return;

      setActiveGenerationId(finalizedGeneration.id);
      setTempArtifacts(null);
      setImportProjectSelectorOpen(false);
    };

    runGlobalImport().catch(surfaceDeliveryError);
  };

  const handleRefineSection = (artifactKey: DocumentArtifactKeys, sectionKey: string, newContent: string) => {
    if (!ensureProductAction('docs.refine', { documentGenerationId: activeGenerationId, hasDocumentContext: Boolean(tempArtifacts || activeGenerationId) })) return;
    const processArtifacts = (artifacts: GeneratedArtifacts): GeneratedArtifacts => {
      const newArtifacts = { ...artifacts };
      const artifactToUpdate = newArtifacts[artifactKey];
      if (artifactToUpdate && 'sections' in artifactToUpdate) {
        const newSections = artifactToUpdate.sections.map(section =>
          section.key === sectionKey ? { ...section, content: newContent } : section
        );
        (newArtifacts as any)[artifactKey] = { ...artifactToUpdate, sections: newSections };
      }
      return newArtifacts;
    };

    if (tempArtifacts) {
      setTempArtifacts(processArtifacts(tempArtifacts));
    } else if (activeGenerationId) {
      const gen = documentGenerations.find(g => g.id === activeGenerationId);
      if (gen) {
        void deliverySaveGeneration({ ...gen, artifacts: processArtifacts(gen.artifacts) })
          .catch(surfaceDeliveryError);
      }
    }
  };

  const { tasksForScope, projectsForScope, epicsForScope, sprintsForScope, usersForScope, automationsForScope, timesheetsForScope } = useMemo(() => {
    if (currentScope.type === ScopeType.MY_WORK) {
      const myProjectIds = new Set<string>();
      tasks.forEach(task => { if (task.assigneeIds.includes(currentUser.id)) myProjectIds.add(task.projectId); });
      projects.forEach(p => { if (p.ownerId === currentUser.id) myProjectIds.add(p.id); });

      const myTasks = tasks.filter(task => task.assigneeIds.includes(currentUser.id));
      const epicIds = [...new Set(myTasks.map(t => t.epicId).filter(Boolean))];

      return {
        tasksForScope: myTasks, projectsForScope: projects.filter(p => myProjectIds.has(p.id)),
        epicsForScope: epics.filter(e => epicIds.includes(e.id)), sprintsForScope: sprints.filter(s => myProjectIds.has(s.projectId)),
        usersForScope: [currentUser], automationsForScope: [], timesheetsForScope: [],
      };
    }
    if (currentScope.type === ScopeType.PROJECT) {
      const projectTasks = tasks.filter(task => task.projectId === currentScope.id);
      const assigneeIds = [...new Set(projectTasks.flatMap(t => t.assigneeIds))];
      const taskIdsInProject = new Set(projectTasks.map(t => t.id));

      return {
        tasksForScope: projectTasks, projectsForScope: [projects.find(p => p.id === currentScope.id)!].filter(Boolean),
        epicsForScope: epics.filter(e => e.projectId === currentScope.id), sprintsForScope: sprints.filter(s => s.projectId === currentScope.id),
        usersForScope: users.filter(u => assigneeIds.includes(u.id)), automationsForScope: automations.filter(a => a.projectId === currentScope.id),
        timesheetsForScope: timesheetEntries.filter(t => taskIdsInProject.has(t.taskId)),
      };
    }
    if (currentScope.type === ScopeType.TEAM) {
      const team = teams.find(t => t.id === currentScope.id);
      const memberIds = team?.memberIds || [];
      const teamTasks = tasks.filter(t => t.assigneeIds.some(id => memberIds.includes(id)));
      const projectIds = [...new Set(teamTasks.map(t => t.projectId))];
      const epicIds = [...new Set(teamTasks.map(t => t.epicId).filter(Boolean))];
      return {
        tasksForScope: teamTasks, projectsForScope: projects.filter(p => projectIds.includes(p.id)),
        epicsForScope: epics.filter(e => epicIds.includes(e.id)), sprintsForScope: [],
        usersForScope: users.filter(u => memberIds.includes(u.id)), automationsForScope: [], timesheetsForScope: [],
      };
    }
    return { tasksForScope: [], projectsForScope: [], epicsForScope: [], sprintsForScope: [], usersForScope: [], automationsForScope: [], timesheetsForScope: [] };
  }, [currentScope, tasks, projects, epics, sprints, users, automations, timesheetEntries, currentUser, teams]);

  const activeTasks = useMemo(() => filterActiveDeliveryTasks(tasks), [tasks]);
  const activeTasksForScope = useMemo(() => filterActiveDeliveryTasks(tasksForScope), [tasksForScope]);

  const handleCreateEpicFromDoc = (generation: DocumentGeneration) => {
    const template = docTemplates.find(t => t.id === generation.templateId);
    if (!template) return;

    const doc = generation.artifacts[template.artifactKey];
    let title = "Generated Epic";
    if (doc && 'title' in doc && typeof doc.title === 'string' && doc.title.trim() !== '') {
      title = doc.title;
    }

    const newEpic: Epic = {
      id: `epic-${Date.now()}`,
      name: title,
      projectId: generation.projectId,
      color: ['#EF4444', '#F59E0B', '#10B981', '#3B82F6', '#8B5CF6', '#EC4899'][epics.length % 6]
    };

    deliveryAddEpics([newEpic]).catch(surfaceDeliveryError);

    // Switch to project scope and backlog view
    const project = projects.find(p => p.id === generation.projectId);
    if (project) {
      applyGuardedView(View.BACKLOG, { type: ScopeType.PROJECT, id: project.id, name: project.name });
      alert(`Epic "${title}" created!`);
    }
  };

  const renderCurrentView = () => {
    const currentAccess = resolveAppViewAccess(currentView, currentScope);

    if (isGovernViewOpen) {
      const fallbackAccess = resolveAppViewAccess(View.PROCESS_CATALOG, currentScope);
      if (governPresentationAccess.reason === 'loading') return <ViewLoadingFallback />;
      if (!governPresentationAccess.allowed) {
        return <div className="mx-auto max-w-3xl p-8"><div className="premium-surface rounded-3xl p-8 text-center"><p className="av-eyebrow">Governance overview unavailable</p><h1 className="mt-2 text-2xl font-bold text-[var(--av-color-text)]">Open an authorized source context to review governance signals.</h1><p className="mx-auto mt-3 max-w-xl text-sm font-semibold leading-6 text-[var(--av-color-text-muted)]">This read-only overview requires the current Assess read authority and never creates review or approval authority.</p><button type="button" onClick={() => { setGovernViewOpen(false); applyGuardedView(fallbackAccess.fallbackView, fallbackAccess.fallbackScope ?? currentScope); }} className="btn-primary mt-6 inline-flex min-h-10 items-center justify-center px-4 text-sm font-bold">Open available workspace</button></div></div>;
      }
      return <GovernView
        processes={productMarketingCapture ? MARKETING_CAPTURE_PROCESSES : processes}
        handoffEntries={productMarketingCapture ? MARKETING_CAPTURE_HANDOFFS : handoffEntries}
        onNavigate={handleViewChange}
        captureMode={productMarketingCapture}
      />;
    }

    if (currentScope.type !== ScopeType.ORGANIZATION && !currentAccess.allowed && currentAccess.guardSeverity !== 'wait') {
      return (
        <div className="mx-auto max-w-3xl p-8">
          <div className="premium-surface rounded-3xl p-8 text-center">
            <p className="text-[11px] font-black uppercase tracking-[0.16em] text-slate-400">Workspace unavailable</p>
            <h1 className="mt-2 text-2xl font-black text-[#002C4B] dark:text-white">This workspace is not available in the current access context.</h1>
            <p className="mx-auto mt-3 max-w-xl text-sm font-semibold leading-6 text-slate-600 dark:text-slate-300">Open an available workspace for the current user, scope, and enabled module set.</p>
            <button onClick={() => applyGuardedView(currentAccess.fallbackView, currentAccess.fallbackScope ?? currentScope)} className="mt-6 rounded-xl bg-[#ffbc03] px-5 py-3 text-sm font-black text-[#002C4B]">
              Open Available Workspace
            </button>
          </div>
        </div>
      );
    }

    // If we are currently viewing a specific process detail
    if (currentView === View.PROCESS_DETAIL && selectedProcessId) {
      return <ProcessDetailStubView
        processId={selectedProcessId}
        onBack={() => applyGuardedView(View.PROCESS_CATALOG)}
        onStartAssessment={(id) => { setSelectedProcessId(id); applyGuardedView(View.GUIDED_ASSESSMENT); }}
        onGenerateDocs={handleAssessToDocsHandoff}
        captureMode={applicationPortfolioMarketingCapture}
      />;
    }

    if (currentView === View.GUIDED_ASSESSMENT && selectedProcessId && currentScope.type !== ScopeType.ORGANIZATION) {
       // Using orgId from the current context. Assuming projects belong to current org if in project scope, but Process is strictly an org-level concept.
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
          canonicalMonitorContext={!productMarketingCapture && currentOrganization?.id && currentWorkspace?.id ? {
            actorId: currentUser.id,
            organizationId: currentOrganization.id,
            workspaceId: currentWorkspace.id,
            expectedAuthorizationVersion: tenantContext?.authorizationVersion,
          } : undefined}
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

  if (controlledHumanBrowserBinding.status === 'blocked') {
    return <div className="min-h-screen bg-slate-50 dark:bg-slate-950">
      <ControlledHumanNonProductionBanner />
      <main className="grid min-h-[calc(100vh-2.75rem)] place-items-center p-6">
        <section className="w-full max-w-xl rounded-3xl border border-red-200 bg-white p-8 text-center shadow-xl dark:border-red-900 dark:bg-slate-900">
          <p className="av-eyebrow">Controlled human test</p>
          <h1 className="mt-3 text-3xl font-bold text-[#002C4B] dark:text-white">Workspace access blocked</h1>
          <p className="mx-auto mt-4 max-w-md text-sm leading-6 text-slate-600 dark:text-slate-300">The connected test binding is no longer valid. No workspace projection or mutation is available.</p>
          <a href="/sign-in" className="btn-primary mt-6 inline-flex min-h-11 items-center justify-center px-5 text-sm font-bold">Return to controlled sign-in</a>
        </section>
      </main>
    </div>;
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
        <ControlledHumanNonProductionBanner />
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
        <main id="app-main" tabIndex={0} className="view-transition-enter view-transition-enter-active flex-1 overflow-y-auto p-4 sm:p-5 lg:p-6">
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
