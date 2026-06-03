
import React, { useState, useEffect, useMemo, useRef } from 'react';
import Sidebar from './components/shared/Sidebar';
import Header from './components/shared/Header';
import ModuleJourney from './components/shared/ModuleJourney';
import { Scope, View, ScopeType, Task, Project, Epic, Sprint, User, TaskStatus, Team, DocTemplate, Automation, TimesheetEntry, GeneratedArtifacts, ApprovalStatus, Filters, ProjectLifecycleStage, DocumentGeneration, ProjectDetails, WorkItem, TaskType, DocumentArtifactKeys, DocumentSection, AiProviderType } from './types';
import { MOCK_USERS, MOCK_TEAMS, MOCK_AUTOMATIONS, MOCK_TIMESHEET_ENTRIES } from './data/mockData';
import { MOCK_DOC_TEMPLATES } from './data/docTemplates';
import { useAuth } from './components/auth/AuthProvider';
import LoginView from './components/auth/LoginView';
import { useOrganizationContext } from './components/auth/OrganizationProvider';
import OnboardingWizard from './components/auth/OnboardingWizard';
import { useDelivery } from './components/delivery/DeliveryProvider';
import { useDocs } from './components/docs/DocsProvider';


import { StorageKeys, usePersistentState } from './services/storage';
import { firstEnabledView, isViewEnabled, isModuleEnabled } from './constants/moduleConfig';
import { useHandoffLedger } from './services/handoffLedgerService';
import { isSupabaseConfigured } from './services/supabaseClient';
import { mapDemoTeamsForSupabase, mapDemoUsersForSupabase } from './services/demoIdentity';
import { timesheetAdapter } from './services/adapters/timesheetAdapter';

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
  const [theme, setTheme] = usePersistentState<'light' | 'dark'>(StorageKeys.THEME, 'light');
  const [isSidebarCollapsed, setSidebarCollapsed] = useState(false);

  // App State
  const { user: currentUser, loading: authLoading } = useAuth();
  const { currentOrganization, organizations, loading: orgLoading, createOrg } = useOrganizationContext();
  const [currentScope, setCurrentScope] = usePersistentState<Scope>(StorageKeys.SCOPE, { type: ScopeType.MY_WORK });
  const [currentView, setCurrentView] = usePersistentState<View>(StorageKeys.VIEW, View.DASHBOARD);
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
  const [teams, setTeams] = usePersistentState<Team[]>(StorageKeys.TEAMS, MOCK_TEAMS);
  const [users, setUsers] = usePersistentState<User[]>(StorageKeys.USERS, MOCK_USERS);
  const [docTemplates, setDocTemplates] = usePersistentState<DocTemplate[]>(StorageKeys.DOC_TEMPLATES, MOCK_DOC_TEMPLATES);
  const [automations, setAutomations] = usePersistentState<Automation[]>(StorageKeys.AUTOMATIONS, MOCK_AUTOMATIONS);
  const [timesheetEntries, setTimesheetEntries] = useState<TimesheetEntry[]>(MOCK_TIMESHEET_ENTRIES);
  const { documentGenerations, saveGeneration: deliverySaveGeneration } = useDocs();
  const { entries: handoffEntries, recordHandoff } = useHandoffLedger();

  const [activeGenerationId, setActiveGenerationId] = useState<string | null>(null);
  const [tempArtifacts, setTempArtifacts] = useState<GeneratedArtifacts | null>(null);

  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const [isProjectSelectorOpen, setIsProjectSelectorOpen] = useState(false);
  const [isImportProjectSelectorOpen, setImportProjectSelectorOpen] = useState(false);

  // AI Provider State
  const [userApiKey, setUserApiKey] = useState('');
  const [aiProviderType, setAiProviderType] = usePersistentState<AiProviderType>(StorageKeys.AI_PROVIDER, 'groq');

  // Assess Detail State
  const [selectedProcessId, setSelectedProcessId] = useState<string | null>(null);
  const enabledModules = currentOrganization?.enabledModules;


  useEffect(() => {
    if (theme === 'dark') {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [theme]);

  useEffect(() => {
    localStorage.removeItem(StorageKeys.API_KEY);
  }, []);

  useEffect(() => {
    if (aiProviderType === 'openai') {
      setAiProviderType('groq');
    }
  }, [aiProviderType, setAiProviderType]);

  useEffect(() => {
    if (!currentUser || lastAppliedUserId.current === currentUser.id) return;

    if (isSupabaseConfigured()) {
      setUsers(mapDemoUsersForSupabase(MOCK_USERS));
      setTeams(mapDemoTeamsForSupabase(MOCK_TEAMS));
    }

    if (currentUser.defaultScope) {
      setCurrentScope(currentUser.defaultScope);
    }
    if (currentUser.defaultView) {
      setCurrentView(currentUser.defaultView);
    }

    lastAppliedUserId.current = currentUser.id;
  }, [currentUser, setCurrentScope, setCurrentView]);

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
    setCurrentScope(scope);
    // Reset view to a sensible default for the new scope
    if (scope.type === ScopeType.MY_WORK) setCurrentView(isViewEnabled(View.DASHBOARD, enabledModules) ? View.DASHBOARD : firstEnabledView(enabledModules));
    if (scope.type === ScopeType.PROJECT) setCurrentView(isViewEnabled(View.BOARDS, enabledModules) ? View.BOARDS : firstEnabledView(enabledModules));
    if (scope.type === ScopeType.TEAM) setCurrentView(isViewEnabled(View.BOARDS, enabledModules) ? View.BOARDS : firstEnabledView(enabledModules));
  };

  const handleViewChange = (view: View) => {
    setCurrentView(isViewEnabled(view, enabledModules) ? view : firstEnabledView(enabledModules));
  };

  const handleDashboardStatClick = (filter: Filters) => {
    if (currentScope.type !== ScopeType.MY_WORK) {
      setCurrentScope({ type: ScopeType.MY_WORK });
    }
    setQuickFilter(filter);
    setCurrentView(View.LIST);
  };

  const handlePrimaryAction = () => {
    if (isModuleEnabled('docs', enabledModules)) {
      setCurrentView(View.DOCS_FORGE);
      return;
    }
    if (isModuleEnabled('assess', enabledModules)) {
      setCurrentView(View.PROCESS_CATALOG);
      return;
    }
    if (isModuleEnabled('delivery', enabledModules)) {
      setCurrentView(View.BOARDS);
      return;
    }
    setCurrentView(View.DASHBOARD);
  };

  const handleProjectSelectedForDocForge = (project: Project) => {
    handleScopeChange({ type: ScopeType.PROJECT, id: project.id, name: project.name });
    setCurrentView(View.DOCS_FORGE);
    setIsProjectSelectorOpen(false);
  };

  // Data manipulation handlers
  const surfaceDeliveryError = (error: unknown) => {
    const message = error instanceof Error ? error.message : 'This delivery action could not be completed.';
    window.alert(message);
  };

  const handleUpdateTaskStatus = (taskId: string, newStatus: TaskStatus) => {
    deliveryUpdateTaskStatus(taskId, newStatus).catch(surfaceDeliveryError);
  };

  const handleUpdateProjectLifecycleStage = (projectId: string, newStage: ProjectLifecycleStage) => {
    const project = projects.find(item => item.id === projectId);
    if (!project) return;
    deliveryUpdateProject({ ...project, lifecycleStage: newStage }).catch(surfaceDeliveryError);
  };

  const handleUpdateTask = (updatedTask: Task) => {
    deliveryUpdateTask(updatedTask).catch(surfaceDeliveryError);
  };

  const handleAddTask = (taskDetails: Pick<Task, 'title' | 'projectId'> & Partial<Omit<Task, 'title' | 'projectId'>>) => {
    deliveryAddTask(taskDetails).catch(surfaceDeliveryError);
  };

  const handleDeleteTask = (taskId: string) => {
    deliveryDeleteTask(taskId)
      .then(() => {
        if (selectedTask?.id === taskId) {
          setSelectedTask(null);
        }
      })
      .catch(surfaceDeliveryError);
  };

  const handleUpdateTaskSprint = (taskId: string, sprintId: string | null) => {
    deliveryUpdateTaskSprint(taskId, sprintId).catch(surfaceDeliveryError);
  };

  const handleUpdateSprint = (sprint: Sprint) => {
    deliveryUpdateSprint(sprint).catch(surfaceDeliveryError);
  };

  const handleAssessToDocsHandoff = (payload: { processId: string; processName: string; assessmentId?: string; decision?: string }) => {
    recordHandoff({
      fromModule: 'assess',
      toModule: 'docs',
      status: 'Submitted',
      sourceType: 'Decision Pack',
      sourceId: payload.assessmentId || payload.processId,
      targetType: 'Document Generation',
      targetId: 'pending-doc-generation',
      title: `${payload.processName} moved to Docs`,
      summary: `Assessment decision ${payload.decision || 'ready'} was handed off to Avala Studio for BRD, PRD, PDD, and diagram generation.`,
      evidenceRefs: [payload.processId, payload.assessmentId || 'assessment-pending'],
      metadata: {
        processId: payload.processId,
        decision: payload.decision,
      },
    });
    setCurrentView(View.DOCS_FORGE);
  };

  useEffect(() => {
    if (!currentOrganization || currentScope.type === ScopeType.ORGANIZATION) return;
    if (currentView === View.TEAMS) {
      setCurrentView(isViewEnabled(View.BOARDS, enabledModules) ? View.BOARDS : firstEnabledView(enabledModules));
      return;
    }
    if (currentView === View.REPORTS) {
      setCurrentView(isViewEnabled(View.DASHBOARD, enabledModules) ? View.DASHBOARD : firstEnabledView(enabledModules));
      return;
    }
    if (!isViewEnabled(currentView, enabledModules)) {
      setCurrentView(firstEnabledView(enabledModules));
    }
  }, [currentOrganization, currentScope.type, currentView, enabledModules, setCurrentView]);

  const handleReorderTask = (taskIdToMove: string, referenceTaskId: string | null, newEpicId: string) => {
    deliveryReorderTask(taskIdToMove, referenceTaskId, newEpicId).catch(surfaceDeliveryError);
  };

  const handleUpdateTimesheet = (userId: string, taskId: string, date: string, hours: number) => {
    if (!currentOrganization || !currentUser) return;
    const canManageTimesheets = currentUser.permissions?.some(permission => ['project.manage', 'timesheets.approve'].includes(permission));
    const canLogOwnTime = userId === currentUser.id && currentUser.permissions?.includes('timesheets.log');
    if (!canManageTimesheets && !canLogOwnTime) {
      surfaceDeliveryError(new Error('You do not have permission to log or approve timesheet entries.'));
      return;
    }

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


  const handleImportWorkItems = async (itemsToImport: WorkItem[], projectId: string) => {
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
        newTasks.push({
          id: `task-${Date.now()}-${index}`, title: item.title, description: descriptionWithAC, status: 'To Do',
          priority: 'Medium', type: item.type as TaskType, projectId: projectId, epicId: lastSeenEpicId,
          assigneeIds: [], startDate: new Date().toISOString().split('T')[0],
          dueDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
        });
      }
    });

    await deliveryAddEpics(newEpics);
    await deliveryAddTasks(newTasks);

    recordHandoff({
      fromModule: 'docs',
      toModule: 'delivery',
      status: 'Accepted',
      sourceType: 'Work Items',
      sourceId: activeGenerationId || 'temporary-document-generation',
      targetType: 'Project',
      targetId: projectId,
      title: `${itemsToImport.length} generated work items imported`,
      summary: `Generated document work items were accepted into ${projects.find(p => p.id === projectId)?.name || 'the selected project'} backlog.`,
      evidenceRefs: itemsToImport.map(item => item.title),
      metadata: {
        itemCount: itemsToImport.length,
        epicCount: newEpics.length,
        taskCount: newTasks.length,
      },
    });

    alert(`${newEpics.length} epic(s) and ${newTasks.length} task(s) have been imported to your backlog.`);

    handleScopeChange({ type: ScopeType.PROJECT, id: projectId, name: projects.find(p => p.id === projectId)!.name });
    setCurrentView(View.BACKLOG);
  };

  const handleInitiateImport = (itemsToImport: WorkItem[]) => {
    // If we are already in a project, import directly.
    if (currentScope.type === ScopeType.PROJECT) {
      handleImportWorkItems(itemsToImport, currentScope.id).catch(surfaceDeliveryError);
      // If this was a temporary artifact session, we can now persist it.
      if (tempArtifacts) {
        const newGeneration: DocumentGeneration = {
          id: `docgen-${Date.now()}`,
          projectId: currentScope.id,
          generatedAt: new Date().toISOString(),
          templateId: 'unknown', // This info is lost in the temp state, could be improved
          artifacts: tempArtifacts,
        };
        deliverySaveGeneration(newGeneration);
        setTempArtifacts(null);
      }
    } else {
      // If it's a global generation, open the project selector.
      setImportProjectSelectorOpen(true);
    }
  };

  const handleProjectSelectedForImport = (project: Project) => {
    if (!tempArtifacts) return;

    // 1. Persist the DocumentGeneration artifact
    const newGeneration: DocumentGeneration = {
      id: `docgen-${Date.now()}`,
      projectId: project.id,
      generatedAt: new Date().toISOString(),
      templateId: 'unknown', // This info is lost in the temp state, could be improved
      artifacts: tempArtifacts,
    };
    deliverySaveGeneration(newGeneration);

    // 2. Import the work items into the selected project
    handleImportWorkItems(tempArtifacts.workItems, project.id).catch(surfaceDeliveryError);

    // 3. Clean up and close modal
    setTempArtifacts(null);
    setImportProjectSelectorOpen(false);
  };

  const handleRefineSection = (artifactKey: DocumentArtifactKeys, sectionKey: string, newContent: string) => {
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
        deliverySaveGeneration({ ...gen, artifacts: processArtifacts(gen.artifacts) });
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
      handleScopeChange({ type: ScopeType.PROJECT, id: project.id, name: project.name });
      setCurrentView(View.BACKLOG); // Ensure View.BACKLOG exists in your View enum
      alert(`Epic "${title}" created!`);
    }
  };

  const renderCurrentView = () => {
    if (currentScope.type !== ScopeType.ORGANIZATION && !isViewEnabled(currentView, enabledModules)) {
      return (
        <div className="mx-auto max-w-3xl p-8">
          <div className="premium-surface rounded-3xl p-8 text-center">
            <p className="text-[11px] font-black uppercase tracking-[0.16em] text-slate-400">Module not enabled</p>
            <h1 className="mt-2 text-2xl font-black text-[#002C4B] dark:text-white">This workspace is configured for a different module set.</h1>
            <p className="mx-auto mt-3 max-w-xl text-sm font-semibold leading-6 text-slate-600 dark:text-slate-300">Only enabled modules appear in navigation. Ask an Avala Admin to update module access if this team needs the complete Avala Assess, Avala Studio, Avala Delivery Lite, and Avala Monitor suite.</p>
            <button onClick={() => setCurrentView(firstEnabledView(enabledModules))} className="mt-6 rounded-xl bg-[#ffbc03] px-5 py-3 text-sm font-black text-[#002C4B]">
              Open Enabled Module
            </button>
          </div>
        </div>
      );
    }

    // If we are currently viewing a specific process detail
    if (currentView === View.PROCESS_DETAIL && selectedProcessId) {
      return <ProcessDetailStubView
        processId={selectedProcessId}
        onBack={() => setCurrentView(View.PROCESS_CATALOG)}
        onStartAssessment={(id) => { setSelectedProcessId(id); setCurrentView(View.GUIDED_ASSESSMENT); }}
        onGenerateDocs={handleAssessToDocsHandoff}
      />;
    }

    if (currentView === View.GUIDED_ASSESSMENT && selectedProcessId && currentScope.type !== ScopeType.ORGANIZATION) {
       // Using orgId from the current context. Assuming projects belong to current org if in project scope, but Process is strictly an org-level concept.
       // The process has an orgId. We need to use the current selected organization, but the scope might be Team/Project.
       // Actually, Module 1 defined Assess views mostly in Organization scope, so we use currentOrganization context globally.
       return <GuidedAssessmentView processId={selectedProcessId} onExit={() => setCurrentView(View.PROCESS_DETAIL)} />;
    }

    // Global Assess Views
    if (currentView === View.PROCESS_CATALOG) {
      return <ProcessCatalogView onViewDetail={(id) => { setSelectedProcessId(id); setCurrentView(View.PROCESS_DETAIL); }} />;
    }
    if (currentView === View.TEMPLATE_LIBRARY) {
      return <TemplateLibraryView />;
    }

    if (currentScope.type === ScopeType.ORGANIZATION) {
      return <OrganizationSetupView currentUser={currentUser} allUsers={users} />;
    }

    switch (currentView) {
      case View.DASHBOARD:
        return <CustomDashboardView currentUser={currentUser} tasks={tasksForScope} projects={projectsForScope} sprints={sprintsForScope} handoffEntries={handoffEntries} onSelectTask={setSelectedTask} onStatClick={handleDashboardStatClick} userApiKey={userApiKey} aiProviderType={aiProviderType} />;
      case View.PORTFOLIO:
        return <PortfolioView projects={projects} tasks={tasks} users={users} onUpdateProjectStage={handleUpdateProjectLifecycleStage} onScopeChange={handleScopeChange} onViewChange={handleViewChange} />;
      case View.DOCS_FORGE:
        return <DocsForgeView
          project={currentScope.type === ScopeType.PROJECT ? projectsForScope[0] : null}
          docTemplates={docTemplates}
          onCancel={() => setCurrentView(View.DASHBOARD)}
          onComplete={(projectDetails: ProjectDetails, artifacts: GeneratedArtifacts) => {
            if (currentScope.type === ScopeType.PROJECT) {
              const newGeneration: DocumentGeneration = {
                id: `docgen-${Date.now()}`, projectId: currentScope.id,
                generatedAt: new Date().toISOString(), templateId: projectDetails.templateId, artifacts: artifacts,
              };
              setTempArtifacts(artifacts);
              setActiveGenerationId(null);
              deliverySaveGeneration(newGeneration)
                .then(saved => {
                  if (saved) {
                    setActiveGenerationId(saved.id);
                    setTempArtifacts(null);
                  }
                })
                .catch(surfaceDeliveryError);
            } else {
              // Globally generated, hold artifacts in temp state
              setTempArtifacts(artifacts);
              setActiveGenerationId(null);
            }
            setCurrentView(View.WORKSPACE);
          }}
          userApiKey={userApiKey}
          aiProviderType={aiProviderType}
          onAiProviderTypeChange={setAiProviderType}
        />;
      case View.WORKSPACE: {
        const activeGeneration = documentGenerations.find(g => g.id === activeGenerationId);
        const artifactsToShow = activeGeneration?.artifacts || tempArtifacts;

        if (!artifactsToShow) {
          return <div className="p-8 text-center">Could not find document generation data. Please return to the docs repository.</div>;
        }
        // Template finding might be less reliable for global generations
        const templateId = activeGeneration?.templateId || 'brd.v1';
        const template = docTemplates.find(t => t.id === templateId) || docTemplates[0];

        return <WorkspaceView
          artifacts={artifactsToShow}
          generationId={activeGeneration?.id || null}
          template={template}
          error={null}
          onDone={() => {
            setActiveGenerationId(null);
            setTempArtifacts(null);
            setCurrentView(currentScope.type === ScopeType.PROJECT ? View.DOCS : View.DASHBOARD);
          }}
          users={users} currentUser={currentUser}
          onUpdateApprovalStatus={handleUpdateApprovalStatus}
          onResubmitForApproval={handleResubmitForApproval}
          onInitiateImport={handleInitiateImport}
          onRefineSection={handleRefineSection}
          userApiKey={userApiKey}
          aiProviderType={aiProviderType}
        />
      }
      case View.TEMPLATE_STUDIO:
        return <TemplateStudioView templates={docTemplates} onCreate={(t) => setDocTemplates(p => [...p, { ...t, id: `template-${Date.now()}` }])} onUpdate={(t) => setDocTemplates(p => p.map(pt => pt.id === t.id ? t : pt))} onDelete={(id) => setDocTemplates(p => p.filter(pt => pt.id !== id))} />;
      case View.DOCS:
        return <DocsView generations={documentGenerations.filter(g => g.projectId === (currentScope as any).id)} templates={docTemplates} onViewGeneration={(id) => {
          setActiveGenerationId(id);
          setTempArtifacts(null);
          setCurrentView(View.WORKSPACE);
        }} />;
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
            userApiKey={userApiKey}
            aiProviderType={aiProviderType}
            onUpdateTaskStatus={handleUpdateTaskStatus} onUpdateTask={handleUpdateTask} onSelectTask={setSelectedTask}
            // Fix: Pass `handleReorderTask` to the `onReorderTask` prop. The original code had a typo `onReorderTask`.
            onUpdateTaskSprint={handleUpdateTaskSprint} onUpdateSprint={handleUpdateSprint} onReorderTask={handleReorderTask} onAddTask={handleAddTask} onDeleteTask={handleDeleteTask}
            onCreateAutomation={(a) => setAutomations(p => [...p, { ...a, id: `auto-${Date.now()}` }])} onUpdateAutomation={(a) => setAutomations(p => p.map(pa => pa.id === a.id ? a : pa))} onDeleteAutomation={(id) => setAutomations(p => p.filter(pa => pa.id !== id))} onToggleAutomation={(id, isEnabled) => setAutomations(p => p.map(pa => pa.id === id ? { ...pa, isEnabled } : pa))}
            onUpdateTimesheet={handleUpdateTimesheet}
            onViewGeneration={(generationId: string) => {
              setTempArtifacts(null);
              setActiveGenerationId(generationId);
              setCurrentView(View.WORKSPACE);
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
    return <LoginView />;
  }

  if (organizations.length === 0) {
    return <OnboardingWizard onComplete={(name) => createOrg(name)} />;
  }

  return (
    <div className="app-shell flex h-screen text-text-light dark:text-text-dark font-sans">
      <Sidebar
        currentScope={currentScope}
        currentView={currentView}
        onViewChange={handleViewChange}
        onScopeChange={handleScopeChange}
        collapsed={isSidebarCollapsed}
      />
      <div className="flex flex-col flex-1 overflow-hidden relative">
        <Header
          theme={theme}
          toggleTheme={toggleTheme}
          onStartNew={handlePrimaryAction}
          currentScope={currentScope}
          onScopeChange={handleScopeChange}
          currentUser={currentUser}
          teams={teams}
          projects={projects}
        />
        {currentScope.type !== ScopeType.ORGANIZATION && (
          <ModuleJourney
            enabledModules={enabledModules}
            currentView={currentView}
            onNavigate={handleViewChange}
          />
        )}
        <main className="flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8 view-transition-enter view-transition-enter-active">
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
