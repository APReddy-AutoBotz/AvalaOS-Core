import React from 'react';
import { createRoot } from 'react-dom/client';
import '../../index.css';
import DocsView from '../../components/docs/DocsView';
import { AuthProvider, useAuth } from '../../components/auth/AuthProvider';
import {
  OrganizationProvider,
  useOrganizationContext,
} from '../../components/auth/OrganizationProvider';
import { supabase } from '../../services/supabaseClient';

const ACTOR = '46666666-6666-4666-8666-666666666666';
const encode = (value: object) =>
  btoa(JSON.stringify(value))
    .replaceAll('+', '-')
    .replaceAll('/', '_')
    .replaceAll('=', '');
const accessToken = `${encode({ alg: 'none', typ: 'JWT' })}.${encode({
  sub: ACTOR,
  aud: 'authenticated',
  role: 'authenticated',
  exp: 4102444800,
})}.deterministic-signature`;
await supabase.auth.setSession({
  access_token: accessToken,
  refresh_token: 'studio-private-artifact-browser-refresh',
});

function ProductDocsRoute() {
  const { user, loading } = useAuth();
  const { tenantContext, sessionState } = useOrganizationContext();
  return (
    <main className="min-h-screen p-4">
      <output data-testid="private-artifact-auth-human">
        {loading ? 'loading' : user?.id ?? 'anonymous'}
      </output>
      <output data-testid="private-artifact-server-tenant">
        {sessionState}:{tenantContext?.organizationId ?? 'none'}:
        {tenantContext?.workspaceId ?? 'none'}
      </output>
      <DocsView generations={[]} templates={[]} onViewGeneration={() => undefined} />
    </main>
  );
}

createRoot(document.getElementById('root')!).render(
  <AuthProvider>
    <OrganizationProvider>
      <ProductDocsRoute />
    </OrganizationProvider>
  </AuthProvider>,
);
