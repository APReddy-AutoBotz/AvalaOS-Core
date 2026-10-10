import { handleLegacyDeliveryCommand } from '../_shared/legacyDeliveryCommand.ts';
import { legacyDeliveryDatabaseDependencies } from '../_shared/legacyDeliveryDb.ts';
import { handleLegacyDeliveryOptions } from '../_shared/legacyDeliveryHttp.ts';

declare const Deno: { serve(handler: (request: Request) => Response | Promise<Response>): void };

Deno.serve(request => handleLegacyDeliveryOptions(request)
  ?? handleLegacyDeliveryCommand(request, legacyDeliveryDatabaseDependencies(request)));
