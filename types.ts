export enum ScopeType {
    MY_WORK = 'my_work',
    TEAM = 'team',
    PROJECT = 'project',
    ORGANIZATION = 'organization',
}

export type Scope = 
    | { type: ScopeType.MY_WORK }
    | { type: ScopeType.ORGANIZATION }
    | { type: ScopeType.TEAM, id: string, name: string }
    | { type: ScopeType.PROJECT, id: string, name: string };

export enum View {
    DASHBOARD = 'dashboard',
    TEAMS = 'teams',
    BOARDS = 'boards',
    LIST = 'list',
    CALENDAR = 'calendar',
    GANTT = 'gantt',
    WORKLOAD = 'workload',
    ROADMAP = 'roadmap',
    BACKLOG = 'backlog',
    SPRINT_PLANNING = 'sprint_planning',
    REPORTS = 'reports',
    DOCS = 'docs',
    DOCS_FORGE = 'docs_forge',
    TEMPLATE_STUDIO = 'template_studio',
    AUTOMATIONS = 'automations',
    TIMESHEETS = 'timesheets',
    PORTFOLIO = 'portfolio',
    WORKSPACE = 'workspace',
}

export interface User {
    id: string;
    name: string;
    email: string;
    avatarUrl?: string;
    skills?: string[];
}

export interface Team {
    id: string;
    name: string;
    memberIds: string[];
}

export type ProjectLifecycleStage = 'Planning' | 'Analysis & Design' | 'Development' | 'Testing' | 'Deployment' | 'Maintenance';
export type ProjectHealthStatus = 'On Track' | 'At Risk' | 'Off Track';
export const ALL_HEALTH_STATUSES: ProjectHealthStatus[] = ['On Track', 'At Risk', 'Off Track'];


export interface Project {
    id: string;
    name: string;
    description: string;
    ownerId: string;
    lifecycleStage: ProjectLifecycleStage;
    healthStatus: ProjectHealthStatus;
}

export const ALL_STATUSES = ['To Do', 'In Progress', 'In Review', 'Testing', 'Ready for Release', 'Done', 'Blocked', 'On Hold'] as const;
export type TaskStatus = typeof ALL_STATUSES[number];

export const ALL_PRIORITIES = ['High', 'Medium', 'Low'] as const;
export type TaskPriority = typeof ALL_PRIORITIES[number];

export const ALL_TASK_TYPES = ['Story', 'Task', 'Bug', 'Subtask'] as const;
export type TaskType = typeof ALL_TASK_TYPES[number];

export interface Task {
    id: string;
    title: string;
    description: string;
    status: TaskStatus;
    priority: TaskPriority;
    type: TaskType;
    projectId: string;
    epicId?: string;
    sprintId?: string;
    assigneeIds: string[];
    reporterId?: string;
    storyPoints?: number;
    startDate: string; // YYYY-MM-DD
    dueDate: string; // YYYY-MM-DD
    parentId?: string;
    subtaskIds?: string[];
    dependencyIds?: string[];
    comments?: Comment[];
    userStories?: UserStory[];
    activityLog?: ActivityLogItem[];
}

export interface Epic {
    id: string;
    name: string;
    projectId: string;
    color: string;
}

export interface Sprint {
    id: string;
    name: string;
    projectId: string;
    startDate: string; // YYYY-MM-DD
    endDate: string; // YYYY-MM-DD
    status: 'Upcoming' | 'Active' | 'Completed';
    goal?: string;
    capacity?: number; // in story points
}

export interface Comment {
    id: string;
    userId: string;
    content: string;
    createdAt: string; // ISO 8601
}

export interface UserStory {
    id: string;
    asA: string;
    iWant: string;
    soThat: string;
    acceptanceCriteria: AcceptanceCriterion[];
    attachments?: Attachment[];
}

export interface AcceptanceCriterion {
    id: string;
    text: string;
    completed: boolean;
}

export interface Attachment {
    id: string;
    fileName: string;
    fileType: 'Image' | 'PDF' | 'Word' | 'Excel' | 'Other';
    fileSize: string;
    url: string;
}

export interface ActivityLogItem {
    id: string;
    userId: string;
    change: string;
    previousValue?: string;
    newValue?: string;
    createdAt: string; // ISO 8601
}

export interface Filters {
    assigneeIds?: string[];
    projectIds?: string[];
    epicIds?: string[];
    priorities?: TaskPriority[];
    types?: TaskType[];
    statuses?: TaskStatus[];
    dateRange?: 'overdue' | 'dueSoon';
}

export type AutomationTriggerType = 'task_status_changed' | 'task_created';
export type AutomationActionType = 'change_status' | 'set_assignee' | 'add_comment';
export type AutomationConditionField = 'priority' | 'type';
export type AutomationConditionOperator = 'is' | 'is_not';

export interface Automation {
    id: string;
    name: string;
    description: string;
    projectId: string;
    isEnabled: boolean;
    trigger: {
        type: AutomationTriggerType;
        config: any;
    };
    conditions: {
        field: AutomationConditionField;
        operator: AutomationConditionOperator;
        value: any;
    }[];
    actions: {
        id: string;
        type: AutomationActionType;
        config: any;
    }[];
}

export interface TimesheetEntry {
    id: string;
    userId: string;
    taskId: string;
    date: string; // YYYY-MM-DD
    hours: number;
}

// ===================================
// DOCS FORGE TYPES
// ===================================

export interface ProjectDetails {
    company: string;
    project: string;
    domain: string;
    templateId: string;
}

export type DocumentArtifactKeys = 'brd' | 'frd' | 'pdd';

export interface DocTemplate {
    id: string;
    title: string;
    description: string;
    artifactKey: DocumentArtifactKeys;
    sections: TemplateSection[];
}

export interface TemplateSection {
    key: string;
    title: string;
    description: string;
    required?: boolean;
    promptInjection?: string;
}

export interface IndustryProfile {
    id: string;
    name: string;
    description: string;
    nfr_overrides: string[];
    risk_taxonomy: string[];
    policy_checks: string[];
}

export type ApprovalStatus = 'Pending' | 'Approved' | 'Rejected';

export interface Approver {
    userId: string;
    role: 'Accountable' | 'Responsible' | 'Consulted' | 'Informed';
    status: ApprovalStatus;
    approvedAt: string | null;
    comments?: string;
}

// Types for the generated artifacts from Gemini
export interface DocumentSection {
    key: string;
    title: string;
    content: string;
    citations?: string[];
}

interface DocumentArtifact {
    title: string;
    sections: DocumentSection[];
}

interface QualityGateArtifact {
    title: string;
    ambiguityPoints: string[];
    gapPoints: string[];
}

interface DiagramArtifact {
    title: string;
    mermaidCode: string;
}

interface DiagramsArtifact {
    asIs: DiagramArtifact;
    toBe: DiagramArtifact;
}

export interface WorkItem {
    type: 'Epic' | 'Story' | 'Task';
    title: string;
    description: string;
    acceptanceCriteria: string[];
}

export interface GeneratedArtifacts {
    brd: DocumentArtifact;
    frd: DocumentArtifact;
    pdd: DocumentArtifact;
    qualityGate: QualityGateArtifact;
    diagrams: DiagramsArtifact;
    workItems: WorkItem[];
    approvals: Approver[];
}

export interface DocumentGeneration {
    id: string;
    projectId: string;
    generatedAt: string; // ISO timestamp
    templateId: string;
    artifacts: GeneratedArtifacts;
}


// ===================================
// AI SPRINT PLANNER TYPES
// ===================================

export interface AiTaskAssignment {
    taskId: string;
    assigneeId: string;
    reason: string;
}

export interface AiSprintPlan {
    rationale: string;
    sprintTaskIds: string[];
    taskAssignments: AiTaskAssignment[];
}


// ===================================
// DASHBOARD TYPES
// ===================================

export enum WidgetType {
    WELCOME = 'welcome',
    STATS = 'stats',
    MY_TASKS = 'my_tasks',
    PROJECT_HEALTH = 'project_health',
    BURNDOWN_CHART = 'burndown_chart',
    TASKS_BY_STATUS = 'tasks_by_status',
    AI_INSIGHTS = 'ai_insights',
}

export interface WidgetDefinition {
    id: WidgetType;
    title: string;
    description: string;
    gridArea: string; // For CSS Grid Area
}

export type WidgetConfig = Record<string, any>;
export type WidgetConfigs = Partial<Record<WidgetType, WidgetConfig>>;


// ===================================
// AI INSIGHTS WIDGET TYPES
// ===================================
export interface AiInsight {
    type: 'risk' | 'priority' | 'summary' | 'bottleneck';
    title: string;
    content: string;
}


// ===================================
// AI PROVIDER TYPES
// ===================================

export type AiProviderType = 'gemini' | 'openai';

export interface IAiProvider {
    generateProjectArtifacts(
        projectDetails: ProjectDetails,
        fileContent: string | null,
        fileName: string
    ): Promise<GeneratedArtifacts>;

    refineSectionContent(
        originalContent: string,
        refinementPrompt: string
    ): Promise<string>;

    generateSprintPlan(
        backlogTasks: Task[],
        teamMembers: User[],
        sprintDurationDays: number,
        sprintCapacity: number
    ): Promise<AiSprintPlan>;

    generateDashboardInsights(
        currentUser: User,
        tasks: Task[],
        projects: Project[]
    ): Promise<AiInsight[]>;
}
