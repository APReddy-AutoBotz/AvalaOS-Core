import React from 'react';
import type { DocTemplate } from '../../types';
import { useOrganizationContext } from '../auth/OrganizationProvider';
import GovernedTemplateManager from './GovernedTemplateManager';

interface Props {
  templates: DocTemplate[];
  onCreate: (template: Omit<DocTemplate, 'id'>) => void;
  onUpdate: (template: DocTemplate) => void;
  onDelete: (templateId: string) => void;
}

export default function TemplateManagerView({ templates }: Props) {
  const { tenantContext } = useOrganizationContext();
  const governedTemplateAccess=tenantContext?.capabilities.includes('studio.templates.read')===true;
  return <main className="space-y-6">{tenantContext && governedTemplateAccess ? <GovernedTemplateManager context={tenantContext} capabilities={tenantContext.capabilities} /> : <section className="av-surface p-5" aria-labelledby="template-manager-unavailable"><h2 id="template-manager-unavailable" className="text-xl font-bold text-[var(--av-color-text)]">Governed Template Manager unavailable</h2><p className="mt-2 text-sm text-[var(--av-color-text-muted)]">A current server-authorized tenant workspace with governed template authority is required. No local template mutation is offered.</p></section>}<section className="av-surface p-5" aria-labelledby="legacy-template-archive"><h2 id="legacy-template-archive" className="text-lg font-bold text-[var(--av-color-text)]">Legacy local templates · read only</h2><p className="mt-2 text-sm text-[var(--av-color-text-muted)]">{templates.length} historical local template{templates.length === 1 ? '' : 's'} remain visible only as a non-canonical archive. They cannot be edited or deleted and never act as provider/system instructions.</p></section></main>;
}
