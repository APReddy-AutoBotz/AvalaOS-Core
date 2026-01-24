
import React, { useState, useEffect, useMemo } from 'react';
import Sidebar from './components/Sidebar';
import Header from './components/Header';
import MyWorkView from './components/MyWorkView';
import ProjectView from './components/ProjectView';
import TeamView from './components/TeamView';
import DocsForgeView from './components/DocsForgeView';
import TemplateStudioView from './components/TemplateStudioView';
import CustomDashboardView from './components/CustomDashboardView';
import ReportsView from './components/ReportsView';
import DocsView from './components/DocsView';
import PortfolioView from './components/PortfolioView';
import WorkspaceView from './components/WorkspaceView';
import { Scope, View, ScopeType, Task, Project, Epic, Sprint, User, TaskStatus, Team, DocTemplate, Automation, TimesheetEntry, GeneratedArtifacts, ApprovalStatus, Filters, ProjectLifecycleStage, DocumentGeneration, ProjectDetails, WorkItem, TaskType, DocumentArtifactKeys, DocumentSection, AiProviderType } from './types';
import { MOCK_USERS, MOCK_TEAMS, MOCK_PROJECTS, MOCK_TASKS, MOCK_EPICS, MOCK_SPRINTS, MOCK_AUTOMATIONS, MOCK_TIMESHEET_ENTRIES, MOCK_DOCUMENT_GENERATIONS } from './data/mockData';
import { MOCK_DOC_TEMPLATES } from './data/docTemplates';
import TaskDetailModal from './components/TaskDetailModal';
import ProjectSelectorModal from './components/ProjectSelectorModal';


import { StorageKeys, usePersistentState } from './services/storage';

function App() {
  const [theme, setTheme] = usePersistentState<'light' | 'dark'>(StorageKeys.THEME, 'light');
  const [isSidebarCollapsed, setSidebarCollapsed] = useState(false);

  // App State
  const [currentUser] = usePersistentState<User>(StorageKeys.CURRENT_USER, MOCK_USERS[0]);
  const [currentScope, setCurrentScope] = usePersistentState<Scope>(StorageKeys.SCOPE, { type: ScopeType.MY_WORK });
  const [currentView, setCurrentView] = usePersistentState<View>(StorageKeys.VIEW, View.DASHBOARD);
  const [quickFilter, setQuickFilter] = useState<Filters | null>(null);

  // Data State
  const [tasks, setTasks] = usePersistentState<Task[]>(StorageKeys.TASKS, MOCK_TASKS);
  const [projects, setProjects] = usePersistentState<Project[]>(StorageKeys.PROJECTS, MOCK_PROJECTS);
  const [epics, setEpics] = usePersistentState<Epic[]>(StorageKeys.EPICS, MOCK_EPICS);
  const [sprints, setSprints] = usePersistentState<Sprint[]>(StorageKeys.SPRINTS, MOCK_SPRINTS);
  const [teams, setTeams] = usePersistentState<Team[]>(StorageKeys.TEAMS, MOCK_TEAMS);
  const [users, setUsers] = usePersistentState<User[]>(StorageKeys.USERS, MOCK_USERS);
  const [docTemplates, setDocTemplates] = usePersistentState<DocTemplate[]>(StorageKeys.DOC_TEMPLATES, MOCK_DOC_TEMPLATES);
  const [automations, setAutomations] = usePersistentState<Automation[]>(StorageKeys.AUTOMATIONS, MOCK_AUTOMATIONS);
  const [timesheetEntries, setTimesheetEntries] = usePersistentState<TimesheetEntry[]>(StorageKeys.TIMESHEETS, MOCK_TIMESHEET_ENTRIES);
  const [documentGenerations, setDocumentGenerations] = usePersistentState<DocumentGeneration[]>(StorageKeys.DOC_GENERATIONS, MOCK_DOCUMENT_GENERATIONS);

  const [activeGenerationId, setActiveGenerationId] = useState<string | null>(null);
  const [tempArtifacts, setTempArtifacts] = useState<GeneratedArtifacts | null>(null);

  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const [isProjectSelectorOpen, setIsProjectSelectorOpen] = useState(false);
  const [isImportProjectSelectorOpen, setImportProjectSelectorOpen] = useState(false);

  // AI Provider State
  const [userApiKey, setUserApiKey] = usePersistentState<string>(StorageKeys.API_KEY, '');
  const [aiProviderType, setAiProviderType] = usePersistentState<AiProviderType>(StorageKeys.AI_PROVIDER, 'gemini');


  useEffect(() => {
    if (theme === 'dark') {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [theme]);

  const toggleTheme = () => {
    setTheme(prevTheme => prevTheme === 'light' ? 'dark' : 'light');
  };

  const handleScopeChange = (scope: Scope) => {
    setCurrentScope(scope);
    // Reset view to a sensible default for the new scope
    if (scope.type === ScopeType.MY_WORK) setCurrentView(View.DASHBOARD);
    if (scope.type === ScopeType.PROJECT) setCurrentView(View.BOARDS);
    if (scope.type === ScopeType.TEAM) setCurrentView(View.TEAMS);
  };

  const handleViewChange = (view: View) => {
    setCurrentView(view);
  };

  const handleDashboardStatClick = (filter: Filters) => {
    if (currentScope.type !== ScopeType.MY_WORK) {
      setCurrentScope({ type: ScopeType.MY_WORK });
    }
    setQuickFilter(filter);
    setCurrentView(View.LIST);
  };

  const handleStartNewDoc = () => {
    // Always go to the forge, regardless of current scope.
    // We'll handle project selection later if needed.
    setCurrentView(View.DOCS_FORGE);
  };

  const handleProjectSelectedForDocForge = (project: Project) => {
    handleScopeChange({ type: ScopeType.PROJECT, id: project.id, name: project.name });
    setCurrentView(View.DOCS_FORGE);
    setIsProjectSelectorOpen(false);
  };

  // Data manipulation handlers
  const handleUpdateTaskStatus = (taskId: string, newStatus: TaskStatus) => {
    setTasks(prevTasks => prevTasks.map(task => task.id === taskId ? { ...task, status: newStatus } : task));
  };

  const handleUpdateProjectLifecycleStage = (projectId: string, newStage: ProjectLifecycleStage) => {
    setProjects(prevProjects => prevProjects.map(p => p.id === projectId ? { ...p, lifecycleStage: newStage } : p));
  };

  const handleUpdateTask = (updatedTask: Task) => {
    setTasks(prev => prev.map(t => t.id === updatedTask.id ? updatedTask : t));
  };

  const handleAddTask = (taskDetails: Pick<Task, 'title' | 'projectId'> & Partial<Omit<Task, 'title' | 'projectId'>>) => {
    const newTask: Task = {
      ...taskDetails,
      id: `task-${Date.now()}`,
      title: taskDetails.title,
      description: taskDetails.description || '',
      status: taskDetails.status || 'To Do',
      priority: taskDetails.priority || 'Medium',
      type: taskDetails.type || 'Task',
      projectId: taskDetails.projectId,
      assigneeIds: taskDetails.assigneeIds || [],
      startDate: taskDetails.startDate || new Date().toISOString().split('T')[0],
      dueDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
    };
    setTasks(prev => [...prev, newTask]);
  };

  const handleDeleteTask = (taskId: string) => {
    setTasks(prev => prev.filter(t => t.id !== taskId));
    if (selectedTask?.id === taskId) {
      setSelectedTask(null);
    }
  };

  const handleUpdateTaskSprint = (taskId: string, sprintId: string | null) => {
    setTasks(tasks.map(t => t.id === taskId ? { ...t, sprintId: sprintId || undefined } : t));
  };

  const handleReorderTask = (taskIdToMove: string, referenceTaskId: string | null, newEpicId: string) => {
    // This is a simplified reorder. A real app would adjust order properties.
    console.log(`Reordering ${taskIdToMove} before ${referenceTaskId} in epic ${newEpicId}`);
    setTasks(prevTasks => {
      const taskToMove = prevTasks.find(t => t.id === taskIdToMove);
      if (!taskToMove) return prevTasks;

      const otherTasks = prevTasks.filter(t => t.id !== taskIdToMove);
      taskToMove.epicId = newEpicId !== 'unassigned' ? newEpicId : undefined;

      if (!referenceTaskId) {
        return [...otherTasks, taskToMove];
      }

      const refIndex = otherTasks.findIndex(t => t.id === referenceTaskId);
      otherTasks.splice(refIndex, 0, taskToMove);
      return otherTasks;
    });
  };

  const handleUpdateTimesheet = (userId: string, taskId: string, date: string, hours: number) => {
    setTimesheetEntries(prev => {
      const existingEntryIndex = prev.findIndex(e => e.userId === userId && e.taskId === taskId && e.date === date);
      if (existingEntryIndex > -1) {
        if (hours === 0) {
          // Remove entry if hours are zero
          return prev.filter((_, index) => index !== existingEntryIndex);
        }
        // Update existing entry
        const updatedEntries = [...prev];
        updatedEntries[existingEntryIndex] = { ...updatedEntries[existingEntryIndex], hours };
        return updatedEntries;
      } else if (hours > 0) {
        // Add new entry
        const newEntry: TimesheetEntry = {
          id: `ts-${Date.now()}`,
          userId,
          taskId,
          date,
          hours,
        };
        return [...prev, newEntry];
      }
      return prev;
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

    setDocumentGenerations(prevGens => {
      return prevGens.map(gen => {
        if (gen.id === generationId) {
          const newApprovals = gen.artifacts.approvals.map(approver =>
            approver.userId === userId
              ? { ...approver, status, comments: status === 'Rejected' ? comments : undefined, approvedAt: status === 'Approved' ? new Date().toISOString() : null }
              : approver
          );
          return { ...gen, artifacts: { ...gen.artifacts, approvals: newApprovals } };
        }
        return gen;
      });
    });
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

    setDocumentGenerations(prevGens => {
      return prevGens.map(gen => {
        if (gen.id === generationId) {
          const newApprovals = gen.artifacts.approvals.map(approver =>
            approver.userId === userId
              ? { ...approver, status: 'Pending' as ApprovalStatus, comments: undefined, approvedAt: null }
              : approver
          );
          return { ...gen, artifacts: { ...gen.artifacts, approvals: newApprovals } };
        }
        return gen;
      });
    });
  };


  const handleImportWorkItems = (itemsToImport: WorkItem[], projectId: string) => {
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

    setEpics(prev => [...prev, ...newEpics]);
    setTasks(prev => [...prev, ...newTasks]);

    alert(`${newEpics.length} epic(s) and ${newTasks.length} task(s) have been imported to your backlog.`);

    handleScopeChange({ type: ScopeType.PROJECT, id: projectId, name: projects.find(p => p.id === projectId)!.name });
    setCurrentView(View.BACKLOG);
  };

  const handleInitiateImport = (itemsToImport: WorkItem[]) => {
    // If we are already in a project, import directly.
    if (currentScope.type === ScopeType.PROJECT) {
      handleImportWorkItems(itemsToImport, currentScope.id);
      // If this was a temporary artifact session, we can now persist it.
      if (tempArtifacts) {
        const newGeneration: DocumentGeneration = {
          id: `docgen-${Date.now()}`,
          projectId: currentScope.id,
          generatedAt: new Date().toISOString(),
          templateId: 'unknown', // This info is lost in the temp state, could be improved
          artifacts: tempArtifacts,
        };
        setDocumentGenerations(prev => [...prev, newGeneration]);
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
    setDocumentGenerations(prev => [...prev, newGeneration]);

    // 2. Import the work items into the selected project
    handleImportWorkItems(tempArtifacts.workItems, project.id);

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
      setDocumentGenerations(prevGens =>
        prevGens.map(gen =>
          gen.id === activeGenerationId
            ? { ...gen, artifacts: processArtifacts(gen.artifacts) }
            : gen
        )
      );
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

    setEpics(prev => [...prev, newEpic]);

    // Switch to project scope and backlog view
    const project = projects.find(p => p.id === generation.projectId);
    if (project) {
      handleScopeChange({ type: ScopeType.PROJECT, id: project.id, name: project.name });
      setCurrentView(View.BACKLOG); // Ensure View.BACKLOG exists in your View enum
      alert(`Epic "${title}" created!`);
    }
  };

  const renderCurrentView = () => {
    switch (currentView) {
      case View.DASHBOARD:
        return <CustomDashboardView currentUser={currentUser} tasks={tasksForScope} projects={projectsForScope} sprints={sprintsForScope} onSelectTask={setSelectedTask} onStatClick={handleDashboardStatClick} userApiKey={userApiKey} aiProviderType={aiProviderType} />;
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
              setDocumentGenerations(prev => [...prev, newGeneration]);
              setActiveGenerationId(newGeneration.id);
              setTempArtifacts(null);
            } else {
              // Globally generated, hold artifacts in temp state
              setTempArtifacts(artifacts);
              setActiveGenerationId(null);
            }
            setCurrentView(View.WORKSPACE);
          }}
          userApiKey={userApiKey}
          onUserApiKeyChange={setUserApiKey}
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
      case View.REPORTS:
        return <ReportsView />;
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
            userApiKey={userApiKey}
            aiProviderType={aiProviderType}
            onUpdateTaskStatus={handleUpdateTaskStatus} onUpdateTask={handleUpdateTask} onSelectTask={setSelectedTask}
            // Fix: Pass `handleReorderTask` to the `onReorderTask` prop. The original code had a typo `onReorderTask`.
            onUpdateTaskSprint={handleUpdateTaskSprint} onReorderTask={handleReorderTask} onAddTask={handleAddTask} onDeleteTask={handleDeleteTask}
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
          return <TeamView view={currentView} team={teams.find(t => t.id === currentScope.id)!} members={usersForScope} tasks={tasksForScope} projects={projectsForScope} epics={epicsForScope} onUpdateTaskStatus={handleUpdateTaskStatus} onSelectTask={setSelectedTask} onAddTask={handleAddTask} onDeleteTask={handleDeleteTask} />;
        }
        return <div className="p-8">Select a scope to get started.</div>;
    }
  };

  return (
    <div className="flex h-screen bg-slate-100 dark:bg-abz-ink-950 text-text-light dark:text-text-dark font-sans">
      <Sidebar
        currentScope={currentScope}
        currentView={currentView}
        onViewChange={handleViewChange}
        collapsed={isSidebarCollapsed}
      />
      <div className="flex flex-col flex-1 overflow-hidden">
        <Header
          theme={theme}
          toggleTheme={toggleTheme}
          onStartNew={handleStartNewDoc}
          currentScope={currentScope}
          onScopeChange={handleScopeChange}
          currentUser={currentUser}
        />
        <main className="flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8">
          {renderCurrentView()}
        </main>
      </div>
      {selectedTask && (
        <TaskDetailModal
          task={selectedTask}
          allTasks={tasks}
          project={projects.find(p => p.id === selectedTask.projectId)}
          epic={epics.find(e => e.id === selectedTask.epicId)}
          users={users}
          onClose={() => setSelectedTask(null)}
          onUpdateTask={handleUpdateTask}
          onAddTask={(subtask) => setTasks(prev => [...prev, subtask])}
          onDeleteTask={handleDeleteTask}
        />
      )}
      <ProjectSelectorModal
        isOpen={isImportProjectSelectorOpen}
        onClose={() => setImportProjectSelectorOpen(false)}
        projects={projects}
        onProjectSelect={handleProjectSelectedForImport}
      />
    </div>
  );
}

export default App;
