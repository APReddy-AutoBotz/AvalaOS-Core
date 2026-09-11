import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const root = new URL('../../', import.meta.url);

test('Studio exposes an unmistakable exact-PR synthetic path without replacing normal generation', async () => {
  const source = await readFile(new URL('components/docs/StudioArtifactWorkspace.tsx', root), 'utf8');
  for (const token of [
    'isControlledHumanRuntimeEnabled',
    'executePrCControlledHumanSyntheticGeneration',
    "controlledHumanSyntheticGeneration?'Generate synthetic controlled-human draft':'Generate governed package draft'",
    'Synthetic controlled-human test output only · exact PR #264 exercise · no provider route, key, or provider call.',
    'no provider route or provider call was used',
    'syntheticGenerationAttemptRef',
    'retry the same exact operation to reconcile',
  ]) assert.ok(source.includes(token), `missing UI contract: ${token}`);
  assert.match(source, /controlledHumanSyntheticGeneration\s*\?\s*await executePrCControlledHumanSyntheticGeneration[\s\S]*:\s*await executeStudioWorkspaceCommand/u);
});

test('synthetic Edge and client sources contain no provider execution surface or caller-authored output', async () => {
  const files = [
    'supabase/functions/pr-c-controlled-human-synthetic-generation/index.ts',
    'supabase/functions/_shared/prCControlledHumanSyntheticGeneration.ts',
    'services/studioArtifacts/prCControlledHumanSyntheticGeneration.ts',
  ];
  const sources = await Promise.all(files.map(file => readFile(new URL(file, root), 'utf8')));
  const implementation = sources.join('\n');
  for (const forbidden of [
    'callStudioArtifactProvider',
    'resolveEnterpriseAi',
    'providerConfigId',
    'providerRouteId',
    'fetch(',
    'OPENAI_API_KEY',
    'GROQ_API_KEY',
    'ANTHROPIC_API_KEY',
    'GEMINI_API_KEY',
  ]) assert.equal(implementation.includes(forbidden), false, `forbidden execution surface: ${forbidden}`);
  assert.ok(implementation.includes("'rpc/pr_c_controlled_human_synthetic_studio_generate'"));
  assert.ok(implementation.includes("generationKind: 'synthetic_controlled_human'"));
});
