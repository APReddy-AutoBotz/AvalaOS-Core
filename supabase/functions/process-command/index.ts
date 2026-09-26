import { handleOptions } from '../_shared/http.ts';
import { handleProcessCreationRequest } from '../_shared/processCreationCommand.ts';
import { processCreationDependencies } from '../_shared/processCreationDb.ts';

declare const Deno: { serve(handler: (request: Request) => Response | Promise<Response>): void };
Deno.serve(request => handleOptions(request) ?? handleProcessCreationRequest(request, processCreationDependencies));
