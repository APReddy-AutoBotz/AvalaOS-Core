import { DEFAULT_ENABLED_MODULES, MODULE_HOME_VIEW } from '../constants/moduleConfig';
import { Organization, ProductModuleKey, Scope, ScopeType, User, View } from '../types';

export type ViewAccessReason =
  | 'auth_loading'
  | 'unauthenticated'
  | 'no_organization'
  | 'setup_required'
  | 'disabled_module'
  | 'missing_permission'
  | 'invalid_scope'
  | 'stale_persisted_view'
  | 'deferred_view'
  | 'admin_decision_pending'
  | 'allowed';

export type ViewAccessGuardSeverity = 'wait' | 'redirect' | 'disable' | 'hide' | 'warn' | 'allow';

export type ViewAccessStatus = 'active' | 'deferred' | 'decision_pending';

export interface ViewAccessMetadata {
  view: View;
  module: ProductModuleKey;
  allowedScopes: ScopeType[];
  requiredPermissions: string[];
  status: ViewAccessStatus;
  fallbackView: View;
  fallbackScopeType?: ScopeType;
  decisionScopeTypes?: ScopeType[];
}

export interface ResolveViewAccessInput {
  user: User | null;
  authLoading: boolean;
  organization: Organization | null;
  enabledModules?: ProductModuleKey[];
  view: View;
  scope: Scope;
}

export interface ViewAccessResult {
  allowed: boolean;
  fallbackView: View;
  fallbackScope?: Scope;
  reason: ViewAccessReason;
  module?: ProductModuleKey;
  requiredPermissions: string[];
  requiredScope: ScopeType[];
  guardSeverity: ViewAccessGuardSeverity;
}

const ASSESS_ACCESS_PERMISSIONS = [
  'process.create',
  'assessment.create',
  'assessment.edit',
  'assessment.review',
  'process.approve',
  'strategy.read',
];

const DELIVERY_BOARD_PERMISSIONS = [
  'project.read',
  'project.manage',
  'task.read',
  'task.update',
  'task.update.own',
  'defects.manage',
  'uat.execute',
];

const ALL_ASSESS_SCOPES = [
  ScopeType.MY_WORK,
  ScopeType.TEAM,
  ScopeType.PROJECT,
  ScopeType.ORGANIZATION,
];

const DELIVERY_WORK_SCOPES = [ScopeType.MY_WORK, ScopeType.PROJECT, ScopeType.TEAM];
const DOCS_WORK_SCOPES = [ScopeType.MY_WORK, ScopeType.TEAM, ScopeType.PROJECT];

export const VIEW_ACCESS_METADATA: Record<View, ViewAccessMetadata> = {
  [View.DASHBOARD]: {
    view: View.DASHBOARD,
    module: 'monitor',
    allowedScopes: [ScopeType.MY_WORK],
    requiredPermissions: [],
    status: 'active',
    fallbackView: View.DASHBOARD,
    fallbackScopeType: ScopeType.MY_WORK,
  },
  [View.PORTFOLIO]: {
    view: View.PORTFOLIO,
    module: 'monitor',
    allowedScopes: [ScopeType.MY_WORK],
    requiredPermissions: ['portfolio.read', 'strategy.read'],
    status: 'active',
    fallbackView: View.DASHBOARD,
    fallbackScopeType: ScopeType.MY_WORK,
  },
  [View.PROCESS_CATALOG]: {
    view: View.PROCESS_CATALOG,
    module: 'assess',
    allowedScopes: ALL_ASSESS_SCOPES,
    requiredPermissions: ASSESS_ACCESS_PERMISSIONS,
    status: 'active',
    fallbackView: View.PROCESS_CATALOG,
  },
  [View.TEMPLATE_LIBRARY]: {
    view: View.TEMPLATE_LIBRARY,
    module: 'assess',
    allowedScopes: ALL_ASSESS_SCOPES,
    requiredPermissions: ['process.create', 'assessment.create', 'assessment.edit', 'org.admin'],
    status: 'active',
    fallbackView: View.PROCESS_CATALOG,
  },
  [View.PROCESS_DETAIL]: {
    view: View.PROCESS_DETAIL,
    module: 'assess',
    allowedScopes: ALL_ASSESS_SCOPES,
    requiredPermissions: ASSESS_ACCESS_PERMISSIONS,
    status: 'active',
    fallbackView: View.PROCESS_CATALOG,
  },
  [View.GUIDED_ASSESSMENT]: {
    view: View.GUIDED_ASSESSMENT,
    module: 'assess',
    allowedScopes: ALL_ASSESS_SCOPES,
    requiredPermissions: ['assessment.create', 'assessment.edit', 'assessment.review', 'process.approve'],
    status: 'active',
    fallbackView: View.PROCESS_CATALOG,
  },
  [View.DOCS_FORGE]: {
    view: View.DOCS_FORGE,
    module: 'docs',
    allowedScopes: DOCS_WORK_SCOPES,
    requiredPermissions: ['docs.generate', 'docs.review', 'ai.configure', 'studio.handoff.read'],
    status: 'active',
    fallbackView: View.DOCS_FORGE,
  },
  [View.TEMPLATE_STUDIO]: {
    view: View.TEMPLATE_STUDIO,
    module: 'docs',
    allowedScopes: DOCS_WORK_SCOPES,
    requiredPermissions: ['docs.generate', 'docs.review', 'org.admin'],
    status: 'active',
    fallbackView: View.DOCS_FORGE,
  },
  [View.DOCS]: {
    view: View.DOCS,
    module: 'docs',
    allowedScopes: [ScopeType.PROJECT],
    requiredPermissions: ['docs.read', 'docs.review', 'docs.generate', 'docs.approve'],
    status: 'active',
    fallbackView: View.DOCS_FORGE,
  },
  [View.WORKSPACE]: {
    view: View.WORKSPACE,
    module: 'docs',
    allowedScopes: [ScopeType.PROJECT],
    requiredPermissions: ['docs.read', 'docs.review', 'docs.generate'],
    status: 'active',
    fallbackView: View.DOCS_FORGE,
    decisionScopeTypes: [ScopeType.ORGANIZATION],
  },
  [View.BOARDS]: {
    view: View.BOARDS,
    module: 'delivery',
    allowedScopes: DELIVERY_WORK_SCOPES,
    requiredPermissions: DELIVERY_BOARD_PERMISSIONS,
    status: 'active',
    fallbackView: View.BOARDS,
  },
  [View.LIST]: {
    view: View.LIST,
    module: 'delivery',
    allowedScopes: DELIVERY_WORK_SCOPES,
    requiredPermissions: ['task.read', 'task.update', 'task.update.own', 'project.read', 'project.manage'],
    status: 'active',
    fallbackView: View.BOARDS,
  },
  [View.BACKLOG]: {
    view: View.BACKLOG,
    module: 'delivery',
    allowedScopes: [ScopeType.PROJECT],
    requiredPermissions: ['backlog.read', 'backlog.manage', 'project.manage'],
    status: 'active',
    fallbackView: View.BOARDS,
  },
  [View.ROADMAP]: {
    view: View.ROADMAP,
    module: 'delivery',
    allowedScopes: [ScopeType.PROJECT],
    requiredPermissions: ['roadmap.read', 'roadmap.manage', 'portfolio.read', 'project.manage'],
    status: 'active',
    fallbackView: View.BOARDS,
  },
  [View.CALENDAR]: {
    view: View.CALENDAR,
    module: 'delivery',
    allowedScopes: [ScopeType.MY_WORK, ScopeType.PROJECT],
    requiredPermissions: ['task.read', 'project.read', 'project.manage', 'uat.execute', 'training.review'],
    status: 'active',
    fallbackView: View.BOARDS,
  },
  [View.GANTT]: {
    view: View.GANTT,
    module: 'delivery',
    allowedScopes: [ScopeType.PROJECT],
    requiredPermissions: ['roadmap.read', 'roadmap.manage', 'project.manage', 'portfolio.read'],
    status: 'active',
    fallbackView: View.BOARDS,
  },
  [View.WORKLOAD]: {
    view: View.WORKLOAD,
    module: 'delivery',
    allowedScopes: [ScopeType.PROJECT],
    requiredPermissions: ['capacity.read', 'project.manage'],
    status: 'active',
    fallbackView: View.BOARDS,
  },
  [View.SPRINT_PLANNING]: {
    view: View.SPRINT_PLANNING,
    module: 'delivery',
    allowedScopes: [ScopeType.PROJECT],
    requiredPermissions: ['sprint.manage', 'backlog.manage', 'project.manage'],
    status: 'active',
    fallbackView: View.BOARDS,
  },
  [View.DELIVERY_PACK]: {
    view: View.DELIVERY_PACK,
    module: 'delivery',
    allowedScopes: [ScopeType.PROJECT],
    requiredPermissions: ['project.read', 'project.manage', 'task.read', 'backlog.read', 'docs.read', 'approvals.review'],
    status: 'active',
    fallbackView: View.BOARDS,
  },
  [View.TIMESHEETS]: {
    view: View.TIMESHEETS,
    module: 'delivery',
    allowedScopes: [ScopeType.PROJECT],
    requiredPermissions: ['timesheets.log', 'timesheets.read', 'timesheets.approve'],
    status: 'active',
    fallbackView: View.BOARDS,
  },
  [View.AUTOMATIONS]: {
    view: View.AUTOMATIONS,
    module: 'delivery',
    allowedScopes: [ScopeType.PROJECT],
    requiredPermissions: ['automation.view', 'automation.execute', 'automation.edit'],
    status: 'active',
    fallbackView: View.BOARDS,
  },
  [View.REPORTS]: {
    view: View.REPORTS,
    module: 'monitor',
    allowedScopes: [ScopeType.MY_WORK],
    requiredPermissions: [],
    status: 'deferred',
    fallbackView: View.DASHBOARD,
    fallbackScopeType: ScopeType.MY_WORK,
  },
  [View.TEAMS]: {
    view: View.TEAMS,
    module: 'delivery',
    allowedScopes: [ScopeType.TEAM],
    requiredPermissions: DELIVERY_BOARD_PERMISSIONS,
    status: 'decision_pending',
    fallbackView: View.BOARDS,
  },
};

const VIEW_ACCESS_ORDER = [
  View.DASHBOARD,
  View.PROCESS_CATALOG,
  View.DOCS_FORGE,
  View.BOARDS,
  View.PORTFOLIO,
  View.TEMPLATE_LIBRARY,
  View.TEMPLATE_STUDIO,
  View.DOCS,
  View.LIST,
  View.BACKLOG,
  View.ROADMAP,
  View.CALENDAR,
  View.GANTT,
  View.WORKLOAD,
  View.SPRINT_PLANNING,
  View.DELIVERY_PACK,
  View.TIMESHEETS,
  View.AUTOMATIONS,
  View.PROCESS_DETAIL,
  View.GUIDED_ASSESSMENT,
  View.WORKSPACE,
];

const ORGANIZATION_SETUP_FALLBACK: Scope = { type: ScopeType.ORGANIZATION };
const MY_WORK_FALLBACK: Scope = { type: ScopeType.MY_WORK };

function uniqueViews(views: View[]) {
  return [...new Set(views)];
}

function resolveEnabledModules(input: ResolveViewAccessInput) {
  if (input.enabledModules) return input.enabledModules;
  if (input.organization?.enabledModules) return input.organization.enabledModules;
  return DEFAULT_ENABLED_MODULES;
}

function isModuleEnabled(module: ProductModuleKey | undefined, enabledModules: ProductModuleKey[]) {
  return Boolean(module && enabledModules.includes(module));
}

export function hasViewPermission(user: User, requiredPermissions: string[]) {
  if (user.orgRole === 'Admin') return true;
  if (requiredPermissions.length === 0) return true;
  const userPermissions = user.permissions ?? [];
  return requiredPermissions.some(permission => userPermissions.includes(permission));
}

function fallbackScopeFor(scopeTypes: ScopeType[], preferredScope?: Scope, fallbackScopeType?: ScopeType) {
  if (preferredScope && scopeTypes.includes(preferredScope.type)) return preferredScope;

  const targetScopeType = fallbackScopeType ?? scopeTypes[0] ?? ScopeType.MY_WORK;
  if (targetScopeType === ScopeType.MY_WORK) return MY_WORK_FALLBACK;
  if (targetScopeType === ScopeType.ORGANIZATION) return ORGANIZATION_SETUP_FALLBACK;

  return undefined;
}

function getDeniedFallback(
  input: ResolveViewAccessInput,
  enabledModules: ProductModuleKey[],
  metadata?: ViewAccessMetadata,
) {
  const moduleHomeViews = enabledModules.map(module => MODULE_HOME_VIEW[module]);
  const candidateViews = uniqueViews([
    metadata?.fallbackView,
    ...moduleHomeViews,
    ...VIEW_ACCESS_ORDER,
  ].filter(Boolean) as View[]);

  for (const candidateView of candidateViews) {
    const candidate = VIEW_ACCESS_METADATA[candidateView];
    if (!candidate || candidate.status !== 'active') continue;
    if (!isModuleEnabled(candidate.module, enabledModules)) continue;
    if (input.user && !hasViewPermission(input.user, candidate.requiredPermissions)) continue;

    return {
      fallbackView: candidate.view,
      fallbackScope: fallbackScopeFor(candidate.allowedScopes, input.scope, candidate.fallbackScopeType),
    };
  }

  const firstEnabledModule = enabledModules[0];
  const fallbackView = firstEnabledModule ? MODULE_HOME_VIEW[firstEnabledModule] : View.DASHBOARD;
  const fallbackMetadata = VIEW_ACCESS_METADATA[fallbackView];

  return {
    fallbackView,
    fallbackScope: fallbackMetadata
      ? fallbackScopeFor(fallbackMetadata.allowedScopes, input.scope, fallbackMetadata.fallbackScopeType)
      : MY_WORK_FALLBACK,
  };
}

function deniedResult(
  input: ResolveViewAccessInput,
  enabledModules: ProductModuleKey[],
  reason: ViewAccessReason,
  guardSeverity: ViewAccessGuardSeverity,
  metadata?: ViewAccessMetadata,
): ViewAccessResult {
  const fallback = getDeniedFallback(input, enabledModules, metadata);

  return {
    allowed: false,
    ...fallback,
    reason,
    module: metadata?.module,
    requiredPermissions: metadata ? [...metadata.requiredPermissions] : [],
    requiredScope: metadata ? [...metadata.allowedScopes] : [],
    guardSeverity,
  };
}

export function resolveViewAccess(input: ResolveViewAccessInput): ViewAccessResult {
  const metadata = VIEW_ACCESS_METADATA[input.view];
  const enabledModules = resolveEnabledModules(input);

  if (input.authLoading) {
    return {
      allowed: false,
      fallbackView: input.view,
      fallbackScope: input.scope,
      reason: 'auth_loading',
      module: metadata?.module,
      requiredPermissions: metadata ? [...metadata.requiredPermissions] : [],
      requiredScope: metadata ? [...metadata.allowedScopes] : [],
      guardSeverity: 'wait',
    };
  }

  if (!input.user) {
    return deniedResult(input, enabledModules, 'unauthenticated', 'redirect', metadata);
  }

  if (!input.organization) {
    return {
      allowed: false,
      fallbackView: View.WORKSPACE,
      fallbackScope: ORGANIZATION_SETUP_FALLBACK,
      reason: 'no_organization',
      module: metadata?.module,
      requiredPermissions: metadata ? [...metadata.requiredPermissions] : [],
      requiredScope: metadata ? [...metadata.allowedScopes] : [],
      guardSeverity: 'redirect',
    };
  }

  if (enabledModules.length === 0) {
    return {
      allowed: false,
      fallbackView: View.WORKSPACE,
      fallbackScope: ORGANIZATION_SETUP_FALLBACK,
      reason: 'setup_required',
      module: metadata?.module,
      requiredPermissions: metadata ? [...metadata.requiredPermissions] : [],
      requiredScope: metadata ? [...metadata.allowedScopes] : [],
      guardSeverity: 'redirect',
    };
  }

  if (!metadata) {
    return deniedResult(input, enabledModules, 'stale_persisted_view', 'redirect');
  }

  if (metadata.status === 'deferred') {
    return deniedResult(input, enabledModules, 'deferred_view', 'hide', metadata);
  }

  if (metadata.status === 'decision_pending') {
    return deniedResult(input, enabledModules, 'deferred_view', 'warn', metadata);
  }

  if (metadata.decisionScopeTypes?.includes(input.scope.type)) {
    return deniedResult(input, enabledModules, 'admin_decision_pending', 'warn', metadata);
  }

  if (!isModuleEnabled(metadata.module, enabledModules)) {
    return deniedResult(input, enabledModules, 'disabled_module', 'redirect', metadata);
  }

  if (!metadata.allowedScopes.includes(input.scope.type)) {
    return deniedResult(input, enabledModules, 'invalid_scope', 'redirect', metadata);
  }

  if (!hasViewPermission(input.user, metadata.requiredPermissions)) {
    return deniedResult(input, enabledModules, 'missing_permission', 'hide', metadata);
  }

  return {
    allowed: true,
    fallbackView: input.view,
    fallbackScope: input.scope,
    reason: 'allowed',
    module: metadata.module,
    requiredPermissions: [...metadata.requiredPermissions],
    requiredScope: [...metadata.allowedScopes],
    guardSeverity: 'allow',
  };
}
