import { handleOptions } from '../_shared/http.ts';
import { assessCommandDependencies } from '../_shared/assessDb.ts';
import { handleAssessRequest } from '../_shared/assessRouter.ts';

declare const Deno: { serve: (handler: (request: Request) => Response | Promise<Response>) => void };

Deno.serve(async request => {
  const options = handleOptions(request);
  if (options) return options;
  return handleAssessRequest(request, assessCommandDependencies);
});
