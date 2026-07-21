import { handleOptions } from '../_shared/http.ts';
import { assessV2Dependencies } from '../_shared/assessV2Db.ts';
import { handleAssessV2Request } from '../_shared/assessV2Router.ts';
import { assessV2ReviewDependencies } from '../_shared/assessV2ReviewDb.ts';
import { assessV2EconomicsDependencies } from '../_shared/assessV2EconomicsDb.ts';

declare const Deno:{serve:(handler:(request:Request)=>Response|Promise<Response>)=>void};
Deno.serve(async request=>handleOptions(request)??handleAssessV2Request(request,assessV2Dependencies,assessV2ReviewDependencies,assessV2EconomicsDependencies));
