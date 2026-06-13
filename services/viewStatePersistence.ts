import { DEFAULT_ENABLED_MODULES } from '../constants/moduleConfig';
import { Organization, ProductModuleKey, Scope, ScopeType, User, View } from '../types';
import { resolveViewAccess, type ViewAccessResult } from './viewAccessGuard';

export const DEFAULT_PERSISTED_VIEW = View.DASHBOARD;
export const DEFAULT_PERSISTED_SCOPE: Scope = { type: ScopeType.MY_WORK };

export interface ResolvePersistedViewScopeStateInput {
  view: unknown;
  scope: unknown;
  user: User | null;
  authLoading: boolean;
  organization: Organization | null;
  enabledModules?: ProductModuleKey[];
  preserveOrganizationWorkspace?: boolean;
}

export interface PersistedViewScopeStateResolution {
  view: View;
  scope: Scope;
  normalizedView: View;
  normalizedScope: Scope;
  viewChanged: boolean;
  scopeChanged: boolean;
  fallbackApplied: boolean;
  access: ViewAccessResult;
}

const VALID_VIEWS = new Set<string>(Object.values(View));

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function cloneScope(scope: Scope): Scope {
  if (scope.type === ScopeType.PROJECT || scope.type === ScopeType.TEAM) {
    return { type: scope.type, id: scope.id, name: scope.name };
  }
  return { type: scope.type };
}

export function isValidView(value: unknown): value is View {
  return typeof value === 'string' && VALID_VIEWS.has(value);
}

export function normalizePersistedView(value: unknown, fallback: View = DEFAULT_PERSISTED_VIEW): View {
  return isValidView(value) ? value : fallback;
}

export function isValidScope(value: unknown): value is Scope {
  if (!isRecord(value)) return false;

  if (value.type === ScopeType.MY_WORK || value.type === ScopeType.ORGANIZATION) {
    return true;
  }

  if (value.type === ScopeType.PROJECT || value.type === ScopeType.TEAM) {
    return isNonEmptyString(value.id) && isNonEmptyString(value.name);
  }

  return false;
}

export function normalizePersistedScope(
  value: unknown,
  fallback: Scope = DEFAULT_PERSISTED_SCOPE,
): Scope {
  if (!isRecord(value)) return cloneScope(fallback);

  if (value.type === ScopeType.MY_WORK) return { type: ScopeType.MY_WORK };
  if (value.type === ScopeType.ORGANIZATION) return { type: ScopeType.ORGANIZATION };

  if (value.type === ScopeType.PROJECT && isNonEmptyString(value.id) && isNonEmptyString(value.name)) {
    return { type: ScopeType.PROJECT, id: value.id, name: value.name };
  }

  if (value.type === ScopeType.TEAM && isNonEmptyString(value.id) && isNonEmptyString(value.name)) {
    return { type: ScopeType.TEAM, id: value.id, name: value.name };
  }

  return cloneScope(fallback);
}

export function areScopesEqual(left: Scope, right: Scope) {
  if (left.type !== right.type) return false;

  if (left.type === ScopeType.PROJECT || left.type === ScopeType.TEAM) {
    return right.type === left.type && left.id === right.id && left.name === right.name;
  }

  return true;
}

function isCleanPersistedScope(value: unknown, normalizedScope: Scope) {
  if (!isRecord(value)) return false;
  const keys = Object.keys(value).sort();

  if (normalizedScope.type === ScopeType.MY_WORK || normalizedScope.type === ScopeType.ORGANIZATION) {
    return keys.length === 1 && keys[0] === 'type' && value.type === normalizedScope.type;
  }

  return (
    keys.length === 3 &&
    keys[0] === 'id' &&
    keys[1] === 'name' &&
    keys[2] === 'type' &&
    value.type === normalizedScope.type &&
    value.id === normalizedScope.id &&
    value.name === normalizedScope.name
  );
}

function isOrganizationWorkspaceDecisionPath(view: View, scope: Scope) {
  return view === View.WORKSPACE && scope.type === ScopeType.ORGANIZATION;
}

export function resolvePersistedViewScopeState({
  view,
  scope,
  user,
  authLoading,
  organization,
  enabledModules,
  preserveOrganizationWorkspace = true,
}: ResolvePersistedViewScopeStateInput): PersistedViewScopeStateResolution {
  const normalizedView = normalizePersistedView(view);
  const normalizedScope = normalizePersistedScope(scope);
  const access = resolveViewAccess({
    user,
    authLoading,
    organization,
    enabledModules: enabledModules ?? organization?.enabledModules ?? DEFAULT_ENABLED_MODULES,
    view: normalizedView,
    scope: normalizedScope,
  });

  const viewNeedsNormalization = view !== normalizedView;
  const scopeNeedsNormalization = !isCleanPersistedScope(scope, normalizedScope);

  if (
    access.allowed ||
    access.guardSeverity === 'wait' ||
    (preserveOrganizationWorkspace && isOrganizationWorkspaceDecisionPath(normalizedView, normalizedScope))
  ) {
    return {
      view: normalizedView,
      scope: normalizedScope,
      normalizedView,
      normalizedScope,
      viewChanged: viewNeedsNormalization,
      scopeChanged: scopeNeedsNormalization,
      fallbackApplied: false,
      access,
    };
  }

  const fallbackScope = normalizePersistedScope(access.fallbackScope ?? normalizedScope);

  return {
    view: access.fallbackView,
    scope: fallbackScope,
    normalizedView,
    normalizedScope,
    viewChanged: viewNeedsNormalization || access.fallbackView !== normalizedView,
    scopeChanged: scopeNeedsNormalization || !areScopesEqual(fallbackScope, normalizedScope),
    fallbackApplied: true,
    access,
  };
}
