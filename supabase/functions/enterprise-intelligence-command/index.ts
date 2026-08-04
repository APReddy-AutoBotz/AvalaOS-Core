import { handleEnterpriseIntelligenceOptions, handleEnterpriseIntelligenceRequest } from '../_shared/enterpriseIntelligenceCommand.ts';

declare const Deno: { serve: (handler: (request: Request) => Response | Promise<Response>) => void };

Deno.serve(async request => handleEnterpriseIntelligenceOptions(request) ?? handleEnterpriseIntelligenceRequest(request));
