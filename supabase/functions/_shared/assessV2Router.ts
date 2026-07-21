import { jsonResponse } from './http.ts';
import { AssessV2Dependencies, AssessV2Error, asAssessV2Error, assessV2ErrorBody, parseAssessV2Envelope } from './assessV2Command.ts';
import { executeAssessV2Command } from './assessV2Handlers.ts';
import { AssessV2ReviewDependencies, AssessV2ReviewError, isAssessV2ReviewCommand, parseAssessV2ReviewEnvelope } from './assessV2ReviewCommand.ts';
import { executeAssessV2ReviewCommand } from './assessV2ReviewHandlers.ts';

export const handleAssessV2Request = async (request: Request, dependencies: AssessV2Dependencies, reviewDependencies?:AssessV2ReviewDependencies) => {
  if(request.method!=='POST'){const e=new AssessV2Error('METHOD_NOT_ALLOWED');return jsonResponse(assessV2ErrorBody(e),e.status);}
  try { let body:unknown; try{body=await request.json();}catch{throw new AssessV2Error('INVALID_COMMAND');} const raw=body as Record<string,unknown>|null;if(raw&&isAssessV2ReviewCommand(raw.commandType)){if(!reviewDependencies)throw new AssessV2ReviewError('COMMAND_UNAVAILABLE');const result=await executeAssessV2ReviewCommand(request,parseAssessV2ReviewEnvelope(body),reviewDependencies);return jsonResponse({ok:true,...result})}const result=await executeAssessV2Command(request,parseAssessV2Envelope(body),dependencies); return jsonResponse({ok:true,...result}); }
  catch(error){if(error instanceof AssessV2ReviewError)return jsonResponse({ok:false,error:{code:error.code,message:'The command could not be completed.'}},error.status);const e=asAssessV2Error(error);return jsonResponse(assessV2ErrorBody(e),e.status);}
};
