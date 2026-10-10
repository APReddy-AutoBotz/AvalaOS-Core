import { handleOptions } from '../_shared/http.ts';
import { handleProcessCommandRequest } from '../_shared/processCommandRouter.ts';
import { processCreationDependencies } from '../_shared/processCreationDb.ts';
import { processUpdateDependencies } from '../_shared/processUpdateDb.ts';

declare const Deno: { serve(handler: (request: Request) => Response | Promise<Response>): void };
Deno.serve(request => handleOptions(request) ?? handleProcessCommandRequest(request, {
  creation: processCreationDependencies,
  update: processUpdateDependencies,
}));
