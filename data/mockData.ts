import { User, Team, Project, Task, Epic, Sprint, Automation, TimesheetEntry, DocumentGeneration } from '../types';
import { FITTRACK_GENERATED_DATA, INVOICE_PROCESSING_ARTIFACTS } from '../constants';
import { MOCK_DOC_TEMPLATES } from './docTemplates';


export const MOCK_USERS: User[] = [
    { id: 'user-1', name: 'Sarah Chen', email: 'sarah@example.com', skills: ['Management', 'Communication', 'Strategy'] },
    { id: 'user-2', name: 'Ben Carter', email: 'ben@example.com', skills: ['Frontend', 'Backend', 'Mobile', 'React'] },
    { id: 'user-3', name: 'Chloe Davis', email: 'chloe@example.com', skills: ['Design', 'UI/UX', 'Figma', 'Frontend'] },
    { id: 'user-4', name: 'David Rodriguez', email: 'david@example.com', skills: ['AI/ML', 'Python', 'Data Science', 'TensorFlow'] },
    { id: 'user-5', name: 'Emily White', email: 'emily@example.com', skills: ['QA', 'Testing', 'Automation Testing'] },
    { id: 'user-6', name: 'Frank Miller', email: 'frank@example.com', skills: ['RPA', 'UiPath', 'Backend', 'Python'] },
    { id: 'user-7', name: 'Grace Lee', email: 'grace@example.com', skills: ['Marketing', 'Content', 'SEO'] },
    { id: 'user-8', name: 'Henry Wilson', email: 'henry@example.com', skills: ['Data Engineering', 'SQL', 'Python', 'Cloud'] },
];

export const MOCK_TEAMS: Team[] = [
    { id: 'team-1', name: 'AppDev Team', memberIds: ['user-2', 'user-3', 'user-5'] },
    { id: 'team-2', name: 'AI & Data Team', memberIds: ['user-4', 'user-8'] },
    { id: 'team-3', name: 'Automation Squad', memberIds: ['user-6', 'user-1'] },
    { id: 'team-4', name: 'Marketing Crew', memberIds: ['user-7', 'user-1'] },
];

export const MOCK_PROJECTS: Project[] = [
    { id: 'proj-1', name: 'Invoice Processing Automation', description: 'RPA bot to automate invoice processing from email to ERP.', ownerId: 'user-6', lifecycleStage: 'Development', healthStatus: 'On Track' },
    { id: 'proj-2', name: 'AI Customer Support Agent', description: 'Autonomous AI agent for Tier 1 customer support queries.', ownerId: 'user-4', lifecycleStage: 'Testing', healthStatus: 'At Risk' },
    { id: 'proj-3', name: 'FitTrack Mobile App', description: 'Cross-platform mobile app for tracking workouts and nutrition.', ownerId: 'user-2', lifecycleStage: 'Development', healthStatus: 'On Track' },
    { id: 'proj-4', name: 'Market Risk Analysis Platform', description: 'Web platform for real-time market risk analysis and reporting.', ownerId: 'user-8', lifecycleStage: 'Maintenance', healthStatus: 'Off Track' },
    { id: 'proj-5', name: 'Q4 Product Launch Campaign', description: 'Multi-channel marketing campaign for a new flagship product.', ownerId: 'user-7', lifecycleStage: 'Planning', healthStatus: 'On Track' },
];

export const MOCK_EPICS: Epic[] = [
    // Project 1: Invoice Processing Automation
    { id: 'epic-101', name: 'Email Ingestion & OCR', projectId: 'proj-1', color: '#EF4444' },
    { id: 'epic-102', name: 'Data Validation & Business Rules', projectId: 'proj-1', color: '#F59E0B' },
    { id: 'epic-103', name: 'ERP Integration & Reporting', projectId: 'proj-1', color: '#10B981' },
    // Project 2: AI Customer Support Agent
    { id: 'epic-201', name: 'Knowledge Base Ingestion', projectId: 'proj-2', color: '#3B82F6' },
    { id: 'epic-202', name: 'Conversation Flow & Logic', projectId: 'proj-2', color: '#8B5CF6' },
    { id: 'epic-203', name: 'Human Handover Protocol', projectId: 'proj-2', color: '#EC4899' },
    // Project 3: FitTrack Mobile App
    { id: 'epic-301', name: 'User Authentication & Profile', projectId: 'proj-3', color: '#4F46E5' },
    { id: 'epic-302', name: 'Workout Logging', projectId: 'proj-3', color: '#14B8A6' },
    { id: 'epic-303', name: 'Nutrition Tracking', projectId: 'proj-3', color: '#F59E0B' },
    // Project 4: Market Risk Analysis Platform
    { id: 'epic-401', name: 'Data Ingestion (Market Feeds)', projectId: 'proj-4', color: '#0EA5A3' },
    { id: 'epic-402', name: 'Risk Calculation Engine', projectId: 'proj-4', color: '#EF4444' },
    { id: 'epic-403', name: 'Dashboard & Visualization', projectId: 'proj-4', color: '#4338CA' },
    // Project 5: Q4 Product Launch Campaign
    { id: 'epic-501', name: 'Creative & Content Production', projectId: 'proj-5', color: '#EC4899' },
    { id: 'epic-502', name: 'Paid Media & SEO', projectId: 'proj-5', color: '#10B981' },
    { id: 'epic-503', name: 'Social Media Outreach', projectId: 'proj-5', color: '#3B82F6' },
];

export const MOCK_SPRINTS: Sprint[] = [
    {
        id: 'sprint-1',
        name: 'FitTrack Alpha Release',
        projectId: 'proj-3',
        startDate: '2025-10-09',
        endDate: '2025-10-22',
        status: 'Completed',
        goal: 'Core user auth and workout logging functionality.',
        capacity: 20
    },
    {
        id: 'sprint-2',
        name: 'FitTrack Beta Features',
        projectId: 'proj-3',
        startDate: '2025-10-23',
        endDate: '2025-11-12',
        status: 'Active',
        goal: 'Implement nutrition tracking and basic dashboard.',
        capacity: 25,
    },
     {
        id: 'sprint-3',
        name: 'FitTrack Public Launch Prep',
        projectId: 'proj-3',
        startDate: '2025-11-13',
        endDate: '2025-11-26',
        status: 'Upcoming',
        goal: 'Bug fixing, performance optimization, and App Store submission prep.',
        capacity: 22,
    },
];


export const MOCK_TASKS: Task[] = [
    // Proj 1: RPA
    { id: 'task-101', title: 'Story: Automated invoice processing', description: 'As an AP clerk, I want invoices with a PO to be processed automatically so that I can focus on exceptions.', status: 'To Do', priority: 'High', type: 'Story', projectId: 'proj-1', epicId: 'epic-101', assigneeIds: ['user-6'], startDate: '2025-11-10', dueDate: '2025-11-29', storyPoints: 13 },
    { id: 'task-102', title: 'Set up dedicated mailbox for invoices', description: 'Configure O365 mailbox and grant read permissions to the service account.', status: 'Done', priority: 'High', type: 'Task', projectId: 'proj-1', epicId: 'epic-101', assigneeIds: ['user-1'], startDate: '2025-10-01', dueDate: '2025-10-03', storyPoints: 2 },
    { id: 'task-103', title: 'Develop OCR model for invoice data extraction', description: 'Use UiPath AI Fabric to train a model on 50 sample invoices.', status: 'In Progress', priority: 'High', type: 'Task', projectId: 'proj-1', epicId: 'epic-101', assigneeIds: ['user-6'], startDate: '2025-10-28', dueDate: '2025-11-11', storyPoints: 8, dependencyIds: ['task-102'] },
    { id: 'task-104', title: 'Create validation rules for PO numbers', description: 'Business rule: PO number must exist in SAP and match the vendor.', status: 'In Review', priority: 'Medium', type: 'Task', projectId: 'proj-1', epicId: 'epic-102', assigneeIds: ['user-6'], startDate: '2025-11-01', dueDate: '2025-11-08', storyPoints: 5 },
    { id: 'task-105', title: 'Bug: OCR fails on handwritten invoices', description: 'The current model has a low confidence score for handwritten notes on invoices, causing exceptions.', status: 'To Do', priority: 'Medium', type: 'Bug', projectId: 'proj-1', epicId: 'epic-101', assigneeIds: ['user-6'], reporterId: 'user-1', startDate: '2025-11-04', dueDate: '2025-11-12', storyPoints: 3 },
    { id: 'task-106', title: 'Build API connector for SAP', description: 'Develop and test the RFC/BAPI calls for entering invoice data into SAP.', status: 'To Do', priority: 'High', type: 'Task', projectId: 'proj-1', epicId: 'epic-103', assigneeIds: ['user-6'], startDate: '2025-11-13', dueDate: '2025-11-27', storyPoints: 8 },
    
    // Proj 2: AI Agent
    { id: 'task-201', title: 'Story: Instant answers 24/7', description: 'As a customer, I want to get instant answers to simple questions 24/7 so I don\'t have to wait for an agent.', status: 'To Do', priority: 'High', type: 'Story', projectId: 'proj-2', epicId: 'epic-202', assigneeIds: ['user-4'], startDate: '2025-11-08', dueDate: '2025-11-28', storyPoints: 13 },
    { id: 'task-202', title: 'Integrate with Zendesk knowledge base', description: 'Set up API access to pull articles from Zendesk for the RAG model.', status: 'Done', priority: 'Medium', type: 'Task', projectId: 'proj-2', epicId: 'epic-201', assigneeIds: ['user-4'], startDate: '2025-10-05', dueDate: '2025-10-12', storyPoints: 5 },
    { id: 'task-203', title: 'Research and select a Large Language Model (LLM) API', description: 'Evaluate Gemini, OpenAI, and Anthropic for cost, performance, and features.', status: 'Done', priority: 'High', type: 'Task', projectId: 'proj-2', assigneeIds: ['user-4'], startDate: '2025-10-02', dueDate: '2025-10-06', storyPoints: 3 },
    { id: 'task-204', title: 'Design conversation tree for password resets', description: 'Map out the step-by-step logic for guiding a user through a password reset.', status: 'In Progress', priority: 'High', type: 'Task', projectId: 'proj-2', epicId: 'epic-202', assigneeIds: ['user-4', 'user-1'], startDate: '2025-10-20', dueDate: '2025-11-04', storyPoints: 5, dependencyIds: ['task-203'] },
    { id: 'task-205', title: 'Implement sentiment analysis for escalation triggers', description: 'Use a pre-trained model to detect user frustration and trigger human handover.', status: 'Blocked', priority: 'Medium', type: 'Task', projectId: 'proj-2', epicId: 'epic-203', assigneeIds: ['user-4'], startDate: '2025-11-05', dueDate: '2025-11-15', storyPoints: 8 },

    // Proj 3: FitTrack
    { id: 'task-301', title: 'Story: Log daily meals', description: 'As a user, I want to log my daily meals to track my calorie intake.', status: 'In Progress', priority: 'High', type: 'Story', projectId: 'proj-3', epicId: 'epic-303', sprintId: 'sprint-2', assigneeIds: ['user-2'], startDate: '2025-10-31', dueDate: '2025-11-11', storyPoints: 8 },
    { id: 'task-302', title: 'Design UI/UX in Figma for workout tracker', description: 'Create high-fidelity mockups and a clickable prototype for the workout logging flow.', status: 'Done', priority: 'High', type: 'Task', projectId: 'proj-3', epicId: 'epic-302', sprintId: 'sprint-1', assigneeIds: ['user-3'], startDate: '2025-10-10', dueDate: '2025-10-17', storyPoints: 5 },
    { id: 'task-303', title: 'Develop user registration with Firebase Auth', description: 'Implement email/password and Google Sign-In.', status: 'Done', priority: 'High', type: 'Task', projectId: 'proj-3', epicId: 'epic-301', sprintId: 'sprint-1', assigneeIds: ['user-2'], startDate: '2025-10-18', dueDate: '2025-10-22', storyPoints: 5, subtaskIds: ['task-303-sub1', 'task-303-sub2'] },
    { id: 'task-303-sub1', title: 'Set up Firebase project', description: '', status: 'Done', priority: 'High', type: 'Subtask', projectId: 'proj-3', assigneeIds: ['user-2'], startDate: '2025-10-18', dueDate: '2025-10-18', parentId: 'task-303' },
    { id: 'task-303-sub2', title: 'Implement UI for login screen', description: '', status: 'Done', priority: 'High', type: 'Subtask', projectId: 'proj-3', assigneeIds: ['user-3'], startDate: '2025-10-19', dueDate: '2025-10-20', parentId: 'task-303' },
    { id: 'task-304', title: 'Build API endpoint for food database integration', description: 'Integrate with Nutritionix API for food lookup.', status: 'In Progress', priority: 'Medium', type: 'Task', projectId: 'proj-3', epicId: 'epic-303', sprintId: 'sprint-2', assigneeIds: ['user-2'], startDate: '2025-10-30', dueDate: '2025-11-06', storyPoints: 8 },
    { id: 'task-305', title: 'Implement push notifications for workout reminders', description: 'Use Firebase Cloud Messaging to send scheduled notifications.', status: 'To Do', priority: 'Medium', type: 'Task', projectId: 'proj-3', epicId: 'epic-302', sprintId: 'sprint-3', assigneeIds: ['user-2'], startDate: '2025-11-14', dueDate: '2025-11-21', storyPoints: 5 },
    { id: 'task-306', title: 'Bug: Calorie count is incorrect for certain foods', description: 'The app is miscalculating the total calories when logging items with complex units.', status: 'Testing', priority: 'High', type: 'Bug', projectId: 'proj-3', epicId: 'epic-303', sprintId: 'sprint-2', assigneeIds: ['user-5'], reporterId: 'user-2', startDate: '2025-11-01', dueDate: '2025-11-07', storyPoints: 3, dependencyIds: ['task-304'] },

    // Proj 4: Risk Platform
    { id: 'task-401', title: 'Story: Real-time portfolio risk', description: 'As a risk analyst, I want to see the Value at Risk for our portfolio in real-time to make informed decisions.', status: 'In Progress', priority: 'High', type: 'Story', projectId: 'proj-4', epicId: 'epic-402', assigneeIds: ['user-8'], startDate: '2025-10-15', dueDate: '2025-12-05', storyPoints: 21 },
    { id: 'task-402', title: 'Integrate with Bloomberg real-time data feed', description: 'Set up a persistent connection to the Bloomberg market data API.', status: 'In Progress', priority: 'High', type: 'Task', projectId: 'proj-4', epicId: 'epic-401', assigneeIds: ['user-4', 'user-8'], startDate: '2025-10-15', dueDate: '2025-11-01', storyPoints: 8 },
    { id: 'task-403', title: 'Implement Monte Carlo simulation for VaR calculation', description: 'Develop the core risk calculation engine using Python and NumPy.', status: 'To Do', priority: 'High', type: 'Task', projectId: 'proj-4', epicId: 'epic-402', assigneeIds: ['user-4'], startDate: '2025-11-02', dueDate: '2025-11-26', storyPoints: 13, dependencyIds: ['task-402'] },
    { id: 'task-404', title: 'Design interactive dashboard with D3.js', description: 'Mock up and build the main dashboard UI for displaying risk metrics.', status: 'To Do', priority: 'Medium', type: 'Task', projectId: 'proj-4', epicId: 'epic-403', assigneeIds: ['user-2', 'user-3'], startDate: '2025-11-10', dueDate: '2025-12-04', storyPoints: 8 },

    // Proj 5: Marketing Campaign
    { id: 'task-501', title: 'Story: Track multi-channel campaign performance', description: 'As a marketing manager, I want to track campaign performance across all channels in one place to measure ROI.', status: 'To Do', priority: 'High', type: 'Story', projectId: 'proj-5', epicId: 'epic-502', assigneeIds: ['user-7'], startDate: '2025-11-01', dueDate: '2025-11-22', storyPoints: 8 },
    { id: 'task-502', title: 'Develop key messaging and brand guidelines', description: 'Finalize the campaign slogan, value proposition, and visual identity.', status: 'Done', priority: 'High', type: 'Task', projectId: 'proj-5', epicId: 'epic-501', assigneeIds: ['user-7', 'user-1'], startDate: '2025-10-02', dueDate: '2025-10-09', storyPoints: 5 },
    { id: 'task-503', title: 'Produce launch video for YouTube', description: 'Includes scripting, filming, and post-production.', status: 'In Review', priority: 'High', type: 'Task', projectId: 'proj-5', epicId: 'epic-501', assigneeIds: ['user-7'], startDate: '2025-10-10', dueDate: '2025-10-27', storyPoints: 8, dependencyIds: ['task-502'] },
    { id: 'task-504', title: 'Set up Google Ads and social media ad campaigns', description: 'Create ad groups, write copy, and define targeting for Google, Meta, and LinkedIn.', status: 'On Hold', priority: 'Medium', type: 'Task', projectId: 'proj-5', epicId: 'epic-502', assigneeIds: ['user-7'], startDate: '2025-10-28', dueDate: '2025-11-08', storyPoints: 5 },
    { id: 'task-505', title: 'Identify and contact key industry influencers', description: 'Compile a list of 20 relevant influencers and begin outreach.', status: 'In Progress', priority: 'Medium', type: 'Task', projectId: 'proj-5', epicId: 'epic-503', assigneeIds: ['user-1'], startDate: '2025-10-16', dueDate: '2025-10-30', storyPoints: 3 },
];

export const MOCK_AUTOMATIONS: Automation[] = [
    {
        id: 'auto-1',
        name: 'Auto-assign critical bugs',
        description: 'When a high-priority bug is created, assign it to the lead designer.',
        projectId: 'proj-3',
        isEnabled: true,
        trigger: { type: 'task_created', config: {} },
        conditions: [
            { field: 'priority', operator: 'is', value: 'High' },
            { field: 'type', operator: 'is', value: 'Bug' }
        ],
        actions: [
            { id: 'action-1', type: 'set_assignee', config: { assigneeIds: ['user-3'] } }
        ]
    },
    {
        id: 'auto-2',
        name: 'Move to In Review when PR is opened',
        description: 'This would be triggered by a webhook from GitHub/GitLab. Simulating for now.',
        projectId: 'proj-3',
        isEnabled: true,
        trigger: { type: 'task_status_changed', config: { toStatus: 'In Progress' } },
        conditions: [],
        actions: [
            { id: 'action-2', type: 'change_status', config: { status: 'In Review' } }
        ]
    },
    {
        id: 'auto-3',
        name: 'Add QA checklist when moved to Testing',
        description: 'When a task moves to the Testing status, add a standard QA checklist as a comment.',
        projectId: 'proj-3',
        isEnabled: true,
        trigger: { type: 'task_status_changed', config: { toStatus: 'Testing' } },
        conditions: [],
        actions: [
            { id: 'action-3', type: 'add_comment', config: { comment: 'QA Checklist for "{{task.title}}":\n- [ ] Test on Chrome\n- [ ] Test on Firefox\n- [ ] Test on mobile (iOS & Android)' } }
        ]
    },
    {
        id: 'auto-4',
        name: 'Notify reporter on task completion',
        description: 'When a task is moved to Done, add a comment mentioning the reporter to keep them informed.',
        projectId: 'proj-3',
        isEnabled: true,
        trigger: { type: 'task_status_changed', config: { toStatus: 'Done' } },
        conditions: [],
        actions: [
            { id: 'action-4', type: 'add_comment', config: { comment: 'Task "{{task.title}}" has been completed. Thanks for reporting! cc: @{{task.reporter.name}}' } }
        ]
    },
    {
        id: 'auto-5',
        name: 'Triage low priority tasks',
        description: 'When a new low-priority task is created, assign it to Emily White for initial assessment.',
        projectId: 'proj-3',
        isEnabled: true,
        trigger: { type: 'task_created', config: {} },
        conditions: [
            { field: 'priority', operator: 'is', value: 'Low' }
        ],
        actions: [
            { id: 'action-5', type: 'set_assignee', config: { assigneeIds: ['user-5'] } }
        ]
    },
    {
        id: 'auto-6',
        name: 'Request PM review for new features',
        description: 'When a story or task (but not a bug) is moved to "In Review", assign it to Sarah Chen and notify her.',
        projectId: 'proj-3',
        isEnabled: false,
        trigger: { type: 'task_status_changed', config: { toStatus: 'In Review' } },
        conditions: [
            { field: 'type', operator: 'is_not', value: 'Bug' }
        ],
        actions: [
            { id: 'action-6a', type: 'set_assignee', config: { assigneeIds: ['user-1'] } },
            { id: 'action-6b', type: 'add_comment', config: { comment: '@Sarah Chen, "{{task.title}}" is ready for your review.' } }
        ]
    }
];

export const MOCK_TIMESHEET_ENTRIES: TimesheetEntry[] = [
    // Ben on FitTrack App
    { id: 'ts-1', userId: 'user-2', taskId: 'task-304', date: '2025-10-30', hours: 8 },
    { id: 'ts-2', userId: 'user-2', taskId: 'task-304', date: '2025-10-31', hours: 6.5 },
    // Emily on FitTrack App
    { id: 'ts-3', userId: 'user-5', taskId: 'task-306', date: '2025-11-01', hours: 4 },
    // Frank on RPA project
    { id: 'ts-4', userId: 'user-6', taskId: 'task-103', date: '2025-10-28', hours: 8 },
    { id: 'ts-5', userId: 'user-6', taskId: 'task-103', date: '2025-10-29', hours: 8 },
    { id: 'ts-6', userId: 'user-6', taskId: 'task-103', date: '2025-10-30', hours: 2 },
    // Sarah on Marketing Campaign
    { id: 'ts-7', userId: 'user-1', taskId: 'task-505', date: '2025-10-16', hours: 3 },
];

export const MOCK_DOCUMENT_GENERATIONS: DocumentGeneration[] = [
    {
        id: 'docgen-1',
        projectId: 'proj-1',
        generatedAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(), // 2 days ago
        templateId: MOCK_DOC_TEMPLATES.find(t => t.artifactKey === 'pdd')?.id || 'pdd.v1',
        artifacts: INVOICE_PROCESSING_ARTIFACTS
    },
    {
        id: 'docgen-2',
        projectId: 'proj-3',
        generatedAt: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString(), // 5 days ago
        templateId: MOCK_DOC_TEMPLATES.find(t => t.artifactKey === 'brd')?.id || 'brd.v1',
        artifacts: FITTRACK_GENERATED_DATA
    },
    {
        id: 'docgen-3',
        projectId: 'proj-3',
        generatedAt: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString(), // 10 days ago
        templateId: MOCK_DOC_TEMPLATES.find(t => t.artifactKey === 'frd')?.id || 'frd.v1',
        artifacts: {
            ...FITTRACK_GENERATED_DATA,
            frd: {
                title: 'FRD: Initial Scoping',
                sections: FITTRACK_GENERATED_DATA.frd.sections,
            }
        }
    },
];
