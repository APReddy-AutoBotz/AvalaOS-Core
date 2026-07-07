import { DEFAULT_ENABLED_MODULES } from '../constants/moduleConfig';
import { AssessProcess, DocumentGeneration, Organization, ProductModuleKey, Project, Scope, ScopeType, User, View } from '../types';
import { normalizePersistedScope, normalizePersistedView, resolvePersistedViewScopeState } from './viewStatePersistence';
import type { ViewAccessResult } from './viewAccessGuard';

export type ProductNavigationIssue =
  | 'missing_process_id'
  | 'invalid_process_id'
  | 'invalid_guided_assessment_scope'
  | 'missing_project_id'
  | 'invalid_project_id'
  | 'missing_document_generation_id'
  | 'invalid_document_generation_id'
  | 'document_generation_project_mismatch';

export interface ProductNavigationTarget {
  view?: unknown;
  scope?: unknown;
  processId?: string | null;
  projectId?: string | null;
  assessmentId?: string | null;
  documentGenerationId?: string | null;
  deliveryPackId?: string | null;
}

export interface ResolveProductNavigationStateInput extends ProductNavigationTarget {
  user: User | null;
  authLoading: boolean;
  organization: Organization | null;
  enabledModules?: ProductModuleKey[];
  processes: AssessProcess[];
  projects: Project[];
  documentGenerations: DocumentGeneration[];
  preserveOrganizationWorkspace?: boolean;
}

export interface ProductNavigationStateResolution {
  view: View;
  scope: Scope;
  selectedProcessId: string | null;
  activeGenerationId: string | null;
  issues: ProductNavigationIssue[];
  fallbackApplied: boolean;
  access: ViewAccessResult;
}

export interface ProductNavigationSearchState {
  view: View;
  scope: Scope;
  selectedProcessId?: string | null;
  activeGenerationId?: string | null;
  assessmentId?: string | null;
  deliveryPackId?: string | null;
}

const PRODUCT_NAVIGATION_KEYS = [
  'view',
  'scope',
  'scopeId',
  'scopeName',
  'processId',
  'projectId',
  'assessmentId',
  'documentGenerationId',
  'generationId',
  'deliveryPackId',
];

const PROCESS_ENTITY_VIEWS = new Set<View>([View.PROCESS_DETAIL, View.GUIDED_ASSESSMENT]);

const PROJECT_ENTITY_VIEWS = new Set<View>([
  View.BACKLOG,
  View.ROADMAP,
  View.GANTT,
  View.WORKLOAD,
  View.SPRINT_PLANNING,
  View.TIMESHEETS,
  View.AUTOMATIONS,
  View.DELIVERY_PACK,
  View.DOCS,
  View.WORKSPACE,
]);

function cleanString(value: unknown) {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

function searchParamsFrom(search: string | URLSearchParams) {
  if (search instanceof URLSearchParams) return new URLSearchParams(search);
  return new URLSearchParams(search.startsWith('?') ? search.slice(1) : search);
}

function processBelongsToOrganization(process: AssessProcess, organization: Organization | null) {
  return Boolean(organization && process.orgId === organization.id);
}

export function productNavigationViewRequiresProcess(view: View) {
  return PROCESS_ENTITY_VIEWS.has(view);
}

export function productNavigationViewUsesProject(view: View) {
  return PROJECT_ENTITY_VIEWS.has(view);
}

export function productNavigationViewUsesDocumentGeneration(view: View) {
  return view === View.WORKSPACE;
}

export function hasProductNavigationSearch(search: string | URLSearchParams) {
  const params = searchParamsFrom(search);
  return PRODUCT_NAVIGATION_KEYS.some(key => params.has(key));
}

export function parseProductNavigationSearch(search: string | URLSearchParams): ProductNavigationTarget {
  const params = searchParamsFrom(search);
  const scopeType = cleanString(params.get('scope'));
  const scopeId = cleanString(params.get('scopeId')) ?? cleanString(params.get('projectId'));
  const scopeName = cleanString(params.get('scopeName')) ?? scopeId;
  let scope: Scope | undefined;

  if (scopeType === ScopeType.MY_WORK) {
    scope = { type: ScopeType.MY_WORK };
  } else if (scopeType === ScopeType.ORGANIZATION) {
    scope = { type: ScopeType.ORGANIZATION };
  } else if (scopeType === ScopeType.PROJECT && scopeId && scopeName) {
    scope = { type: ScopeType.PROJECT, id: scopeId, name: scopeName };
  } else if (scopeType === ScopeType.TEAM && scopeId && scopeName) {
    scope = { type: ScopeType.TEAM, id: scopeId, name: scopeName };
  }

  return {
    view: cleanString(params.get('view')) ?? undefined,
    scope,
    processId: cleanString(params.get('processId')),
    projectId: cleanString(params.get('projectId')),
    assessmentId: cleanString(params.get('assessmentId')),
    documentGenerationId: cleanString(params.get('documentGenerationId')) ?? cleanString(params.get('generationId')),
    deliveryPackId: cleanString(params.get('deliveryPackId')),
  };
}

export function buildProductNavigationSearch(state: ProductNavigationSearchState) {
  const params = new URLSearchParams();
  params.set('view', state.view);
  params.set('scope', state.scope.type);

  if (state.scope.type === ScopeType.PROJECT || state.scope.type === ScopeType.TEAM) {
    params.set('scopeId', state.scope.id);
    params.set('scopeName', state.scope.name);
  }

  if (state.scope.type === ScopeType.PROJECT) {
    params.set('projectId', state.scope.id);
  }

  if (productNavigationViewRequiresProcess(state.view) && state.selectedProcessId) {
    params.set('processId', state.selectedProcessId);
  }

  if (productNavigationViewUsesDocumentGeneration(state.view) && state.activeGenerationId) {
    params.set('documentGenerationId', state.activeGenerationId);
  }

  if (state.assessmentId) params.set('assessmentId', state.assessmentId);
  if (state.deliveryPackId) params.set('deliveryPackId', state.deliveryPackId);

  const serialized = params.toString();
  return serialized ? `?${serialized}` : '';
}

export function resolveProductNavigationState(input: ResolveProductNavigationStateInput): ProductNavigationStateResolution {
  const issues: ProductNavigationIssue[] = [];
  const addIssue = (issue: ProductNavigationIssue) => {
    if (!issues.includes(issue)) issues.push(issue);
  };
  let view = normalizePersistedView(input.view);
  let scope = normalizePersistedScope(input.scope);
  let selectedProcessId = cleanString(input.processId);
  let activeGenerationId = cleanString(input.documentGenerationId);
  const requestedProjectId = cleanString(input.projectId) ?? (scope.type === ScopeType.PROJECT ? scope.id : null);
  const requestedProject = requestedProjectId
    ? input.projects.find(project => project.id === requestedProjectId)
    : undefined;

  if (requestedProjectId && !requestedProject) {
    addIssue('invalid_project_id');
    if (scope.type === ScopeType.PROJECT && scope.id === requestedProjectId) {
      scope = { type: ScopeType.MY_WORK };
    }
  }

  if (requestedProject && (productNavigationViewUsesProject(view) || input.projectId || scope.type === ScopeType.PROJECT)) {
    scope = { type: ScopeType.PROJECT, id: requestedProject.id, name: requestedProject.name };
  }

  if (productNavigationViewUsesProject(view) && view !== View.WORKSPACE && scope.type !== ScopeType.PROJECT) {
    addIssue(requestedProjectId ? 'invalid_project_id' : 'missing_project_id');
  }

  if (view === View.GUIDED_ASSESSMENT && scope.type === ScopeType.ORGANIZATION) {
    scope = { type: ScopeType.MY_WORK };
    addIssue('invalid_guided_assessment_scope');
  }

  if (productNavigationViewRequiresProcess(view)) {
    if (!selectedProcessId) {
      addIssue('missing_process_id');
      view = View.PROCESS_CATALOG;
    } else {
      const process = input.processes.find(item => item.id === selectedProcessId && processBelongsToOrganization(item, input.organization));
      if (!process) {
        addIssue('invalid_process_id');
        selectedProcessId = null;
        view = View.PROCESS_CATALOG;
      }
    }
  }

  if (view === View.WORKSPACE && scope.type !== ScopeType.ORGANIZATION) {
    if (!activeGenerationId) {
      addIssue('missing_document_generation_id');
      view = scope.type === ScopeType.PROJECT ? View.DOCS : View.DOCS_FORGE;
    } else {
      const generation = input.documentGenerations.find(item => item.id === activeGenerationId);
      if (!generation) {
        addIssue('invalid_document_generation_id');
        activeGenerationId = null;
        view = scope.type === ScopeType.PROJECT ? View.DOCS : View.DOCS_FORGE;
      } else if (scope.type === ScopeType.PROJECT && generation.projectId !== scope.id) {
        addIssue('document_generation_project_mismatch');
        activeGenerationId = null;
        view = View.DOCS;
      } else if (scope.type !== ScopeType.PROJECT) {
        const generationProject = input.projects.find(project => project.id === generation.projectId);
        if (generationProject) {
          scope = { type: ScopeType.PROJECT, id: generationProject.id, name: generationProject.name };
        } else {
          addIssue('invalid_project_id');
          activeGenerationId = null;
          view = View.DOCS_FORGE;
          scope = { type: ScopeType.MY_WORK };
        }
      }
    }
  } else if (view !== View.WORKSPACE) {
    activeGenerationId = null;
  }

  const resolved = resolvePersistedViewScopeState({
    view,
    scope,
    user: input.user,
    authLoading: input.authLoading,
    organization: input.organization,
    enabledModules: input.enabledModules ?? input.organization?.enabledModules ?? DEFAULT_ENABLED_MODULES,
    preserveOrganizationWorkspace: input.preserveOrganizationWorkspace,
  });

  if (!productNavigationViewRequiresProcess(resolved.view)) {
    selectedProcessId = null;
  }

  if (resolved.view !== View.WORKSPACE || resolved.scope.type !== ScopeType.PROJECT) {
    activeGenerationId = null;
  }

  return {
    view: resolved.view,
    scope: resolved.scope,
    selectedProcessId,
    activeGenerationId,
    issues,
    fallbackApplied: resolved.fallbackApplied,
    access: resolved.access,
  };
}
