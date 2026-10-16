import assert from 'node:assert/strict';
import test from 'node:test';
import { parseTemplateYaml, serializeTemplateYaml } from './TemplateEditor';

const template = {
  id: 'template-1',
  title: 'Controlled template',
  description: 'Synthetic template fixture.',
  artifactKey: 'brd' as const,
  sections: [{ key: 'scope', title: 'Scope', description: 'Describe scope.', required: true }],
};

test('local js-yaml round trip preserves template structure and an existing id', () => {
  const yaml = serializeTemplateYaml(template);
  assert.deepEqual(parseTemplateYaml(yaml, template.id), template);
});

test('new-template YAML omits the placeholder id', () => {
  const yaml = serializeTemplateYaml(template, true);
  assert.doesNotMatch(yaml, /^id:/mu);
  assert.equal('id' in parseTemplateYaml(yaml), false);
});

test('invalid YAML and invalid template structure fail closed', () => {
  assert.throws(() => parseTemplateYaml('title: [unterminated'));
  assert.throws(() => parseTemplateYaml('title: Missing sections'), /title.*sections/iu);
  assert.throws(() => parseTemplateYaml('- item'), /title.*sections/iu);
});
