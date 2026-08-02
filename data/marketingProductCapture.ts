import type { AssessProcess, HandoffLedgerEntry, Project, Task } from '../types';

const timestamp = '2026-07-30T12:00:00.000Z';

const process = (
  id: string,
  name: string,
  department: string,
  criticality: AssessProcess['criticality'],
  status: AssessProcess['status'],
): AssessProcess => ({
  id,
  orgId: 'synthetic-capture-organization',
  workspaceId: 'synthetic-capture-workspace',
  name,
  description: `Synthetic ${department.toLowerCase()} process used only for read-only marketing capture.`,
  ownerId: 'synthetic-owner',
  department,
  criticality,
  status,
  createdAt: timestamp,
  updatedAt: timestamp,
});

export const MARKETING_CAPTURE_PROCESSES: AssessProcess[] = [
  process('proc-ap-invoice-exception', 'AP Invoice Exception Handling', 'Finance Operations', 'Critical', 'Ready for Review'),
  process('capture-process-02', 'Purchase Requisition Review', 'Procurement', 'High', 'In Review'),
  process('capture-process-03', 'Vendor Master Change Validation', 'Finance Controls', 'Critical', 'Changes Requested'),
  process('capture-process-04', 'Customer Credit Review', 'Commercial Operations', 'High', 'Approved'),
  process('capture-process-05', 'Travel Expense Verification', 'Finance Operations', 'Medium', 'Completed'),
  process('capture-process-06', 'Inventory Reconciliation', 'Supply Chain', 'High', 'Approved'),
  process('capture-process-07', 'Contract Obligation Intake', 'Legal Operations', 'High', 'Draft'),
  process('capture-process-08', 'Service Ticket Classification', 'Service Operations', 'Medium', 'Handed Off to Delivery'),
  process('capture-process-09', 'Employee Access Recertification', 'Technology Risk', 'Critical', 'Completed'),
  process('capture-process-10', 'Order Hold Resolution', 'Sales Operations', 'Medium', 'Not Started'),
];

export const MARKETING_CAPTURE_HANDOFFS: HandoffLedgerEntry[] = [
  {
    id: 'capture-handoff-01',
    orgId: 'synthetic-capture-organization',
    fromModule: 'assess',
    toModule: 'docs',
    status: 'Accepted',
    sourceType: 'Decision Pack',
    sourceId: 'proc-ap-invoice-exception',
    targetType: 'Document Generation',
    targetId: 'capture-artifact-01',
    title: 'AP exception controls ready for approval',
    summary: 'Synthetic approval-ready handoff with bounded human approval conditions.',
    createdAt: timestamp,
    createdBy: 'synthetic-reviewer',
    evidenceRefs: ['evidence-01', 'evidence-02', 'evidence-03', 'evidence-04'],
    metadata: { governState: 'Approval ready', controlGap: false, synthetic: true },
  },
  {
    id: 'capture-handoff-02',
    orgId: 'synthetic-capture-organization',
    fromModule: 'assess',
    toModule: 'docs',
    status: 'Submitted',
    sourceType: 'Decision Pack',
    sourceId: 'capture-process-03',
    title: 'Vendor change evidence requires correction',
    summary: 'Synthetic review requires independent ownership evidence before approval.',
    createdAt: timestamp,
    createdBy: 'synthetic-reviewer',
    evidenceRefs: ['evidence-05', 'evidence-06'],
    metadata: { governState: 'Changes requested', controlGap: true, synthetic: true },
  },
  {
    id: 'capture-handoff-03',
    orgId: 'synthetic-capture-organization',
    fromModule: 'docs',
    toModule: 'delivery',
    status: 'Completed',
    sourceType: 'Document Generation',
    sourceId: 'capture-artifact-03',
    targetType: 'Project',
    targetId: 'capture-delivery-03',
    title: 'Expense verification delivery context accepted',
    summary: 'Synthetic governed handoff accepted with source lineage.',
    createdAt: timestamp,
    createdBy: 'synthetic-owner',
    evidenceRefs: ['evidence-03', 'evidence-07'],
    metadata: { governState: 'Accepted', controlGap: false, synthetic: true },
  },
];

export const MARKETING_CAPTURE_PROJECTS: Project[] = [
  { id: 'capture-project-01', name: 'AP Exception Control Readiness', description: 'Synthetic governed initiative.', ownerId: 'user-7', lifecycleStage: 'Testing', healthStatus: 'On Track' },
  { id: 'capture-project-02', name: 'Vendor Master Control Renewal', description: 'Synthetic governed initiative.', ownerId: 'user-5', lifecycleStage: 'Analysis & Design', healthStatus: 'At Risk' },
  { id: 'capture-project-03', name: 'Expense Verification Handoff', description: 'Synthetic governed initiative.', ownerId: 'user-2', lifecycleStage: 'Deployment', healthStatus: 'On Track' },
  { id: 'capture-project-04', name: 'Service Intake Evidence Closure', description: 'Synthetic governed initiative.', ownerId: 'user-3', lifecycleStage: 'Planning', healthStatus: 'Off Track' },
];

const task = (
  id: string,
  title: string,
  projectId: string,
  status: Task['status'],
  priority: Task['priority'],
): Task => ({
  id,
  title,
  description: 'Synthetic read-only capture record.',
  status,
  priority,
  type: 'Task',
  projectId,
  assigneeIds: [],
  startDate: '2026-07-20',
  dueDate: '2026-08-20',
});

export const MARKETING_CAPTURE_TASKS: Task[] = [
  task('capture-task-01', 'Validate approval evidence', 'capture-project-01', 'In Review', 'High'),
  task('capture-task-02', 'Confirm exception controls', 'capture-project-01', 'Testing', 'Medium'),
  task('capture-task-03', 'Resolve ownership evidence gap', 'capture-project-02', 'Blocked', 'High'),
  task('capture-task-04', 'Review vendor change conditions', 'capture-project-02', 'In Progress', 'High'),
  task('capture-task-05', 'Accept governed delivery pack', 'capture-project-03', 'Done', 'Medium'),
  task('capture-task-06', 'Record fixture outcome baseline', 'capture-project-03', 'Done', 'Low'),
  task('capture-task-07', 'Link source handoff evidence', 'capture-project-04', 'To Do', 'High'),
  task('capture-task-08', 'Assign accountable reviewer', 'capture-project-04', 'On Hold', 'Medium'),
];

export const MARKETING_CAPTURE_MONITOR_SIGNAL = {
  label: 'Synthetic outcome signal',
  detail: 'Control-validation cycle time is 18% below the synthetic fixture baseline.',
  status: 'Recorded',
  lineageGapCount: 1,
} as const;
