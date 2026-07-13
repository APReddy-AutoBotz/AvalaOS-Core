import { jsonResponse } from './http.ts';
import {
  AssessCommandDependencies,
  AssessCommandError,
  asAssessCommandError,
  assessErrorBody,
  parseAssessEnvelope,
} from './assessCommand.ts';
import { executeAssessCommand } from './assessHandlers.ts';

export const handleAssessRequest = async (request: Request, dependencies: AssessCommandDependencies) => {
  if (request.method !== 'POST') {
    const error = new AssessCommandError('METHOD_NOT_ALLOWED');
    return jsonResponse(assessErrorBody(error), error.status);
  }
  try {
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      throw new AssessCommandError('INVALID_COMMAND');
    }
    const result = await executeAssessCommand(request, parseAssessEnvelope(body), dependencies);
    return jsonResponse({ ok: true, outcome: result.outcome, resource: result.resource });
  } catch (error) {
    const controlled = asAssessCommandError(error);
    return jsonResponse(assessErrorBody(controlled), controlled.status);
  }
};
