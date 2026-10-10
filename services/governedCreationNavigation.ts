import { ScopeType, View } from '../types';

/** Route selection is presentation, never a grant of mutation authority. */
export function resolveGovernedCreationSurface(dataAccess: string, view: View, scopeType?: ScopeType): 'studio' | 'delivery' | null {
  if (dataAccess !== 'server') return null;
  if ([View.DOCS_FORGE, View.TEMPLATE_STUDIO].includes(view)) return 'studio';
  // Project packs use authoritative legacy tasks and the server snapshot command.
  if (view === View.DELIVERY_PACK && scopeType === ScopeType.PROJECT) return null;
  if ([View.BOARDS, View.LIST, View.DELIVERY_PACK].includes(view)) return 'delivery';
  return null;
}
