import { handleProviderLifecycleAuthorityRecheckRequest } from '../_shared/providerLifecycleEndpoint.ts';

declare const Deno: { serve: (handler: (request: Request) => Response | Promise<Response>) => void };

Deno.serve(handleProviderLifecycleAuthorityRecheckRequest);
