import { jsonResponse } from './http.ts';
import { AssessV2Dependencies, AssessV2Error, asAssessV2Error, assessV2ErrorBody, parseAssessV2Envelope } from './assessV2Command.ts';
import { executeAssessV2Command } from './assessV2Handlers.ts';

export const handleAssessV2Request = async (request: Request, dependencies: AssessV2Dependencies) => {
  if(request.method!=='POST'){const e=new AssessV2Error('METHOD_NOT_ALLOWED');return jsonResponse(assessV2ErrorBody(e),e.status);}
  try { let body:unknown; try{body=await request.json();}catch{throw new AssessV2Error('INVALID_COMMAND');} const result=await executeAssessV2Command(request,parseAssessV2Envelope(body),dependencies); return jsonResponse({ok:true,...result}); }
  catch(error){const e=asAssessV2Error(error);return jsonResponse(assessV2ErrorBody(e),e.status);}
};
