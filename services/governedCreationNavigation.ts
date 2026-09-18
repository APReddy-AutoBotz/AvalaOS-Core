import { View } from '../types';

/** Route selection is presentation, never a grant of mutation authority. */
export function resolveGovernedCreationSurface(dataAccess: string, view: View): 'studio' | 'delivery' | null {
  if (dataAccess !== 'server') return null;
  if ([View.DOCS_FORGE, View.TEMPLATE_STUDIO, View.WORKSPACE, View.DOCS].includes(view)) return 'studio';
  if ([View.BOARDS, View.LIST, View.DELIVERY_PACK].includes(view)) return 'delivery';
  return null;
}
