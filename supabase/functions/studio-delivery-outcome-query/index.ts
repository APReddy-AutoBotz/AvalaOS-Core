import { studioDeliveryDatabaseDependencies } from '../_shared/studioDeliveryDb.ts';
import { handleStudioDeliveryOptions } from '../_shared/studioDeliveryHttp.ts';
import { handleStudioDeliveryOutcomeQuery } from '../_shared/studioDeliveryOutcomeQuery.ts';

declare const Deno: { serve(handler: (request: Request) => Response | Promise<Response>): void };
Deno.serve(request => handleStudioDeliveryOptions(request)
  ?? handleStudioDeliveryOutcomeQuery(request, studioDeliveryDatabaseDependencies(request)));
