import { DEFAULT_ENABLED_MODULES } from '../constants/moduleConfig';
import { Organization, ProductModuleKey, Scope, ScopeType, User } from '../types';

export type ProductAction =
  | 'process.create'
  | 'process.edit'
  | 'assessment.edit'
  | 'assessment.approve'
  | 'docs.generate'
  | 'docs.refine'
  | 'docs.export'
  | 'artifact.download'
  | 'project.task.create'
  | 'project.task.update'
  | 'project.task.delete'
  | 'project.task.reorder'
  | 'workflow.status.change'
  | 'approval.execute'
  | 'automation.create'
  | 'automation.update'
  | 'automation.toggle'
  | 'automation.delete'
  | 'timesheet.update'
  | 'delivery.import'
  | 'delivery.pack.review';

export type ProductActionStatus = 'allowed' | 'blocked';
export type ProductActionRisk = 'low' | 'medium' | 'high' | 'critical';
export type ProductActionReason =
  | 'allowed'
  | 'auth_loading'
  | 'unauthenticated'
  | 'no_organization'
  | 'unknown_action'
  | 'disabled_module'
  | 'invalid_scope'
  | 'missing_permission'
  | 'missing_project_context'
  | 'missing_process_context'
  | 'missing_document_context'
  | 'missing_target_user_context';

export interface ProductActionContext {
  user: User | null | undefined;
  authLoading?: boolean;
  organization: Organization | null | undefined;
  enabledModules?: ProductModuleKey[];
  scope: Scope;
  action: ProductAction | string;
  processId?: string | null;
  projectId?: string | null;
  documentGenerationId?: string | null;
  hasDocumentContext?: boolean;
  targetUserId?: string | null;
}

export interface ProductActionDecision {
  action: string;
  allowed: boolean;
  status: ProductActionStatus;
  reason: ProductActionReason;
  risk: ProductActionRisk;
  module?: ProductModuleKey;
  category: 'assess' | 'docs' | 'delivery' | 'workflow' | 'approval' | 'automation' | 'artifact';
  requiredPermissions: string[];
  allowedScopes: ScopeType[];
  message: string;
}

interface ProductActionMetadata {
  module?: ProductModuleKey;
  category: ProductActionDecision['category'];
  risk: ProductActionRisk;
  requiredPermissions: string[];
  allowedScopes: ScopeType[];
  adminAllowed?: boolean;
  requiresProject?: boolean;
  requiresProcess?: boolean;
  requiresDocument?: boolean;
  requiresTargetUser?: boolean;
}

const ACTION_POLICY: Record<ProductAction, ProductActionMetadata> = {
  'process.create': {
    module: 'assess',
    category: 'assess',
    risk: 'high',
    requiredPermissions: ['process.create'],
    allowedScopes: [ScopeType.MY_WORK, ScopeType.TEAM, ScopeType.ORGANIZATION],
    adminAllowed: true,
  },
  'process.edit': {
    module: 'assess',
    category: 'assess',
    risk: 'high',
    requiredPermissions: ['process.edit'],
    allowedScopes: [ScopeType.MY_WORK, ScopeType.TEAM, ScopeType.ORGANIZATION],
    adminAllowed: true,
    requiresProcess: true,
  },
  'assessment.edit': {
    module: 'assess',
    category: 'assess',
    risk: 'high',
    requiredPermissions: ['assessment.edit', 'assessment.create'],
    allowedScopes: [ScopeType.MY_WORK, ScopeType.TEAM, ScopeType.PROJECT, ScopeType.ORGANIZATION],
    adminAllowed: true,
    requiresProcess: true,
  },
  'assessment.approve': {
    module: 'assess',
    category: 'approval',
    risk: 'critical',
    requiredPermissions: ['process.approve'],
    allowedScopes: [ScopeType.MY_WORK, ScopeType.TEAM, ScopeType.PROJECT, ScopeType.ORGANIZATION],
    adminAllowed: true,
    requiresProcess: true,
  },
  'docs.generate': {
    module: 'docs',
    category: 'docs',
    risk: 'high',
    requiredPermissions: ['docs.generate'],
    allowedScopes: [ScopeType.MY_WORK, ScopeType.TEAM, ScopeType.PROJECT],
    adminAllowed: true,
  },
  'docs.refine': {
    module: 'docs',
    category: 'docs',
    risk: 'high',
    requiredPermissions: ['docs.generate'],
    allowedScopes: [ScopeType.MY_WORK, ScopeType.TEAM, ScopeType.PROJECT],
    adminAllowed: true,
    requiresDocument: true,
  },
  'docs.export': {
    module: 'docs',
    category: 'artifact',
    risk: 'critical',
    requiredPermissions: ['docs.export'],
    allowedScopes: [ScopeType.MY_WORK, ScopeType.TEAM, ScopeType.PROJECT],
    adminAllowed: false,
    requiresDocument: true,
  },
  'artifact.download': {
    module: 'docs',
    category: 'artifact',
    risk: 'critical',
    requiredPermissions: ['artifact.download'],
    allowedScopes: [ScopeType.MY_WORK, ScopeType.TEAM, ScopeType.PROJECT],
    adminAllowed: false,
    requiresDocument: true,
  },
  'project.task.create': {
    module: 'delivery',
    category: 'delivery',
    risk: 'high',
    requiredPermissions: ['task.create', 'backlog.manage', 'project.manage'],
    allowedScopes: [ScopeType.MY_WORK, ScopeType.TEAM, ScopeType.PROJECT],
    adminAllowed: true,
    requiresProject: true,
  },
  'project.task.update': {
    module: 'delivery',
    category: 'delivery',
    risk: 'high',
    requiredPermissions: ['task.update', 'project.manage'],
    allowedScopes: [ScopeType.MY_WORK, ScopeType.TEAM, ScopeType.PROJECT],
    adminAllowed: true,
    requiresProject: true,
  },
  'project.task.delete': {
    module: 'delivery',
    category: 'delivery',
    risk: 'critical',
    requiredPermissions: ['task.delete', 'project.manage'],
    allowedScopes: [ScopeType.MY_WORK, ScopeType.TEAM, ScopeType.PROJECT],
    adminAllowed: true,
    requiresProject: true,
  },
  'project.task.reorder': {
    module: 'delivery',
    category: 'delivery',
    risk: 'high',
    requiredPermissions: ['backlog.manage', 'project.manage'],
    allowedScopes: [ScopeType.MY_WORK, ScopeType.TEAM, ScopeType.PROJECT],
    adminAllowed: true,
    requiresProject: true,
  },
  'workflow.status.change': {
    module: 'delivery',
    category: 'workflow',
    risk: 'critical',
    requiredPermissions: ['task.update', 'project.manage'],
    allowedScopes: [ScopeType.MY_WORK, ScopeType.TEAM, ScopeType.PROJECT],
    adminAllowed: true,
    requiresProject: true,
  },
  'approval.execute': {
    module: 'docs',
    category: 'approval',
    risk: 'critical',
    requiredPermissions: ['approval.execute', 'docs.approve'],
    allowedScopes: [ScopeType.MY_WORK, ScopeType.TEAM, ScopeType.PROJECT],
    adminAllowed: true,
    requiresDocument: true,
  },
  'automation.create': {
    module: 'delivery',
    category: 'automation',
    risk: 'critical',
    requiredPermissions: ['automation.edit'],
    allowedScopes: [ScopeType.PROJECT],
    adminAllowed: true,
    requiresProject: true,
  },
  'automation.update': {
    module: 'delivery',
    category: 'automation',
    risk: 'critical',
    requiredPermissions: ['automation.edit'],
    allowedScopes: [ScopeType.PROJECT],
    adminAllowed: true,
    requiresProject: true,
  },
  'automation.toggle': {
    module: 'delivery',
    category: 'automation',
    risk: 'critical',
    requiredPermissions: ['automation.edit'],
    allowedScopes: [ScopeType.PROJECT],
    adminAllowed: true,
    requiresProject: true,
  },
  'automation.delete': {
    module: 'delivery',
    category: 'automation',
    risk: 'critical',
    requiredPermissions: ['automation.edit'],
    allowedScopes: [ScopeType.PROJECT],
    adminAllowed: true,
    requiresProject: true,
  },
  'timesheet.update': {
    module: 'delivery',
    category: 'delivery',
    risk: 'high',
    requiredPermissions: ['project.manage', 'timesheets.approve', 'timesheets.log'],
    allowedScopes: [ScopeType.MY_WORK, ScopeType.TEAM, ScopeType.PROJECT],
    adminAllowed: true,
    requiresProject: true,
    requiresTargetUser: true,
  },
  'delivery.import': {
    module: 'delivery',
    category: 'delivery',
    risk: 'critical',
    requiredPermissions: ['workitems.import', 'backlog.manage', 'project.manage'],
    allowedScopes: [ScopeType.MY_WORK, ScopeType.PROJECT],
    adminAllowed: true,
    requiresProject: true,
    requiresDocument: true,
  },
  'delivery.pack.review': {
    module: 'delivery',
    category: 'delivery',
    risk: 'medium',
    requiredPermissions: ['task.read', 'project.manage'],
    allowedScopes: [ScopeType.PROJECT],
    adminAllowed: true,
    requiresProject: true,
  },
};

const isKnownAction = (action: string): action is ProductAction =>
  Object.prototype.hasOwnProperty.call(ACTION_POLICY, action);

const hasAnyPermission = (user: User, permissions: string[]) =>
  permissions.some(permission => user.permissions?.includes(permission));

const buildDecision = (
  action: string,
  metadata: ProductActionMetadata | undefined,
  allowed: boolean,
  reason: ProductActionReason,
  message: string,
): ProductActionDecision => ({
  action,
  allowed,
  status: allowed ? 'allowed' : 'blocked',
  reason,
  risk: metadata?.risk ?? 'critical',
  module: metadata?.module,
  category: metadata?.category ?? 'workflow',
  requiredPermissions: metadata?.requiredPermissions ?? [],
  allowedScopes: metadata?.allowedScopes ?? [],
  message,
});

const resolveEnabledModules = (input: ProductActionContext): ProductModuleKey[] => {
  if (input.enabledModules !== undefined) return input.enabledModules;
  if (input.organization?.enabledModules !== undefined) return input.organization.enabledModules;
  return DEFAULT_ENABLED_MODULES;
};
export function resolveProductActionPolicy(input: ProductActionContext): ProductActionDecision {
  if (input.authLoading) {
    return buildDecision(input.action, undefined, false, 'auth_loading', 'Action policy is waiting for authentication context.');
  }
  if (!input.user) {
    return buildDecision(input.action, undefined, false, 'unauthenticated', 'Sign in before taking product actions.');
  }
  if (!input.organization) {
    return buildDecision(input.action, undefined, false, 'no_organization', 'Select an organization before taking product actions.');
  }
  if (!isKnownAction(input.action)) {
    return buildDecision(input.action, undefined, false, 'unknown_action', 'This product action is not registered in the action policy.');
  }

  const metadata = ACTION_POLICY[input.action];
  const enabledModules = resolveEnabledModules(input);

  if (metadata.module && !enabledModules.includes(metadata.module)) {
    return buildDecision(input.action, metadata, false, 'disabled_module', `Avala ${metadata.module} is not enabled for this organization.`);
  }
  if (!metadata.allowedScopes.includes(input.scope.type)) {
    return buildDecision(input.action, metadata, false, 'invalid_scope', 'This action is not available in the current workspace scope.');
  }
  if (metadata.requiresProject && !input.projectId && input.scope.type !== ScopeType.PROJECT) {
    return buildDecision(input.action, metadata, false, 'missing_project_context', 'Select a project before taking this action.');
  }
  if (metadata.requiresProcess && !input.processId) {
    return buildDecision(input.action, metadata, false, 'missing_process_context', 'Open a process record before taking this action.');
  }
  if (metadata.requiresDocument && !input.documentGenerationId && !input.hasDocumentContext) {
    return buildDecision(input.action, metadata, false, 'missing_document_context', 'Open a generated document context before taking this action.');
  }
  if (metadata.requiresTargetUser && !input.targetUserId) {
    return buildDecision(input.action, metadata, false, 'missing_target_user_context', 'Select the target user before taking this action.');
  }

  if (input.action === 'timesheet.update') {
    const canManageTimesheets = hasAnyPermission(input.user, ['project.manage', 'timesheets.approve']);
    const canLogOwnTime = input.targetUserId === input.user.id && input.user.permissions?.includes('timesheets.log');
    if (!canManageTimesheets && !canLogOwnTime && input.user.orgRole !== 'Admin') {
      return buildDecision(input.action, metadata, false, 'missing_permission', 'You do not have permission to log or approve timesheet entries.');
    }
    return buildDecision(input.action, metadata, true, 'allowed', 'Action allowed by product action policy.');
  }

  if (metadata.adminAllowed && input.user.orgRole === 'Admin') {
    return buildDecision(input.action, metadata, true, 'allowed', 'Action allowed by product action policy.');
  }
  if (!hasAnyPermission(input.user, metadata.requiredPermissions)) {
    return buildDecision(input.action, metadata, false, 'missing_permission', 'You do not have permission to take this product action.');
  }

  return buildDecision(input.action, metadata, true, 'allowed', 'Action allowed by product action policy.');
}

export class ProductActionPolicyError extends Error {
  readonly decision: ProductActionDecision;

  constructor(decision: ProductActionDecision) {
    super(decision.message);
    this.name = 'ProductActionPolicyError';
    this.decision = decision;
  }
}

export function assertProductActionAllowed(input: ProductActionContext): ProductActionDecision {
  const decision = resolveProductActionPolicy(input);
  if (!decision.allowed) {
    throw new ProductActionPolicyError(decision);
  }
  return decision;
}
