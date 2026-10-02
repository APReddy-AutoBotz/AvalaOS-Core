import { handleOptions } from '../_shared/http.ts';
import {
  handlePrCControlledHumanSyntheticGeneration,
  type PrCControlledHumanSyntheticGenerationCommand,
} from '../_shared/prCControlledHumanSyntheticGeneration.ts';
import { getAuthUser, postgrest } from '../_shared/supabase.ts';

declare const Deno: { serve(handler: (request: Request) => Response | Promise<Response>): void };

// Only same-backend authentication and the service-only atomic RPC are
// dependencies. There is no provider, resolver, provider configuration,
// provider secret, source retrieval, or arbitrary network-output dependency.
const dependencies = {
  authenticate: getAuthUser,
  execute: (command: PrCControlledHumanSyntheticGenerationCommand) => postgrest<unknown>(
    'rpc/pr_c_controlled_human_synthetic_studio_generate',
    { method: 'POST', body: JSON.stringify({ p_command: command }) },
  ),
};

Deno.serve(request => handleOptions(request)
  ?? handlePrCControlledHumanSyntheticGeneration(request, dependencies));
