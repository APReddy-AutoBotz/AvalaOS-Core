import React from 'react';
import { useAuth } from '../auth/AuthProvider';
import { useOrganizationContext } from '../auth/OrganizationProvider';
import { bindAuthoritativePresentationCapabilities } from '../../services/viewAccessGuard';
import { getRuntimeDataAccess } from '../../services/supabaseClient';
import StudioArtifactWorkspace from './StudioArtifactWorkspace';

/** Main Studio navigation opens canonical source/template/artifact commands. */
export default function GovernedStudioRoute() {
  const { user } = useAuth();
  const { tenantContext, currentOrganization, currentWorkspace, sessionState } = useOrganizationContext();
  const capabilities = bindAuthoritativePresentationCapabilities({
    userId: user?.id,
    organizationId: currentOrganization?.id,
    workspaceId: currentWorkspace?.id,
    sessionState,
    tenantContext,
  });
  const canRead = getRuntimeDataAccess() === 'server' && capabilities.some(capability => [
    'studio.artifacts.read', 'studio.sources.read', 'studio.templates.read', 'studio.handoffs.read',
  ].includes(capability));
  if (!canRead || !tenantContext) return <section className="av-surface m-5 p-5" aria-labelledby="studio-access-title">
    <h1 id="studio-access-title" className="text-xl font-bold">Studio access unavailable</h1>
    <p className="mt-2">Select a current workspace with Studio read access. Your administrator can assign an appropriate role; no document was created.</p>
  </section>;
  return <div data-testid="governed-studio-creation-route">
    {sessionState === 'read_only' && <p role="status" className="m-5">This workspace is read-only. Editing and generation are unavailable.</p>}
    <StudioArtifactWorkspace
      key={`${tenantContext.userId}:${tenantContext.organizationId}:${tenantContext.workspaceId}:${tenantContext.authorizationVersion}:${sessionState}`}
      context={tenantContext}
      capabilities={capabilities}
      online={sessionState === 'ready'}
    />
  </div>;
}
