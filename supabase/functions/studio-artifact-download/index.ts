import { handleOptions } from '../_shared/http.ts';
import { studioPrivateArtifactDownloadDependencies } from '../_shared/studioPrivateArtifactDb.ts';
import { handleStudioPrivateArtifactDownload } from '../_shared/studioPrivateArtifactDownloadHandler.ts';

declare const Deno: {
  serve: (handler: (request: Request) => Response | Promise<Response>) => void;
};

Deno.serve(
  request =>
    handleOptions(request) ??
    handleStudioPrivateArtifactDownload(
      request,
      studioPrivateArtifactDownloadDependencies,
    ),
);
