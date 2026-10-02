import { handleSyntheticAdminRequest } from '../_shared/syntheticAdminEndpoint.ts';

declare const Deno: { serve(handler: (request: Request) => Response | Promise<Response>): void };
Deno.serve(handleSyntheticAdminRequest);
