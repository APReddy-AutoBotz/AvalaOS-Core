import { legacyDeliveryDatabaseDependencies } from '../_shared/legacyDeliveryDb.ts';
import { handleLegacyDeliveryOptions } from '../_shared/legacyDeliveryHttp.ts';
import { handleLegacyDeliveryQuery } from '../_shared/legacyDeliveryQuery.ts';

declare const Deno: { serve(handler: (request: Request) => Response | Promise<Response>): void };

Deno.serve(request => handleLegacyDeliveryOptions(request)
  ?? handleLegacyDeliveryQuery(request, legacyDeliveryDatabaseDependencies(request)));
