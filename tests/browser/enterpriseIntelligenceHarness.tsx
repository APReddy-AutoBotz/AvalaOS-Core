import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import '../../index.css';
import EnterpriseIntelligenceView from '../../components/enterprise/EnterpriseIntelligenceView';
import type { EnterpriseWorkspace, Organization, User } from '../../types';

const defaultOrganization = {
  id: '20000000-0000-4000-8000-000000000002',
  name: 'Synthetic Enterprise',
} as unknown as Organization;

const defaultWorkspace = {
  id: '30000000-0000-4000-8000-000000000003',
  organizationId: defaultOrganization.id,
  name: 'Governed Workspace',
} as unknown as EnterpriseWorkspace;

const defaultUser = {
  id: '10000000-0000-4000-8000-000000000001',
  name: 'Synthetic Reviewer',
  email: 'reviewer@example.test',
} as unknown as User;

const deliveryOrganization = {
  id: '00000001-0000-4000-8000-000000000001',
  name: 'Synthetic Northstar',
} as unknown as Organization;

const alternateDeliveryOrganization = {
  id: '00000004-0000-4000-8000-000000000004',
  name: 'Synthetic Contoso',
} as unknown as Organization;

const deliveryWorkspaces = [{
  id: '00000002-0000-4000-8000-000000000002',
  organizationId: deliveryOrganization.id,
  name: 'Governed Delivery',
}, {
  id: '00000003-0000-4000-8000-000000000003',
  organizationId: deliveryOrganization.id,
  name: 'Northstar Other Workspace',
}] as unknown as EnterpriseWorkspace[];

const alternateDeliveryWorkspace = {
  id: '00000005-0000-4000-8000-000000000005',
  organizationId: alternateDeliveryOrganization.id,
  name: 'Contoso Governed Delivery',
} as unknown as EnterpriseWorkspace;

const deliveryUser = {
  id: '30000006-0000-4000-8000-000000000006',
  name: 'Synthetic Delivery Author',
  email: 'delivery-author@example.test',
} as unknown as User;

const alternateDeliveryUser = {
  id: '30000014-0000-4000-8000-000000000014',
  name: 'Synthetic Delivery Reviewer',
  email: 'delivery-reviewer@example.test',
} as unknown as User;

const parameters = new URLSearchParams(window.location.search);
const missingContext = parameters.has('missing-context');
const deliveryMonitor = parameters.has('delivery-monitor');
const scopeSwitch = deliveryMonitor && parameters.has('scope-switch');

const Harness = () => {
  const [workspaceIndex, setWorkspaceIndex] = useState(0);
  const [alternateOrganization, setAlternateOrganization] = useState(false);
  const [alternateActor, setAlternateActor] = useState(false);
  const organization = deliveryMonitor ? (alternateOrganization ? alternateDeliveryOrganization : deliveryOrganization) : defaultOrganization;
  const workspace = deliveryMonitor ? (alternateOrganization ? alternateDeliveryWorkspace : deliveryWorkspaces[workspaceIndex]) : defaultWorkspace;
  const currentUser = deliveryMonitor ? (alternateActor ? alternateDeliveryUser : deliveryUser) : defaultUser;

  return <main className="min-h-screen bg-[var(--av-color-bg)]">
    {scopeSwitch && <div className="flex flex-wrap items-center gap-3 p-4">
      <button type="button" disabled={alternateOrganization} onClick={() => setWorkspaceIndex(index => index === 0 ? 1 : 0)}>Switch Enterprise workspace context</button>
      <button type="button" onClick={() => setAlternateOrganization(value => !value)}>Switch Enterprise organization context</button>
      <button type="button" onClick={() => setAlternateActor(value => !value)}>Switch Enterprise actor context</button>
      <span data-testid="enterprise-harness-organization">{organization.name}</span>
      <span data-testid="enterprise-harness-scope">{workspace.name}</span>
      <span data-testid="enterprise-harness-actor">{currentUser.name}</span>
    </div>}
    <EnterpriseIntelligenceView
      organization={missingContext ? null : organization}
      workspace={missingContext ? null : workspace}
      currentUser={missingContext ? null : currentUser}
    />
  </main>;
};

createRoot(document.getElementById('root')!).render(
  <Harness />,
);
