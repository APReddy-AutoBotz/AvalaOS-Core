import React from 'react';
import { createRoot } from 'react-dom/client';
import '../../index.css';
import EnterpriseIntelligenceView from '../../components/enterprise/EnterpriseIntelligenceView';
import type { EnterpriseWorkspace, Organization, User } from '../../types';

const organization = {
  id: '20000000-0000-4000-8000-000000000002',
  name: 'Synthetic Enterprise',
} as unknown as Organization;

const workspace = {
  id: '30000000-0000-4000-8000-000000000003',
  organizationId: organization.id,
  name: 'Governed Workspace',
} as unknown as EnterpriseWorkspace;

const currentUser = {
  id: '10000000-0000-4000-8000-000000000001',
  name: 'Synthetic Reviewer',
  email: 'reviewer@example.test',
} as unknown as User;

const missingContext = new URLSearchParams(window.location.search).has('missing-context');

createRoot(document.getElementById('root')!).render(
  <main className="min-h-screen bg-[var(--av-color-bg)]">
    <EnterpriseIntelligenceView
      organization={missingContext ? null : organization}
      workspace={missingContext ? null : workspace}
      currentUser={missingContext ? null : currentUser}
    />
  </main>,
);
