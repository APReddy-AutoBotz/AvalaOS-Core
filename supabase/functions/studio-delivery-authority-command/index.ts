import { handleStudioDeliveryCommand } from '../_shared/studioDeliveryCommand.ts';
import { studioDeliveryDatabaseDependencies } from '../_shared/studioDeliveryDb.ts';
import { handleStudioDeliveryOptions } from '../_shared/studioDeliveryHttp.ts';

declare const Deno: { serve(handler: (request: Request) => Response | Promise<Response>): void };
Deno.serve(request => handleStudioDeliveryOptions(request)
  ?? handleStudioDeliveryCommand(request, studioDeliveryDatabaseDependencies(request)));
