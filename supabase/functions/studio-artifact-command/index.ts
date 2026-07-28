import { handleOptions } from '../_shared/http.ts';
import { studioArtifactDependencies } from '../_shared/studioArtifactDb.ts';
import { handleStudioArtifactCommand } from '../_shared/studioArtifactHandler.ts';
declare const Deno:{serve:(handler:(request:Request)=>Response|Promise<Response>)=>void};
Deno.serve(request=>handleOptions(request)??handleStudioArtifactCommand(request,studioArtifactDependencies));
