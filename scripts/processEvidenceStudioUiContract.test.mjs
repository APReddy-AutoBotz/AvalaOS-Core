import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = path => fs.readFileSync(path, 'utf8');
const contracts = read('services/studioArtifacts/contracts.ts');
const workspace = read('components/docs/StudioArtifactWorkspace.tsx');
const manager = read('components/docs/GovernedTemplateManager.tsx');
const editor = read('components/docs/StructuredArtifactEditor.tsx');
const command = read('supabase/functions/_shared/studioArtifactCommand.ts');
const provider = read('supabase/functions/_shared/studioArtifactProvider.ts');
const generation = read('supabase/functions/_shared/studioArtifactGeneration.ts');

assert.match(contracts, /STUDIO_ARTIFACT_TYPES = \['brd', 'frd', 'pdd', 'sdd'\]/u);
assert.ok(workspace.includes('STUDIO_ARTIFACT_TYPES.map'), 'ordinary artifact selector must derive all four types');
assert.ok(manager.includes('<option value="sdd">SDD</option>'), 'governed template selector must expose SDD');
assert.ok(editor.includes('MermaidRenderer'), 'flow sections require sanitized Mermaid preview');
assert.ok(editor.includes("selected.id === 'asIsFlow' || selected.id === 'toBeFlow'"), 'only canonical flow sections render as diagrams');
assert.ok(generation.includes("inspectMermaidFlowcharts(body, true).length === 1"), 'generated flows use the shared bounded parser');
assert.ok(editor.includes('inspectMermaidFlowcharts(section.body, true)'), 'edited flows use the same shared bounded parser');
assert.ok(command.includes('validateCanonicalFlowSectionEdits(content as JsonObject)'), 'raw canonical flow revisions use the shared server parser');
assert.ok(provider.includes('Do not invent API availability'), 'SDD prompt retains unknown technical evidence');
assert.ok(provider.includes('never invent a connection'), 'flow prompt prohibits fabricated edges');
assert.ok(workspace.includes('...(selectedSectionIds.length?{selectedSectionIds}: {})'), 'selected section IDs must cross the governed generation command');
assert.equal(workspace.includes('if(selectedSectionIds.length&&artifact){'), false, 'browser must not merge or save generated sections');
assert.equal(workspace.includes('contentToStructuredSections'), false, 'browser must not act as selective-refresh content authority');
assert.ok(editor.includes('server applies selected candidates atomically'), 'editor must explain the atomic server boundary');
assert.ok(workspace.includes('Selected-section refresh is unavailable in the provider-free synthetic path'), 'synthetic full generation must fail closed for selected refresh');
assert.ok(workspace.includes("sourcePackage.currentVersionId!==artifact.currentVersion.id"), 'selected refresh must compare the exact viewed head before provider work');
assert.ok(workspace.includes("artifact.ancestry.sourcePackageHash!==artifactWorkspace.sourcePackage.hash"), 'needs-review must compare document and aggregate source bindings');
assert.ok(workspace.includes('Adopt changed input into current document'), 'changed-source adoption must be an explicit ordinary UI choice');
assert.ok(workspace.includes('currentVersionId:source.currentVersionId,currentApprovedVersionId:source.currentApprovedVersionId'), 'adoption must bind the exact viewed current and approved heads');
assert.ok(command.includes("'replaceArtifact' in payload"), 'server command parser must fail closed around the optional predecessor selector');

console.log('process evidence Studio SDD and flow UI contract passed');
