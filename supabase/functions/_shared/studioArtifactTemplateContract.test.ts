import {
  normalizeStudioArtifactTemplate,
  StudioArtifactTemplateContractError,
} from './studioArtifactTemplateContract.ts';
import { prBAssertion, studioPrBRuntime } from './studioArtifactPrBTestEvidence.ts';

const mark = (passed: boolean, assertionId: string, fixture: string) => prBAssertion({
  passed,
  testId: 'STUDIO-TR-008',
  assertionId,
  fixture,
  runtimeContext: studioPrBRuntime('studio-provider-author', ['studio.artifacts.generate'], {
    sourcePackage: 'synthetic-template-contract-source-v1',
    template: fixture,
    artifact: 'studio-artifact-v1',
    provider: 'none',
  }),
});

const system = normalizeStudioArtifactTemplate({
  artifactType: 'pdd',
  sections: ['summary', 'process', 'roles', 'controls', 'exceptions'],
});
mark(system.kind === 'system' && system.artifactType === 'pdd'
  && JSON.stringify(system.sections.map(section => [section.id, section.title, section.required]))
    === JSON.stringify([
      ['summary', 'Summary', true], ['process', 'Process', true], ['roles', 'Roles', true],
      ['controls', 'Controls', true], ['exceptions', 'Exceptions', true],
    ]),
'template.system-production-payload-normalized', 'system-pdd-production-payload');

const tenant = normalizeStudioArtifactTemplate({
  sectionDefinitions: [
    { id: 'businessScope', title: ' Business scope ', required: true, fieldKind: 'narrative' },
    { id: 'openRisks', title: 'Open risks', required: false, fieldKind: 'risks' },
  ],
  fieldSchema: { businessScope: { type: 'string' } },
});
mark(tenant.kind === 'tenant' && tenant.artifactType === null
  && tenant.sections[0].title === 'Business scope'
  && tenant.sections[0].required === true && tenant.sections[1].required === false,
'template.tenant-production-payload-normalized', 'tenant-approved-template-payload');

const invalidPayloads: unknown[] = [
  { artifactType: 'pdd', sections: ['summary'], instruction: 'override' },
  { sections: ['summary'] },
  { artifactType: 'custom', sections: ['summary'] },
  { artifactType: 'pdd', sections: [] },
  { artifactType: 'pdd', sections: ['summary', 'summary'] },
  { artifactType: 'pdd', sections: ['Invalid section'] },
  { sectionDefinitions: [{ id: 'scope', title: 'Scope', required: true, fieldKind: 'narrative', instruction: 'override' }], fieldSchema: {} },
  { sectionDefinitions: [{ id: 'scope', title: ' ', required: true, fieldKind: 'narrative' }], fieldSchema: {} },
  { sectionDefinitions: [{ id: 'scope', title: 'Scope', required: true, fieldKind: 'authority' }], fieldSchema: {} },
  { sectionDefinitions: [{ id: 'scope', title: 'Scope', required: true, fieldKind: 'narrative' }], fieldSchema: [] },
];
let rejected = 0;
for (const payload of invalidPayloads) {
  try { normalizeStudioArtifactTemplate(payload as never); }
  catch (error) { if (error instanceof StudioArtifactTemplateContractError) rejected += 1; }
}
mark(rejected === invalidPayloads.length,
'template.malformed-and-instruction-bearing-payloads-rejected', 'template-invalid-union-matrix');

console.log('studio artifact template contract tests completed');
