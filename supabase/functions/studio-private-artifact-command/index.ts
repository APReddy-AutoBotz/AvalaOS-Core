import { handleOptions } from '../_shared/http.ts';
import { studioPrivateArtifactDependencies } from '../_shared/studioPrivateArtifactDb.ts';
import { handleStudioPrivateArtifactCommand } from '../_shared/studioPrivateArtifactHandler.ts';

declare const Deno: {
  serve: (handler: (request: Request) => Response | Promise<Response>) => void;
};

Deno.serve(
  request =>
    handleOptions(request) ??
    handleStudioPrivateArtifactCommand(request, studioPrivateArtifactDependencies),
);
